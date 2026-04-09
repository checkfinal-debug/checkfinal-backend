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
      ? "The uploaded content could not be fully interpreted. Please try again."
      : "Yüklenen içerik tam olarak yorumlanamadı. Lütfen tekrar deneyin.",
    doctorSummary: isEnglish
      ? "Structured clinical decision-support output could not be generated from the available content."
      : "Mevcut içerikten yapılandırılmış klinik karar destek çıktısı üretilemedi.",
    keyFindings: [],
    publicWarnings: isEnglish
      ? ["If symptoms are severe, new, or rapidly worsening, seek prompt medical care."]
      : ["Şikayetleriniz şiddetliyse, yeniyse veya hızla artıyorsa gecikmeden sağlık kuruluşuna başvurun."],
    doctorWarnings: isEnglish
      ? ["Manual review of the original source material is recommended."]
      : ["Orijinal kaynak materyalin manuel olarak gözden geçirilmesi önerilir."],
    privacyNotice: isEnglish
      ? "Your data is processed only for this analysis."
      : "Verileriniz yalnızca bu analiz için işlenir.",
    actionPlan: {
      urgency: isEnglish ? "Not specified" : "Belirsiz",
      whichDoctor: isEnglish ? "General evaluation" : "Genel değerlendirme",
      whatToDoNext: isEnglish
        ? "Please retry or consult a physician."
        : "Lütfen tekrar deneyin veya bir hekime başvurun.",
    },
  };
}

function normalizeImageInput(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  // raw base64 gelirse jpeg data url'e çevir
  return `data:image/jpeg;base64,${trimmed}`;
}

function extractTextFromResponse(response) {
  try {
    if (
      response &&
      Array.isArray(response.output) &&
      response.output.length > 0
    ) {
      const outputItem = response.output.find(
        (item) => item && item.type === "message" && Array.isArray(item.content)
      );

      if (outputItem) {
        const textItem = outputItem.content.find(
          (c) => c && (c.type === "output_text" || typeof c.text === "string")
        );

        if (textItem && typeof textItem.text === "string") {
          return textItem.text;
        }
      }
    }
  } catch (_) {}

  return "";
}

function extractJSON(text) {
  if (!text || typeof text !== "string") return null;

  let cleaned = text.trim();

  cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonCandidate = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonCandidate);
  } catch (_) {
    return null;
  }
}

function safeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeActionPlan(actionPlan, language = "tr") {
  const isEnglish = language === "en";

  const fallback = fallbackResponse(language).actionPlan;

  if (!actionPlan || typeof actionPlan !== "object") {
    return fallback;
  }

  let urgency = safeString(actionPlan.urgency, fallback.urgency);
  let whichDoctor = safeString(actionPlan.whichDoctor, fallback.whichDoctor);
  let whatToDoNext = safeString(actionPlan.whatToDoNext, fallback.whatToDoNext);

  const all = `${urgency} ${whichDoctor} ${whatToDoNext}`.toLowerCase();

  // branş güçlendirme
  if (
    all.includes("jak2") ||
    all.includes("bcr/abl") ||
    all.includes("hemat") ||
    all.includes("lenf") ||
    all.includes("lymph") ||
    all.includes("hepatomegali") ||
    all.includes("thrombocyt") ||
    all.includes("platelet")
  ) {
    whichDoctor = isEnglish ? "Hematology" : "Hematoloji";
  }

  if (
    all.includes("brain") ||
    all.includes("beyin") ||
    all.includes("cranial") ||
    all.includes("nöro") ||
    all.includes("neuro") ||
    all.includes("ct") ||
    all.includes("bt")
  ) {
    if (
      all.includes("focal deficit") ||
      all.includes("altered consciousness") ||
      all.includes("seizure") ||
      all.includes("ani güçsüzlük") ||
      all.includes("bilinç değişikliği") ||
      all.includes("nöbet")
    ) {
      whichDoctor = isEnglish ? "Emergency / Neurology" : "Acil / Nöroloji";
    } else {
      whichDoctor = isEnglish ? "Neurology" : "Nöroloji";
    }
  }

  // aşırı kesinlik varsa yumuşat
  if (
    urgency.toLowerCase().includes("high risk") ||
    urgency.toLowerCase().includes("medium risk") ||
    urgency.toLowerCase().includes("low risk")
  ) {
    urgency = isEnglish
      ? "Medical evaluation should be planned according to symptoms and findings."
      : "Belirtiler ve bulgulara göre tıbbi değerlendirme planlanmalıdır.";
  }

  return {
    urgency,
    whichDoctor,
    whatToDoNext,
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

    const language = body.language === "en" ? "en" : "tr";
    const isEnglish = language === "en";

    const reportText =
      typeof body.reportText === "string"
        ? body.reportText.trim()
        : typeof body.text === "string"
        ? body.text.trim()
        : "";

    const rawImages = Array.isArray(body.images)
      ? body.images
      : Array.isArray(body.imageDataUrls)
      ? body.imageDataUrls
      : [];

    const images = rawImages.map(normalizeImageInput).filter(Boolean);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ...fallbackResponse(language),
        publicSummary: isEnglish
          ? "Server configuration error: OpenAI API key is missing."
          : "Sunucu yapılandırma hatası: OpenAI API anahtarı eksik.",
        doctorSummary: isEnglish
          ? "OPENAI_API_KEY is missing on the server."
          : "Sunucuda OPENAI_API_KEY tanımlı değil.",
      });
    }

    if (!reportText && images.length === 0) {
      return res.status(400).json({
        error: isEnglish ? "No content provided." : "İçerik gönderilmedi.",
      });
    }

    const systemPrompt = isEnglish
      ? `
You are CheckFinal's safety-first clinical decision-support AI.

CORE ROLE:
- Interpret uploaded medical text, report text, laboratory text, radiology report text, and medical images.
- Do NOT make a definitive diagnosis.
- Do NOT prescribe treatment.
- Do NOT invent missing findings.
- Do NOT overstate certainty.
- Always stay medically conservative and legally safe.

GLOBAL RULES:
- Use uncertainty language: "may suggest", "can be associated with", "should be evaluated", "cannot be excluded".
- If the data is limited, explicitly say so.
- If a single image or screenshot is provided, clearly state that full series / official report may be required.
- If only partial data exists, do not act as if the case is complete.
- If red flags are possible, mention them clearly.
- Keep patient safety higher than confidence.

SPECIALTY ROUTING RULES:
- Suggest the MOST relevant first specialty.
- Default to Internal Medicine only if no stronger specialty signal exists.
- If brain CT/MR / neurologic content dominates -> prioritize Neurology.
- If focal neurologic deficit, seizure, altered consciousness, sudden severe headache -> Emergency / Neurology.
- If hematology pattern dominates (CBC abnormalities, JAK2, BCR/ABL, thrombocytosis, leukocytosis, lymph nodes + hepatomegaly, marrow / blood-forming organ concern) -> prioritize Hematology.
- If cardiac symptoms dominate -> Cardiology.
- If respiratory findings dominate -> Pulmonology.
- If endocrine/metabolic pattern dominates -> Endocrinology or Internal Medicine.
- If GI/hepatic pattern dominates -> Gastroenterology or Internal Medicine.
- If ENT-region findings dominate and are isolated -> ENT.
- Use the strongest signal, not the safest generic specialty.

PUBLIC MODE REQUIREMENTS:
- Clear, simple, calm
- No unnecessary jargon
- Explain what the findings may mean
- Explain what to do next
- Be understandable to a non-doctor

DOCTOR MODE REQUIREMENTS:
- More detailed than public mode
- Include structured clinical interpretation
- Mention likely significance of major findings
- Mention reasonable differential direction without claiming certainty
- Mention limitations explicitly
- Mention what follow-up evaluation is logically appropriate
- Avoid filler; write dense, clinically useful text

OUTPUT RULES:
Return ONLY valid JSON.
Use EXACTLY this schema:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "actionPlan": {
    "urgency": "string",
    "whichDoctor": "string",
    "whatToDoNext": "string"
  }
}
`
      : `
Sen CheckFinal için çalışan, güvenlik öncelikli klinik karar destek yapay zekâsısın.

TEMEL GÖREVİN:
- Yüklenen tıbbi metni, rapor metnini, laboratuvar içeriğini, radyoloji rapor metnini ve medikal görüntüleri yorumlamak.
- Kesin tanı koyma.
- Tedavi yazma.
- Eksik bulgu uydurma.
- Gereksiz kesinlik kullanma.
- Tıbbi ve hukuki açıdan temkinli kal.

GENEL KURALLAR:
- Her zaman belirsizlik dili kullan:
  "düşündürebilir", "ilişkili olabilir", "değerlendirilmelidir", "dışlanamaz".
- Veri sınırlıysa bunu açıkça söyle.
- Tek görüntü / ekran görüntüsü varsa tam seri ve resmi rapor gerekebileceğini mutlaka belirt.
- Eksik veri varsa olguyu tamamlanmış gibi yorumlama.
- Olası kırmızı bayrakları açıkça belirt.
- Güven yerine hasta güvenliğini öncele.

BRANŞ YÖNLENDİRME KURALLARI:
- En güçlü sinyale göre ilk branşı seç.
- Daha güçlü sinyal yoksa İç Hastalıkları fallback olarak kullanılabilir.
- Beyin BT/MR / nörolojik içerik baskınsa -> Nöroloji öncelikli düşün.
- Fokal nörolojik defisit, nöbet, bilinç değişikliği, ani şiddetli baş ağrısı varsa -> Acil / Nöroloji.
- Hematoloji örüntüsü baskınsa (CBC bozuklukları, JAK2, BCR/ABL, trombositoz, lökositoz, lenf nodu + hepatomegali, kan ve kan yapıcı organ şüphesi) -> Hematoloji öncelikli düşün.
- Kardiyak örüntü baskınsa -> Kardiyoloji.
- Solunumsal örüntü baskınsa -> Göğüs Hastalıkları.
- Endokrin / metabolik örüntü baskınsa -> Endokrinoloji veya İç Hastalıkları.
- Gastrointestinal / hepatik örüntü baskınsa -> Gastroenteroloji veya İç Hastalıkları.
- İzole KBB bölgesi bulguları baskınsa -> Kulak Burun Boğaz.
- En güvenli jenerik branşı değil, en güçlü klinik branşı seç.

HALK MODU:
- Sade, açık, sakin
- Gereksiz teknik dil kullanma
- Bulguların ne anlama gelebileceğini anlat
- Sonraki adımı net söyle

DOKTOR MODU:
- Halk modundan daha detaylı olmalı
- Yapılandırılmış klinik yorum içermeli
- Majör bulguların olası önemini belirtmeli
- Kesin tanı koymadan ayırıcı yön belirtmeli
- Veri sınırlılığını açıkça yazmalı
- Mantıklı takip / ileri değerlendirme yönünü belirtmeli
- Gereksiz uzatma değil, yoğun klinik içerik üretmeli

ÇIKTI KURALI:
Sadece geçerli JSON döndür.
TAM OLARAK şu yapıyı kullan:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "actionPlan": {
    "urgency": "string",
    "whichDoctor": "string",
    "whatToDoNext": "string"
  }
}
`;

    const userContent = [];

    if (reportText) {
      userContent.push({
        type: "input_text",
        text: isEnglish
          ? `Medical report / uploaded text:\n\n${reportText}`
          : `Tıbbi rapor / yüklenen metin:\n\n${reportText}`,
      });
    } else {
      userContent.push({
        type: "input_text",
        text: isEnglish
          ? "Please analyze the attached medical images conservatively and return structured JSON."
          : "Lütfen ekli medikal görselleri temkinli şekilde analiz et ve yapılandırılmış JSON döndür.",
      });
    }

    for (const img of images) {
      userContent.push({
        type: "input_image",
        image_url: img,
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      max_output_tokens: 1800,
    });

    const rawText = extractTextFromResponse(response);

    if (!rawText || !rawText.trim()) {
      console.log("Empty AI response");
      return res.json(fallbackResponse(language));
    }

    const parsed = extractJSON(rawText);

    if (!parsed) {
      console.log("JSON parse failed");
      console.log(rawText);
      return res.json(fallbackResponse(language));
    }

    const fallback = fallbackResponse(language);

    const responsePayload = {
      publicSummary: safeString(parsed.publicSummary, fallback.publicSummary),
      doctorSummary: safeString(parsed.doctorSummary, fallback.doctorSummary),
      keyFindings: toArray(parsed.keyFindings),
      publicWarnings:
        toArray(parsed.publicWarnings).length > 0
          ? toArray(parsed.publicWarnings)
          : fallback.publicWarnings,
      doctorWarnings:
        toArray(parsed.doctorWarnings).length > 0
          ? toArray(parsed.doctorWarnings)
          : fallback.doctorWarnings,
      privacyNotice: safeString(parsed.privacyNotice, fallback.privacyNotice),
      actionPlan: normalizeActionPlan(parsed.actionPlan, language),
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.json(fallbackResponse(req.body?.language || "tr"));
  }
});

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
