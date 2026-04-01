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
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim() !== "")
    : [];
}

function fallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The report could not be analyzed in detail at this time. Please try again. If you have urgent symptoms, seek medical care promptly."
      : "Rapor şu anda ayrıntılı olarak analiz edilemedi. Lütfen tekrar deneyin. Acil şikayetiniz varsa gecikmeden sağlık kuruluşuna başvurun.",
    doctorSummary: isEnglish
      ? "Detailed structured interpretation could not be generated. Correlate with clinical history, symptoms, examination, and original laboratory reference ranges."
      : "Ayrıntılı yapılandırılmış yorum üretilemedi. Klinik öykü, semptomlar, muayene ve orijinal laboratuvar referans aralıkları ile birlikte değerlendirilmelidir.",
    keyFindings: isEnglish
      ? ["The uploaded report text was received, but a complete interpretation could not be produced."]
      : ["Yüklenen rapor metni alındı ancak tam yorum üretilemedi."],
    publicWarnings: isEnglish
      ? ["If you have severe pain, shortness of breath, fainting, active bleeding, or high fever, seek urgent medical care."]
      : ["Şiddetli ağrı, nefes darlığı, bayılma, aktif kanama veya yüksek ateş varsa acil değerlendirme gerekir."],
    doctorWarnings: isEnglish
      ? ["Review original report manually and correlate clinically."]
      : ["Orijinal rapor manuel olarak gözden geçirilmeli ve klinik ile birlikte yorumlanmalıdır."],
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
    const { reportText, language } = req.body || {};
    const selectedLanguage = language === "en" ? "en" : "tr";
    const isEnglish = selectedLanguage === "en";

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ...fallbackResponse(selectedLanguage),
        publicSummary: isEnglish
          ? "OpenAI API key is missing on the server."
          : "Sunucuda OpenAI API anahtarı eksik.",
        doctorSummary: isEnglish
          ? "Server configuration error: OPENAI_API_KEY is missing."
          : "Sunucu yapılandırma hatası: OPENAI_API_KEY eksik.",
      });
    }

    if (!reportText || typeof reportText !== "string" || !reportText.trim()) {
      return res.status(400).json({
        error: isEnglish ? "No report text provided." : "Rapor metni gönderilmedi.",
      });
    }

    const systemPrompt = isEnglish
      ? `
You are a careful medical decision-support assistant for the CheckFinal app.
You are NOT making a final diagnosis.
You must analyze medical report text and return ONLY valid JSON.

Your job:
 1.⁠ ⁠Extract the important findings from the report.
 2.⁠ ⁠Explain them clearly for normal people in publicSummary.
 3.⁠ ⁠In publicSummary, clearly state:
   - what the important abnormalities may suggest,
   - which medical specialty the patient should see first,
   - whether this seems emergency / urgent soon / routine follow-up.
 4.⁠ ⁠publicWarnings must be short, practical, understandable bullet points for laypersons.
 5.⁠ ⁠doctorSummary must be more technical, more structured, and more clinically useful.
 6.⁠ ⁠doctorWarnings must include differential considerations, red flags, and clinical next-step suggestions when appropriate.
 7.⁠ ⁠keyFindings must list important values and whether high / low / normal when inferable.
 8.⁠ ⁠If the report is limited or unclear, say so clearly.
 9.⁠ ⁠Never promise a diagnosis. Use wording like "may suggest", "can be associated with", "should be evaluated".
10.⁠ ⁠Keep output concise but useful.

Return EXACTLY this JSON shape:
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

Görevin:
 1.⁠ ⁠Rapor metnindeki önemli bulguları ayıkla.
 2.⁠ ⁠publicSummary alanında bunu halkın anlayacağı dille açıkla.
 3.⁠ ⁠publicSummary içinde mutlaka açıkça yaz:
   - önemli anormalliklerin neyi düşündürebileceğini,
   - hastanın ilk olarak hangi branşa başvurması gerektiğini,
   - durumun acil / kısa sürede değerlendirme / rutin kontrol düzeyinde olup olmadığını.
 4.⁠ ⁠publicWarnings alanı halk için kısa, net, uygulanabilir maddeler olsun.
 5.⁠ ⁠doctorSummary daha teknik, daha ayrıntılı ve klinik olarak daha faydalı olsun.
 6.⁠ ⁠doctorWarnings içinde ayırıcı tanı, kırmızı bayrak bulgular ve uygun sonraki adımlar yer alsın.
 7.⁠ ⁠keyFindings içinde önemli değerler ve mümkünse düşük / yüksek / normal bilgisi yer alsın.
 8.⁠ ⁠Rapor eksik ya da belirsizse bunu açıkça söyle.
 9.⁠ ⁠Kesin tanı varmış gibi yazma. "düşündürebilir", "ilişkili olabilir", "değerlendirilmelidir" dili kullan.
10.⁠ ⁠Çıktı kısa ama anlamlı olsun.

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
      ? ⁠ Medical report text:\n\n${reportText} ⁠
      : ⁠ Tıbbi rapor metni:\n\n${reportText} ⁠;

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
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(500).json(fallbackResponse(selectedLanguage));
    }

    const responsePayload = {
      publicSummary:
        typeof parsed.publicSummary === "string" && parsed.publicSummary.trim()
          ? parsed.publicSummary.trim()
          : fallbackResponse(selectedLanguage).publicSummary,
      doctorSummary:
        typeof parsed.doctorSummary === "string" && parsed.doctorSummary.trim()
          ? parsed.doctorSummary.trim()
          : fallbackResponse(selectedLanguage).doctorSummary,
      keyFindings: toArray(parsed.keyFindings),
      publicWarnings: toArray(parsed.publicWarnings),
      doctorWarnings: toArray(parsed.doctorWarnings),
      privacyNotice:
        typeof parsed.privacyNotice === "string" && parsed.privacyNotice.trim()
          ? parsed.privacyNotice.trim()
          : fallbackResponse(selectedLanguage).privacyNotice,
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Analyze error:", error);

    const language = req.body?.language === "en" ? "en" : "tr";
    return res.status(500).json(fallbackResponse(language));
  }
});

app.listen(PORT, () => {
  console.log(⁠ CheckFinal backend running on port ${PORT} ⁠);
});