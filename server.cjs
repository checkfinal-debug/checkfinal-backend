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

function safeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeImageInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  return `data:image/jpeg;base64,${trimmed}`;
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
      urgency: isEnglish
        ? "Medical evaluation should be planned according to symptoms and findings."
        : "Belirtiler ve bulgulara göre tıbbi değerlendirme planlanmalıdır.",
      whichDoctor: isEnglish ? "General evaluation" : "Genel değerlendirme",
      whatToDoNext: isEnglish
        ? "Please retry or consult a physician."
        : "Lütfen tekrar deneyin veya bir hekime başvurun.",
    },
  };
}

function normalizeActionPlan(actionPlan, language = "tr", mergedText = "") {
  const isEnglish = language === "en";
  const fallback = fallbackResponse(language).actionPlan;

  let urgency = fallback.urgency;
  let whichDoctor = fallback.whichDoctor;
  let whatToDoNext = fallback.whatToDoNext;

  if (actionPlan && typeof actionPlan === "object") {
    urgency = safeString(actionPlan.urgency, urgency);
    whichDoctor = safeString(actionPlan.whichDoctor, whichDoctor);
    whatToDoNext = safeString(actionPlan.whatToDoNext, whatToDoNext);
  }

  const combined = `${urgency} ${whichDoctor} ${whatToDoNext} ${mergedText}`.toLowerCase();

  const hasBrainPattern =
    combined.includes("beyin") ||
    combined.includes("brain") ||
    combined.includes("cranial") ||
    combined.includes("kran") ||
    combined.includes("neurolog") ||
    combined.includes("nöroloj") ||
    combined.includes("intracran") ||
    combined.includes("hemorrhage") ||
    combined.includes("kanama");

  const hasEmergencyNeuroPattern =
    combined.includes("focal deficit") ||
    combined.includes("ani güçsüzlük") ||
    combined.includes("bilinç değişikliği") ||
    combined.includes("altered consciousness") ||
    combined.includes("seizure") ||
    combined.includes("nöbet") ||
    combined.includes("ani şiddetli baş ağrısı") ||
    combined.includes("sudden severe headache");

  const hasHemePattern =
    combined.includes("jak2") ||
    combined.includes("calr") ||
    combined.includes("mpl") ||
    combined.includes("bcr/abl") ||
    combined.includes("bcr abl") ||
    combined.includes("hematolog") ||
    combined.includes("hematoloji") ||
    combined.includes("thrombocyt") ||
    combined.includes("trombosit") ||
    combined.includes("trombositoz") ||
    combined.includes("leukocyt") ||
    combined.includes("lökosit") ||
    combined.includes("lenf") ||
    combined.includes("lymph") ||
    combined.includes("lap") ||
    combined.includes("hepatomegali") ||
    combined.includes("splenomeg") ||
    combined.includes("kan ve kan yapıcı") ||
    combined.includes("blood-forming");

  const hasGiPattern =
    combined.includes("karaciğer") ||
    combined.includes("hepat") ||
    combined.includes("steatoz") ||
    combined.includes("ggt") ||
    combined.includes("alt ") ||
    combined.includes("ast ");

  const hasEntPattern =
    combined.includes("nazofarenks") ||
    combined.includes("adenoid") ||
    combined.includes("sinüzit") ||
    combined.includes("sinus") ||
    combined.includes("ent") ||
    combined.includes("kulak burun boğaz");

  if (hasEmergencyNeuroPattern) {
    whichDoctor = isEnglish ? "Emergency / Neurology" : "Acil / Nöroloji";
  } else if (hasHemePattern) {
    whichDoctor = isEnglish ? "Hematology" : "Hematoloji";
  } else if (hasBrainPattern) {
    whichDoctor = isEnglish ? "Neurology" : "Nöroloji";
  } else if (hasGiPattern) {
    whichDoctor = isEnglish ? "Internal Medicine / Gastroenterology" : "İç Hastalıkları / Gastroenteroloji";
  } else if (hasEntPattern) {
    whichDoctor = isEnglish ? "ENT" : "Kulak Burun Boğaz";
  }

  if (
    urgency.toLowerCase().includes("high risk") ||
    urgency.toLowerCase().includes("medium risk") ||
    urgency.toLowerCase().includes("low risk")
  ) {
    urgency = fallback.urgency;
  }

  if (hasEmergencyNeuroPattern) {
    urgency = isEnglish
      ? "Urgent medical evaluation is appropriate, and emergency assessment may be required if acute neurologic symptoms are present."
      : "Acil nörolojik belirtiler varsa acil değerlendirme gerekebilir; uygun gecikme olmadan tıbbi değerlendirme planlanmalıdır.";
  } else if (hasHemePattern) {
    urgency = isEnglish
      ? "Near-term specialist evaluation is appropriate based on the findings and symptom course."
      : "Bulgular ve belirtilerin seyrine göre yakın zamanda uzman değerlendirmesi uygundur.";
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

YOUR ROLE
- Interpret uploaded medical report text, laboratory text, radiology report text, and medical images.
- Do NOT make a definitive diagnosis.
- Do NOT prescribe treatment.
- Do NOT invent missing findings.
- Do NOT overstate certainty.
- Stay clinically useful, conservative, and legally safe.

GLOBAL RULES
- Use uncertainty language such as: "may suggest", "can be associated with", "should be evaluated", "cannot be excluded".
- If data is limited, explicitly say so.
- A single image or screenshot is NOT enough for definitive exclusion of pathology.
- If only partial data exists, do not behave as if the case is complete.
- Mention clinically relevant red flags when appropriate.

SPECIALTY ROUTING
- Choose the strongest specialty signal, not the safest generic one.
- Use Internal Medicine only when no stronger specialty signal exists.
- Brain imaging / neurologic pattern -> Neurology.
- Acute focal neurologic deficit / seizure / altered consciousness / sudden severe headache -> Emergency / Neurology.
- Hematology pattern (CBC abnormalities, thrombocytosis, leukocytosis, JAK2/CALR/MPL/BCR-ABL workup, lymphadenopathy + organomegaly, blood-forming organ concern) -> Hematology.
- Hepatic / metabolic pattern -> Internal Medicine or Gastroenterology.
- Isolated nasopharyngeal / adenoid / sinus pattern -> ENT.

PUBLIC SUMMARY
- Clear, calm, understandable, non-technical
- Explain what the findings may mean
- Explain what to do next

DOCTOR SUMMARY
- More detailed and denser than public summary
- Structured clinical interpretation
- Explain significance of the main findings
- Include reasonable differential direction without claiming certainty
- Explicitly state limitations
- Suggest logical next evaluation direction
- Avoid filler text

STRICT OUTPUT
Return ONLY valid JSON with EXACTLY this schema:
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

GÖREVİN
- Yüklenen tıbbi rapor metnini, laboratuvar içeriğini, radyoloji rapor metnini ve medikal görüntüleri yorumlamak.
- Kesin tanı koyma.
- Tedavi yazma.
- Eksik bulgu uydurma.
- Gereksiz kesinlik kullanma.
- Klinik olarak faydalı ama hukuki ve tıbbi açıdan temkinli kal.

GENEL KURALLAR
- Şu tür belirsizlik dili kullan:
  "düşündürebilir", "ilişkili olabilir", "değerlendirilmelidir", "dışlanamaz".
- Veri sınırlıysa bunu açıkça söyle.
- Tek görüntü / ekran görüntüsü önemli patolojileri kesin dışlamak için yeterli değildir.
- Eksik veri varsa olguyu tamamlanmış gibi yorumlama.
- Uygunsa klinik kırmızı bayrakları belirt.

BRANŞ YÖNLENDİRME
- En güçlü klinik sinyale göre branş seç.
- Daha güçlü sinyal yoksa İç Hastalıkları fallback olabilir.
- Beyin görüntüleme / nörolojik örüntü -> Nöroloji.
- Fokal nörolojik defisit, nöbet, bilinç değişikliği, ani şiddetli baş ağrısı -> Acil / Nöroloji.
- Hematoloji örüntüsü (CBC bozukluğu, trombositoz, lökositoz, JAK2/CALR/MPL/BCR-ABL çalışılmış olması, LAP + organomegali, kan ve kan yapıcı organ şüphesi) -> Hematoloji.
- Karaciğer / metabolik örüntü -> İç Hastalıkları veya Gastroenteroloji.
- İzole nazofarenks / adenoid / sinüs örüntüsü -> Kulak Burun Boğaz.

HALK MODU
- Açık, sakin, anlaşılır
- Gereksiz teknik dil kullanma
- Bulguların ne anlama gelebileceğini anlat
- Sonraki adımı net söyle

DOKTOR MODU
- Halk modundan belirgin daha detaylı olmalı
- Yapılandırılmış klinik yorum içermeli
- Ana bulguların olası önemini açıklamalı
- Kesin tanı koymadan ayırıcı yön vermeli
- Veri sınırlılığını açıkça söylemeli
- Mantıklı ileri değerlendirme yönü sunmalı
- Gereksiz uzatma değil, yoğun klinik içerik üretmeli

SADECE GEÇERLİ JSON DÖNDÜR
Tam olarak şu yapıyı kullan:
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
        type: "text",
        text: isEnglish
          ? `Medical report / uploaded text:\n\n${reportText}`
          : `Tıbbi rapor / yüklenen metin:\n\n${reportText}`,
      });
    } else {
      userContent.push({
        type: "text",
        text: isEnglish
          ? "Please analyze the attached medical images conservatively and return structured JSON."
          : "Lütfen ekli medikal görselleri temkinli şekilde analiz et ve yapılandırılmış JSON döndür.",
      });
    }

    for (const img of images) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: img,
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      max_tokens: 1800,
    });

    const rawText = completion?.choices?.[0]?.message?.content || "";

    if (!rawText || !rawText.trim()) {
      console.log("Empty AI response");
      return res.json(fallbackResponse(language));
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      console.log("JSON parse failed");
      console.log(rawText);
      return res.json(fallbackResponse(language));
    }

    const fallback = fallbackResponse(language);

    const mergedText = [
      safeString(parsed.publicSummary),
      safeString(parsed.doctorSummary),
      ...toArray(parsed.keyFindings),
      ...toArray(parsed.publicWarnings),
      ...toArray(parsed.doctorWarnings),
      safeString(parsed?.actionPlan?.urgency),
      safeString(parsed?.actionPlan?.whichDoctor),
      safeString(parsed?.actionPlan?.whatToDoNext),
    ].join(" ");

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
      actionPlan: normalizeActionPlan(parsed.actionPlan, language, mergedText),
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
