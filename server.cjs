require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000);
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || "25mb";
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 8);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.disable("x-powered-by");
app.use(cors({ origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));

const rateStore = new Map();

function getFetch() {
  if (typeof fetch === "function") return fetch;
  return (...args) => import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));
}

function nowIso() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  console[level](`[${nowIso()}] ${message}`, meta);
}

function rateLimit(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const entry = rateStore.get(ip) || { count: 0, start: now };

  if (now - entry.start > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }

  entry.count += 1;
  rateStore.set(ip, entry);

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin."
    });
  }

  next();
}

app.use(rateLimit);

function safeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\u0000/g, "").trim();
  return cleaned || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeStrings(arr, max = 8) {
  const out = [];
  const seen = new Set();

  for (const item of safeArray(arr)) {
    const text = safeString(item);
    if (!text) continue;
    const key = text.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }

  return out;
}

function truncateText(text, max = 16000) {
  const clean = safeString(text);
  return clean.length > max ? clean.slice(0, max) : clean;
}

function normalizeLanguage(input) {
  const lang = safeString(input, "tr").toLowerCase();
  if (lang.startsWith("en")) return "en";
  return "tr";
}

function normalizeImages(rawImages) {
  const images = safeArray(rawImages)
    .map((x) => safeString(x))
    .filter(Boolean)
    .filter((x) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(x) || /^https?:\/\//.test(x))
    .slice(0, MAX_IMAGES);

  return images;
}

function normalizeInputBody(body) {
  const textCandidates = [
    body?.inputText,
    body?.text,
    body?.content,
    body?.reportText,
    body?.preparedText,
    body?.rawText
  ];

  const imageCandidates = [
    ...safeArray(body?.images),
    ...safeArray(body?.imageDataUrls),
    ...safeArray(body?.imageUrls)
  ];

  const text = truncateText(textCandidates.map((x) => safeString(x)).filter(Boolean).join("\n\n"));
  const images = normalizeImages(imageCandidates);
  const selectedLanguage = normalizeLanguage(body?.selectedLanguage || body?.language || "tr");

  return { text, images, selectedLanguage };
}

function chooseDoctor(text) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");

  if (/\banemi\b|\bhemoglobin\b|\bhgb\b|\bdemir\b|\bfe\b|\bferritin\b|\bb12\b/.test(t)) {
    return "Hematoloji";
  }

  if (
    /\bkaraciğer\b|\balt\b|\bast\b|\bggt\b|\balp\b|\bbilirubin\b|\bhepat\b|\baciğer\b/.test(t)
  ) {
    return "Gastroenteroloji";
  }

  if (
    /\bsafra\b|\bkolesist\b|\bkolesistektomi\b|\bsludge\b|\btaş\b|\bgallbladder\b|\bchole/.test(t)
  ) {
    return "Genel Cerrahi";
  }

  if (/\bakciğer\b|\btoraks\b|\bpulmoner\b|\bpnömon\b|\bnefes\b|\böksür/.test(t)) {
    return "Göğüs Hastalıkları";
  }

  return "İç Hastalıkları";
}

function chooseUrgency(text) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");

  if (
    /\bşiddetli ağrı\b|\bdayanılmaz ağrı\b|\bsarılık\b|\bkanama\b|\bsiyah dışkı\b|\bhematemez\b|\bbayılma\b|\bnefes darlığı\b|\bsepsis\b|\bperitonit\b|\bobstrüksiyon\b/.test(
      t
    )
  ) {
    return "Acil değerlendirme gerekebilir";
  }

  if (/\bameliyat\b|\boperasyon\b|\bkolesistektomi\b|\bpersistan\b|\byüksek\b|\banemi\b|\balt\b|\bast\b/.test(t)) {
    return "Geciktirilmeden hekim değerlendirmesi önerilir";
  }

  return "Klinik duruma göre yakın zamanda hekim değerlendirmesi önerilir";
}

