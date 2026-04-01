const express = require("express");
const cors = require("cors");
const otenv = require("dotenv");
const OpenAI = require("openai");

dotenv.cdonfig();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/analyze", async (req, res) => {
  try {
    const { reportText, language } = req.body;

    if (!reportText) {
      return res.status(400).json({
        error: "No report text provided",
      });
    }

    const isEnglish = language === "en";

    const prompt = `
You are an advanced medical AI.

STRICT RULES:

PUBLIC OUTPUT MUST INCLUDE:
- What is wrong (simple)
- Is it serious? (Low / Medium / High)
- Which doctor to visit (VERY CLEAR)
- What to do next (action steps)

DOCTOR OUTPUT MUST INCLUDE:
- Clinical interpretation
- Differential diagnosis
- Recommended tests
- Risk evaluation

RETURN JSON ONLY:

{
  "publicSummary": "...",
  "doctorSummary": "...",
  "keyFindings": ["...", "..."],
  "publicWarnings": ["...", "..."],
  "doctorWarnings": ["...", "..."],
  "privacyNotice": "${isEnglish ? "This report is private." : "Bu rapor gizlidir."}"
}

LANGUAGE: ${isEnglish ? "ENGLISH" : "TURKISH"}

REPORT:
${reportText}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: prompt,
    });

    let text = response.output[0].content[0].text;

    let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({
        publicSummary: isEnglish
          ? "Analysis failed"
          : "Analiz başarısız",
        doctorSummary: "",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice: isEnglish
          ? "This report is private."
          : "Bu rapor gizlidir.",
      });
    }

    res.json(parsed);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      publicSummary:
        language === "en"
          ? "Server error"
          : "Sunucu hatası",
      doctorSummary: "",
      keyFindings: [],
      publicWarnings: [],
      doctorWarnings: [],
      privacyNotice:
        language === "en"
          ? "This report is private."
          : "Bu rapor gizlidir.",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("CheckFinal backend running on port " + PORT);
});
