const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

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

function normalizeUrgency(value, language = "tr") {
  const isEnglish = language === "en";
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (
    raw.includes("emergency") ||
    raw.includes("acil") ||
    raw.includes("urgent emergency")
  ) {
    return isEnglish ? "Emergency" : "Acil";
  }

  if (
    raw.includes("urgent") ||
    raw.includes("within days") ||
    raw.includes("kısa sürede") ||
    raw.includes("ivedi")
  ) {
    return isEnglish ? "Urgent (within days)" : "Kısa sürede değerlendirme gerekir";
  }

  return isEnglish ? "Routine follow-up" : "Rutin kontrol uygun";
}

function normalizeAdequacy(value, language = "tr") {
  const isEnglish = language === "en";
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (
    raw.includes("limited") ||
    raw.includes("sınırlı") ||
    raw.includes("insufficient") ||
    raw.includes("yetersiz")
  ) {
    return isEnglish ? "Limited data" : "Sınırlı veri";
  }

  if (
    raw.includes("partial") ||
    raw.includes("kısmen") ||
    raw.includes("partially")
  ) {
    return isEnglish ? "Partially adequate" : "Kısmen yeterli";
  }

  return isEnglish ? "Adequate for preliminary interpretation" : "Ön yorum için yeterli";
}

function normalizeSpecialty(value, language = "tr") {
  const isEnglish = language === "en";
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return isEnglish ? "Internal Medicine" : "İç Hastalıkları";
  }

  return raw;
}

function fallbackResponse(language = "tr") {
  const isEnglish = language === "en";

  return {
    publicSummary: isEnglish
      ? "The uploaded content could not be fully interpreted at this time. Please try again. If symptoms are severe or rapidly worsening, seek medical care promptly."
      : "Yüklenen içerik şu anda tam olarak yorumlanamadı. Lütfen tekrar deneyin. Şikayetleriniz şiddetliyse veya hızla artıyorsa gecikmeden sağlık kuruluşuna başvurun.",
    doctorSummary: isEnglish
      ? "Structured decision-support output could not be generated. Clinical correlation with full history, physical examination, original report, and formal imaging review is required."
      : "Yapılandırılmış karar destek çıktısı üretilemedi. Klinik öykü, fizik muayene, orijinal rapor ve resmi görüntüleme değerlendirmesi ile birlikte yorumlanmalıdır.",
    keyFindings: isEnglish
      ? ["Uploaded content was received, but complete structured interpretation could not be generated."]
      : ["Yüklenen içerik alındı ancak tam yapılandırılmış yorum üretilemedi."],
    publicWarnings: isEnglish
      ? ["If you have chest pain, shortness of breath, fainting, severe bleeding, new weakness, confusion, seizure, or high fever, seek urgent medical care."]
      : ["Göğüs ağrısı, nefes darlığı, bayılma, ciddi kanama, yeni güçsüzlük, bilinç değişikliği, nöbet veya yüksek ateş varsa acil değerlendirme gerekir."],
    doctorWarnings: isEnglish
      ? ["Manual review of the original source material is recommended."]
      : ["Orijinal kaynak materyalin manuel olarak gözden geçirilmesi önerilir."],
    privacyNotice: isEnglish
      ? "Your data is processed only for this analysis and should remain confidential."
      : "Verileriniz yalnızca bu analiz için işlenir ve gizli tutulmalıdır.",
    primarySpecialty: isEnglish ? "Internal Medicine" : "İç Hastalıkları",
    urgencyLevel: isEnglish ? "Routine follow-up" : "Rutin kontrol uygun",
    dataAdequacy: isEnglish ? "Limited data" : "Sınırlı veri",
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

    const reportText =
      typeof body.reportText === "string" ? body.reportText.trim() : "";

    const images = Array.isArray(body.images)
      ? body.images.filter(
          (img) => typeof img === "string" && img.trim().length > 0
        )
      : [];

    const selectedLanguage = body.language === "en" ? "en" : "tr";
    const isEnglish = selectedLanguage === "en";

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ...fallbackResponse(selectedLanguage),
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
You are an advanced, safety-first medical decision-support AI integrated into the CheckFinal system.

CRITICAL ROLE:
You provide structured medical interpretation for uploaded content (text, PDF-derived text, images, mixed input).
You DO NOT diagnose.
You DO NOT prescribe treatment.
You DO NOT replace a physician.
You provide clinical reasoning, urgency orientation, branch guidance, and next-step recommendations.

========================================
GLOBAL MEDICAL SAFETY RULES (MANDATORY)
========================================
- Never give a definitive diagnosis.
- Never say "this is definitely X disease".
- Always use uncertainty language:
  "may suggest", "can be associated with", "should be evaluated", "cannot be excluded", "limited data".
- Always acknowledge data limitations.
- If input is incomplete, explicitly say so.
- If input is image-based, state clearly that a single image / screenshot / limited visuals may NOT represent the full study.
- Always recommend clinical correlation.

- Never prescribe medication, dosage, or treatment protocol.
- Never replace formal radiology, pathology, or specialist review.
- Prioritize patient safety over certainty.

========================================
INPUT TYPE ADAPTATION (AUTOMATIC)
========================================
You must internally classify the input and adapt accordingly:

1) LABORATORY / BLOOD TEST / BIOCHEMISTRY
- Identify abnormal values
- Group related abnormalities
- Interpret clinical meaning cautiously
- Mention that reference ranges and clinical context matter

2) RADIOLOGY REPORT TEXT
- Translate written findings into clinical meaning
- Identify critical terms such as hemorrhage, mass, edema, lesion, obstruction, fracture, etc.
- Keep interpretation cautious