function detectKeyFindings(text, hasImages) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");
  const findings = [];

  if (/\bsafra\b|\bsludge\b|\btaş\b|\bkolesist\b/.test(t)) findings.push("Safra kesesi ve safra sistemi ile ilişkili bulgular dikkat çekmektedir.");
  if (/\banemi\b|\bhemoglobin\b|\bhgb\b|\bdemir\b|\bferritin\b/.test(t)) findings.push("Anemi veya demir eksikliği ile uyumlu laboratuvar ifadeleri bulunmaktadır.");
  if (/\bb12\b|\bfolat\b/.test(t)) findings.push("Beslenme veya emilim ile ilişkili vitamin eksikliği olasılığı değerlendirilmelidir.");
  if (/\bkaraciğer\b|\balt\b|\bast\b|\bggt\b|\balp\b|\bbilirubin\b/.test(t)) findings.push("Karaciğer testleri veya hepatobiliyer sistemle ilişkili değerlendirme gerektiren ifadeler vardır.");
  if (/\breflü\b|\bgastrit\b|\bülser\b|\banastomoz\b|\broux\b|\bgastrektomi\b/.test(t)) findings.push("Üst gastrointestinal sistem ve cerrahi öykü ile ilişkili ek değerlendirme ihtiyacı olabilir.");
  if (/\bmri\b|\bmr\b|\busg\b|\bultrason\b|\btomografi\b|\bct\b/.test(t)) findings.push("Görüntüleme verileri klinik tablo ile birlikte yorumlanmalıdır.");
  if (hasImages) findings.push("Görüntü girdileri de değerlendirmeye dahil edilmiştir.");
  if (findings.length === 0) findings.push("Yüklenen içerikte klinik değerlendirme gerektiren ifadeler bulunmaktadır.");

  return dedupeStrings(findings, 8);
}

function buildPublicWarnings(text) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");
  const warnings = [];

  warnings.push("Bu çıktı yalnızca yüklenen veriler üzerinden oluşturulan ön değerlendirme niteliğindedir.");

  if (/\banemi\b|\bdemir\b|\bb12\b/.test(t)) {
    warnings.push("Halsizlik, çarpıntı, nefes darlığı veya belirgin güçsüzlük varsa hekim değerlendirmesi geciktirilmemelidir.");
  }

  if (/\bsafra\b|\bkarın ağrısı\b|\btaş\b|\bkolesist\b/.test(t)) {
    warnings.push("Şiddetli karın ağrısı, ateş, sarılık veya kusma gelişirse acil değerlendirme gerekebilir.");
  }

  if (/\bülser\b|\breflü\b|\bkanama\b/.test(t)) {
    warnings.push("Siyah dışkı, kusmukta kan veya giderek artan mide yakınmaları varsa hızlı tıbbi değerlendirme gerekir.");
  }

  warnings.push("Kesin tanı ve tedavi planı için hekim muayenesi ve resmi raporlarla birlikte değerlendirme yapılmalıdır.");

  return dedupeStrings(warnings, 6);
}

function buildDoctorWarnings(text) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");
  const warnings = [];

  warnings.push("AI çıktısı klinik korelasyon ve resmi rapor doğrulaması olmadan kesin karar amacıyla kullanılmamalıdır.");

  if (/\banemi\b|\bdemir\b|\bb12\b/.test(t)) {
    warnings.push("Persistan anemi, demir/B12 eksikliği, emilim bozukluğu, kronik kan kaybı ve postoperatif beslenme yetersizliği açısından birlikte ele alınmalıdır.");
  }

  if (/\balt\b|\bast\b|\bkaraciğer\b|\bhepat\b/.test(t)) {
    warnings.push("Hepatobiliyer enzim değişiklikleri için trend, ilaç öyküsü, cerrahi öykü ve görüntüleme uyumu değerlendirilmelidir.");
  }

  if (/\bsafra\b|\btaş\b|\bsludge\b|\bkolesistektomi\b/.test(t)) {
    warnings.push("Safra sistemi bulguları ve cerrahi öykü mevcutsa komplikasyon, rezidüel patoloji veya eşlik eden üst GİS sorunları dışlanmalıdır.");
  }

  warnings.push("Eksik veri, tarih uyumsuzluğu veya tekil laboratuvar değerleri aşırı yorumlanmamalıdır.");

  return dedupeStrings(warnings, 7);
}

