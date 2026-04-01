import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("CheckFinal backend is running");
});

app.post("/analyze", async (req, res) => {
  try {
    const reportText = req.body?.reportText?.trim();
    const language = req.body?.language === "en" ? "en" : "tr";

    if (!reportText) {
      return res.status(400).json({
        publicSummary: language === "en" ? "No report text was provided." : "Rapor metni gönderilmedi.",
        doctorSummary: language === "en" ? "No clinical text was provided." : "Klinik metin gönderilmedi.",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice: language === "en"
          ? "This report contains personal health information."
          : "Bu rapor kişisel sağlık bilgisi içerir."
      });
    }

    const developerPrompt = language === "en"
      ? `
You are a medical decision-support assistant.

Your task is NOT to merely rewrite the report.
Your task is to EXPLAIN the report clearly.

Return ONLY valid JSON with these exact keys:
{
  "publicSummary": string,
  "doctorSummary": string,
  "keyFindings": string[],
  "publicWarnings": string[],
  "doctorWarnings": string[],
  "privacyNotice": string
}

Rules:
- publicSummary:
  Explain in plain language for an ordinary person.
  Say what the report is about.
  Explain what the important values may mean.
  Mention if values are low, high, normal, or borderline when possible.
  Do NOT diagnose with certainty.
  Do NOT use excessive jargon.

- doctorSummary:
  Write a more clinical interpretation for a physician.
  Mention possible significance of abnormalities.
  Mention likely differential-style considerations if appropriate.
  Still avoid definitive diagnosis unless explicitly obvious.

- keyFindings:
  Return short bullet-like findings.
  Example: "White blood cell count is mildly low."
  Example: "Iron level is near the lower range."

- publicWarnings:
  Explain what deserves attention in simple language.
  Mention when physician follow-up may be needed.

- doctorWarnings:
  Mention clinically relevant cautions, limitations, red flags, correlation needs.

- privacyNotice:
  One short privacy sentence.

Important:
- Do not only copy the report.
- Interpret and explain.
- If the report is incomplete, say that clearly.
- If numeric values exist, use them in context.
- Output ONLY JSON.
`
      : `
Sen tıbbi karar destek amaçlı çalışan bir yapay zekâsın.

Görevin raporu sadece yeniden yazmak değildir.
Görevin raporu ANLAMLANDIRMAK ve AÇIKLAMAKtır.

Sadece şu anahtarlarla GEÇERLİ JSON döndür:
{
  "publicSummary": string,
  "doctorSummary": string,
  "keyFindings": string[],
  "publicWarnings": string[],
  "doctorWarnings": string[],
  "privacyNotice": string
}

Kurallar:
- publicSummary:
  Halkın anlayacağı sade Türkçe ile yaz.
  Bu raporun ne hakkında olduğunu açıkla.
  Önemli değerlerin ne anlama gelebileceğini anlat.
  Uygunsa düşük, yüksek, normal, sınırda gibi ifadeler kullan.
  Kesin tanı koyma.
  Gereksiz tıbbi jargon kullanma.

- doctorSummary:
  Doktora yönelik daha klinik özet yaz.
  Anormal bulguların olası önemini belirt.
  Gerekirse ayırıcı tanı mantığında olası klinik anlamları söyle.
  Yine de kesin tanı koyma.

- keyFindings:
  Kısa, net bulgular halinde yaz.
  Örnek: "Beyaz küre sayısı hafif düşük görünüyor."
  Örnek: "Demir düzeyi alt sınıra yakın."

- publicWarnings:
  Halkın anlayacağı şekilde dikkat edilmesi gerekenleri yaz.
  Gerekirse doktor kontrolü gerekebileceğini belirt.

- doctorWarnings:
  Klinik açıdan dikkat edilmesi gereken noktaları yaz.
  Korelasyon gerekliliği, sınırlılıklar, alarm bulguları gibi şeyleri belirt.

- privacyNotice:
  Tek cümlelik kısa gizlilik notu yaz.

Önemli:
- Metni sadece kopyalama.
- Yorumla ve açıkla.
- Rapor eksikse bunu açıkça söyle.
- Sayısal değer varsa bağlam içinde değerlendir.
- Sadece JSON döndür.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "developer", content: developerPrompt },
        {
          role: "user",
          content: `Dil: ${language}\n\nRapor metni:\n${reportText}`
        }
      ],
      temperature: 0.2
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        publicSummary: language === "en"
          ? "The server produced an invalid response."
          : "Sunucu geçersiz bir yanıt üretti.",
        doctorSummary: language === "en"
          ? "The model output could not be parsed."
          : "Model çıktısı ayrıştırılamadı.",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice: language === "en"
          ? "This report contains personal health information."
          : "Bu rapor kişisel sağlık bilgisi içerir."
      });
    }

    res.json({
      publicSummary: parsed.publicSummary || "",
      doctorSummary: parsed.doctorSummary || "",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      publicWarnings: Array.isArray(parsed.publicWarnings) ? parsed.publicWarnings : [],
      doctorWarnings: Array.isArray(parsed.doctorWarnings) ? parsed.doctorWarnings : [],
      privacyNotice: parsed.privacyNotice || (
        language === "en"
          ? "This report contains personal health information and should be kept private."
          : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
      )
    });

  } catch (error) {
    console.error("Analyze error:", error);

    res.status(500).json({
      publicSummary: "Analiz sırasında hata oluştu.",
      doctorSummary: "Sunucu analiz işlemini tamamlayamadı.",
      keyFindings: [],
      publicWarnings: [],
      doctorWarnings: [],
      privacyNotice: "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
