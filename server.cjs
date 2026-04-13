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
- Preserve meaningful medical keywords from the source when supported, such as anemia, hemoglobin, platelet, CRP, ferritin, vitamin B12, glucose, ALT, AST, creatinine, thyroid, gallbladder, liver, bowel, etc.
- The app provides citations separately, so your role is to produce medically cautious content while preserving relevant finding terms.

Important safety framing:
- This is an AI-assisted informational and decision-support output.
- It must not read like diagnosis, treatment advice, or discharge instructions.
- Avoid absolute phrases such as:
  "this is", "confirms", "definitely", "you have", "must start treatment", "requires surgery now".
- Prefer:
  "may be associated with", "may be compatible with", "may justify medical review", "can be discussed with a healthcare professional".
- When naming conditions, use forms like:
  "findings that may be compatible with anemia"
  "reported findings that may be compatible with chronic cholecystitis"
  "a laboratory pattern that may be compatible with iron deficiency"
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

privacyNotice must be exactly:
"This report is for informational and decision-support purposes only. It does not replace physician evaluation, diagnosis, treatment planning, or medical judgment."

actionPlan rules:
- urgency must be a natural sentence, not a single label.
- whichDoctor must NOT be a bare specialty name.
- whichDoctor must be phrased cautiously, such as:
  "Internal Medicine may be considered as an initial evaluation point depending on the broader clinical context."
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
- Kaynak sistemi uygulama tarafında ayrıca gösterileceği için; anemi, hemoglobin, trombosit, CRP, ferritin, vitamin B12, glukoz, ALT, AST, kreatinin, tiroid, safra kesesi, karaciğer, bağırsak gibi anlamlı tıbbi anahtar kelimeleri destek varsa koru.

Önemli güvenlik çerçevesi:
- Bu çıktı yapay zekâ destekli bilgilendirme ve karar desteği içindir.
- Tanı, tedavi önerisi veya taburculuk talimatı gibi okunmamalıdır.
- Şu tür mutlak ifadelerden kaçın:
  "budur", "kesinleştirir", "kesin", "sende var", "tedavi başlanmalıdır", "hemen ameliyat gerekir".
- Bunun yerine şunları tercih et:
  "ilişkili olabilir", "uyumlu olabilir", "tıbbi değerlendirmeyi gerektirebilir", "bir sağlık profesyoneli ile görüşülebilir".
- Hastalık adı kullanırken bunu nihai gerçek gibi değil, şu biçimde ver:
  "anemi ile uyumlu olabilecek bulgular"
  "kronik kolesistit ile uyumlu olarak raporlanmış bulgular"
  "demir eksikliği ile uyumlu olabilecek laboratuvar paterni"
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

privacyNotice tam olarak şu olmalı:
"Bu rapor yalnızca bilgilendirme ve karar desteği amaçlıdır. Hekim değerlendirmesi, tanı, tedavi planı veya tıbbi kararın yerine geçmez."

actionPlan kuralları:
- urgency tek kelime değil, doğal cümle olsun.
- whichDoctor yalın bir branş adı olmasın.
- whichDoctor şu tona benzer temkinli bir cümle olsun:
  "Geniş klinik bağlama göre ilk aşamada İç Hastalıkları değerlendirmesi düşünülebilir."
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