function buildWhatToDoNext(text, doctor) {
  const t = (safeString(text) || "").toLocaleLowerCase("tr");

  if (doctor === "Hematoloji") {
    return "Hemogram ve demir parametrelerinin güncel trendi gözden geçirilmeli; B12, ferritin ve gerekirse gizli kan kaybı açısından hekim planına göre ileri değerlendirme yapılmalıdır.";
  }

  if (doctor === "Gastroenteroloji") {
    return "Karaciğer testleri ve hepatobiliyer sistem bulguları güncel klinik durumla birlikte yeniden değerlendirilmelidir; ilaç öyküsü, görüntüleme ve gerekirse ek tetkik planı hekim tarafından belirlenmelidir.";
  }

  if (doctor === "Genel Cerrahi") {
    return "Safra sistemi ve cerrahi öykü birlikte ele alınmalı; artan ağrı, ateş, sarılık veya kusma varsa gecikmeden hekim değerlendirmesi yapılmalıdır.";
  }

  if (doctor === "Göğüs Hastalıkları") {
    return "Solunumsal bulgular mevcutsa muayene, oksijenasyon ve uygun görüntüleme ile hekim değerlendirmesi planlanmalıdır.";
  }

  if (/\bülser\b|\breflü\b|\banastomoz\b/.test(t)) {
    return "Mevcut gastrointestinal yakınmalar, beslenme durumu ve laboratuvar değişiklikleri birlikte değerlendirilerek İç Hastalıkları veya Gastroenteroloji üzerinden takip planı oluşturulmalıdır.";
  }

  return "Mevcut bulgular resmi raporlar ve klinik öykü ile birlikte hekim tarafından yeniden değerlendirilmelidir; gerekirse ilgili branşlara yönlendirme yapılmalıdır.";
}

function buildFallbackAnalysis({ text, images, selectedLanguage }) {
  const combined = safeString(text);
  const hasImages = images.length > 0;
  const doctor = chooseDoctor(combined);
  const urgency = chooseUrgency(combined);
  const findings = detectKeyFindings(combined, hasImages);
  const publicWarnings = buildPublicWarnings(combined);
  const doctorWarnings = buildDoctorWarnings(combined);

  const publicSummaryTr =
    [
      "Yüklenen içerik, tek başına kesin tanı koydurmayan ancak klinik değerlendirme gerektirebilecek birden fazla bulgu içermektedir.",
      findings.length ? `Öne çıkan noktalar arasında ${findings.join(" ")}` : "",
      hasImages ? "Görüntü girdileri de metinle birlikte dikkate alınmıştır." : "",
      "Bu sonuç, yalnızca ön bilgilendirme ve karar desteği amaçlıdır; muayene, resmi rapor ve hekim yorumu ile birlikte ele alınmalıdır."
    ]
      .filter(Boolean)
      .join(" ");

  const doctorSummaryTr =
    [
      "Yüklenen veri sınırlı olmakla birlikte içerikte klinik korelasyon gerektiren ifadeler bulunmaktadır.",
      findings.join(" "),
      "Çıktı, tanı koydurucu değil; problem listesi, trend analizi, semptom şiddeti, fizik muayene ve resmi rapor doğrulaması ile birlikte yorumlanmalıdır.",
      `Öncelikli branş yönlendirmesi olarak ${doctor} önerilmiştir.`
    ]
      .filter(Boolean)
      .join(" ");

  const publicSummaryEn =
    [
      "The uploaded content contains findings that do not establish a diagnosis on their own but may warrant clinical evaluation.",
      findings.length ? `Key points include: ${findings.join(" ")}` : "",
      hasImages ? "Image inputs were considered together with the text." : "",
      "This output is intended only for preliminary information and decision support and should be interpreted together with formal reports and clinician evaluation."
    ]
      .filter(Boolean)
      .join(" ");

  const doctorSummaryEn =
    [
      "Although the uploaded data is limited, it contains statements that warrant clinical correlation.",
      findings.join(" "),
      "This output is not diagnostic; it should be interpreted with problem-list framing, trend review, symptom severity, examination findings, and formal report validation.",
      `Primary specialty direction: ${doctor}.`
    ]
      .filter(Boolean)
      .join(" ");

  const tr = selectedLanguage === "tr";

  return {
    publicSummary: tr ? publicSummaryTr : publicSummaryEn,
    doctorSummary: tr ? doctorSummaryTr : doctorSummaryEn,
    keyFindings: findings,
    publicWarnings,
    doctorWarnings,
    privacyNotice: tr
      ? "Bu çıktı yalnızca yüklenen veriler üzerinden oluşturulan yapay zekâ destekli ön değerlendirme niteliğindedir. Kesin tanı, tedavi kararı veya hekim muayenesinin yerine geçmez."
      : "This output is an AI-assisted preliminary assessment generated only from uploaded content. It does not replace diagnosis, treatment planning, or clinician evaluation.",
    actionPlan: {
      urgency,
      whichDoctor: doctor,
      whatToDoNext: buildWhatToDoNext(combined, doctor)
    }
  };
}

