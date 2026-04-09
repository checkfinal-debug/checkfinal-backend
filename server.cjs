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

app.post("/analyze", async (req, res) => {
  try {
    const { text, language = "tr", images = [] } = req.body;

    const isEnglish = language === "en";

    let content = [];

    if (text && text.trim() !== "") {
      content.push({
        type: "input_text",
        text: `Medical report / uploaded text:\n${text}`,
      });
    }

    if (images && images.length > 0) {
      images.forEach((img) => {
        content.push({
          type: "input_image",
          image_url: {
            url: img,
          },
        });
      });
    }

    const systemPrompt = isEnglish
      ? `
You are an AI-assisted clinical decision support system.

STRICT RULES:
- Do NOT diagnose
- Do NOT give certainty
- Do NOT hallucinate missing data
- Clearly state limitations
- Stay medically safe and conservative

TASK:
Generate structured medical interpretation.

PUBLIC MODE:
- Simple, clear
- No technical overload

DOCTOR MODE:
- More detailed
- Include clinical reasoning
- Include possible interpretation
- Include limitations clearly

IMPORTANT:
- If data is limited (single image, missing report), clearly say so
- If findings are unclear, DO NOT guess

OUTPUT STRICT JSON:
{
  "publicSummary": "...",
  "doctorSummary": "...",
  "keyFindings": ["..."],
  "publicWarnings": ["..."],
  "doctorWarnings": ["..."],
  "privacyNotice": "...",
  "actionPlan": {
    "urgency": "...",
    "whichDoctor": "...",
    "whatToDoNext": "..."
  }
}
`
      : `
Sen yapay zekâ destekli klinik karar destek sistemisin.

KURALLAR:
- Tanı koyma
- Kesinlik belirtme
- Eksik veriyi uydurma
- Her zaman veri sınırlılığını belirt
- Tıbbi olarak güvenli ve temkinli ol

GÖREV:
Yapılandırılmış analiz üret.

HALK MODU:
- Sade, anlaşılır
- Teknik terim az

DOKTOR MODU:
- Daha detaylı
- Klinik yorum içermeli
- Veri sınırlılığı mutlaka belirtilmeli
- Ayırıcı düşünce ima edilmeli ama kesinlik yok

KRİTİK:
- Tek görüntü / eksik veri varsa açıkça yaz
- Emin değilsen yorum yapma

JSON FORMAT:
{
  "publicSummary": "...",
  "doctorSummary": "...",
  "keyFindings": ["..."],
  "publicWarnings": ["..."],
  "doctorWarnings": ["..."],
  "privacyNotice": "...",
  "actionPlan": {
    "urgency": "...",
    "whichDoctor": "...",
    "whatToDoNext": "..."
  }
}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: content,
        },
      ],
      max_output_tokens: 1200,
    });

    let outputText = response.output_text;

    let parsed;

    try {
      parsed = JSON.parse(outputText);
    } catch (e) {
      return res.json(fallbackResponse(language));
    }

    // 🔥 SMART BRANCH BOOST
    if (parsed.keyFindings && parsed.keyFindings.length > 0) {
      const textAll = parsed.keyFindings.join(" ").toLowerCase();

      if (textAll.includes("lenf") || textAll.includes("hepatomegali")) {
        parsed.actionPlan.whichDoctor = isEnglish
          ? "Internal Medicine / Hematology"
          : "İç Hastalıkları / Hematoloji";
      }

      if (textAll.includes("beyin") || textAll.includes("bt")) {
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
