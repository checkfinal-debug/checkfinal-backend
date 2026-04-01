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

app.get("/", (req, res) => {
  res.send("CheckFinal backend çalışıyor");
});

app.post("/analyze-report", upload.any(), async (req, res) => {
  try {
    let text = "";

    if (req.body && req.body.text) {
      text = req.body.text;
    }

    if (!text && req.files && req.files.length > 0) {
      const file = req.files[0];

      if (file.mimetype === "application/pdf") {
        text = ⁠ Yüklenen dosya bir PDF. Dosya adı: ${file.originalname}. Bu aşamada yalnızca dosya tipi tespit edildi, belge metni henüz çıkarılmadı. ⁠;
      } else if (file.mimetype && file.mimetype.startsWith("image/")) {
        text = ⁠ Yüklenen dosya bir görsel. Dosya adı: ${file.originalname}. Bu aşamada yalnızca görsel tipi tespit edildi, OCR ile metin çıkarımı henüz yapılmadı. ⁠;
      } else {
        text = ⁠ Yüklenen dosya adı: ${file.originalname}. Dosya tipi: ${file.mimetype || "bilinmiyor"}. İçerik metni henüz çıkarılmadı. ⁠;
      }
    }

    if (!text) {
      return res.status(400).json({
        summary: "Veri yok",
        keyFindings: ["Boş istek geldi"],
        cautions: ["Ne metin ne dosya gönderildi"],
        nextStep: "Uygulamadan metin veya dosya gönder",
        physicianNote: "Bu çıktı teknik kontrol amaçlı üretildi"
      });
    }

    const prompt = `
Sen klinik karar destek asistanısın.
Aşağıdaki içeriğe göre SADECE geçerli JSON döndür.
Başka açıklama yazma.

JSON formatı tam olarak şu olsun:
{
  "summary": "kısa genel özet",
  "keyFindings": ["madde 1", "madde 2"],
  "cautions": ["uyarı 1", "uyarı 2"],
  "nextStep": "önerilen sonraki adım",
  "physicianNote": "nihai karar için hekim değerlendirmesi gerekir"
}

Kurallar:
•⁠  ⁠Türkçe yaz
•⁠  ⁠Tanı koyma
•⁠  ⁠Kesin hüküm verme
•⁠  ⁠Kısa, düzenli ve profesyonel yaz
•⁠  ⁠Eğer içerik sınırlıysa bunu dürüstçe belirt

İçerik:
${text}
`;

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
    } catch {
      return res.json({
        summary: raw,
        keyFindings: [],
        cautions: ["AI çıktısı JSON formatında dönmedi"],
        nextStep: "Prompt veya model yanıtı kontrol edilmeli",
        physicianNote: "Nihai tıbbi karar için hekim değerlendirmesi gerekir"
      });
    }

    return res.json({
      summary: parsed.summary || "",
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
      nextStep: parsed.nextStep || "",
      physicianNote: parsed.physicianNote || "Nihai tıbbi karar için hekim değerlendirmesi gerekir"
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      summary: "Server hatası",
      keyFindings: [],
      cautions: [error.message || "Bilinmeyen hata"],
      nextStep: "Backend loglarını kontrol et",
      physicianNote: "Nihai tıbbi karar için hekim değerlendirmesi gerekir"
    });
  }
});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