function normalizeAnalysis(raw, fallback, sourceText) {
  const out = raw && typeof raw === "object" ? raw : {};
  const fallbackDoctor = chooseDoctor(sourceText);
  const normalized = {
    publicSummary: safeString(out.publicSummary, fallback.publicSummary),
    doctorSummary: safeString(out.doctorSummary, fallback.doctorSummary),
    keyFindings: dedupeStrings(out.keyFindings, 8),
    publicWarnings: dedupeStrings(out.publicWarnings, 7),
    doctorWarnings: dedupeStrings(out.doctorWarnings, 8),
    privacyNotice: safeString(out.privacyNotice, fallback.privacyNotice),
    actionPlan: {
      urgency: safeString(out?.actionPlan?.urgency, fallback.actionPlan.urgency),
      whichDoctor: fallbackDoctor,
      whatToDoNext: safeString(out?.actionPlan?.whatToDoNext, fallback.actionPlan.whatToDoNext)
    }
  };

  if (!normalized.keyFindings.length) normalized.keyFindings = fallback.keyFindings;
  if (!normalized.publicWarnings.length) normalized.publicWarnings = fallback.publicWarnings;
  if (!normalized.doctorWarnings.length) normalized.doctorWarnings = fallback.doctorWarnings;

  return normalized;
}

function buildDeveloperPrompt(language) {
  const isTr = language === "tr";

  if (isTr) {
    return `
Sen CheckFinal için çalışan production-grade bir klinik karar destek motorusun.

KESİN KURALLAR:
- Asla tanı koyma.
- Asla kesin hüküm verme.
- Klinik olarak güçlü ama güvenli dil kullan.
- Uygun kalıplar: "uyumlu olabilir", "düşündürebilir", "değerlendirme gerekir", "klinik korelasyon önerilir", "hekim tarafından ele alınmalıdır".
- Uygun olmayan kalıplar: "kesin vardır", "tanı şudur", "net olarak", "mutlaka".
- Markdown yok.
- JSON dışı tek karakter bile üretme.
- Null üretme.
- Her alan dolu olsun.
- Aynı veriye aynı mantıkla yaklaş.
- Eksik veri varsa bunu abartmadan belirt.
- Halk Modu metni sade ama yüzeysel olmayan, açıklayıcı, premium hissi veren uzunlukta olsun.
- Doktor Modu metni daha teknik, daha sistematik, daha derin olsun.
- Halk Modu teknik jargonla dolu olmasın; anlaşılır Türkçe kullan.
- Doktor Modu, problem listesi mantığıyla yazılsın; klinik korelasyon vurgulansın.
- Bulguları tekrar edip durma; sentez yap.
- Gereksiz korku üretme.
- Görüntü ve metin birlikte geldiyse birlikte değerlendir. Yalnız görüntü varsa da çalış. Yalnız metin varsa da çalış.
- Yalnız yüklenen verilere dayan. Veri dışı uydurma yapma.
- Aciliyet ifadesini sayısallaştırma, risk skoru verme.
- Kırmızı bayrak gerektirebilecek durum varsa bunu güvenli dille belirt.
- Branş seçiminde öncelik kuralı uygula:
  1) anemi / hemoglobin / demir / ferritin / B12 baskınsa -> Hematoloji
  2) karaciğer / ALT / AST / hepatobiliyer baskınsa -> Gastroenteroloji
  3) safra / taş / sludge / kolesist / kolesistektomi baskınsa -> Genel Cerrahi
  4) akciğer / toraks / pnömoni / nefes darlığı baskınsa -> Göğüs Hastalıkları
  5) aksi halde -> İç Hastalıkları
- Birden fazla sistem etkilenmişse summary içinde multidisipliner değerlendirme ihtimalini belirt ama actionPlan.whichDoctor alanında tek ana branş yaz.
- publicWarnings halkın anlayacağı dilde olsun.
- doctorWarnings daha klinik ve ayırıcı düşünceye açık olsun.
- privacyNotice profesyonel ve kısa olsun.
- actionPlan.whatToDoNext net aksiyon cümlesi olsun.
- Asla boş array döndürme; gerekli ise güvenli ve genel maddeler üret.
`;
  }

  return `
You are a production-grade clinical decision support engine for CheckFinal.

HARD RULES:
- Never diagnose.
- Never make definitive claims.
- Use strong but safe clinical language.
- Preferred phrasing: "may be compatible with", "may suggest", "requires evaluation", "clinical correlation is recommended", "should be assessed by a clinician".
- Forbidden phrasing: "definitely has", "the diagnosis is", "clearly proves", "must be".
- No markdown.
- Output JSON only.
- Never output null.
- Every field must be filled.
- Be consistent across similar cases.
- If data is incomplete, mention that carefully without overstating uncertainty.
- publicSummary should be accessible, polished, premium-feeling, and not superficial.
- doctorSummary should be more technical, systematic, and deeper.
- Do not overload publicSummary with jargon.
- doctorSummary should use a problem-list and clinical-correlation mindset.
- Avoid repetitive content across sections.
- Do not generate unnecessary fear.
- If both text and images are provided, assess them together. If only one modality exists, still work.
- Use only uploaded data. Do not invent facts.
- Do not provide numeric risk scores.
- If red-flag type features are relevant, mention them in safe non-diagnostic language.
- Specialty rule priority:
  1) anemia / hemoglobin / iron / ferritin / B12 dominant -> Hematology
  2) liver / ALT / AST / hepatobiliary dominant -> Gastroenterology
  3) gallbladder / stone / sludge / cholecyst / cholecystectomy dominant -> General Surgery
  4) lung / thoracic / pneumonia / dyspnea dominant -> Chest Diseases
  5) otherwise -> Internal Medicine
- If multiple systems are involved, note the multidisciplinary nature in summaries, but actionPlan.whichDoctor must contain only one primary specialty.
- publicWarnings should be easy to understand.
- doctorWarnings should be more clinical and differential-oriented.
- privacyNotice should be brief and professional.
- actionPlan.whatToDoNext should be a clear next-step sentence.
- Never return empty arrays; generate safe general items if needed.
`;
}

