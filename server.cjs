const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLanguage(value) {
  return value === "en" ? "en" : "tr";
}

function normalizeImages(body) {
  const rawImages = []
    .concat(Array.isArray(body.images) ? body.images : [])
    .concat(Array.isArray(body.imageDataUrls) ? body.imageDataUrls : []);

  return rawImages
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.startsWith("data:image/")) {
        return item;
      }
      return `data:image/jpeg;base64,${item}`;
    });
}

function inferUrgencyText(raw, isEnglish) {
  const text = safeString(raw).toLowerCase();

  if (
    text.includes("acil") ||
    text.includes("urgent") ||
    text.includes("emergency") ||
    text.includes("should not be delayed") ||
    text.includes("geciktirilmemelidir")
  ) {
    return isEnglish
      ? "A physician review should not be delayed, especially if symptoms are increasing or red-flag findings are present."
      : "Özellikle belirtiler artıyorsa veya kırmızı bayrak bulguları varsa hekim değerlendirmesi geciktirilmemelidir.";
  }

  if (
    text.includes("yakın") ||
    text.includes("kısa sürede") ||
    text.includes("near-term") ||
    text.includes("soon") ||
    text.includes("within days") ||
    text.includes("prompt")
  ) {
    return isEnglish
      ? "Near-term specialist evaluation is appropriate according to the overall findings and symptom course."
      : "Genel bulgular ve belirtilerin seyrine göre yakın zamanda uzman değerlendirmesi uygundur.";
  }

  return isEnglish
    ? "Routine follow-up may be appropriate depending on symptoms, examination, and prior test results."
    : "Belirtiler, muayene ve önceki tetkiklerle birlikte değerlendirilerek rutin kontrol uygun olabilir.";
}

function buildFallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The uploaded medical content could not be interpreted reliably at this time. Please try again with clearer text or images. If symptoms are significant, seek medical evaluation."
      : "Yüklenen tıbbi içerik bu aşamada güvenilir şekilde yorumlanamadı. Daha net metin veya görüntülerle tekrar deneyin. Yakınmalar belirginse hekim değerlendirmesine başvurun.",
    doctorSummary: isEnglish
      ? "Structured interpretation could not be generated. Correlation with the original report, clinical history, physical examination, and prior results is required."
      : "Yapılandırılmış yorum oluşturulamadı. Orijinal rapor, klinik öykü, fizik muayene ve önceki sonuçlarla birlikte değerlendirme gerekir.",
    keyFindings: isEnglish
      ? ["No reliable structured extraction could be completed from the uploaded material."]
      : ["Yüklenen içerikten güvenilir yapılandırılmış çıkarım tamamlanamadı."],
    publicWarnings: isEnglish
      ? ["If you have severe pain, shortness of breath, fainting, confusion, or rapid worsening, seek urgent care."]
      : ["Şiddetli ağrı, nefes darlığı, bayılma, bilinç değişikliği veya hızlı kötüleşme varsa acil değerlendirme gerekir."],
    doctorWarnings: isEnglish
      ? ["Manual review of the original report and full clinical correlation are recommended."]
      : ["Orijinal raporun manuel incelenmesi ve tam klinik korelasyon önerilir."],
    privacyNotice: isEnglish
      ? "This report is for informational and decision-support purposes only. It does not replace physician evaluation."
      : "Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesinin yerine geçmez.",
    actionPlan: {
      urgency: isEnglish
        ? "A physician review should be arranged according to symptom severity and the quality of the uploaded material."
        : "Belirtilerin şiddetine ve yüklenen içeriğin kalitesine göre hekim değerlendirmesi planlanmalıdır.",
      whichDoctor: isEnglish ? "Internal Medicine" : "İç Hastalıkları",
      whatToDoNext: isEnglish
        ? "Repeat the upload with clearer documents or images, compare with prior records, and arrange physician follow-up."
        : "Daha net belge veya görüntülerle tekrar yükleme yapın, önceki kayıtlarla karşılaştırın ve hekim kontrolü planlayın.",
    },
  };
}

