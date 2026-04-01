import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (_req, res) => {
  res.status(200).send("CheckFinal backend is running");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/analyze", async (req, res) => {
  try {
    const reportText = (req.body?.reportText || "").trim();
    const language = (req.body?.language || "tr").trim().toLowerCase();

    if (!reportText) {
      return res.status(400).json({
        publicSummary:
          language === "en"
            ? "No report content was provided for analysis."
            : "Analiz için rapor içeriği gönderilmedi.",
        doctorSummary:
          language === "en"
            ? "No clinical content received."
            : "Klinik içerik alınmadı.",
        keyFindings: [],
        publicWarnings: [
          language === "en"
            ? "Please add report text, PDF content, or image-derived text."
            : "Lütfen rapor metni, PDF içeriği veya görselden çıkarılmış metin ekleyin."
        ],
        doctorWarnings: [
          language === "en" ? "Empty request." : "Boş istek."
        ],
        privacyNotice:
          language === "en"
            ? "Uploaded content is processed only for temporary analysis flow."
            : "Yüklenen içerik yalnızca geçici analiz akışı için işlenir."
      });
    }

    const systemPrompt =
      language === "en"
        ? `
You are a careful medical pre-analysis assistant for the CheckFinal app.

Return ONLY valid JSON with this exact schema:
{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string"
}

Rules:
- This app does not diagnose.
- Do not prescribe treatment.
- Final medical judgment belongs to a physician.
- publicSummary must be simple and understandable for general users.
- doctorSummary can be more clinical and concise.
- keyFindings should contain 3 to 8 short findings when possible.
- publicWarnings should be easy to understand.
- doctorWarnings can be more clinical.
- privacyNotice should be one short sentence.
- If the text is unclear, state that clearly.
- Output only JSON.
`
        : `
Sen CheckFinal uygulaması için dikkatli çalışan bir tıbbi ön analiz yardımcısısın.

YALNIZCA aşağıdaki şemaya uygun geçerli JSON döndür:
{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string"
}

Kurallar:
- Bu uygulama tanı koymaz.
- Tedavi önermez.
- Nihai karar hekime aittir.
- publicSummary sade ve halkın anlayacağı şekilde olsun.
- doctorSummary daha klinik ve kısa olabilir.
- keyFindings mümkünse 3 ila 8 kısa bulgu içersin.
- publicWarnings sade ve anlaşılır olsun.
- doctorWarnings gerektiğinde daha klinik olabilir.
- privacyNotice tek kısa cümle olsun.
- Metin belirsizse bunu açıkça söyle.
- Sadece JSON döndür.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            language === "en"
              ? `Analyze this report content:\n\n${reportText}`
              : `Şu rapor içeriğini analiz et:\n\n${reportText}`
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        publicSummary:
          language === "en"
            ? "The analysis output could not be structured."
            : "Analiz çıktısı yapılandırılamadı.",
        doctorSummary:
          language === "en"
            ? "Model response was not valid JSON."
            : "Model yanıtı geçerli JSON değildi.",
        keyFindings: [],
        publicWarnings: [
          language === "en" ? "Please try again." : "Lütfen tekrar deneyin."
        ],
        doctorWarnings: [
          language === "en" ? "Invalid model output." : "Geçersiz model çıktısı."
        ],
        privacyNotice:
          language === "en"
            ? "Content is processed temporarily for analysis."
            : "İçerik analiz için geçici olarak işlenir."
      });
    }

    const safeResponse = {
      publicSummary:
        typeof parsed.publicSummary === "string"
          ? parsed.publicSummary
          : language === "en"
            ? "Pre-analysis completed."
            : "Ön analiz tamamlandı.",
      doctorSummary:
        typeof parsed.doctorSummary === "string"
          ? parsed.doctorSummary
          : language === "en"
            ? "Clinical pre-analysis completed."
            : "Klinik ön analiz tamamlandı.",
      keyFindings: Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.map(String).slice(0, 8)
        : [],
      publicWarnings: Array.isArray(parsed.publicWarnings)
        ? parsed.publicWarnings.map(String).slice(0, 8)
        : [],
      doctorWarnings: Array.isArray(parsed.doctorWarnings)
        ? parsed.doctorWarnings.map(String).slice(0, 8)
        : [],
      privacyNotice:
        typeof parsed.privacyNotice === "string"
          ? parsed.privacyNotice
          : language === "en"
            ? "Content is processed temporarily for analysis flow."
            : "İçerik analiz akışı için geçici olarak işlenir."
    };

    return res.status(200).json(safeResponse);
  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      publicSummary: "Analiz sırasında bir hata oluştu.",
      doctorSummary: "Sunucu tarafında hata oluştu.",
      keyFindings: [],
      publicWarnings: ["Lütfen tekrar deneyin."],
      doctorWarnings: ["Server error."],
      privacyNotice: "İçerik analiz akışı için geçici olarak işlenir."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