function buildUserPrompt(text, imagesCount, language) {
  const isTr = language === "tr";

  if (isTr) {
    return [
      "Yüklenen içerikleri değerlendir ve yalnızca istenen JSON şemasına göre cevap ver.",
      "Metin ve görüntüleri birlikte düşün.",
      "Genel Özet bölümünde bulguları sentezle, tekrar yapma, premium hissi ver.",
      "Doktor Özeti bölümünde daha teknik, daha sistematik ve daha derin analiz yap.",
      "Aşağıda kullanıcı metni yer alıyor:",
      text ? text : "Kullanıcı yazılı metin sağlamadı; yalnızca görüntü girdileri mevcut olabilir.",
      `Görüntü sayısı: ${imagesCount}`
    ].join("\n\n");
  }

  return [
    "Assess the uploaded content and respond only in the requested JSON schema.",
    "Consider text and images together.",
    "In publicSummary, synthesize rather than repeat findings; make it polished and premium-feeling.",
    "In doctorSummary, be more technical, systematic, and deeper.",
    "User text is below:",
    text ? text : "No written text was provided by the user; image inputs may be the only source.",
    `Image count: ${imagesCount}`
  ].join("\n\n");
}

function buildSchema(language) {
  const isTr = language === "tr";

  return {
    name: "checkfinal_analysis_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        publicSummary: {
          type: "string",
          description: isTr
            ? "Halk için sade, açıklayıcı, premium hissi veren ön değerlendirme özeti"
            : "Accessible, polished, premium-feeling public-facing preliminary summary"
        },
        doctorSummary: {
          type: "string",
          description: isTr
            ? "Doktor için daha teknik, daha derin, sistematik klinik yorum"
            : "More technical, deeper, systematic doctor-facing clinical interpretation"
        },
        keyFindings: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 8
        },
        publicWarnings: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 7
        },
        doctorWarnings: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 8
        },
        privacyNotice: {
          type: "string"
        },
        actionPlan: {
          type: "object",
          additionalProperties: false,
          properties: {
            urgency: { type: "string" },
            whichDoctor: { type: "string" },
            whatToDoNext: { type: "string" }
          },
          required: ["urgency", "whichDoctor", "whatToDoNext"]
        }
      },
      required: [
        "publicSummary",
        "doctorSummary",
        "keyFindings",
        "publicWarnings",
        "doctorWarnings",
        "privacyNotice",
        "actionPlan"
      ]
    }
  };
}