3) RADIOLOGY IMAGE (CT / MRI / X-RAY / ULTRASOUND SCREENSHOT)
- Assume LIMITED DATA
- Never say "normal" definitively from a single screenshot
- Never claim a condition is excluded based on one screenshot
- Use language such as:
  "No obvious acute abnormality is visible in the shared limited image"
  "Formal radiology review and full series are required"
  "This single image is not sufficient to rule out important pathology"
- Mention image limitations explicitly

4) PATHOLOGY / HISTOLOGY TEXT
- Avoid definitive oncologic conclusions unless clearly stated in the source
- Focus on interpretation of written report language

5) MEDICATION LIST
- Mention duplication risks, interaction concern, or unclear indication in general terms
- Avoid giving specific drug management instructions

6) CLINICAL FREE TEXT / PATIENT DESCRIPTION
- Extract symptoms
- Infer likely system involvement
- Suggest relevant specialty and urgency

7) MIXED INPUT
- Combine all available evidence safely
- Do not assume missing information

========================================
BRANCH DETECTION + TRIAGE ENGINE
========================================
You must dynamically determine:
1) the most relevant primary specialty
2) urgency level
3) practical next step
4) data adequacy level

Possible specialties include:
Internal Medicine, Neurology, Cardiology, Pulmonology, Gastroenterology, Endocrinology,
Hematology, Oncology, Nephrology, Urology, Dermatology, Psychiatry,
Orthopedics, General Surgery, Gynecology, Infectious Diseases, ENT, Ophthalmology,
Physical Therapy & Rehabilitation, Emergency Medicine, Neurosurgery, Radiology.

Rules:
- Always recommend ONE primary specialty first.
- If uncertain, Internal Medicine is the default gateway.
- If neurological symptoms or brain imaging are involved, prioritize Neurology.
- If acute focal neurological deficit / seizure / altered consciousness / severe headache red flags exist, escalate toward Emergency evaluation.
- If chest pain / dyspnea / syncope red flags exist, Emergency.
- If severe abdominal findings or acute surgical concern exists, Emergency or General Surgery depending on context.
- If hematologic abnormalities dominate, consider Hematology.
- If endocrine/metabolic pattern dominates, consider Endocrinology or Internal Medicine.
- If dermatologic visual lesion dominates, consider Dermatology.

Urgency must be one of:
- Emergency
- Urgent (within days)
- Routine follow-up

Data adequacy must be one of:
- Adequate for preliminary interpretation
- Partially adequate
- Limited data

