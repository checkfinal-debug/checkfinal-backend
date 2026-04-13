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
      return ⁠ data:image/jpeg;base64,${item} ⁠;
    });
}

function sanitizeSummaryText(text) {
  return safeString(text)
    .replace(/\b(adlı hasta|hasta adı|patient name|named patient)\b/gi, "")
    .replace(/\b(definitive diagnosis|kesin tanı)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeLine(text, language) {
  const isEnglish = language === "en";
  let value = safeString(text);

  if (!value) return "";

  value = value
    .replace(/\bmust\b/gi, "should")
    .replace(/\bneeds\b/gi, "may need")
    .replace(/\brequires\b/gi, "may require")
    .replace(/\bdefinitely\b/gi, "")
    .replace(/\bconfirmed\b/gi, "suggested")
    .replace(/\bkesin\b/gi, "")
    .replace(/\bmutlaka\b/gi, "uygun şekilde")
    .replace(/\bgerektirir\b/gi, "gerektirebilir")
    .replace(/\bgereklidir\b/gi, "uygun olabilir")
    .replace(/\btedavi başlanmalıdır\b/gi, "tedavi açısından klinik değerlendirme uygun olabilir")
    .replace(/\bstart treatment\b/gi, "consider clinical evaluation")
    .replace(/\bschedule an appointment\b/gi, "consider medical evaluation")
    .replace(/\bgo to\b/gi, "consider evaluation by")
    .replace(/\bsee\b/gi, "consult")
    .replace(/\bimmediately\b/gi, "without unnecessary delay")
    .replace(/\bhemen\b/gi, "gereksiz gecikme olmadan")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) {
    return isEnglish
      ? "Clinical correlation is recommended."
      : "Klinik korelasyon önerilir.";
  }

  return value;
}

function inferUrgencyText(raw, isEnglish) {
  const text = safeString(raw).toLowerCase();

  if (
    text.includes("acil") ||
    text.includes("urgent") ||
    text.includes("emergency") ||
    text.includes("should not be delayed") ||
    text.includes("geciktirilmemelidir") ||
    text.includes("red-flag") ||
    text.includes("kırmızı bayrak")
  ) {
    return isEnglish
      ? "Medical review should not be delayed, particularly if symptoms are increasing or red-flag findings are present."
      : "Özellikle belirtiler artıyorsa veya kırmızı bayrak bulguları varsa tıbbi değerlendirme geciktirilmemelidir.";
  }

  if (
    text.includes("yakın") ||
    text.includes("kısa sürede") ||
    text.includes("near-term") ||
    text.includes("soon") ||
    text.includes("within days") ||
    text.includes("prompt") ||
    text.includes("orta")
  ) {
    return isEnglish
      ? "Medical review may be considered in the near term according to symptoms, examination findings, and prior results."
      : "Belirtiler, muayene bulguları ve önceki sonuçlara göre yakın dönemde tıbbi değerlendirme düşünülebilir.";
  }

  return isEnglish
    ? "Routine medical review may be considered depending on symptoms, examination, and prior test results."
    : "Belirtiler, muayene ve önceki tetkiklerle birlikte değerlendirilerek rutin tıbbi inceleme düşünülebilir.";
}

function buildFallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The uploaded medical content could not be interpreted with sufficient confidence at this time. Please try again with clearer text or images. If symptoms are significant or worsening, medical evaluation should be considered."
      : "Yüklenen tıbbi içerik bu aşamada yeterli güvenle yorumlanamadı. Daha net metin veya görüntülerle tekrar deneyin. Yakınmalar belirginse veya artıyorsa tıbbi değerlendirme düşünülmelidir.",
    doctorSummary: isEnglish
      ? "A structured interpretation could not be generated with sufficient reliability. Review of the original report, clinical history, examination findings, and prior results is recommended."
      : "Yeterli güvenilirlikte yapılandırılmış yorum oluşturulamadı. Orijinal rapor, klinik öykü, muayene bulguları ve önceki sonuçlarla birlikte değerlendirme önerilir.",
    keyFindings: isEnglish
      ? ["No reliable structured extraction could be completed from the uploaded material."]
      : ["Yüklenen içerikten güvenilir yapılandırılmış çıkarım tamamlanamadı."],
    publicWarnings: isEnglish
      ? ["If there is severe pain, shortness of breath, fainting, confusion, or rapid worsening, urgent medical assessment should be considered."]
      : ["Şiddetli ağrı, nefes darlığı, bayılma, bilinç değişikliği veya hızlı kötüleşme varsa acil tıbbi değerlendirme düşünülmelidir."],
    doctorWarnings: isEnglish
      ? ["Manual review of the original report and full clinical correlation are recommended."]
      : ["Orijinal raporun manuel incelenmesi ve tam klinik korelasyon önerilir."],
    privacyNotice: isEnglish
      ? "This report is for informational and decision-support purposes only. It does not replace physician evaluation, diagnosis, treatment planning, or medical judgment."
      : "Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesi, tanı, tedavi planı veya tıbbi kararın yerine geçmez.",
    actionPlan: {
      urgency: isEnglish
        ? "Medical review may be arranged according to symptom severity and the quality of the uploaded material."
        : "Belirtilerin şiddeti ve yüklenen içeriğin kalitesine göre tıbbi değerlendirme planlanabilir.",
      whichDoctor: isEnglish
        ? "A healthcare professional can determine the most appropriate specialty after reviewing the full clinical context."
        : "Uygun branş, tam klinik değerlendirme sonrasında bir sağlık profesyoneli tarafından belirlenebilir.",
      whatToDoNext: isEnglish
        ? "You may consider repeating the upload with clearer documents or images and sharing the available material with a qualified healthcare professional."
        : "Daha net belge veya görüntülerle tekrar yükleme yapılması ve mevcut materyalin yetkili bir sağlık profesyoneli ile paylaşılması düşünülebilir.",
    },
  };
}

