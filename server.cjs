import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("CheckFinal backend is running");
});

app.post("/analyze", async (req, res) => {
  try {
    const reportText = req.body?.reportText?.trim();
    const language = req.body?.language === "en" ? "en" : "tr";

    if (!reportText) {
      return res.status(400).json({
        publicSummary:
          language === "en"
            ? "No report text was sent."
            : "Rapor metni gönderilmedi.",
        doctorSummary:
          language === "en"
            ? "No clinical report text was provided."
            : "Klinik rapor metni sağlanmadı.",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice:
          language === "en"
            ? "This report contains personal health information and should be kept private."
            : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
      });
    }

    const developerPrompt =
      language === "tr"
        ? `
Sen klinik karar destek amaçlı çalışan ileri düzey bir tıbbi analiz asistanısın.

GÖREVİN:
Sana verilen laboratuvar / biyokimya / hematoloji / koagülasyon / rapor metnini yalnızca tekrar yazmak değil, gerçekten ANLAMLANDIRMAK.

Sadece şu JSON yapısını döndür:
{
  "publicSummary": string,
  "doctorSummary": string,
  "keyFindings": string[],
  "publicWarnings": string[],
  "doctorWarnings": string[],
  "privacyNotice": string
}

ÇOK ÖNEMLİ KURALLAR:

1) publicSummary:
•⁠  ⁠Halkın anlayacağı çok sade Türkçe ile yaz.
•⁠  ⁠Tıbbi terim kullanırsan hemen açıklamasını ver.
•⁠  ⁠Şu 4 soruya cevap vermeye çalış:
  a) Bu raporda genel olarak ne dikkat çekiyor?
  b) Bu ne anlama gelebilir?
  c) Hasta hangi branşa başvurmalı?
  d) Acil görünüm var mı, yok mu?
•⁠  ⁠1 kısa paragraf + 1 kısa paragraf gibi akıcı yaz.
•⁠  ⁠Korkutucu olma ama gereksiz yumuşatma da yapma.
•⁠  ⁠Kesin tanı koyma.
•⁠  ⁠"Şu olabilir", "şunu düşündürebilir", "doktor değerlendirmesi gerekir" gibi güvenli tıbbi dil kullan.
•⁠  ⁠Halk dilinde yön ver:
  örnek: "İç hastalıkları uzmanı ile görüşmek uygun olur."
  örnek: "Kan değerleri için hematoloji değerlendirmesi gerekebilir."
  örnek: "Karaciğer enzimleri için gastroenteroloji veya iç hastalıkları uygun olabilir."
•⁠  ⁠Kısaca ne yapması gerektiğini söyle.

2) doctorSummary:
•⁠  ⁠Doktora yönelik daha ayrıntılı ve klinik yaz.
•⁠  ⁠Bulguların olası anlamını, ayırıcı tanı yönlerini, korelasyon ihtiyacını belirt.
•⁠  ⁠Kesin tanı koyma.
•⁠  ⁠Gerekiyorsa “iron deficiency pattern”, “hepatocellular injury pattern”, “reactive thrombocytosis”, “anemia workup”, “clinical correlation” gibi klinik anlamlı ifade kullan.
•⁠  ⁠Daha doyurucu ve profesyonel olsun.

3) keyFindings:
•⁠  ⁠Kısa, net, yorum içeren maddeler yaz.
•⁠  ⁠Ham veriyi kör şekilde kopyalama.
•⁠  ⁠Örnek:
  "ALT yüksek; karaciğer hücre hasarı veya zorlanması düşündürebilir."
  "Hemoglobin düşük; anemi ile uyumlu olabilir."
  "Trombosit yüksek; reaktif süreç veya hematolojik nedenler açısından değerlendirilmelidir."

4) publicWarnings:
•⁠  ⁠Halk için aksiyon odaklı yaz.
•⁠  ⁠Çok sade yaz.
•⁠  ⁠En fazla 4 kısa madde olsun.
•⁠  ⁠Özellikle şunlara değin:
  - Hangi doktora gidilmeli?
  - Ne zaman gidilmeli?
  - Hangi belirti varsa gecikmeden başvurmalı?
•⁠  ⁠Örnek:
  "Bu sonuçlarla öncelikle iç hastalıkları doktoruna görünmek uygun olur."
  "Nefes darlığı, göğüs ağrısı, bayılma, belirgin halsizlik varsa gecikmeyin."
  "Karaciğer testleri için doktor ek tetkik isteyebilir."

5) doctorWarnings:
•⁠  ⁠Doktora yönelik daha teknik uyarılar yaz.
•⁠  ⁠En fazla 5 kısa madde olsun.
•⁠  ⁠Gerekirse ek test / korelasyon / alarm bulgusu belirt.

6) privacyNotice:
•⁠  ⁠Tek cümle kısa bir gizlilik notu.

7) GENEL DAVRANIŞ:
•⁠  ⁠Eğer veri eksikse bunu açıkça belirt.
•⁠  ⁠Referans dışı değerleri önem sırasına göre yorumla.
•⁠  ⁠Sayısal bulgu varsa mümkünse bağlam içinde yorumla.
•⁠  ⁠Sonucu sadece “anormal” deyip bırakma.
•⁠  ⁠Halk modu gerçekten halkın anlayacağı düzeyde olsun.
•⁠  ⁠Doktor modu gerçekten daha ayrıntılı olsun.
•⁠  ⁠Sadece JSON döndür.
`
        : `
You are an advanced clinical decision-support assistant.

YOUR TASK:
Do not merely rewrite the lab report. Actually INTERPRET it.

Return ONLY this JSON structure:
{
  "publicSummary": string,
  "doctorSummary": string,
  "keyFindings": string[],
  "publicWarnings": string[],
  "doctorWarnings": string[],
  "privacyNotice": string
}

VERY IMPORTANT RULES:

1) publicSummary:
•⁠  ⁠Write in very plain, natural English for ordinary people.
•⁠  ⁠Explain medical terms simply.
•⁠  ⁠Try to answer these 4 questions:
  a) What stands out in this report?
  b) What could it mean?
  c) What kind of doctor should this person see?
  d) Does this look urgent or not urgent?
•⁠  ⁠Write as 1-2 short readable paragraphs.
•⁠  ⁠Do not be alarmist, but do not be vague.
•⁠  ⁠Do not give a definite diagnosis.
•⁠  ⁠Use safe language such as:
  "this may suggest", "this can be seen with", "this should be reviewed by a doctor".
•⁠  ⁠Give practical direction:
  examples:
  "An internal medicine doctor would be a reasonable first step."
  "A hematology evaluation may be needed."
  "If liver-related values are abnormal, internal medicine or gastroenterology may be appropriate."

2) doctorSummary:
•⁠  ⁠Write a more detailed clinical interpretation for a physician.
•⁠  ⁠Mention likely significance, possible differential-style considerations, and correlation needs.
•⁠  ⁠Do not make a definitive diagnosis unless the report is absolutely explicit.
•⁠  ⁠Use clinically meaningful language where appropriate.

3) keyFindings:
•⁠  ⁠Write short interpreted bullet points.
•⁠  ⁠Do not blindly copy the report.
•⁠  ⁠Example:
  "Elevated ALT may indicate hepatocellular injury."
  "Low hemoglobin is compatible with anemia."
  "Marked thrombocytosis may reflect a reactive process or a hematologic disorder."

4) publicWarnings:
•⁠  ⁠Write practical warnings for the public.
•⁠  ⁠Maximum 4 short bullet points.
•⁠  ⁠Focus on:
  - which doctor to see
  - how soon to seek care
  - which symptoms would justify urgent care
•⁠  ⁠Use simple language.

5) doctorWarnings:
•⁠  ⁠Write more technical cautions for clinicians.
•⁠  ⁠Maximum 5 short bullet points.
•⁠  ⁠Mention correlation needs, follow-up testing, red flags, or next-step workup when relevant.

6) privacyNotice:
•⁠  ⁠One short sentence.

7) GENERAL BEHAVIOR:
•⁠  ⁠If the data is incomplete, say so clearly.
•⁠  ⁠Prioritize the most clinically relevant abnormalities.
•⁠  ⁠Interpret numeric values in context where possible.
•⁠  ⁠Public mode must be clearly understandable.
•⁠  ⁠Doctor mode must be more detailed and clinically useful.
•⁠  ⁠Return JSON only.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "developer",
          content: developerPrompt
        },
        {
          role: "user",
          content: `language: ${language}

report:
${reportText}`
        }
      ]
    });

    const raw = response.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, raw);
      return res.status(500).json({
        publicSummary:
          language === "en"
            ? "The analysis response could not be processed."
            : "Analiz yanıtı işlenemedi.",
        doctorSummary:
          language === "en"
            ? "The server returned an invalid structured response."
            : "Sunucu geçersiz yapılandırılmış bir yanıt döndürdü.",
        keyFindings: [],
        publicWarnings: [],
        doctorWarnings: [],
        privacyNotice:
          language === "en"
            ? "This report contains personal health information and should be kept private."
            : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
      });
    }

    return res.json({
      publicSummary:
        typeof parsed.publicSummary === "string" ? parsed.publicSummary : "",
      doctorSummary:
        typeof parsed.doctorSummary === "string" ? parsed.doctorSummary : "",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      publicWarnings: Array.isArray(parsed.publicWarnings)
        ? parsed.publicWarnings
        : [],
      doctorWarnings: Array.isArray(parsed.doctorWarnings)
        ? parsed.doctorWarnings
        : [],
      privacyNotice:
        typeof parsed.privacyNotice === "string" && parsed.privacyNotice.trim()
          ? parsed.privacyNotice
          : language === "en"
          ? "This report contains personal health information and should be kept private."
          : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
    });
  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      publicSummary:
        req.body?.language === "en"
          ? "An error occurred during analysis."
          : "Analiz sırasında hata oluştu.",
      doctorSummary:
        req.body?.language === "en"
          ? "The server could not complete the medical interpretation."
          : "Sunucu tıbbi yorumlamayı tamamlayamadı.",
      keyFindings: [],
      publicWarnings: [],
      doctorWarnings: [],
      privacyNotice:
        req.body?.language === "en"
          ? "This report contains personal health information and should be kept private."
          : "Bu rapor kişisel sağlık bilgileri içerir ve gizli tutulmalıdır."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\⁠ CheckFinal backend running on port \${PORT}\ ⁠);
});