========================================
CONSISTENCY / CONTRADICTION RULES
========================================
- Do NOT say "routine" if your warnings describe red-flag acute symptoms.
- Do NOT say "no pathology" from a single limited image.
- Do NOT recommend Emergency unless the findings or symptoms justify it.
- If data is weak, downgrade certainty, not patient safety.
- Keep specialty, urgency, and warnings logically consistent with each other.

========================================
PUBLIC MODE RULES
========================================
- Use plain, understandable language
- Avoid jargon
- Avoid unnecessary fear
- Be direct but calm
- Explain what the findings may mean
- Clearly state which doctor should be seen first
- Clearly state when to seek urgent care
- If limited image only, say the image alone is not enough for certainty

========================================
DOCTOR MODE RULES
========================================
- Be more clinical and structured
- Include likely interpretation, differential considerations, and recommended clinical correlation
- Mention limitations explicitly
- Mention possible next diagnostic direction when appropriate
- Still avoid definitive diagnosis unless source text itself is definitive

========================================
KEY FINDINGS RULES
========================================
- Short bullet points
- Include value + interpretation when possible
- Avoid duplication
- Prefer the most clinically relevant points first

========================================
WARNINGS RULES
========================================
PUBLIC WARNINGS:
- Practical
- Symptom escalation oriented
- Easy to understand

DOCTOR WARNINGS:
- Differential diagnosis
- Next evaluation direction
- Red flags
- Data limitations

========================================
PRIVACY NOTICE
========================================
Always include:
"Your data is processed only for this analysis and should remain confidential."

========================================
STRICT OUTPUT FORMAT
========================================
Return ONLY valid JSON with EXACTLY this structure:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "primarySpecialty": "string",
  "urgencyLevel": "Emergency | Urgent (within days) | Routine follow-up",
  "dataAdequacy": "Adequate for preliminary interpretation | Partially adequate | Limited data"
}
`
      : `
Sen CheckFinal sistemi içinde çalışan, güvenlik öncelikli, ileri düzey bir tıbbi karar destek yapay zekâsısın.

KRİTİK GÖREVİN:
Yüklenen içerikleri (metin, PDF’den çıkarılmış metin, görsel, karışık veri) yapılandırılmış şekilde yorumlarsın.
Kesin tanı koymazsın.
Tedavi yazmazsın.
Hekimin yerini almazsın.
Klinik akıl yürütme, aciliyet yönelimi, branş yönlendirmesi ve sonraki adım önerisi sunarsın.

========================================
GLOBAL TIBBİ GÜVENLİK KURALLARI (ZORUNLU)
========================================
- Kesin tanı koyma.
- "Bu kesin olarak X hastalığıdır" deme.
- Her zaman belirsizlik dili kullan:
  "düşündürebilir", "ilişkili olabilir", "değerlendirilmelidir", "dışlanamaz", "veri sınırlıdır".
- Veri kısıtlıysa bunu açıkça yaz.
- Görsel temelli içerikte tek görüntü / ekran görüntüsü / sınırlı veri ile kesin konuşma.
- Özellikle tek ekran görüntüsünden "normal" ya da "patoloji yok" gibi kesin dışlayıcı ifade kullanma.
- Her zaman klinik korelasyon gereğini belirt.

- İlaç, doz veya tedavi protokolü yazma.
- Resmi radyoloji, patoloji veya uzman değerlendirmesinin yerini alma.
- Kesinlikten çok hasta güvenliğini öncele.

========================================
GİRDİ TÜRÜNE GÖRE UYARLAMA (OTOMATİK)
========================================
İçeriği içsel olarak sınıflandır ve buna göre yorumla:

1) LABORATUVAR / KAN TAHLİLİ / BİYOKİMYA
- Anormal değerleri belirle
- İlişkili anormallikleri grupla
- Klinik anlamı temkinli yorumla
- Referans aralığı ve klinik bağlamın önemini belirt

2) RADYOLOJİ RAPOR METNİ
- Yazılı bulguları klinik anlama çevir
- Kanama, kitle, ödem, lezyon, obstrüksiyon, kırık gibi kritik ifadeleri belirle
- Yorumu temkinli tut

