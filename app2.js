import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", function (req, res) {
  res.send("CheckFinal backend calisiyor");
});

app.post("/analyze-report", upload.any(), async function (req, res) {
  try {
    let text = "";

    if (req.body && req.body.text) {
      text = req.body.text;
    }

    if (!text && req.files && req.files.length > 0) {
      const file = req.files[0];

      if (file.mimetype === "application/pdf") {
        text = "Yuklenen dosya bir PDF. Dosya adi: " + file.originalname + ". Belge metni henuz cikarilmadi.";
      } else if (file.mimetype && file.mimetype.indexOf("image/") === 0) {
        text = "Yuklenen dosya bir gorsel. Dosya adi: " + file.originalname + ". OCR henuz yapilmadi.";
      } else {
        text = "Yuklenen dosya adi: " + file.originalname + ". Dosya tipi: " + (file.mimetype || "bilinmiyor") + ".";
      }
    }

    if (!text) {
      return res.status(400).json({
        summary: "Veri yok",
        keyFindings: ["Bos istek geldi"],
        cautions: ["Ne metin ne dosya gonderildi"],
        nextStep: "Uygulamadan metin veya dosya gonder",
        physicianNote: "Nihai tibbi karar icin hekim degerlendirmesi gerekir"
      });
    }

    const prompt =
      "Sen klinik karar destek asistanisin. " +
      "Asagidaki icerige gore SADECE gecerli JSON dondur. " +
      "Baska aciklama yazma. " +
      'JSON formati tam olarak su olsun: ' +
      '{"summary":"kisa genel ozet","keyFindings":["madde 1","madde 2"],"cautions":["uyari 1","uyari 2"],"nextStep":"onerilen sonraki adim","physicianNote":"nihai karar icin hekim degerlendirmesi gerekir"} ' +
      "Kurallar: Turkce yaz. Tani koyma. Kesin hukum verme. Kisa ve duzenli yaz. Icerik sinirliysa bunu durustce belirt. " +
      "Icerik: " + text;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2
    });

    const raw = completion.choices[0].message.content || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.json({
        summary: raw,
        keyFindings: [],
        cautions: ["AI ciktisi JSON formatinda donmedi"],
        nextStep: "Prompt veya model yaniti kontrol edilmeli",
        physicianNote: "Nihai tibbi karar icin hekim degerlendirmesi gerekir"
      });
    }

    return res.json({
      summary: parsed.summary || "",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
      nextStep: parsed.nextStep || "",
      physicianNote: parsed.physicianNote || "Nihai tibbi karar icin hekim degerlendirmesi gerekir"
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      summary: "Server hatasi",
      keyFindings: [],
      cautions: [error.message || "Bilinmeyen hata"],
      nextStep: "Backend loglarini kontrol et",
      physicianNote: "Nihai tibbi karar icin hekim degerlendirmesi gerekir"
    });
  }
});

app.listen(3000, function () {
  console.log("http://localhost:3000");
});
