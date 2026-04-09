const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

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
      ? "The report could not be fully interpreted. Please try again."
      : "Rapor yorumlanamadı. Lütfen tekrar deneyin.",
    doctorSummary: isEnglish
      ? "Structured interpretation could not be generated."
      : "Yapılandırılmış yorum üretilemedi.",
    keyFindings: [],
    publicWarnings: [],
    doctorWarnings: [],
    privacyNotice: isEnglish
      ? "Your data is processed only for this analysis."
      : "Verileriniz yalnızca bu analiz için işlenir.",
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

    const reportText =
      typeof body.reportText === "string" ? body.reportText.trim() : "";

    const images = Array.isArray(body.images) ? body.images : [];

    const selectedLanguage = body.language === "en" ? "en" : "tr";
    const isEnglish = selectedLanguage === "en";

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json(fallbackResponse(selectedLanguage));
    }

    if (!reportText && images.length === 0) {
      return res.status(400).json({
        error: isEnglish
          ? "No content provided."
          : "İçerik gönderilmedi.",
      });
    }

    // =========================
    // SYSTEM PROMPT
    // =========================

    const systemPrompt = isEnglish
      ? `
You are a cautious medical decision-support assistant.

You analyze BOTH:
•⁠  ⁠medical report text
•⁠  ⁠medical images (radiology, scans, etc.)

You DO NOT diagnose.

Rules:
•⁠  ⁠Use cautious language
•⁠  ⁠Suggest possible interpretations
•⁠  ⁠Indicate urgency: Emergency / Urgent / Routine
•⁠  ⁠Suggest which doctor to see
•⁠  ⁠Mention red flags
•⁠  ⁠If uncertain → clearly say so

Return ONLY JSON:

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
Sen dikkatli bir tıbbi karar destek asistanısın.

Hem:
•⁠  ⁠metin
•⁠  ⁠görüntü

analiz edersin.

Kesin tanı koymazsın.

Kurallar:
•⁠  ⁠Temkinli konuş
•⁠  ⁠Olasılık belirt
•⁠  ⁠Aciliyet belirt: Acil / Kısa sürede / Rutin
•⁠  ⁠Branş öner
•⁠  ⁠Kırmızı bayrakları yaz
•⁠  ⁠Emin değilsen açıkça belirt

SADECE JSON döndür:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string"
}
`;

    // =========================
    // CONTENT BUILD (TEXT + IMAGE)
    // =========================

    const content = [];

    if (reportText) {
      content.push({
        type: "text",
        text: reportText,
      });
    }

    images.forEach((img) => {
      content.push({
        type: "image_url",
        image_url: {
          url: ⁠ data:image/jpeg;base64,${img} ⁠,
        },
      });
    });

    // =========================
    // OPENAI CALL (VISION + TEXT)
    // =========================

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: content,
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json(fallbackResponse(selectedLanguage));
    }

    const fallback = fallbackResponse(selectedLanguage);

    const responsePayload = {
      publicSummary: parsed.publicSummary || fallback.publicSummary,
      doctorSummary: parsed.doctorSummary || fallback.doctorSummary,
      keyFindings: toArray(parsed.keyFindings),
      publicWarnings: toArray(parsed.publicWarnings),
      doctorWarnings: toArray(parsed.doctorWarnings),
      privacyNotice: parsed.privacyNotice || fallback.privacyNotice,
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json(fallbackResponse("tr"));
  }
});

app.listen(PORT, () => {
  console.log(⁠ CheckFinal backend running on port ${PORT} ⁠);
});