function normalizeWhichDoctor(raw, language) {
  const isEnglish = language === "en";
  const text = safeString(raw);
  const lower = text.toLowerCase();

  if (!text) {
    return isEnglish
      ? "A healthcare professional can determine the most appropriate specialty after reviewing the full clinical context."
      : "Uygun branş, tam klinik değerlendirme sonrasında bir sağlık profesyoneli tarafından belirlenebilir.";
  }

  if (
    lower.includes("hematolog") ||
    lower.includes("hematology") ||
    lower.includes("hematoloji")
  ) {
    return isEnglish
      ? "Hematology may be considered as an initial specialty depending on the broader clinical context."
      : "Genel klinik bağlama göre ilk aşamada Hematoloji değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("gastro") ||
    lower.includes("hepatology") ||
    lower.includes("hepatoloji") ||
    lower.includes("gastroenteroloji")
  ) {
    return isEnglish
      ? "Gastroenterology may be considered depending on the pattern of findings and clinical history."
      : "Bulgu paternine ve klinik öyküye göre Gastroenteroloji değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("general surgery") ||
    lower.includes("cerrahi") ||
    lower.includes("surgery") ||
    lower.includes("genel cerrahi")
  ) {
    return isEnglish
      ? "General Surgery may be considered if supported by the full report and clinical findings."
      : "Tam rapor ve klinik bulgular destekliyorsa Genel Cerrahi değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("neurology") ||
    lower.includes("nöroloji") ||
    lower.includes("neurolog") ||
    lower.includes("nörolog")
  ) {
    return isEnglish
      ? "Neurology may be considered if the symptoms and examination findings are neurologically oriented."
      : "Belirtiler ve muayene bulguları nörolojik ağırlıklıysa Nöroloji değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("pulmon") ||
    lower.includes("chest") ||
    lower.includes("göğüs") ||
    lower.includes("respiratory")
  ) {
    return isEnglish
      ? "Chest Diseases may be considered depending on respiratory findings and the overall clinical picture."
      : "Solunumsal bulgular ve genel klinik tabloya göre Göğüs Hastalıkları değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("cardio") ||
    lower.includes("kardiyo") ||
    lower.includes("cardiology") ||
    lower.includes("kardiyoloji")
  ) {
    return isEnglish
      ? "Cardiology may be considered if the findings are compatible with cardiovascular assessment."
      : "Bulgular kardiyovasküler değerlendirme ile uyumluysa Kardiyoloji değerlendirmesi düşünülebilir.";
  }

  if (
    lower.includes("internal medicine") ||
    lower.includes("iç hastalıkları") ||
    lower.includes("dahiliye")
  ) {
    return isEnglish
      ? "Internal Medicine may be considered as an initial evaluation point depending on the broader clinical context."
      : "Geniş klinik bağlama göre ilk aşamada İç Hastalıkları değerlendirmesi düşünülebilir.";
  }

  return isEnglish
    ? "A healthcare professional can determine the most appropriate specialty after reviewing the full clinical context."
    : "Uygun branş, tam klinik değerlendirme sonrasında bir sağlık profesyoneli tarafından belirlenebilir.";
}

