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
      if (item.startsWith("data:image/")) return item;
      return `data:image/jpeg;base64,${item}`;
    });
}

function replaceWholeText(text, language) {
  let value = safeString(text);
  if (!value) return "";

  if (language === "en") {
    const replacements = [
      [/\bthis is consistent with\b/gi, "may be compatible with"],
      [/\bthis confirms\b/gi, "this may support"],
      [/\bconfirms\b/gi, "may support"],
      [/\bdefinitive\b/gi, ""],
      [/\bdefinitely\b/gi, ""],
      [/\byou have\b/gi, "there may be findings compatible with"],
      [/\bthe patient has\b/gi, "there may be findings compatible with"],
      [/\brequires surgery now\b/gi, "may warrant surgical review depending on the full clinical context"],
      [/\bstart treatment\b/gi, "consider clinical review"],
      [/\bmust start\b/gi, "may need clinical review before starting"],
      [/\bmust\b/gi, "should"],
      [/\bneeds\b/gi, "may need"],
      [/\brequires\b/gi, "may require"],
      [/\brecommended\b/gi, "may be considered"],
      [/\bstrongly recommended\b/gi, "may be considered"],
      [/\bschedule an appointment\b/gi, "consider medical evaluation"],
      [/\bgo to\b/gi, "consider evaluation by"],
      [/\bsee\b/gi, "discuss with"],
      [/\bimmediately\b/gi, "without unnecessary delay"],
      [/\bdiagnosis\b/gi, "interpretation"],
      [/\btreatment advice\b/gi, "clinical guidance"],
      [/\bbiopsy\b/gi, "tissue sampling evaluation"],
      [/\bultrasound\b/gi, "ultrasound assessment"],
      [/\bct follow-up\b/gi, "imaging follow-up"],
      [/\bfurther evaluation is needed\b/gi, "further evaluation may be helpful"],
      [/\bshould be evaluated\b/gi, "may be evaluated"],
      [/\bshould be investigated\b/gi, "may warrant further review"],
      [/\s+/g, " "],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  } else {
    const replacements = [
      [/\bbudur\b/gi, "ile uyumlu olabilir"],
      [/\bkesin\b/gi, ""],
      [/\bkesin tanı\b/gi, "yorum"],
      [/\bdoğrular\b/gi, "destekleyebilir"],
      [/\bkanıtlar\b/gi, "işaret edebilir"],
      [/\bsende var\b/gi, "ile ilişkili olabilecek bulgular vardır"],
      [/\bhastada var\b/gi, "ile ilişkili olabilecek bulgular vardır"],
      [/\bhemen ameliyat gerekir\b/gi, "tam klinik bağlama göre cerrahi değerlendirme düşünülebilir"],
      [/\btedavi başlanmalıdır\b/gi, "tedavi açısından klinik değerlendirme uygun olabilir"],
      [/\bönerilir\b/gi, "düşünülebilir"],
      [/\bşiddetle önerilir\b/gi, "özellikle düşünülebilir"],
      [/\bmutlaka\b/gi, "uygun şekilde"],
      [/\bgerektirir\b/gi, "gerektirebilir"],
      [/\bgereklidir\b/gi, "uygun olabilir"],
      [/\brandevu al\b/gi, "tıbbi değerlendirme düşünülebilir"],
      [/\bgörülmelidir\b/gi, "değerlendirilebilir"],
      [/\baraştırılmalıdır\b/gi, "araştırılabilir"],
      [/\binceleme yapılmalıdır\b/gi, "inceleme düşünülebilir"],
      [/\bbiyopsi\b/gi, "doku örneklemesi açısından değerlendirme"],
      [/\bUSG\b/gi, "ultrasonografi değerlendirmesi"],
      [/\busg\b/g, "ultrasonografi değerlendirmesi"],
      [/\bhemen\b/gi, "gereksiz gecikme olmadan"],
      [/\btanı\b/gi, "yorum"],
      [/\stedavi önerisi\b/gi, "klinik yönlendirme"],
      [/\s+/g, " "],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  }

  return value.trim();
}

function softenMedicalLabels(text, language) {
  let value = safeString(text);
  if (!value) return "";

  if (language === "en") {
    const replacements = [
      [/\bmild anemia\b/gi, "a pattern that may be compatible with mild anemia"],
      [/\banemia\b/gi, "findings that may be compatible with anemia"],
      [/\biron deficiency\b/gi, "a laboratory pattern that may be compatible with iron deficiency"],
      [/\bvitamin b12 deficiency\b/gi, "a pattern that may be compatible with low vitamin B12 status"],
      [/\blow vitamin b12\b/gi, "a low vitamin B12-related laboratory pattern"],
      [/\bchronic cholecystitis\b/gi, "reported findings that may be compatible with chronic cholecystitis"],
      [/\bcholecystitis\b/gi, "reported findings that may be compatible with gallbladder inflammation"],
      [/\bulcerative colitis\b/gi, "findings that may require clinical correlation for inflammatory bowel disease"],
      [/\bupper respiratory infection\b/gi, "findings that may be related to the upper respiratory tract"],
      [/\bthrombocytopenia\b/gi, "a platelet pattern that may be compatible with thrombocytopenia"],
      [/\bthrombocytosis\b/gi, "a platelet elevation pattern that may be compatible with thrombocytosis"],
      [/\bleukocytosis\b/gi, "a white blood cell elevation pattern that may be compatible with leukocytosis"],
      [/\bhepatitis\b/gi, "hepatic inflammatory involvement that may require clinical correlation"],
      [/\binfection\b/gi, "an infectious process that may require clinical correlation"],
      [/\bmass lesion\b/gi, "a space-occupying lesion"],
      [/\bhepatomegaly\b/gi, "reported hepatomegaly-related enlargement"],
      [/\bsteatosis\b/gi, "a pattern that may be compatible with steatosis"],
      [/\bground-glass\b/gi, "a ground-glass pattern"],
      [/\batelectasis\b/gi, "an atelectatic pattern"],
      [/\blymphoma\b/gi, "a condition that may need exclusion in the appropriate clinical context"],
      [/\bsarcoidosis relapse\b/gi, "a possibility that may require exclusion in the appropriate clinical context"],
      [/\bmalignancy\b/gi, "a finding that may require further exclusion in the appropriate clinical context"],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  } else {
    const replacements = [
      [/\bhafif anemi\b/gi, "anemi ile uyumlu olabilecek görünüm"],
      [/\banemi\b/gi, "anemi ile uyumlu olabilecek bulgular"],
      [/\bdemir eksikliği\b/gi, "demir eksikliği ile uyumlu olabilecek laboratuvar paterni"],
      [/\bvitamin b12 düşüklüğü\b/gi, "düşük vitamin B12 düzeyi ile uyumlu laboratuvar paterni"],
      [/\bvitamin b12 düşük\b/gi, "düşük vitamin B12 düzeyi ile uyumlu bulgu"],
      [/\bkronik kolesistit\b/gi, "kronik kolesistit ile uyumlu olarak raporlanmış bulgular"],
      [/\bkolesistit\b/gi, "safra kesesi inflamasyonu ile uyumlu olabilecek bulgular"],
      [/\bülseratif kolit\b/gi, "inflamatuvar bağırsak hastalığı açısından klinik korelasyon gerektirebilecek bulgular"],
      [/\büst solunum yolu enfeksiyonu\b/gi, "üst solunum yolu ile ilişkili olabilecek bulgular"],
      [/\btrombositopeni\b/gi, "trombosit düşüklüğü ile uyumlu olabilecek patern"],
      [/\btrombositoz\b/gi, "trombosit yüksekliği ile uyumlu laboratuvar paterni"],
      [/\blökositoz\b/gi, "lökosit yüksekliği ile uyumlu laboratuvar paterni"],
      [/\bhepatit\b/gi, "karaciğer inflamasyonu açısından klinik korelasyon gerektirebilecek bulgular"],
      [/\benfeksiyon\b/gi, "enfeksiyöz süreç ile ilişkili olabilecek bulgular"],
      [/\byer kaplayıcı lezyon\b/gi, "yer kaplayıcı süreç"],
      [/\bhepatomegali\b/gi, "raporlanmış karaciğer büyüklüğü artışı"],
      [/\bsteatoz\b/gi, "steatoz ile uyumlu olabilecek patern"],
      [/\bbuzlu cam\b/gi, "buzlu cam paterni"],
      [/\batelektazi\b/gi, "atelektatik patern"],
      [/\blenfoma\b/gi, "uygun klinik bağlamda dışlanması gerekebilecek durum"],
      [/\bsarkoidoz relapsı\b/gi, "uygun klinik bağlamda dışlanması gerekebilecek olasılık"],
      [/\bmalignite\b/gi, "uygun klinik bağlamda dışlanması gerekebilecek durum"],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  }

  return value.trim();
}

function softenDirectivePhrases(text, language) {
  let value = safeString(text);
  if (!value) return "";

  if (language === "en") {
    const replacements = [
      [/\bhematology evaluation\b/gi, "hematology review"],
      [/\bpulmonary evaluation\b/gi, "pulmonary review"],
      [/\bgastroenterology evaluation\b/gi, "gastroenterology review"],
      [/\bneurology evaluation\b/gi, "neurology review"],
      [/\bcardiology evaluation\b/gi, "cardiology review"],
      [/\binternal medicine evaluation\b/gi, "internal medicine review"],
      [/\bshould be followed\b/gi, "may be followed"],
      [/\bshould be monitored\b/gi, "may be monitored"],
      [/\bshould be excluded\b/gi, "may warrant exclusion"],
      [/\bbiopsy may be required\b/gi, "the need for tissue sampling may be clarified clinically"],
      [/\bultrasound may be recommended\b/gi, "ultrasound review may be considered"],
      [/\bfurther hematologic and immunologic evaluation is recommended\b/gi, "further hematologic and immunologic review may be helpful"],
      [/\bclinical correlation is recommended\b/gi, "clinical correlation may be helpful"],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  } else {
    const replacements = [
      [/\bhematoloji değerlendirmesi\b/gi, "hematolojik değerlendirme"],
      [/\bpulmoner değerlendirme\b/gi, "pulmoner inceleme"],
      [/\bgastroenteroloji değerlendirmesi\b/gi, "gastroenterolojik değerlendirme"],
      [/\bnöroloji değerlendirmesi\b/gi, "nörolojik değerlendirme"],
      [/\bkardiyoloji değerlendirmesi\b/gi, "kardiyolojik değerlendirme"],
      [/\biç hastalıkları değerlendirmesi\b/gi, "iç hastalıkları açısından değerlendirme"],
      [/\btakibi önerilir\b/gi, "takibi düşünülebilir"],
      [/\bizlenmelidir\b/gi, "izlenebilir"],
      [/\bdışlanmalıdır\b/gi, "dışlanması değerlendirilebilir"],
      [/\bbiyopsi gerektirebilir\b/gi, "doku örneklemesi ihtiyacı klinik bağlamda netleşebilir"],
      [/\bUSG önerilebilir\b/gi, "ultrasonografi değerlendirmesi düşünülebilir"],
      [/\bultrasonografi ile kontrolü uygun olabilir\b/gi, "ultrasonografi ile kontrol klinik bağlamda değerlendirilebilir"],
      [/\bileri hematolojik ve immünolojik değerlendirme önerilir\b/gi, "ileri hematolojik ve immünolojik değerlendirme yararlı olabilir"],
      [/\bklinik korelasyon önerilir\b/gi, "klinik korelasyon yararlı olabilir"],
      [/\bek tetkik faydalı olabilir\b/gi, "ek inceleme klinik bağlamda yararlı olabilir"],
      [/\baraştırılmalıdır\b/gi, "araştırılabilir"],
    ];

    for (const [pattern, replacement] of replacements) {
      value = value.replace(pattern, replacement);
    }
  }

  return value.trim();
}

function cleanupSentence(text, language) {
  let value = safeString(text);
  if (!value) return "";

  value = value
    .replace(/\b(adlı hasta|hasta adı|patient name|named patient)\b/gi, "")
    .replace(/\b(definitive diagnosis|kesin tanı)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  value = replaceWholeText(value, language);
  value = softenMedicalLabels(value, language);
  value = softenDirectivePhrases(value, language);
  value = value.replace(/\s+/g, " ").trim();

  if (!value) {
    return language === "en"
      ? "Clinical correlation may be helpful."
      : "Klinik korelasyon yararlı olabilir.";
  }

  return value;
}

function sanitizeSummaryText(text, language) {
  return cleanupSentence(text, language);
}

function sanitizeLine(text, language) {
  return cleanupSentence(text, language);
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
    ? "Routine medical review may be considered depending on symptoms, examination findings, and prior test results."
    : "Belirtiler, muayene bulguları ve önceki tetkiklerle birlikte değerlendirilerek rutin tıbbi inceleme düşünülebilir.";
}

function buildFallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The uploaded medical content could not be interpreted with sufficient confidence at this time. Please try again with clearer text or images. If symptoms are significant or worsening, medical evaluation may be considered."
      : "Yüklenen tıbbi içerik bu aşamada yeterli güvenle yorumlanamadı. Daha net metin veya görüntülerle tekrar deneyin. Yakınmalar belirginse veya artıyorsa tıbbi değerlendirme düşünülebilir.",
    doctorSummary: isEnglish
      ? "A structured interpretation could not be generated with sufficient reliability. Review of the original report, clinical history, examination findings, and prior results may be helpful."
      : "Yeterli güvenilirlikte yapılandırılmış yorum oluşturulamadı. Orijinal rapor, klinik öykü, muayene bulguları ve önceki sonuçlarla birlikte değerlendirme yararlı olabilir.",
    keyFindings: isEnglish
      ? ["No reliable structured extraction could be completed from the uploaded material."]
      : ["Yüklenen içerikten güvenilir yapılandırılmış çıkarım tamamlanamadı."],
    publicWarnings: isEnglish
      ? ["If there is severe pain, shortness of breath, fainting, confusion, or rapid worsening, urgent medical assessment may be considered."]
      : ["Şiddetli ağrı, nefes darlığı, bayılma, bilinç değişikliği veya hızlı kötüleşme varsa acil tıbbi değerlendirme düşünülebilir."],
    doctorWarnings: isEnglish
      ? ["Manual review of the original report and full clinical correlation may be helpful."]
      : ["Orijinal raporun manuel incelenmesi ve tam klinik korelasyon yararlı olabilir."],
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
        ? "You may consider repeating the upload with clearer documents or images and discussing the available material with a qualified healthcare professional."
        : "Daha net belge veya görüntülerle tekrar yükleme yapılması ve mevcut materyalin yetkili bir sağlık profesyoneli ile birlikte değerlendirilmesi düşünülebilir.",
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
      ? "Hematology may be considered as an initial review area depending on the broader clinical context."
      : "Genel klinik bağlama göre ilk aşamada hematolojik değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("gastro") ||
    lower.includes("hepatology") ||
    lower.includes("hepatoloji") ||
    lower.includes("gastroenteroloji")
  ) {
    return isEnglish
      ? "Gastroenterology review may be considered depending on the pattern of findings and clinical history."
      : "Bulgu paternine ve klinik öyküye göre gastroenterolojik değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("general surgery") ||
    lower.includes("cerrahi") ||
    lower.includes("surgery") ||
    lower.includes("genel cerrahi")
  ) {
    return isEnglish
      ? "General surgery review may be considered if supported by the full report and clinical findings."
      : "Tam rapor ve klinik bulgular destekliyorsa cerrahi açıdan değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("neurology") ||
    lower.includes("nöroloji") ||
    lower.includes("neurolog") ||
    lower.includes("nörolog")
  ) {
    return isEnglish
      ? "Neurologic review may be considered if the symptoms and examination findings are neurologically oriented."
      : "Belirtiler ve muayene bulguları nörolojik ağırlıklıysa nörolojik değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("pulmon") ||
    lower.includes("chest") ||
    lower.includes("göğüs") ||
    lower.includes("respiratory")
  ) {
    return isEnglish
      ? "Pulmonary review may be considered depending on respiratory findings and the overall clinical picture."
      : "Solunumsal bulgular ve genel klinik tabloya göre pulmoner değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("cardio") ||
    lower.includes("kardiyo") ||
    lower.includes("cardiology") ||
    lower.includes("kardiyoloji")
  ) {
    return isEnglish
      ? "Cardiovascular review may be considered if the findings are compatible with that clinical context."
      : "Bulgular kardiyovasküler bağlamla uyumluysa kardiyolojik değerlendirme düşünülebilir.";
  }

  if (
    lower.includes("internal medicine") ||
    lower.includes("iç hastalıkları") ||
    lower.includes("dahiliye")
  ) {
    return isEnglish
      ? "Internal medicine review may be considered as an initial evaluation point depending on the broader clinical context."
      : "Geniş klinik bağlama göre ilk aşamada iç hastalıkları açısından değerlendirme düşünülebilir.";
  }

  return isEnglish
    ? "A healthcare professional can determine the most appropriate review pathway after considering the full clinical context."
    : "Uygun değerlendirme yolu, tam klinik bağlam göz önünde bulundurularak bir sağlık profesyoneli tarafından belirlenebilir.";
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
      ? "You may consider discussing these findings with a qualified healthcare professional together with symptom history and prior results."
      : "Bu bulguların belirti öyküsü ve önceki sonuçlarla birlikte yetkili bir sağlık profesyoneli ile görüşülmesi düşünülebilir.";
  }

  return isEnglish
    ? "Clinical correlation may be helpful."
    : "Klinik korelasyon yararlı olabilir.";
}

function normalizeResponse(parsed, language) {
  const fallback = buildFallbackResponse(language);

  const publicSummary =
    sanitizeSummaryText(parsed.publicSummary, language) || fallback.publicSummary;

  const doctorSummary =
    sanitizeSummaryText(parsed.doctorSummary, language) || fallback.doctorSummary;

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
- Never output markdown.
- Never output commentary outside JSON.
- Never use null.
- Do not include patient names, identifiers, addresses, dates of birth, or other personal identifiers.
- Do not make a definitive diagnosis.
- Do not prescribe treatment.
- Do not tell the user to start, stop, or change medication.
- Do not sound like a final medical authority.
- Use cautious interpretive language such as:
  "may suggest", "may be compatible with", "could reflect", "may warrant evaluation", "should be correlated clinically".
- Public summary must be understandable, calm, informative, and non-prescriptive.
- Doctor summary must be more technical, more structured, and more detailed, but still non-diagnostic.
- If images are limited, partial, or screenshot-based, explicitly state the limitation.
- Keep reasoning internally consistent across similar cases.
- Preserve meaningful medical keywords from the source when supported, such as anemia, hemoglobin, platelet, CRP, ferritin, vitamin B12, glucose, ALT, AST, creatinine, thyroid, gallbladder, liver, bowel, lymph node, hepatomegaly, steatosis, leukocytosis, thrombocytosis, etc.
- The app provides citations separately, so your role is to produce medically cautious content while preserving relevant finding terms.

Important safety framing:
- This is an AI-assisted informational and decision-support output.
- It must not read like diagnosis, treatment advice, discharge instructions, or specialist orders.
- Avoid absolute phrases such as:
  "this is", "confirms", "definitely", "you have", "must start treatment", "requires surgery now".
- Prefer:
  "may be associated with", "may be compatible with", "may justify medical review", "can be discussed with a healthcare professional".
- When naming conditions, use forms like:
  "findings that may be compatible with anemia"
  "reported findings that may be compatible with chronic cholecystitis"
  "a laboratory pattern that may be compatible with iron deficiency"
  "a platelet elevation pattern that may be compatible with thrombocytosis"
- Do not present a disease label as final fact.

publicSummary rules:
- 4 to 6 sentences.
- Calm, clear, medically literate, but understandable.
- No childish simplification.
- No direct treatment instructions.
- No direct commands.

doctorSummary rules:
- More detailed than publicSummary.
- Mention likely systems involved when supported by the input:
  hematologic, hepatobiliary, gastrointestinal, pulmonary, endocrine, renal, neurologic, radiologic, inflammatory, infectious.
- Mention differential framing when appropriate.
- Mention correlation with prior labs, imaging, symptoms, and clinical course where appropriate.
- No definitive diagnosis.
- No imperative treatment language.
- Avoid direct specialist instructions; frame them as possible review pathways.

keyFindings rules:
- Short bullet-style items.
- Concrete findings only.
- Prefer actual values or explicitly stated abnormalities where available.
- Avoid recommendations in this section.
- If a disease term appears, phrase it cautiously:
  "reported finding compatible with..."
  "laboratory pattern that may be compatible with..."
  "finding requiring clinical correlation for..."

publicWarnings rules:
- Patient-friendly.
- No panic language.
- No definitive disease labeling.
- Mention red-flag symptoms only when clearly relevant.
- Use observation/follow-up language, not treatment language.

doctorWarnings rules:
- More technical.
- Mention limitations, red flags, trend need, differential considerations, and follow-up context when appropriate.
- No treatment orders.
- No direct medication or procedural instructions.
- Prefer "may be helpful", "may be considered", "may warrant review" instead of "recommended", "should undergo", "must".

privacyNotice must be exactly:
"This report is for informational and decision-support purposes only. It does not replace physician evaluation, diagnosis, treatment planning, or medical judgment."

actionPlan rules:
- urgency must be a natural sentence, not a single label.
- whichDoctor must NOT be a bare specialty name.
- whichDoctor must be phrased cautiously, such as:
  "Internal medicine review may be considered as an initial evaluation point depending on the broader clinical context."
- whatToDoNext must be practical but non-prescriptive.
- Examples of acceptable tone:
  "You may consider discussing these findings with a qualified healthcare professional."
  "Correlation with prior results and current symptoms may be helpful."
- Avoid direct commands like:
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
- Markdown kullanma.
- JSON dışında hiçbir açıklama yazma.
- null kullanma.
- Hasta adı, kimlik bilgisi, adres, doğum tarihi veya tanımlayıcı bilgi yazma.
- Kesin tanı koyma.
- Tedavi reçetelemezsin.
- İlaç başlama, ilaç kesme veya doz değiştirme önerisi verme.
- Nihai tıbbi otorite gibi konuşma.
- Şu tür temkinli yorumlayıcı dili kullan:
  "düşündürebilir", "uyumlu olabilir", "yansıtabilir", "değerlendirme gerektirebilir", "klinik korelasyon önerilir".
- Halk özeti anlaşılır, sakin, bilgilendirici ve reçeteleyici olmayan bir dilde olsun.
- Doktor özeti daha teknik, daha yapılandırılmış ve daha detaylı olsun; yine de kesin tanı dili kullanmasın.
- Görseller sınırlıysa, parçalıysa veya ekran görüntüsü niteliğindeyse bunu açıkça belirt.
- Benzer olgularda tutarlı mantık kullan.
- Kaynak sistemi uygulama tarafında ayrıca gösterileceği için; anemi, hemoglobin, trombosit, CRP, ferritin, vitamin B12, glukoz, ALT, AST, kreatinin, tiroid, safra kesesi, karaciğer, bağırsak, lenf nodu, hepatomegali, steatoz, lökositoz, trombositoz gibi anlamlı tıbbi anahtar kelimeleri destek varsa koru.

Önemli güvenlik çerçevesi:
- Bu çıktı yapay zekâ destekli bilgilendirme ve karar desteği içindir.
- Tanı, tedavi önerisi, taburculuk talimatı veya uzman emri gibi okunmamalıdır.
- Şu tür mutlak ifadelerden kaçın:
  "budur", "kesinleştirir", "kesin", "sende var", "tedavi başlanmalıdır", "hemen ameliyat gerekir".
- Bunun yerine şunları tercih et:
  "ilişkili olabilir", "uyumlu olabilir", "tıbbi değerlendirmeyi gerektirebilir", "bir sağlık profesyoneli ile görüşülebilir".
- Hastalık adı kullanırken bunu nihai gerçek gibi değil, şu biçimde ver:
  "anemi ile uyumlu olabilecek bulgular"
  "kronik kolesistit ile uyumlu olarak raporlanmış bulgular"
  "demir eksikliği ile uyumlu olabilecek laboratuvar paterni"
  "trombosit yüksekliği ile uyumlu laboratuvar paterni"
- Hastalık etiketini nihai tanı gibi sunma.

publicSummary kuralları:
- 4 ila 6 cümle.
- Sakin, açık, tıbben düzgün ama anlaşılır olsun.
- Çocuk dili gibi aşırı basitleştirme yapma.
- Doğrudan tedavi komutu verme.
- Doğrudan emir verme.

doctorSummary kuralları:
- publicSummary'den daha detaylı olsun.
- Girdi destekliyorsa şu sistemleri belirt:
  hematolojik, hepatobilier, gastrointestinal, pulmoner, endokrin, renal, nörolojik, radyolojik, inflamatuvar, enfeksiyöz.
- Uygun yerde ayırıcı tanı çerçevesi kur.
- Önceki tetkikler, görüntüleme, semptomlar ve klinik gidiş ile korelasyon gereğini uygun yerde belirt.
- Kesin tanı koyma.
- Emredici tedavi dili kullanma.
- Doğrudan branş emri verme; bunu olası değerlendirme yolu gibi sun.

keyFindings kuralları:
- Kısa, net madde biçiminde olsun.
- Yalnızca somut bulgular yer alsın.
- Mümkünse gerçek değer veya açıkça belirtilmiş anormallik kullan.
- Bu bölümde öneri yazma.
- Hastalık terimi geçecekse şu biçimde yaz:
  "uyumlu olabilecek laboratuvar paterni"
  "raporlanmış bulgu"
  "klinik korelasyon gerektirebilecek bulgu"

publicWarnings kuralları:
- Hasta dostu olsun.
- Korkutucu dil kullanma.
- Kesin hastalık etiketleme yapma.
- Açıkça uygunsa önemli uyarı semptomlarını belirtebilirsin.
- Gözlem ve değerlendirme dili kullan; tedavi dili kullanma.

doctorWarnings kuralları:
- Daha teknik olsun.
- Veri kısıtları, kırmızı bayraklar, trend gereksinimi, ayırıcı tanı ve takip bağlamını uygun şekilde belirt.
- Tedavi emri verme.
- İlaç veya işlem önerisini emir gibi yazma.
- "önerilir", "uygulanmalıdır", "gereklidir" yerine mümkün olduğunca "yararlı olabilir", "düşünülebilir", "göz önünde bulundurulabilir" kullan.

privacyNotice tam olarak şu olmalı:
"Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesi, tanı, tedavi planı veya tıbbi kararın yerine geçmez."

actionPlan kuralları:
- urgency tek kelime değil, doğal cümle olsun.
- whichDoctor yalın bir branş adı olmasın.
- whichDoctor şu tona benzer temkinli bir cümle olsun:
  "Geniş klinik bağlama göre ilk aşamada iç hastalıkları açısından değerlendirme düşünülebilir."
- whatToDoNext pratik ama reçeteleyici olmayan bir dille yazılmalı.
- Uygun ton örnekleri:
  "Bu bulgular yetkili bir sağlık profesyoneli ile görüşülebilir."
  "Önceki sonuçlar ve mevcut belirtilerle birlikte değerlendirme yararlı olabilir."
- Şu tür doğrudan komutlardan kaçın:
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
      temperature: 0.08,
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