function normalizeWhichDoctor(raw, language) {
  const isEnglish = language === "en";
  const text = safeString(raw);

  if (!text) {
    return isEnglish ? "Internal Medicine" : "İç Hastalıkları";
  }

  const lower = text.toLowerCase();

  if (
    lower.includes("hematolog") ||
    lower.includes("hematology") ||
    lower.includes("hematoloji")
  ) {
    return isEnglish ? "Hematology" : "Hematoloji";
  }

  if (
    lower.includes("gastro") ||
    lower.includes("hepatology") ||
    lower.includes("hepatoloji") ||
    lower.includes("gastroenteroloji")
  ) {
    return isEnglish ? "Gastroenterology" : "Gastroenteroloji";
  }

  if (
    lower.includes("general surgery") ||
    lower.includes("cerrahi") ||
    lower.includes("surgery") ||
    lower.includes("genel cerrahi")
  ) {
    return isEnglish ? "General Surgery" : "Genel Cerrahi";
  }

  if (
    lower.includes("neurology") ||
    lower.includes("nöroloji") ||
    lower.includes("neurolog") ||
    lower.includes("nörolog")
  ) {
    return isEnglish ? "Neurology" : "Nöroloji";
  }

  if (
    lower.includes("pulmon") ||
    lower.includes("chest") ||
    lower.includes("göğüs") ||
    lower.includes("respiratory")
  ) {
    return isEnglish ? "Chest Diseases" : "Göğüs Hastalıkları";
  }

  if (
    lower.includes("cardio") ||
    lower.includes("kardiyo") ||
    lower.includes("cardiology") ||
    lower.includes("kardiyoloji")
  ) {
    return isEnglish ? "Cardiology" : "Kardiyoloji";
  }

  return text;
}

