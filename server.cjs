require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/analyze", async (req, res) => {
  try {
    const { inputText, selectedLanguage } = req.body;

    if (!inputText) {
      return res.status(400).json({ error: "inputText boş" });
    }

    const prompt = `
Sen bir klinik karar destek sistemisin. ASLA kesin tanı koymazsın.

AMA:
- Klinik düşünce yapısı yüksek olacak
- Premium doktor seviyesinde analiz yapacaksın
- Apple guideline uyumlu kalacaksın

FORMAT (JSON dışında hiçbir şey yazma):

{
  "publicSummary": "",
  "doctorSummary": "",
  "keyFindings": [],
  "publicWarnings": [],
  "doctorWarnings": [],
  "privacyNotice": "",
  "actionPlan": {
    "urgency": "",
    "whichDoctor": "",
    "whatToDoNext": ""
  }
}

KURALLAR:

------------------------
1) HALK MODU (publicSummary)
------------------------
- Tıbbi terimleri sadeleştir ama YÜZEYSEL YAPMA
- Açıklayıcı, akıcı, güven veren anlatım
- Hastaya “ne oluyor” hissini ver
- Kısa kısa değil → PARAGRAF şeklinde detaylı anlat

------------------------
2) DOKTOR MODU (doctorSummary)
------------------------
4 başlık zorunlu:

1. Klinik Yorum
2. Olası Ayırıcı Tanılar
3. Önerilen İleri Değerlendirme
4. Kırmızı Bayraklar

- Teknik dil kullan
- Ama kesin tanı koyma

------------------------
3) BULGULAR (keyFindings)
------------------------
- Kısa ve net maddeler
- Klinik açıdan önemli olanlar

------------------------
4) UYARILAR
------------------------
publicWarnings:
- Hastaya uygun dil
- Korkutmadan ama ciddiyet ver

doctorWarnings:
- Kritik / dışlanamaz durumlar
- Klinik risk içeren ifadeler

------------------------
5) BRANŞ (whichDoctor)
------------------------
ŞU FORMAT:

"Birinci öncelik: Hematoloji. Gerektiğinde Göğüs Hastalıkları ve İç Hastalıkları değerlendirmesi önerilir."

------------------------
6) ACİLİYET (urgency)
------------------------
- Düşük / Orta / Yakın takip / Öncelikli değerlendirme
(Abartı yok)

------------------------
7) WHAT TO DO
------------------------
- Net klinik yönlendirme
- Takip / ileri test / uzman görüşü

------------------------
8) YASAKLAR
------------------------
- % risk verme
- kesin tanı koyma
- “kesin kanser” gibi ifadeler YOK

------------------------

ANALİZ EDİLECEK METİN:

${inputText}

DİL: ${selectedLanguage === "en" ? "İngilizce" : "Türkçe"}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      messages: [
        { role: "system", content: "Sen deneyimli bir klinik karar destek uzmanısın." },
        { role: "user", content: prompt },
      ],
    });

    let text = completion.choices[0].message.content;

    // JSON parse güvenliği
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const json = JSON.parse(text);

    res.json(json);

  } catch (error) {
    console.error("HATA:", error);
    res.status(500).json({
      error: "Analiz sırasında hata oluştu",
      detail: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server çalışıyor: " + PORT);
});
