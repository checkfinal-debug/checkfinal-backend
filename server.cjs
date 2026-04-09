const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "200mb" }));

const PORT = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    actionPlan: {
      urgency: isEnglish ? "Not specified" : "Belirsiz",
      whichDoctor: isEnglish ? "General evaluation" : "Genel değerlendirme",
      whatToDoNext: isEnglish
        ? "Retry or consult a physician."
        : "Tekrar deneyin veya hekime başvurun.",
    },
  };
}

// 🔥 JSON CLEANER
function extractJSON(text) {
  try {
    if (!text) return null;

    // ```json bloklarını temizle
    text = text.replace(/```json/g, "").replace(/```/g, "");

    // JSON başlangıcını bul
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) return null;

    const jsonString = text.substring(firstBrace, lastBrace + 1);

    return JSON.parse(jsonString);
  } catch (err) {
    return null;
  }
}

app.post("/analyze", async (req, res) => {
  try {
    const { text, language = "tr", images = [] } = req.body;

    const isEnglish = language === "en";

    let content = [];

    if (text && text.trim() !== "") {
      content.push({
        type: "input_text",
        text: `Medical report:\n${text}`,
      });
    }

    if (images && images.length > 0) {
      images.forEach((img) => {
        content.push({
          type: "input_image",
          image_url: { url: img },
        });
      });
    }

    const systemPrompt = isEnglish
      ? `
You are a clinical decision support AI.

Rules:
- No diagnosis
- No certainty
- No hallucination
- Always mention limitations

Return ONLY JSON.
`
      : `
Sen klinik karar destek yapay zekasısın.

Kurallar:
- Tanı koyma
- Kesin konuşma
- Veri uydurma
- Sınırlılığı mutlaka belirt

SADECE JSON döndür.
`;

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content },
      ],
      max_output_tokens: 1200,
    });

    const rawText = response.output_text;

    // 🔥 KRİTİK NOKTA
    let parsed = extractJSON(rawText);

    if (!parsed) {
      console.log("⚠️ JSON parse failed, fallback used");
      return res.json(fallbackResponse(language));
    }

    // 🔥 BRANCH BOOST
    if (parsed.keyFindings?.length > 0) {
      const txt = parsed.keyFindings.join(" ").toLowerCase();

      if (txt.includes("lenf") || txt.includes("hepatomegali")) {
        parsed.actionPlan.whichDoctor = isEnglish
          ? "Internal Medicine / Hematology"
          : "İç Hastalıkları / Hematoloji";
      }

      if (txt.includes("beyin") || txt.includes("bt")) {
        parsed.actionPlan.whichDoctor = isEnglish
          ? "Neurology / Radiology"
          : "Nöroloji / Radyoloji";
      }
    }

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.json(fallbackResponse(req.body.language));
  }
});

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