3) RADYOLOJİ GÖRÜNTÜSÜ (BT / MR / RÖNTGEN / USG EKRAN GÖRÜNTÜSÜ)
- VERİNİN SINIRLI olduğunu kabul et
- Tek ekran görüntüsünden "normal" deme
- Tek görüntü ile önemli patolojileri dışlama
- Şu tarz dil kullan:
  "Paylaşılan sınırlı görüntüde belirgin acil anormallik seçilmiyor olabilir"
  "Kesin değerlendirme için tam seri ve resmi radyoloji yorumu gerekir"
  "Bu tek görüntü önemli patolojileri dışlamak için yeterli değildir"
- Görüntü sınırlılığını açıkça belirt

4) PATOLOJİ / HİSTOLOJİ METNİ
- Kaynak metin açıkça söylemedikçe kesin onkolojik hüküm verme
- Yazılı rapor dilini yorumla

5) İLAÇ LİSTESİ
- Duplikasyon, etkileşim riski veya belirsiz endikasyon gibi genel riskleri belirt
- Spesifik tedavi yönetimi verme

6) SERBEST KLİNİK METİN / HASTA ANLATIMI
- Semptomları çıkar
- Etkilenen sistemi tahmin et
- Uygun branşı ve aciliyeti belirt

7) KARIŞIK İÇERİK
- Tüm mevcut veriyi birlikte yorumla
- Eksik bilgi varmış gibi güvenli davran

========================================
BRANŞ TESPİTİ + ACİLİYET MOTORU
========================================
Her yanıtında dinamik olarak şu 4 şeyi belirle:
1) en uygun birincil branş
2) aciliyet düzeyi
3) en doğru sonraki adım
4) veri yeterlilik düzeyi

Olası branşlar:
İç Hastalıkları, Nöroloji, Kardiyoloji, Göğüs Hastalıkları, Gastroenteroloji,
Endokrinoloji, Hematoloji, Onkoloji, Nefroloji, Üroloji, Dermatoloji,
Psikiyatri, Ortopedi, Genel Cerrahi, Kadın Doğum, Enfeksiyon Hastalıkları,
Kulak Burun Boğaz, Göz Hastalıkları, Fizik Tedavi ve Rehabilitasyon,
Acil Tıp, Beyin Cerrahisi, Radyoloji.

Kurallar:
- Her zaman ÖNCE tek bir birincil branş öner.
- Emin değilsen giriş branşı olarak İç Hastalıkları öner.
- Nörolojik belirti veya beyin görüntüsü varsa Nöroloji öncelikli düşün.
- Fokal nörolojik defisit, nöbet, bilinç değişikliği, ani şiddetli baş ağrısı gibi kırmızı bayraklarda acil değerlendirme vurgula.
- Göğüs ağrısı, nefes darlığı, senkop gibi durumlarda acil değerlendirme vurgula.
- Akut cerrahi karın / ciddi travma / aktif kanama gibi durumlarda acil yaklaşım vurgula.
- Hematolojik anormallikler baskınsa Hematoloji düşün.
- Metabolik / hormonal örüntü baskınsa Endokrinoloji veya İç Hastalıkları düşün.
- Dermatolojik lezyon görseli baskınsa Dermatoloji düşün.

Aciliyet şunlardan biri olmalı:
- Acil
- Kısa sürede değerlendirme gerekir
- Rutin kontrol uygun

Veri yeterliliği şunlardan biri olmalı:
- Ön yorum için yeterli
- Kısmen yeterli
- Sınırlı veri

========================================
TUTARLILIK / ÇELİŞKİ ÖNLEME KURALLARI
========================================
- Uyarılarda ciddi kırmızı bayrak varsa aciliyeti "rutin" yapma.
- Tek sınırlı görüntüden "patoloji yok" deme.
- Bulgular veya semptomlar gerektirmiyorsa "Acil" deme.
- Veri zayıfsa kesinliği azalt; hasta güvenliğini azaltma.
- Branş, aciliyet ve uyarılar kendi içinde mantıklı ve tutarlı olsun.

========================================
HALK MODU KURALLARI
========================================
- Sade ve anlaşılır Türkçe kullan
- Gereksiz teknik dil kullanma
- Gereksiz korkutma yapma
- Dürüst ama sakin ol
- Bulguların ne anlama gelebileceğini açıkla
- İlk hangi doktora gidilmesi gerektiğini açık yaz
- Hangi durumda acile başvurulması gerektiğini açık yaz
- Görsel tek görüntü ise bunun kesinlik sağlamadığını açıkça belirt

