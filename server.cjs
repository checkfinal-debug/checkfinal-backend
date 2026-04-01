const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMessageText(completion) {
  return completion?.choices?.[0]?.message?.content?.trim() || "";
}

function normalizeResponse(parsed, language) {
  const isEnglish = language === "en";

  return {
    publicSummary:
      typeof parsed.publicSummary === "string" && parsed.publicSummary.trim()
        ? parsed.publicSummary.trim()
        : isEnglish
        ? "The report has findings that should be reviewed by a physician."
        : "Rapor içinde doktor tarafından değerlendirilmesi gereken bulgular vardır.",

    doctorSummary:
      typeof parsed.doctorSummary === "string" && parsed.doctorSummary.trim()
        ? parsed.doctorSummary.trim()
        : isEnglish
        ? "The report contains findings that require clinical correlation."
        : "Rapor klinik korelasyon gerektiren bulgular içermektedir.",

    keyFindings: Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.filter((x) => typeof x === "string" && x.trim()).slice(0, 8)
      : [],

    publicWarnings: Array.isArray(parsed.publicWarnings)
      ? parsed.publicWarnings.filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
      : [],

    doctorWarnings: Array.isArray(parsed.doctorWarnings)
      ? parsed.doctorWarnings.filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
      : [],

    privacyNotice:
      typeof parsed.privacyNotice === "string" && parsed.privacyNotice.trim()
        ? parsed.privacyNotice.trim()
        : isEnglish
        ? "This report contains personal health information and should be kept private."
        : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır.",

    actionPlan: {
      urgency:
        parsed.actionPlan &&
        typeof parsed.actionPlan.urgency === "string" &&
        parsed.actionPlan.urgency.trim()
          ? parsed.actionPlan.urgency.trim()
          : isEnglish
          ? "Medium"
          : "Orta",

      whichDoctor:
        parsed.actionPlan &&
        typeof parsed.actionPlan.whichDoctor === "string" &&
        parsed.actionPlan.whichDoctor.trim()
          ? parsed.actionPlan.whichDoctor.trim()
          : isEnglish
          ? "Internal Medicine is the best first step. Hematology may also be needed if blood count abnormalities are significant."
          : "İlk basamak olarak Dahiliye uygun olur. Kan sayımı bozuklukları belirginse Hematoloji de gerekebilir.",

      whatToDoNext:
        parsed.actionPlan &&
        typeof parsed.actionPlan.whatToDoNext === "string" &&
        parsed.actionPlan.whatToDoNext.trim()
          ? parsed.actionPlan.whatToDoNext.trim()
          : isEnglish
          ? "Show this report to a doctor, review your symptoms together, and decide whether repeat testing or specialist evaluation is needed."
          : "Bu raporu bir doktora gösterin, şikayetlerinizle birlikte değerlendirin ve gerekirse tekrar test veya uzman görüşü planlayın.",
    },
  };
}

app.get("/", (req, res) => {
  res.send("CheckFinal backend is running");
});