async function callOpenAIAnalysis({ text, images, selectedLanguage }) {
  const fetchFn = getFetch();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const userContent = [
    {
      type: "input_text",
      text: buildUserPrompt(text, images.length, selectedLanguage)
    },
    ...images.map((imageUrl) => ({
      type: "input_image",
      image_url: imageUrl,
      detail: "high"
    }))
  ];

  const payload = {
    model: OPENAI_MODEL,
    store: false,
    truncation: "auto",
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: buildDeveloperPrompt(selectedLanguage) }]
      },
      {
        role: "user",
        content: userContent
      }
    ],
    text: {
      verbosity: "medium",
      format: {
        type: "json_schema",
        ...buildSchema(selectedLanguage)
      }
    }
  };

  try {
    const response = await fetchFn("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const apiError =
        safeString(data?.error?.message) ||
        safeString(data?.message) ||
        `OpenAI API error (${response.status})`;
      throw new Error(apiError);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonFromOpenAIResponse(apiData) {
  if (!apiData || typeof apiData !== "object") return null;

  const candidates = [];

  if (typeof apiData.output_text === "string" && apiData.output_text.trim()) {
    candidates.push(apiData.output_text);
  }

  const outputItems = safeArray(apiData.output);
  for (const item of outputItems) {
    const contents = safeArray(item?.content);
    for (const content of contents) {
      if (typeof content?.text === "string" && content.text.trim()) candidates.push(content.text);
      if (typeof content?.output_text === "string" && content.output_text.trim()) candidates.push(content.output_text);
      if (typeof content?.json === "string" && content.json.trim()) candidates.push(content.json);
      if (content?.parsed && typeof content.parsed === "object") return content.parsed;
    }
  }

  for (const raw of candidates) {
    try {
      return JSON.parse(raw);
    } catch (_) {}
  }

  return null;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "checkfinal-backend",
    timestamp: nowIso(),
    model: OPENAI_MODEL
  });
});

app.post("/analyze", async (req, res) => {
  const startedAt = Date.now();

  try {
    const { text, images, selectedLanguage } = normalizeInputBody(req.body);

    if (!text && !images.length) {
      return res.status(400).json({
        error: selectedLanguage === "en"
          ? "No valid input found. Please upload text, image, or both."
          : "Geçerli bir içerik bulunamadı. Lütfen metin, görüntü veya her ikisini yükleyin."
      });
    }

    const fallback = buildFallbackAnalysis({ text, images, selectedLanguage });
    let finalAnalysis = fallback;

    if (!OPENAI_API_KEY) {
      log("warn", "OPENAI_API_KEY missing, using fallback analysis");
    } else {
      try {
        const apiData = await callOpenAIAnalysis({ text, images, selectedLanguage });
        const parsed = extractJsonFromOpenAIResponse(apiData);
        finalAnalysis = normalizeAnalysis(parsed, fallback, text);
      } catch (error) {
        log("error", "OpenAI analysis failed, using fallback", { error: error.message });
        finalAnalysis = fallback;
      }
    }

    log("log", "Analyze success", {
      durationMs: Date.now() - startedAt,
      hasText: Boolean(text),
      imageCount: images.length,
      language: selectedLanguage
    });

    return res.json(finalAnalysis);
  } catch (error) {
    log("error", "Analyze route failed", { error: error.message });

    const selectedLanguage = normalizeLanguage(req.body?.selectedLanguage || req.body?.language || "tr");
    const body = normalizeInputBody(req.body || {});
    const fallback = buildFallbackAnalysis(body);

    return res.status(200).json(
      normalizeAnalysis(
        {
          ...fallback,
          publicWarnings: dedupeStrings([
            ...(fallback.publicWarnings || []),
            selectedLanguage === "en"
              ? "A robust fallback response was used due to a processing issue."
              : "İşleme sırasında sorun oluştuğu için güvenli yedek yanıt kullanıldı."
          ])
        },
        fallback,
        body.text
      )
    );
  }
});

app.use((err, _req, res, _next) => {
  log("error", "Unhandled middleware error", { error: err?.message || "Unknown error" });
  return res.status(500).json({
    error: "Sunucu hatası oluştu."
  });
});

app.listen(PORT, () => {
  log("log", `CheckFinal backend running on port ${PORT}`, {
    model: OPENAI_MODEL,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
});
