require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY eksik.");
  process.exit(1);
}

function getSystemPrompt(lang) {
  if (lang === "en") {
    return `
You are a medical AI.

STRICT:
- Respond ONLY in English
- Return ONLY JSON
- No markdown
- No explanations

JSON FORMAT:
{
  "publicSummary": "...",
  "doctorSummary": "...",
  "keyFindings": ["..."],
  "publicWarnings": ["..."],
  "doctorWarnings": ["..."],
  "privacyNotice": "..."
}
`;
  }

  return `
Bir tıbbi yapay zekasın.

KESİN:
- SADECE Türkçe yaz
- SADECE JSON döndür
- Açıklama yok

JSON:
{
  "publicSummary": "...",
  "doctorSummary": "...",
  "keyFindings": ["..."],
  "publicWarnings": ["..."],
  "doctorWarnings": ["..."],
  "privacyNotice": "..."
}
`;
}

app.post("/analyze", async (req, res) => {
  try {
    const reportText = (req.body.reportText || "").trim();
    const language = req.body.language === "en" ? "en" : "tr";

    if (!reportText) {
      return res.status(400).json({ error: "Empty text" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: getSystemPrompt(language) }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: reportText }]
          }
        ]
      })
    });

    const data = await response.json();

    console.log("RAW AI:", JSON.stringify(data, null, 2));

    let text = data.output_text;

    // 🔴 EN KRİTİK FIX
    if (!text) {
      const found = data.output?.[0]?.content?.find(c => c.type === "output_text");
      text = found?.text;
    }

    if (!text) {
      console.log("MODEL BOŞ → FALLBACK ÇALIŞTI");

      return res.json({
        publicSummary: language === "en"
          ? "Basic evaluation generated."
          : "Temel değerlendirme oluşturuldu.",
        doctorSummary: language === "en"
          ? "Clinical interpretation limited."
          : "Klinik yorum sınırlı.",
        keyFindings: [
          language === "en" ? "Limited findings extracted" : "Sınırlı bulgu çıkarıldı"
        ],
        publicWarnings: [
          language === "en" ? "Not a diagnosis" : "Tanı değildir"
        ],
        doctorWarnings: [
          language === "en" ? "Clinical correlation required" : "Klinik korelasyon gerekir"
        ],
        privacyNotice: language === "en"
          ? "Data processed temporarily"
          : "Veriler geçici işlenir"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      console.log("JSON PARSE FAIL → FALLBACK");

      return res.json({
        publicSummary: text,
        doctorSummary: text,
        keyFindings: [text],
        publicWarnings: ["Parsing issue"],
        doctorWarnings: ["Parsing issue"],
        privacyNotice: "Temporary processing"
      });
    }

    res.json(parsed);

  } catch (err) {
    console.error("ERROR:", err);

    res.status(500).json({
      error: "Analysis failed",
      detail: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log("SERVER ÇALIŞIYOR → http://127.0.0.1:3000");
});

