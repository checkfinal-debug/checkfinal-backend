const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function toArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The report could not be fully interpreted at this time. Please try again. If you have severe symptoms, seek medical care promptly."
      : "Rapor şu anda tam olarak yorumlanamadı. Lütfen tekrar deneyin. Ciddi şikayetleriniz varsa gecikmeden sağlık kuruluşuna başvurun.",
    doctorSummary: isEnglish
      ? "Structured interpretation could not be generated. Clinical correlation with history, examination, and original laboratory ranges is required."
      : "Yapılandırılmış yorum üretilemedi. Klinik öykü, muayene ve orijinal laboratuvar referans aralıkları ile birlikte değerlendirme gerekir.",
    keyFindings: isEnglish
      ? ["The uploaded report text was received, but full analysis could not be generated."]
      : ["Yüklenen rapor metni alındı ancak tam analiz üretilemedi."],
    publicWarnings: isEnglish
      ? ["If you have chest pain, shortness of breath, fainting, severe bleeding, or high fever, seek urgent care."]
      : ["Göğüs ağrısı, nefes darlığı, bayılma, ciddi kanama veya yüksek ateş varsa acil değerlendirme gerekir."],
    doctorWarnings: isEnglish
      ? ["Manual review of the source report is recommended."]
      : ["Kaynak raporun manuel gözden geçirilmesi önerilir."],
    privacyNotice: isEnglish
      ? "Your data is processed only for this analysis and should be kept private."
      : "Verileriniz yalnızca bu analiz için işlenir ve gizli tutulmalıdır.",
  };
}

app.get("/", (req, res) => {
  res.send("CheckFinal backend is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/analyze", async (req, res) => {
  try {
    const body = req.body || {};
    const reportText = typeof body.reportText === "string" ? body.reportText.trim() : "";
    const selectedLanguage = body.language === "en" ? "en" : "tr";
    const isEnglish = selectedLanguage === "en";

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ...fallbackResponse(selectedLanguage),
        publicSummary: isEnglish
          ? "Server configuration error: OpenAI API key is missing."
          : "Sunucu yapılandırma hatası: OpenAI API anahtarı eksik.",
        doctorSummary: isEnglish
          ? "OPENAI_API_KEY is missing on the server."
          : "Sunucuda OPENAI_API_KEY tanımlı değil.",
      });
    }

    if (!reportText) {
      return res.status(400).json({
        error: isEnglish ? "No report text provided." : "Rapor metni gönderilmedi.",
      });
    }

    const systemPrompt = isEnglish
      ? `
You are a cautious medical decision-support assistant for the CheckFinal app.
You do NOT make a definitive diagnosis.
You must return ONLY valid JSON.

Your output must help in two separate levels:
1) Public mode: plain English, easy to understand, useful for non-medical users.
2) Doctor mode: more clinical, structured, and medically useful.

Rules:
- Explain what the abnormalities may suggest.
- Clearly state which medical specialty should be consulted first.
- Clearly state urgency as one of these: Emergency / Urgent within days / Routine follow-up.
- Do not overstate certainty.
- Use phrases like "may suggest", "can be associated with", "should be evaluated".
- Mention red flags when appropriate.
- If the data is limited, say so.
- Keep publicSummary understandable by ordinary people.
- Make doctorSummary more technical and clinically oriented.
- keyFindings should contain concise findings with value + interpretation when possible.
- publicWarnings should be practical and understandable.
- doctorWarnings should include differential considerations, next steps, and red flags if relevant.

Return EXACTLY this JSON structure:
{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string"
}
`
      : `
Sen CheckFinal uygulaması için dikkatli çalışan bir tıbbi karar destek asistanısın.
Kesin tanı koymuyorsun.
Sadece geçerli JSON döndür.

İki ayrı düzeyde çıktı üretmelisin:
1) Halk modu: sade Türkçe, halkın anlayacağı dil, yönlendirici ve net.
2) Doktor modu: daha klinik, daha yapılandırılmış, daha tıbbi.

Kurallar:
- Anormal bulguların neyi düşündürebileceğini açıkla.
- Hastanın ilk hangi branşa başvurması gerektiğini açıkça yaz.
- Aciliyet düzeyini mutlaka şu üç kategoriden biriyle belirt:
  Acil / Kısa sürede değerlendirme gerekir / Rutin kontrol uygun.
- Kesin konuşma, "düşündürebilir", "ilişkili olabilir", "değerlendirilmelidir" dili kullan.
- Uygunsa kırmızı bayrakları belirt.
- Veri sınırlıysa bunu açıkça söyle.
- publicSummary halkın anlayacağı kadar sade olsun.
- doctorSummary daha teknik ve klinik olsun.
- keyFindings alanı kısa ve net maddelerden oluşsun; mümkünse değer + yorum içersin.
- publicWarnings uygulanabilir ve anlaşılır maddeler olsun.
- doctorWarnings ayırıcı tanı, önerilen sonraki adım ve kırmızı bayrak bilgisi içersin.

JSON biçimi TAM OLARAK şu olsun:
{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string"
}
`;

    const userPrompt = isEnglish
      ? `Medical report text:\n\n${reportText}`
      : `Tıbbi rapor metni:\n\n${reportText}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return res.status(500).json(fallbackResponse(selectedLanguage));
    }

    const fallback = fallbackResponse(selectedLanguage);

    const responsePayload = {
      publicSummary:
        typeof parsed.publicSummary === "string" && parsed.publicSummary.trim()
          ? parsed.publicSummary.trim()
          : fallback.publicSummary,
      doctorSummary:
        typeof parsed.doctorSummary === "string" && parsed.doctorSummary.trim()
          ? parsed.doctorSummary.trim()
          : fallback.doctorSummary,
      keyFindings: toArray(parsed.keyFindings),
      publicWarnings: toArray(parsed.publicWarnings),
      doctorWarnings: toArray(parsed.doctorWarnings),
      privacyNotice:
        typeof parsed.privacyNotice === "string" && parsed.privacyNotice.trim()
          ? parsed.privacyNotice.trim()
          : fallback.privacyNotice,
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Analyze error:", error);
    const language = req.body && req.body.language === "en" ? "en" : "tr";
    return res.status(500).json(fallbackResponse(language));
  }
});

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