function sanitizeSummaryText(text) {
  return safeString(text)
    .replace(/\b(adlı hasta|hasta adı|patient name|named patient)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResponse(parsed, language) {
  const fallback = buildFallbackResponse(language);
  const isEnglish = language === "en";

  const publicSummary = sanitizeSummaryText(parsed.publicSummary) || fallback.publicSummary;
  const doctorSummary = sanitizeSummaryText(parsed.doctorSummary) || fallback.doctorSummary;

  const keyFindings = toStringArray(parsed.keyFindings);
  const publicWarnings = toStringArray(parsed.publicWarnings);
  const doctorWarnings = toStringArray(parsed.doctorWarnings);

  const privacyNotice =
    safeString(parsed.privacyNotice) || fallback.privacyNotice;

  const actionPlan = parsed.actionPlan && typeof parsed.actionPlan === "object"
    ? parsed.actionPlan
    : {};

  const urgency = inferUrgencyText(actionPlan.urgency, isEnglish);
  const whichDoctor = normalizeWhichDoctor(actionPlan.whichDoctor, language);
  const whatToDoNext =
    safeString(actionPlan.whatToDoNext) || fallback.actionPlan.whatToDoNext;

  return {
    publicSummary,
    doctorSummary,
    keyFindings: keyFindings.length ? keyFindings : fallback.keyFindings,
    publicWarnings: publicWarnings.length ? publicWarnings : fallback.publicWarnings,
    doctorWarnings: doctorWarnings.length ? doctorWarnings : fallback.doctorWarnings,
    privacyNotice,
    actionPlan: {
      urgency,
      whichDoctor,
      whatToDoNext,
    },
  };
}

function buildDeveloperPrompt(language) {
  const isEnglish = language === "en";

  if (isEnglish) {
    return `
You are a production-grade medical decision-support engine for the CheckFinal mobile app.

Return ONLY valid JSON and match this exact schema:
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

Hard rules:
- Never output markdown.
- Never output commentary outside JSON.
- Never use null.
- Do not include patient names or identifying details.
- Do not make a definitive diagnosis.
- Use interpretive medical language such as "may suggest", "is compatible with", "requires evaluation", "should be correlated clinically".
- Public mode must remain fluent, premium, explanatory, and understandable. Do NOT oversimplify into short shallow text.
- Doctor mode must be more technical, more detailed, and clinically structured.
- Extract from both report text and images if present.
- If images are limited or partial, explicitly state that image-based interpretation is limited.
- Be internally consistent. Similar patterns should yield similar logic and tone.

Public summary rules:
- 4 to 7 sentences.
- Clear and premium-sounding.
- Explain findings in a patient-understandable way without sounding childish.

Doctor summary rules:
- More detailed than public summary.
- Mention likely systems involved when supported by input: hematologic, hepatobiliary, gastrointestinal, pulmonary, endocrine, renal, neurologic, radiologic, inflammatory, infectious, etc.
- Mention differential framing when appropriate.
- Mention correlation with prior imaging/labs/clinical course when appropriate.

keyFindings rules:
- Short bullet-style items.
- Concrete findings only.
- Prefer values or named abnormalities where available.

publicWarnings rules:
- Patient-friendly.
- No panic language.
- No absolute diagnosis.

doctorWarnings rules:
- More technical.
- Mention red flags, follow-up needs, trend assessment, differential considerations, or limits of the data.

privacyNotice:
"This report is for informational and decision-support purposes only. It does not replace physician evaluation."

actionPlan rules:
- urgency must be a sentence, not a one-word label.
- whichDoctor must be the single most appropriate first specialty.
- whatToDoNext must be actionable and specific.
- Prefer common first-line specialties when appropriate:
  Internal Medicine, Hematology, Gastroenterology, General Surgery, Chest Diseases, Neurology, Cardiology.

Consistency examples:
- Iron deficiency / low HGB / low HCT -> mention anemia-compatible picture and follow-up.
- Elevated ALT/AST/GGT / fatty liver / hepatomegaly -> mention hepatobiliary evaluation.
- Gallbladder stones / chronic cholecystitis -> mention general surgery or gastroenterology depending context.
- Thrombocytosis / adenopathy / organomegaly -> consider hematology.
- Limited CT screenshot only -> state limitation; do not overcall.

If the material is limited, still return a useful structured result instead of refusing.
`;
  }

  return `
Sen CheckFinal mobil uygulaması için çalışan üretim seviyesinde bir tıbbi karar destek motorusun.

Yalnızca geçerli JSON döndür ve tam olarak şu şemaya uy:
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

Kesin kurallar:
- Markdown kullanma.
- JSON dışında hiçbir açıklama yazma.
- null kullanma.
- Hasta adı veya kimlik bilgisi yazma.
- Kesin tanı koyma.
- "düşündürebilir", "uyumlu olabilir", "değerlendirme gerekir", "klinik korelasyon önerilir" gibi yorumlayıcı tıbbi dil kullan.
- Halk modu akıcı, premium hissi veren, açıklayıcı ve anlaşılır olmalı. Fazla kısaltıp yüzeysel yapma.
- Doktor modu daha teknik, daha detaylı ve daha klinik yapılandırılmış olmalı.
- Metin ve varsa görüntüleri birlikte değerlendir.
- Görüntüler sınırlıysa veya ekran görüntüsü/parça seri ise bunu açıkça belirt.
- Benzer paternlerde tutarlı mantık kullan.

publicSummary kuralları:
- 4 ila 7 cümle.
- Halkın anlayacağı dilde ama basitleştirilmiş çocuk dili değil.
- Bulguların anlamını açıklayıcı şekilde ver.

doctorSummary kuralları:
- publicSummary'den daha detaylı olsun.
- Uygunsa şu sistemleri belirt: hematolojik, hepatobilier, gastrointestinal, pulmoner, endokrin, renal, nörolojik, radyolojik, inflamatuvar, enfeksiyöz.
- Uygun yerde ayırıcı tanı çerçevesi kur.
- Gerekiyorsa önceki tetkikler, klinik gidiş ve trend ihtiyacını belirt.

keyFindings kuralları:
- Kısa, net madde biçiminde.
- Somut bulgular.
- Mümkünse değer veya isimlendirilmiş anormallik içer.

publicWarnings kuralları:
- Hasta dostu olsun.
- Korkutucu dil kullanma.
- Kesin tanı cümlesi kurma.

doctorWarnings kuralları:
- Daha teknik olsun.
- Kırmızı bayrakları, izlem gereksinimini, trend değerlendirmesini, ayırıcı tanıyı veya veri kısıtını belirt.

privacyNotice sabit metni:
"Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesinin yerine geçmez."

actionPlan kuralları:
- urgency tek kelime değil, doğal cümle olsun.
- whichDoctor en uygun ilk branş olsun.
- whatToDoNext uygulanabilir ve somut olsun.
- Gerekirse şu ilk basamak branşları tercih et:
  İç Hastalıkları, Hematoloji, Gastroenteroloji, Genel Cerrahi, Göğüs Hastalıkları, Nöroloji, Kardiyoloji.

Tutarlılık örnekleri:
- Demir eksikliği / düşük HGB / düşük HCT -> anemi ile uyumlu görünüm ve takip.
- ALT/AST/GGT yüksekliği / hepatosteatoz / hepatomegali -> hepatobilier değerlendirme.
- Safra taşı / kronik kolesistit -> bağlama göre genel cerrahi veya gastroenteroloji.
- Trombositoz / lenfadenopati / organomegali -> hematoloji düşün.
- Sadece sınırlı BT ekran görüntüsü -> kısıtlılık belirt, aşırı yorum yapma.

Materyal sınırlı olsa bile boş dönme; yararlı, yapılandırılmış sonuç üret.
`;
}

function buildUserContent(reportText, images, language) {
  const isEnglish = language === "en";

  const textBlock = isEnglish
    ? `Medical content for analysis:\n\nReport text:\n${reportText || "(No report text provided)"}\n\nPlease analyze the medical content and return strict JSON only.`
    : `Analiz için tıbbi içerik:\n\nRapor metni:\n${reportText || "(Rapor metni yok)"}\n\nLütfen tıbbi içeriği değerlendir ve yalnızca geçerli JSON döndür.`;

  const content = [{ type: "text", text: textBlock }];

  for (const imageUrl of images) {
    content.push({
      type: "image_url",
      image_url: {
        url: imageUrl,
        detail: "high",
      },
    });
  }

  return content;
}

app.get("/", (req, res) => {
  res.send("CheckFinal backend is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/analyze", async (req, res) => {
  const language = normalizeLanguage(req.body && req.body.language);
  const isEnglish = language === "en";

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ...buildFallbackResponse(language),
        publicSummary: isEnglish
          ? "Server configuration error: API key is missing."
          : "Sunucu yapılandırma hatası: API anahtarı eksik.",
        doctorSummary: isEnglish
          ? "OPENAI_API_KEY is not configured on the server."
          : "Sunucuda OPENAI_API_KEY tanımlı değil.",
      });
    }

    const body = req.body || {};
    const reportText =
      safeString(body.reportText) ||
      safeString(body.inputText) ||
      safeString(body.text);

    const images = normalizeImages(body);

    if (!reportText && images.length === 0) {
      return res.status(400).json({
        error: isEnglish ? "No medical content provided." : "Tıbbi içerik gönderilmedi.",
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "developer",
          content: buildDeveloperPrompt(language),
        },
        {
          role: "user",
          content: buildUserContent(reportText, images, language),
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw model output:", raw);
      return res.status(500).json(buildFallbackResponse(language));
    }

    const normalized = normalizeResponse(parsed, language);
    return res.json(normalized);
  } catch (error) {
    console.error("Analyze error:", error);
    return res.status(500).json(buildFallbackResponse(language));
  }
});

app.listen(PORT, () => {
  console.log(`CheckFinal backend running on port ${PORT}`);
});