function sanitizeBulletItems(items, language) {
  return toStringArray(items)
    .map((item) => sanitizeLine(item, language))
    .map((item) => item.replace(/^[•\-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeActionText(raw, language, type) {
  const isEnglish = language === "en";
  const text = sanitizeLine(raw, language);

  if (text) return text;

  if (type === "next") {
    return isEnglish
      ? "You may consider sharing these findings with a qualified healthcare professional together with symptom history and prior results."
      : "Bu bulguların belirti öyküsü ve önceki sonuçlarla birlikte yetkili bir sağlık profesyoneli ile paylaşılması düşünülebilir.";
  }

  return isEnglish
    ? "Clinical correlation is recommended."
    : "Klinik korelasyon önerilir.";
}

function normalizeResponse(parsed, language) {
  const fallback = buildFallbackResponse(language);

  const publicSummary =
    sanitizeSummaryText(parsed.publicSummary) || fallback.publicSummary;

  const doctorSummary =
    sanitizeSummaryText(parsed.doctorSummary) || fallback.doctorSummary;

  const keyFindings = sanitizeBulletItems(parsed.keyFindings, language);
  const publicWarnings = sanitizeBulletItems(parsed.publicWarnings, language);
  const doctorWarnings = sanitizeBulletItems(parsed.doctorWarnings, language);

  const privacyNotice =
    safeString(parsed.privacyNotice) || fallback.privacyNotice;

  const actionPlan =
    parsed.actionPlan && typeof parsed.actionPlan === "object"
      ? parsed.actionPlan
      : {};

  const urgency = inferUrgencyText(actionPlan.urgency, language === "en");
  const whichDoctor = normalizeWhichDoctor(actionPlan.whichDoctor, language);
  const whatToDoNext = sanitizeActionText(
    actionPlan.whatToDoNext,
    language,
    "next"
  );

  return {
    publicSummary,
    doctorSummary,
    keyFindings: keyFindings.length ? keyFindings : fallback.keyFindings,
    publicWarnings: publicWarnings.length
      ? publicWarnings
      : fallback.publicWarnings,
    doctorWarnings: doctorWarnings.length
      ? doctorWarnings
      : fallback.doctorWarnings,
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
You are a production-grade AI-assisted medical decision-support engine for the CheckFinal mobile app.

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

Non-negotiable rules:
•⁠  ⁠Never output markdown.
•⁠  ⁠Never output commentary outside JSON.
•⁠  ⁠Never use null.
•⁠  ⁠Do not include patient names, identifiers, addresses, dates of birth, or other personal identifiers.
•⁠  ⁠Do not make a definitive diagnosis.
•⁠  ⁠Do not prescribe treatment.
•⁠  ⁠Do not tell the user to start, stop, or change medication.
•⁠  ⁠Do not sound like a final medical authority.
•⁠  ⁠Use cautious interpretive language such as:
  "may suggest", "may be compatible with", "could reflect", "may warrant evaluation", "should be correlated clinically".
•⁠  ⁠Public summary must be understandable, premium, calm, and informative.
•⁠  ⁠Doctor summary must be more technical, more structured, and more detailed.
•⁠  ⁠If images are limited, partial, or screenshot-based, explicitly state the limitation.
•⁠  ⁠Keep reasoning internally consistent across similar cases.
•⁠  ⁠Preserve meaningful medical keywords from the source when supported, such as anemia, hemoglobin, platelet, CRP, ferritin, vitamin B12, glucose, ALT, AST, creatinine, thyroid, etc.
•⁠  ⁠The app itself provides citations separately, so your role is to produce medically cautious content that preserves the relevant finding terms.

Important safety framing:
•⁠  ⁠This is an AI-assisted informational and decision-support output.
•⁠  ⁠It must not read like diagnosis, treatment advice, or discharge instructions.
•⁠  ⁠Avoid absolute phrases such as:
  "this is", "confirms", "definitely", "you have", "must start treatment", "requires surgery now".
•⁠  ⁠Prefer:
  "may be associated with", "may justify medical review", "can be discussed with a healthcare professional".

publicSummary rules:
•⁠  ⁠4 to 6 sentences.
•⁠  ⁠Calm, clear, medically literate, but understandable.
•⁠  ⁠No childish simplification.
•⁠  ⁠No direct treatment instructions.

doctorSummary rules:
•⁠  ⁠More detailed than publicSummary.
•⁠  ⁠Mention likely systems involved when supported by the input:
  hematologic, hepatobiliary, gastrointestinal, pulmonary, endocrine, renal, neurologic, radiologic, inflammatory, infectious.
•⁠  ⁠Mention differential framing when appropriate.
•⁠  ⁠Mention correlation with prior labs, imaging, symptoms, and clinical course where appropriate.
•⁠  ⁠No definitive diagnosis.

keyFindings rules:
•⁠  ⁠Short bullet-style items.
•⁠  ⁠Concrete findings only.
•⁠  ⁠Prefer actual values or explicitly stated abnormalities where available.
•⁠  ⁠Avoid recommendations in this section.

publicWarnings rules:
•⁠  ⁠Patient-friendly.
•⁠  ⁠No panic language.
•⁠  ⁠No definitive disease labeling.
•⁠  ⁠Mention red-flag symptoms only when clearly relevant.

doctorWarnings rules:
•⁠  ⁠More technical.
•⁠  ⁠Mention limitations, red flags, trend need, differential considerations, and follow-up context when appropriate.
•⁠  ⁠No treatment orders.

privacyNotice must be exactly:
"This report is for informational and decision-support purposes only. It does not replace physician evaluation, diagnosis, treatment planning, or medical judgment."

actionPlan rules:
•⁠  ⁠urgency must be a natural sentence, not a single label.
•⁠  ⁠whichDoctor must NOT be a bare specialty name.
•⁠  ⁠whichDoctor must be phrased cautiously, such as:
  "Internal Medicine may be considered as an initial evaluation point depending on the broader clinical context."
•⁠  ⁠whatToDoNext must be practical but non-prescriptive.
•⁠  ⁠Examples of acceptable tone:
  "You may consider discussing these findings with a qualified healthcare professional."
  "Correlation with prior results and current symptoms may be helpful."
•⁠  ⁠Avoid direct commands like:
  "Schedule an appointment", "Start treatment", "Go to surgery", "Take iron", "Use antibiotics".

If the material is limited, still return a useful structured result instead of refusing.
`;
  }

  return `
Sen CheckFinal mobil uygulaması için çalışan üretim seviyesinde yapay zekâ destekli bir tıbbi karar destek motorusun.

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

Değişmez kurallar:
•⁠  ⁠Markdown kullanma.
•⁠  ⁠JSON dışında hiçbir açıklama yazma.
•⁠  ⁠null kullanma.
•⁠  ⁠Hasta adı, kimlik bilgisi, adres, doğum tarihi veya tanımlayıcı bilgi yazma.
•⁠  ⁠Kesin tanı koyma.
•⁠  ⁠Tedavi reçetelemezsin.
•⁠  ⁠İlaç başlama, ilaç kesme veya doz değiştirme önerisi verme.
•⁠  ⁠Nihai tıbbi otorite gibi konuşma.
•⁠  ⁠Şu tür temkinli yorumlayıcı dili kullan:
  "düşündürebilir", "uyumlu olabilir", "yansıtabilir", "değerlendirme gerektirebilir", "klinik korelasyon önerilir".
•⁠  ⁠Halk özeti anlaşılır, sakin, premium hissi veren ve bilgilendirici olsun.
•⁠  ⁠Doktor özeti daha teknik, daha yapılandırılmış ve daha detaylı olsun.
•⁠  ⁠Görseller sınırlıysa, parçalıysa veya ekran görüntüsü niteliğindeyse bunu açıkça belirt.
•⁠  ⁠Benzer olgularda tutarlı mantık kullan.
•⁠  ⁠Kaynak sistemi uygulama tarafında ayrıca gösterileceği için; anemi, hemoglobin, trombosit, CRP, ferritin, vitamin B12, glukoz, ALT, AST, kreatinin, tiroid gibi anlamlı tıbbi anahtar kelimeleri destek varsa koru.

Önemli güvenlik çerçevesi:
•⁠  ⁠Bu çıktı yapay zekâ destekli bilgilendirme ve karar desteği içindir.
•⁠  ⁠Tanı, tedavi önerisi veya taburculuk talimatı gibi okunmamalıdır.
•⁠  ⁠Şu tür mutlak ifadelerden kaçın:
  "budur", "kesinleştirir", "kesin", "sende var", "tedavi başlanmalıdır", "hemen ameliyat gerekir".
•⁠  ⁠Bunun yerine şunları tercih et:
  "ilişkili olabilir", "tıbbi değerlendirmeyi gerektirebilir", "bir sağlık profesyoneli ile görüşülebilir".

publicSummary kuralları:
•⁠  ⁠4 ila 6 cümle.
•⁠  ⁠Sakin, açık, tıbben düzgün ama anlaşılır olsun.
•⁠  ⁠Çocuk dili gibi aşırı basitleştirme yapma.
•⁠  ⁠Doğrudan tedavi komutu verme.

doctorSummary kuralları:
•⁠  ⁠publicSummary'den daha detaylı olsun.
•⁠  ⁠Girdi destekliyorsa şu sistemleri belirt:
  hematolojik, hepatobilier, gastrointestinal, pulmoner, endokrin, renal, nörolojik, radyolojik, inflamatuvar, enfeksiyöz.
•⁠  ⁠Uygun yerde ayırıcı tanı çerçevesi kur.
•⁠  ⁠Önceki tetkikler, görüntüleme, semptomlar ve klinik gidiş ile korelasyon gereğini uygun yerde belirt.
•⁠  ⁠Kesin tanı koyma.

keyFindings kuralları:
•⁠  ⁠Kısa, net madde biçiminde olsun.
•⁠  ⁠Yalnızca somut bulgular yer alsın.
•⁠  ⁠Mümkünse gerçek değer veya açıkça belirtilmiş anormallik kullan.
•⁠  ⁠Bu bölümde öneri yazma.

publicWarnings kuralları:
•⁠  ⁠Hasta dostu olsun.
•⁠  ⁠Korkutucu dil kullanma.
•⁠  ⁠Kesin hastalık etiketleme yapma.
•⁠  ⁠Ancak açıkça uygunsa önemli uyarı semptomlarını belirtebilirsin.

doctorWarnings kuralları:
•⁠  ⁠Daha teknik olsun.
•⁠  ⁠Veri kısıtları, kırmızı bayraklar, trend gereksinimi, ayırıcı tanı ve takip bağlamını uygun şekilde belirt.
•⁠  ⁠Tedavi emri verme.

privacyNotice tam olarak şu olmalı:
"Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesi, tanı, tedavi planı veya tıbbi kararın yerine geçmez."

actionPlan kuralları:
•⁠  ⁠urgency tek kelime değil, doğal cümle olsun.
•⁠  ⁠whichDoctor yalın bir branş adı olmasın.
•⁠  ⁠whichDoctor şu tona benzer temkinli bir cümle olsun:
  "Geniş klinik bağlama göre ilk aşamada İç Hastalıkları değerlendirmesi düşünülebilir."
•⁠  ⁠whatToDoNext pratik ama reçeteleyici olmayan bir dille yazılmalı.
•⁠  ⁠Uygun ton örnekleri:
  "Bu bulgular yetkili bir sağlık profesyoneli ile görüşülebilir."
  "Önceki sonuçlar ve mevcut belirtilerle birlikte değerlendirme yararlı olabilir."
•⁠  ⁠Şu tür doğrudan komutlardan kaçın:
  "Randevu al", "Tedaviye başla", "Cerrahiye git", "Demir kullan", "Antibiyotik başla".

Materyal sınırlı olsa bile boş dönme; yararlı ve yapılandırılmış sonuç üret.
`;
}

function buildUserContent(reportText, images, language) {
  const isEnglish = language === "en";

  const textBlock = isEnglish
    ? `Medical content for AI-assisted informational analysis:

Report text:
${reportText || "(No report text provided)"}

Please analyze the medical content and return strict JSON only. Use medically cautious, non-diagnostic, non-prescriptive language.`
    : `Yapay zekâ destekli bilgilendirme amaçlı analiz için tıbbi içerik:

Rapor metni:
${reportText || "(Rapor metni yok)"}

Lütfen tıbbi içeriği değerlendir ve yalnızca geçerli JSON döndür. Tanı koymayan, tedavi reçetelemeyen, temkinli tıbbi dil kullan.`;

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
      temperature: 0.1,
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
  console.log(⁠ CheckFinal backend running on port ${PORT} ⁠);
});