app.post("/analyze", async (req, res) => {
  try {
    const reportText = typeof req.body?.reportText === "string" ? req.body.reportText.trim() : "";
    const language = req.body?.language === "en" ? "en" : "tr";
    const isEnglish = language === "en";

    if (!reportText) {
      return res.status(400).json({
        publicSummary: isEnglish
          ? "No report text was sent."
          : "Rapor metni gönderilmedi.",
        doctorSummary: isEnglish
          ? "No report text provided."
          : "Rapor metni sağlanmadı.",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice: isEnglish
          ? "This report contains personal health information and should be kept private."
          : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır.",
        actionPlan: {
          urgency: isEnglish ? "Medium" : "Orta",
          whichDoctor: isEnglish ? "Internal Medicine" : "Dahiliye",
          whatToDoNext: isEnglish
            ? "Please upload or paste a medical report."
            : "Lütfen bir tıbbi rapor yükleyin veya yapıştırın.",
        },
      });
    }

    const systemPrompt = isEnglish
      ? `
You are CheckFinal's medical interpretation AI.

Your job is NOT to merely rewrite the report.
Your job is to INTERPRET the report in two layers:
1) public-friendly explanation
2) doctor-level explanation

You must evaluate ALL clinically relevant abnormalities together.
Do not focus on only one issue.
Do not ignore low neutrophils, low lymphocytes, anemia, platelet changes, liver tests, kidney tests, inflammation, coagulation, or other meaningful findings.

Return ONLY valid JSON with exactly this structure:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "actionPlan": {
    "urgency": "Low / Medium / Urgent",
    "whichDoctor": "string",
    "whatToDoNext": "string"
  }
}

CRITICAL RULES FOR publicSummary:
•⁠  ⁠Use plain everyday language.
•⁠  ⁠Explain what the important findings may mean.
•⁠  ⁠Explain all important abnormalities together.
•⁠  ⁠Clearly say which doctor the patient should see.
•⁠  ⁠Clearly say whether this looks low urgency, medium urgency, or urgent.
•⁠  ⁠Mention what the patient should do next.
•⁠  ⁠Do not be vague.
•⁠  ⁠Do not give a definitive diagnosis unless the report itself proves it.
•⁠  ⁠Use safe wording like "may suggest", "can be seen with", "should be reviewed".

CRITICAL RULES FOR doctorSummary:
•⁠  ⁠Be more clinical and detailed.
•⁠  ⁠Mention differential-style possibilities when appropriate.
•⁠  ⁠Mention infection risk if neutrophils / lymphocytes / WBC suggest that.
•⁠  ⁠Mention hematology evaluation if CBC abnormalities are significant.
•⁠  ⁠Mention marrow suppression possibility only if reasonable.
•⁠  ⁠Mention need for repeat CBC, smear, ferritin, iron studies, reticulocyte count, CRP, etc. when clinically appropriate.

CRITICAL RULES FOR keyFindings:
•⁠  ⁠Short interpreted bullets.
•⁠  ⁠Not raw copy-paste.
•⁠  ⁠Example: "Low neutrophils may increase infection susceptibility."

CRITICAL RULES FOR publicWarnings:
•⁠  ⁠Very practical.
•⁠  ⁠Very simple.
•⁠  ⁠Include doctor direction and red flag symptoms.
•⁠  ⁠Maximum 4 bullets.

CRITICAL RULES FOR doctorWarnings:
•⁠  ⁠More technical.
•⁠  ⁠Mention limitations, red flags, follow-up needs.
•⁠  ⁠Maximum 5 bullets.

IMPORTANT:
•⁠  ⁠Do not hide serious or relevant abnormalities from the public summary.
•⁠  ⁠If more than one blood count issue exists, mention that clearly.
•⁠  ⁠If the data is incomplete, say so clearly.
•⁠  ⁠Output JSON only.
`
      : `
Sen CheckFinal için çalışan tıbbi yorumlama yapay zekâsısın.

Görevin raporu sadece yeniden yazmak değildir.
Görevin raporu 2 düzeyde ANLAMLANDIRMAKTIR:
1) halkın anlayacağı açıklama
2) doktor düzeyinde açıklama

Tüm klinik olarak anlamlı anormallikleri birlikte değerlendir.
Sadece tek bir soruna odaklanma.
Düşük nötrofil, düşük lenfosit, kansızlık, trombosit değişiklikleri, karaciğer testleri, böbrek testleri, iltihap göstergeleri, pıhtılaşma testleri ve diğer anlamlı bulguları atlama.

SADECE aşağıdaki yapıda geçerli JSON döndür:

{
  "publicSummary": "string",
  "doctorSummary": "string",
  "keyFindings": ["string"],
  "publicWarnings": ["string"],
  "doctorWarnings": ["string"],
  "privacyNotice": "string",
  "actionPlan": {
    "urgency": "Düşük / Orta / Acil",
    "whichDoctor": "string",
    "whatToDoNext": "string"
  }
}

publicSummary kuralları:
•⁠  ⁠Halkın anlayacağı sade Türkçe kullan.
•⁠  ⁠Önemli bulguların ne anlama gelebileceğini açıkla.
•⁠  ⁠Bütün önemli anormallikleri birlikte anlat.
•⁠  ⁠Hastanın hangi doktora gitmesi gerektiğini açıkça yaz.
•⁠  ⁠Aciliyet düzeyini açıkça yaz.
•⁠  ⁠Hastanın sonraki adımda ne yapması gerektiğini yaz.
•⁠  ⁠Belirsiz ve boş konuşma.
•⁠  ⁠Kesin tanı koyma.
•⁠  ⁠"şunu düşündürebilir", "bununla görülebilir", "doktor değerlendirmesi gerekir" gibi güvenli dil kullan.

doctorSummary kuralları:
•⁠  ⁠Daha klinik ve ayrıntılı yaz.
•⁠  ⁠Gerekirse ayırıcı tanı mantığı kullan.
•⁠  ⁠Nötrofil / lenfosit / WBC uygunsa enfeksiyon riskini belirt.
•⁠  ⁠CBC bozukluğu belirginse hematoloji değerlendirmesini belirt.
•⁠  ⁠Uygunsa periferik yayma, ferritin, demir çalışmaları, retikülosit, tekrar hemogram, CRP gibi ek değerlendirme gereğini belirt.
•⁠  ⁠Kemik iliği baskılanmasını ancak gerçekten makul ise an.

keyFindings kuralları:
•⁠  ⁠Kısa ama yorum içeren maddeler yaz.
•⁠  ⁠Ham veri kopyalama.
•⁠  ⁠Örnek: "Düşük nötrofil sayısı enfeksiyonlara yatkınlığı artırabilir."

publicWarnings kuralları:
•⁠  ⁠Çok pratik yaz.
•⁠  ⁠Çok sade yaz.
•⁠  ⁠Hangi doktora gidileceğini ve hangi belirtilerde gecikmeden başvurulması gerektiğini belirt.
•⁠  ⁠En fazla 4 madde.

doctorWarnings kuralları:
•⁠  ⁠Daha teknik yaz.
•⁠  ⁠Sınırlılık, kırmızı bayrak, takip gereği gibi noktaları belirt.
•⁠  ⁠En fazla 5 madde.

ÖNEMLİ:
•⁠  ⁠Halk özetinden ciddi veya önemli bulguları gizleme.
•⁠  ⁠Birden fazla kan sayımı sorunu varsa bunu açıkça söyle.
•⁠  ⁠Veri eksikse açıkça yaz.
•⁠  ⁠Sadece JSON döndür.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: isEnglish
            ? ⁠ Please analyze this medical report:\n\n${reportText} ⁠
            : ⁠ Lütfen şu tıbbi raporu analiz et:\n\n${reportText} ⁠,
        },
      ],
    });

    const rawText = extractMessageText(completion);
    const parsed = safeParseJSON(rawText);

    if (!parsed) {
      return res.status(500).json({
        publicSummary: isEnglish
          ? "The report could not be interpreted in structured format."
          : "Rapor yapılandırılmış biçimde yorumlanamadı.",
        doctorSummary: isEnglish
          ? "The structured model response could not be parsed."
          : "Yapılandırılmış model yanıtı çözümlenemedi.",
        keyFindings: [],
        publicWarnings: [
          isEnglish
            ? "Please try again."
            : "Lütfen tekrar deneyin.",
        ],
        doctorWarnings: [
          isEnglish
            ? "Backend JSON parsing failed."
            : "Backend JSON çözümleme hatası oluştu.",
        ],
        privacyNotice: isEnglish
          ? "This report contains personal health information and should be kept private."
          : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır.",
        actionPlan: {
          urgency: isEnglish ? "Medium" : "Orta",
          whichDoctor: isEnglish ? "Internal Medicine" : "Dahiliye",
          whatToDoNext: isEnglish
            ? "Please retry the analysis and review the report clinically."
            : "Lütfen analizi tekrar deneyin ve raporu klinik olarak değerlendirin.",
        },
      });
    }

    const normalized = normalizeResponse(parsed, language);
    return res.json(normalized);
  } catch (error) {
    console.error("Analyze error:", error);

    const isEnglish = req.body?.language === "en";

    return res.status(500).json({
      publicSummary: isEnglish
        ? "An error occurred while analyzing the report."
        : "Rapor analiz edilirken bir hata oluştu.",
      doctorSummary: isEnglish
        ? "The server could not complete the clinical interpretation."
        : "Sunucu klinik yorumlamayı tamamlayamadı.",
      keyFindings: [],
      publicWarnings: [
        isEnglish
          ? "Please try again shortly."
          : "Lütfen kısa süre sonra tekrar deneyin.",
      ],
      doctorWarnings: [
        isEnglish
          ? "Backend runtime error."
          : "Backend çalışma hatası oluştu.",
      ],
      privacyNotice: isEnglish
        ? "This report contains personal health information and should be kept private."
        : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır.",
      actionPlan: {
        urgency: isEnglish ? "Medium" : "Orta",
        whichDoctor: isEnglish ? "Internal Medicine" : "Dahiliye",
        whatToDoNext: isEnglish
          ? "Retry the request later."
          : "İsteği daha sonra tekrar deneyin.",
      },
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(⁠ CheckFinal backend running on port ${PORT} ⁠);
});