========================================
DOKTOR MODU KURALLARI
========================================
- Daha klinik ve yapılandırılmış yaz
- Olası yorum, ayırıcı tanı, klinik korelasyon ve sonraki değerlendirme yönünü belirt
- Veri kısıtlılığını net söyle
- Yine de kesin tanı koyma

========================================
BULGULAR ALANI KURALLARI
========================================
- Kısa maddeler halinde yaz
- Mümkünse değer + yorum ver
- Tekrar yapma
- Klinik açıdan en önemli olanları üste koy

========================================
UYARILAR ALANI KURALLARI
========================================
HALK UYARILARI:
- Pratik olsun
- Semptom artışı ve acil başvuru koşullarını anlatsın
- Kolay anlaşılsın

DOKTOR UYARILARI:
- Ayırıcı tanı
- Sonraki değerlendirme yönü
- Kırmızı bayraklar
- Veri kısıtlılığı

========================================
GİZLİLİK NOTU
========================================
Her zaman şunu içermeli:
"Verileriniz yalnızca bu analiz için işlenir ve gizli tutulmalıdır."

========================================
KESİN ÇIKTI BİÇİMİ
========================================
SADECE geçerli JSON döndür ve TAM OLARAK şu yapıyı kullan:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "primarySpecialty": "string",
  "urgencyLevel": "Acil | Kısa sürede değerlendirme gerekir | Rutin kontrol uygun",
  "dataAdequacy": "Ön yorum için yeterli | Kısmen yeterli | Sınırlı veri"
}
`;

    const userContent = [];

    if (reportText) {
      userContent.push({
        type: "text",
        text: isEnglish
          ? `Medical report / uploaded text content:\n\n${reportText}`
          : `Tıbbi rapor / yüklenen metin içeriği:\n\n${reportText}`,
      });
    } else {
      userContent.push({
        type: "text",
        text: isEnglish
          ? "Please analyze the attached medical images cautiously and return structured JSON for public and doctor-facing medical decision support."
          : "Lütfen ekli medikal görselleri temkinli şekilde analiz et ve halk ile doktor moduna uygun yapılandırılmış JSON döndür.",
      });
    }

    images.forEach((img) => {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
        },
      });
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return res.status(500).json(fallbackResponse(selectedLanguage));
    }

    const fallback = fallbackResponse(selectedLanguage);

    const responsePayload = {
      publicSummary:
        typeof parsed.publicSummary === "string" && parsed.publicSummary.trim()
          ? parsed.publicSummary.trim()
          : fallback.publicSummary,
      doctorSummary:
        typeof parsed.doctorSummary === "string" && parsed.doctorSummary.trim()
          ? parsed.doctorSummary.trim()
          : fallback.doctorSummary,
      keyFindings:
        toArray(parsed.keyFindings).length > 0
          ? toArray(parsed.keyFindings)
          : fallback.keyFindings,
      publicWarnings:
        toArray(parsed.publicWarnings).length > 0
          ? toArray(parsed.publicWarnings)
          : fallback.publicWarnings,
      doctorWarnings:
        toArray(parsed.doctorWarnings).length > 0
          ? toArray(parsed.doctorWarnings)
          : fallback.doctorWarnings,
      privacyNotice:
        typeof parsed.privacyNotice === "string" && parsed.privacyNotice.trim()
          ? parsed.privacyNotice.trim()
          : fallback.privacyNotice,
      primarySpecialty: normalizeSpecialty(parsed.primarySpecialty, selectedLanguage),
      urgencyLevel: normalizeUrgency(parsed.urgencyLevel, selectedLanguage),
      dataAdequacy: normalizeAdequacy(parsed.dataAdequacy, selectedLanguage),
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Analyze error:", error);
    const language = req.body && req.body.language === "en" ? "en" : "tr";
    return res.status(500).json(fallbackResponse(language));
  }
});

app.listen(PORT, () => {
  console.log(\`CheckFinal backend running on port \${PORT}\`);
});
