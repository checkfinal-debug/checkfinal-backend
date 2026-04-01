import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import * as pdfParse from "pdf-parse";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("Backend calisiyor");
});

app.post("/analyze-report", upload.any(), async (req, res) => {
  try {
    let text = "";

    if (req.body?.text) {
      text = req.body.text;
    }

    if (!text && req.files?.length > 0) {
      const file = req.files[0];

      if (file.mimetype === "application/pdf") {
        try {
          const data = await pdfParse.default(file.buffer);
          text = data.text;
        } catch (e) {
          text = "PDF okunamadi";
        }
      } else {
        text = "Desteklenmeyen dosya";
      }
    }

    if (!text) {
      return res.status(400).json({ summary: "Veri yok" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Bunu analiz et: " + text
        }
      ]
    });

    const raw = completion.choices[0].message.content || "";

    res.json({
      summary: raw,
      keyFindings: [],
      cautions: [],
      nextStep: "",
      physicianNote: ""
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ summary: "Server hatasi" });
  }
});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
