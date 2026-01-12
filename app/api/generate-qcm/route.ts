import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* ================= TYPES ================= */

type Difficulty = "easy" | "medium" | "hard";

type Options = {
  singleAnswer: boolean;
  multipleAnswers: boolean;
  allowNoCorrect: boolean;
};

type QCMQuestion = {
  question: string;
  choices: string[];
  correctIndex: number | number[] | null;
  explanation: string;
};

type RawWithChunk = any & { __chunk?: string };

/* ================= CONSTANTS ================= */

const TARGET_QUESTIONS = 20;

// Generate more candidates to survive filtering
const PROMPT_QUESTIONS = 64;

const USED_TEXT_MAX_CHARS = 600000;
const MIN_CHARS_TOTAL = 5000;

const CHUNKS = 7;

const MAX_NO_CORRECT_TOTAL = 1;
const HARD_SINGLE_EXTRA = 26;

const REFILL_ATTEMPTS = 2;
const REFILL_OVERGEN = 14;

// Article-number cap, but applied dynamically (won’t block early)
const MAX_ARTICLE_QUESTIONS_STRICT = 2;
const MAX_ARTICLE_QUESTIONS_RELAX = 4;
const MAX_ARTICLE_QUESTIONS_LAST = 6;

/* ================= HELPERS ================= */

function arabicDifficulty(d: Difficulty) {
  if (d === "easy") return "سهل";
  if (d === "hard") return "صعب";
  return "متوسط";
}

function buildAnswerRules(options: Options) {
  const rules: string[] = [];
  const singleOnly = options.singleAnswer && !options.multipleAnswers;
  const multiOnly = !options.singleAnswer && options.multipleAnswers;

  if (singleOnly) rules.push("النمط: إجابة صحيحة واحدة فقط (ممنوع تعدد الإجابات).");
  else if (multiOnly) rules.push("النمط: عدة إجابات صحيحة (من 1 إلى 3 غالباً).");
  else {
    if (options.singleAnswer) rules.push("قد يحتوي السؤال على إجابة صحيحة واحدة.");
    if (options.multipleAnswers) rules.push("قد يحتوي السؤال على عدة إجابات صحيحة (من 1 إلى 3 غالباً).");
  }

  if (options.allowNoCorrect) rules.push("نادرًا جدًا: يمكن أن تكون «لا توجد إجابة صحيحة» هي الإجابة الصحيحة الوحيدة.");
  else rules.push("ممنوع جعل «لا توجد إجابة صحيحة» إجابة صحيحة.");

  return rules.join("\n");
}

function buildDifficultyRules(difficulty: Difficulty, options: Options) {
  const singleOnly = options.singleAnswer && !options.multipleAnswers;

  if (difficulty === "hard") {
    return [
      "قواعد المستوى (صعب):",
      "- ممنوع الأسئلة الإنشائية/العامة التي تُحل بالحدس (هدف/أهمية/دور...) إلا إذا كانت مرتبطة بشرط/أثر/استثناء/تمييز وارد في الجزء.",
      "- ركّز على: شرط/أثر/نتيجة/استثناء/تعارض/تمييز/حالة قصيرة.",
      "- المشتتات: تقنية وقريبة جداً من الصحيح وتختلف بقيد واحد فقط (Near-miss).",
      "- تجنب الخيارات المتطرفة/الساذجة (دائماً/أبداً/لا شيء/لا علاقة).",
      singleOnly
        ? "- (إجابة واحدة) تجنب الكلمات التفضيلية: الأفضل/الأكثر/الأنسب/الأهم."
        : "- (عدة إجابات) غالباً 2 إجابات صحيحة وأحياناً 3.",
      "- لا تجعل الامتحان مجرد أرقام مواد.",
    ].join("\n");
  }

  if (difficulty === "easy") {
    return [
      "قواعد المستوى (سهل):",
      "- ركّز على الفهم الأساسي والتعريفات الواضحة.",
      "- اجعل المشتتات منطقية لكنها أبسط من المتوسط/الصعب.",
    ].join("\n");
  }

  return [
    "قواعد المستوى (متوسط):",
    "- 60% فهم مباشر + 40% تطبيق/تمييز.",
    "- اربط أحياناً فكرتين من النص.",
  ].join("\n");
}

/* ================= FILTERS & UTILS ================= */

const FORBIDDEN_PATTERNS: RegExp[] = [
  /كما ورد/i,
  /حسب النص/i,
  /في النص/i,
  /وفق النص/i,
  /وفقًا للنص/i,
  /وفقاً للنص/i,
  /انطلاقا من النص/i,
  /حسب ما ذُكر/i,
  /حسب ما ذكر/i,
  /وفق ما سبق/i,
  /فيما سبق/i,
  /فيما يلي/i,
  /من خلال النص/i,
  /المبحث/i,
  /المطلب/i,
  /الفصل/i,
  /الباب/i,
  /صفحة/i,
  /ص\s*\d+/i,
  /كل ما سبق/i,
  /جميع ما سبق/i,
  /ليس مما ذكر/i,
];

const DEFINITION_STEMS: RegExp[] = [/^ما هو/i, /^ما هي/i, /^عرّف/i, /^يقصد ب/i, /^مفهوم/i, /^ما المقصود/i];

const GENERIC_HARD_STEMS: RegExp[] = [
  /^ما هو دور/i,
  /^ما الهدف/i,
  /^ما الغرض/i,
  /^ما أهمية/i,
  /^ما العلاقة/i,
  /^كيف يساهم/i,
  /^ما الذي يهدف/i,
];

const HARD_MARKERS: RegExp[] = [
  /إذا/i,
  /في حالة/i,
  /عند/i,
  /عندما/i,
  /لو/i,
  /افترض/i,
  /يترتب/i,
  /الأثر/i,
  /النتيجة/i,
  /الجزاء/i,
  /الشرط/i,
  /الاستثناء/i,
  /التعارض/i,
  /الفرق/i,
  /يميز/i,
  /تمييز/i,
];

const ARTICLE_PATTERN = /(?:المادة|مادة)\s*\(?\s*\d{1,4}\s*\)?/i;

const EASY_GIVEAWAY_CHOICE_PATTERNS: RegExp[] = [
  /دائماً/i,
  /أبداً/i,
  /مطلقاً/i,
  /لا شيء/i,
  /لا علاقة/i,
  /غير مرتبط/i,
  /مستحيل/i,
  /نهائياً/i,
  /تماماً/i,
];

const AR_STOPWORDS = new Set([
  "من",
  "في",
  "على",
  "إلى",
  "عن",
  "مع",
  "بين",
  "أو",
  "و",
  "ثم",
  "أن",
  "إن",
  "كان",
  "كانت",
  "يكون",
  "تكون",
  "هو",
  "هي",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "ما",
  "ماذا",
  "كيف",
  "لماذا",
  "هل",
  "قد",
  "كل",
  "أي",
  "أحد",
  "إحدى",
  "هناك",
  "هنا",
  "حيث",
  "وفق",
  "حسب",
]);

function stripCodeFences(raw: string) {
  return raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

function safeJsonParse(raw: string) {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("JSON Parse Failed");
  }
}

function normalizeKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .trim();
}

function extractTokensArabic(s: string): string[] {
  return normalizeKey(s)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !AR_STOPWORDS.has(t));
}

function tokenSet(s: string) {
  return new Set(extractTokensArabic(s));
}

function jaccard(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isNoCorrectChoice(s: string) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t === "لا توجد إجابة صحيحة" || t === "لا توجد إجابة صحيحة." || t === "لا توجد إجابة صحيحة!" || /لا توجد إجابة صحيحة/.test(t);
}

function validateAnswerMode(correctIndex: any, options: Options): number | number[] | null {
  const singleOnly = options.singleAnswer && !options.multipleAnswers;
  const multiOnly = !options.singleAnswer && options.multipleAnswers;

  if (singleOnly) {
    if (typeof correctIndex !== "number") return null;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
    return correctIndex;
  }

  if (multiOnly) {
    if (!Array.isArray(correctIndex)) return null;
    const cleaned = correctIndex
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 3);
    const uniq = Array.from(new Set(cleaned));
    return uniq.length ? uniq : null;
  }

  if (typeof correctIndex === "number") {
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) return null;
    return correctIndex;
  }

  if (Array.isArray(correctIndex)) {
    const cleaned = correctIndex
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 3);
    const uniq = Array.from(new Set(cleaned));
    return uniq.length ? uniq : null;
  }

  return null;
}

function shuffleQuestion(q: QCMQuestion): QCMQuestion {
  const idx = [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  const newChoices = idx.map((oldI) => q.choices[oldI]);
  const mapOldToNew = new Map<number, number>();
  idx.forEach((oldI, newI) => mapOldToNew.set(oldI, newI));

  let newCorrect: number | number[] | null = null;

  if (typeof q.correctIndex === "number") {
    newCorrect = mapOldToNew.get(q.correctIndex) ?? null;
  } else if (Array.isArray(q.correctIndex)) {
    const mapped = q.correctIndex
      .map((oldI) => mapOldToNew.get(oldI))
      .filter((v): v is number => typeof v === "number");
    newCorrect = mapped.length ? Array.from(new Set(mapped)) : null;
  } else {
    newCorrect = null;
  }

  return { ...q, choices: newChoices, correctIndex: newCorrect };
}

function normalizeOne(raw: any, options: Options): QCMQuestion | null {
  if (!raw) return null;

  const question = String(raw.question || "").trim();
  const explanation = String(raw.explanation || "—").trim();
  const choices: string[] = Array.isArray(raw.choices) ? raw.choices.map((c: any) => String(c ?? "").trim()).slice(0, 4) : [];

  if (!question) return null;
  if (choices.length !== 4) return null;
  if (choices.some((c) => !c)) return null;

  const corrected = validateAnswerMode(raw.correctIndex, options);
  if (corrected === null) return null;

  return { question, choices, correctIndex: corrected, explanation };
}

/* ================= SMART SAMPLING ================= */

function getSmartChunks(text: string, k: number): string[] {
  const safeText = text.slice(0, USED_TEXT_MAX_CHARS);

  if (safeText.length <= 15000) {
    const size = Math.ceil(safeText.length / k);
    const chunks: string[] = [];
    for (let i = 0; i < k; i++) chunks.push(safeText.slice(i * size, (i + 1) * size));
    return chunks.filter((c) => c.trim().length > 50);
  }

  const window = Math.min(14000, Math.floor(safeText.length / k));
  const maxStart = Math.max(0, safeText.length - window);
  const step = k <= 1 ? 0 : Math.floor(maxStart / (k - 1));

  const chunks: string[] = [];
  for (let i = 0; i < k; i++) {
    const start = Math.min(maxStart, i * step);
    chunks.push(safeText.slice(start, start + window));
  }
  return chunks.filter((c) => c.trim().length > 50);
}

/* ================= GROUNDEDNESS ================= */

function getCorrectChoiceTexts(q: QCMQuestion): string[] {
  if (typeof q.correctIndex === "number") return [q.choices[q.correctIndex] ?? ""].filter(Boolean);
  if (Array.isArray(q.correctIndex)) return q.correctIndex.map((i) => q.choices[i] ?? "").filter(Boolean);
  return [];
}

function overlapCount(tokens: string[], chunkKey: string): number {
  let c = 0;
  for (const t of tokens) if (chunkKey.includes(t)) c++;
  return c;
}

function appearsInChunkEnough(q: QCMQuestion, chunk: string, difficulty: Difficulty, pass: 1 | 2 | 3): boolean {
  const chunkKey = normalizeKey(chunk);

  const qTokens = extractTokensArabic(q.question);
  const correctText = getCorrectChoiceTexts(q).join(" ");
  const correctTokens = extractTokensArabic(correctText);

  const qOverlap = overlapCount(qTokens, chunkKey);
  const cOverlap = overlapCount(correctTokens, chunkKey);

  // Progressive relaxation
  if (difficulty === "hard") {
    if (pass === 1) return qOverlap >= 4 && cOverlap >= 2;
    if (pass === 2) return qOverlap >= 3 && cOverlap >= 1;
    return qOverlap >= 2 && cOverlap >= 1;
  }

  if (difficulty === "medium") {
    if (pass === 1) return qOverlap >= 3 && cOverlap >= 1;
    return qOverlap >= 2 && cOverlap >= 1;
  }

  return qOverlap >= 2 && cOverlap >= 1;
}

function choicesGroundedEnough(q: QCMQuestion, chunk: string, difficulty: Difficulty, pass: 1 | 2 | 3): boolean {
  const chunkKey = normalizeKey(chunk);

  let needed = 2;
  if (difficulty === "hard") needed = pass === 1 ? 3 : 2;
  if (difficulty === "medium") needed = 2;

  let grounded = 0;
  for (const ch of q.choices) {
    const toks = extractTokensArabic(ch);
    const ov = overlapCount(toks, chunkKey);
    if (ov >= 1) grounded++;
  }
  return grounded >= needed;
}

/* ================= THEME (ANTI-REPEAT) ================= */

function themeKey(question: string): string {
  const toks = extractTokensArabic(question);
  const strong = toks
    .filter((t) => t.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .sort();
  return strong.join("|");
}

function themeCap(difficulty: Difficulty, pass: 1 | 2 | 3) {
  if (difficulty !== "hard") return pass === 1 ? 3 : 4;
  if (pass === 1) return 1;
  if (pass === 2) return 2;
  return 3;
}

/* ================= QUALITY HEURISTICS ================= */

function hasGiveawayChoices(q: QCMQuestion, difficulty: Difficulty, pass: 1 | 2 | 3): boolean {
  const hits = q.choices.reduce((acc, c) => acc + (EASY_GIVEAWAY_CHOICE_PATTERNS.some((re) => re.test(c)) ? 1 : 0), 0);
  if (difficulty === "hard") return pass === 1 ? hits >= 1 : hits >= 2;
  return hits >= 2;
}

function isArticleQuestion(q: QCMQuestion): boolean {
  const hay = `${q.question}\n${q.explanation}\n${q.choices.join("\n")}`;
  return ARTICLE_PATTERN.test(hay);
}

function similarityThreshold(difficulty: Difficulty, pass: 1 | 2 | 3) {
  // Higher threshold = more permissive (reject only when similarity is very high)
  if (difficulty === "hard") return pass === 1 ? 0.66 : pass === 2 ? 0.74 : 0.82;
  if (difficulty === "medium") return pass === 1 ? 0.72 : 0.8;
  return pass === 1 ? 0.74 : 0.82;
}

/* ================= OPENAI (ROBUST) ================= */

async function callOpenAI(prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: process.env.MODEL || "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "أنت أستاذ جامعي مختص في إعداد الامتحانات.",
            "مهم جداً: لا تستخدم أي معرفة خارج النص المرفق. لا تضف مفاهيم غير موجودة في الجزء.",
            "أرجع JSON صالح فقط بدون أي شرح إضافي.",
            "ممنوع الإحالة للمصدر داخل السؤال/الشرح مثل: «وفقاً للنص/حسب النص/كما ورد/فيما يلي».",
            "ممنوع خيارات: «كل ما سبق/جميع ما سبق/ليس مما ذكر».",
            "جودة المشتتات: جميع الخيارات يجب أن تبدو معقولة ومتقاربة (Near-miss).",
          ].join("\n"),
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  // ✅ Always read text first (handles non-JSON error bodies)
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`OpenAI API Error ${res.status}: ${text.slice(0, 400)}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${text.slice(0, 400)}`);
  }

  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty OpenAI output");
  return raw as string;
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rawText = String(body.cleanedText || "");
    const difficulty: Difficulty = body.difficulty || "medium";
    const options: Options = body.options;
    const debugEnabled = Boolean(body.debug);

    if (rawText.length < MIN_CHARS_TOTAL) {
      return NextResponse.json({ status: "ERROR", message: "المحتوى غير كافٍ لإنشاء اختبار جيد." }, { status: 400 });
    }
    if (!options || typeof options !== "object") {
      return NextResponse.json({ status: "ERROR", message: "Options invalides" }, { status: 400 });
    }

    const singleOnly = options.singleAnswer && !options.multipleAnswers;
    const chunks = getSmartChunks(rawText, CHUNKS);

    const askTotal = difficulty === "hard" && singleOnly ? PROMPT_QUESTIONS + HARD_SINGLE_EXTRA : PROMPT_QUESTIONS;
    const perChunk = Math.max(8, Math.ceil(askTotal / chunks.length));

    const allRawQuestions: RawWithChunk[] = [];

    // ---- generation across chunks
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];

      const prompt = `
أنشئ ${perChunk} سؤال QCM عربي من هذا الجزء فقط (لا تخرج عن محتواه).

المستوى: ${arabicDifficulty(difficulty)}

${buildDifficultyRules(difficulty, options)}
${buildAnswerRules(options)}

قواعد إلزامية:
- ممنوع "وفقاً للنص/حسب النص/كما ورد/فيما يلي/وفق ما سبق".
- ممنوع "كل ما سبق/جميع ما سبق/ليس مما ذكر".
- ممنوع إدخال مفاهيم غير موجودة في هذا الجزء.
- اجعل الخيارات الأربعة تقنية ومأخوذة من مفردات هذا الجزء قدر الإمكان (حتى المشتتات).
- تجنب الخيارات المتطرفة/الساذجة (دائماً/أبداً/لا شيء/لا علاقة/مطلقاً).
- لا تُكثر من أسئلة "المادة رقم ..." واجعل التركيز على الحكم لا الرقم.

JSON فقط:
{
  "questions": [
    {
      "question": "",
      "choices": ["", "", "", ""],
      "correctIndex": ${singleOnly ? "0" : "0 | [0,1]"},
      "explanation": "تعليل مختصر ودقيق بدون إحالة للنص"
    }
  ]
}

الجزء ${i + 1}/${chunks.length}:
"""${text}"""
`.trim();

      try {
        const raw = await callOpenAI(prompt);
        const parsed = safeJsonParse(raw);
        const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
        for (const item of list) allRawQuestions.push({ ...item, __chunk: text });
      } catch {
        continue;
      }
    }

    const final: QCMQuestion[] = [];
    const seenKeys = new Set<string>();
    const seenTokenSets: Set<string>[] = [];
    const themeCounts = new Map<string, number>();

    let noCorrectUsed = 0;
    let articleQuestionsUsed = 0;

    const debug = {
      cleanedTextLength: rawText.length,
      usedTextMaxChars: USED_TEXT_MAX_CHARS,
      chunksCount: chunks.length,
      perChunk,
      askTotal,
      totalRaw: allRawQuestions.length,
      accepted: 0,
      rejectedForbidden: 0,
      rejectedGrounding: 0,
      rejectedChoicesGrounding: 0,
      rejectedGiveaway: 0,
      rejectedHardRules: 0,
      rejectedNoCorrect: 0,
      rejectedDuplicate: 0,
      rejectedSimilar: 0,
      rejectedTheme: 0,
      rejectedArticleCap: 0,
    };

    function violatesNoCorrectRule(q: QCMQuestion): boolean {
      const idxNC = q.choices.findIndex((c) => isNoCorrectChoice(c));
      if (idxNC === -1) return false;

      if (!options.allowNoCorrect) return true;
      if (noCorrectUsed >= MAX_NO_CORRECT_TOTAL) return true;

      if (typeof q.correctIndex === "number") {
        if (q.correctIndex !== idxNC) return true;
      } else if (Array.isArray(q.correctIndex)) {
        if (q.correctIndex.length !== 1 || q.correctIndex[0] !== idxNC) return true;
      } else {
        return true;
      }
      return false;
    }

    function articleCap(pass: 1 | 2 | 3): number {
      if (pass === 1) return MAX_ARTICLE_QUESTIONS_STRICT;
      if (pass === 2) return MAX_ARTICLE_QUESTIONS_RELAX;
      return MAX_ARTICLE_QUESTIONS_LAST;
    }

    function addIfOk(raw: RawWithChunk, pass: 1 | 2 | 3): void {
      if (final.length >= TARGET_QUESTIONS) return;

      const chunk = raw.__chunk || "";
      const q0 = normalizeOne(raw, options);
      if (!q0) return;

      const fullContent = `${q0.question}\n${q0.explanation}\n${q0.choices.join("\n")}`;
      if (FORBIDDEN_PATTERNS.some((re) => re.test(fullContent))) {
        debug.rejectedForbidden++;
        return;
      }

      if (chunk && !appearsInChunkEnough(q0, chunk, difficulty, pass)) {
        debug.rejectedGrounding++;
        return;
      }

      if (chunk && !choicesGroundedEnough(q0, chunk, difficulty, pass)) {
        debug.rejectedChoicesGrounding++;
        return;
      }

      if (hasGiveawayChoices(q0, difficulty, pass)) {
        debug.rejectedGiveaway++;
        return;
      }

      // Dynamic cap: do NOT block articles if we’re under 10 accepted yet
      const isArt = isArticleQuestion(q0);
      if (isArt && final.length >= 10 && articleQuestionsUsed >= articleCap(pass)) {
        debug.rejectedArticleCap++;
        return;
      }

      if (difficulty === "hard") {
        if (pass === 1) {
          if (DEFINITION_STEMS.some((re) => re.test(q0.question))) {
            debug.rejectedHardRules++;
            return;
          }
          if (GENERIC_HARD_STEMS.some((re) => re.test(q0.question))) {
            debug.rejectedHardRules++;
            return;
          }
          if (!HARD_MARKERS.some((re) => re.test(q0.question))) {
            debug.rejectedHardRules++;
            return;
          }
        }

        if (pass === 2) {
          if (GENERIC_HARD_STEMS.some((re) => re.test(q0.question))) {
            debug.rejectedHardRules++;
            return;
          }
          if (DEFINITION_STEMS.some((re) => re.test(q0.question)) && q0.question.length < 110) {
            debug.rejectedHardRules++;
            return;
          }
        }

        if (pass === 3) {
          if (GENERIC_HARD_STEMS.some((re) => re.test(q0.question))) {
            debug.rejectedHardRules++;
            return;
          }
          if (DEFINITION_STEMS.some((re) => re.test(q0.question)) && q0.question.length < 95) {
            debug.rejectedHardRules++;
            return;
          }
        }
      }

      if (violatesNoCorrectRule(q0)) {
        debug.rejectedNoCorrect++;
        return;
      }

      const key = normalizeKey(q0.question);
      if (!key || seenKeys.has(key)) {
        debug.rejectedDuplicate++;
        return;
      }

      // Theme anti-repeat
      const tKey = themeKey(q0.question);
      const cap = themeCap(difficulty, pass);
      if (tKey) {
        const cnt = themeCounts.get(tKey) ?? 0;
        if (cnt >= cap) {
          debug.rejectedTheme++;
          return;
        }
      }

      // Similarity
      const ts = tokenSet(q0.question);
      const thr = similarityThreshold(difficulty, pass);
      for (const prev of seenTokenSets) {
        if (jaccard(ts, prev) > thr) {
          debug.rejectedSimilar++;
          return;
        }
      }

      const q = shuffleQuestion(q0);

      const idxNC = q.choices.findIndex((c) => isNoCorrectChoice(c));
      if (idxNC !== -1) noCorrectUsed++;

      if (isArt) articleQuestionsUsed++;

      seenKeys.add(key);
      seenTokenSets.push(ts);
      if (tKey) themeCounts.set(tKey, (themeCounts.get(tKey) ?? 0) + 1);

      final.push(q);
      debug.accepted++;
    }

    // Pass 1
    for (const r of allRawQuestions) addIfOk(r, 1);

    // Pass 2
    if (final.length < TARGET_QUESTIONS) {
      for (const r of allRawQuestions) addIfOk(r, 2);
    }

    // Pass 3
    if (final.length < TARGET_QUESTIONS) {
      for (const r of allRawQuestions) addIfOk(r, 3);
    }

    // ---- refill if still missing
    if (final.length < TARGET_QUESTIONS) {
      for (let attempt = 0; attempt < REFILL_ATTEMPTS && final.length < TARGET_QUESTIONS; attempt++) {
        const need = TARGET_QUESTIONS - final.length;
        const chunk = chunks[(attempt + 2) % chunks.length] || rawText.slice(0, 14000);

        const avoidList = final.slice(0, 14).map((q) => `- ${q.question}`).join("\n");

        const prompt = `
نحتاج إلى ${need} سؤال/أسئلة جديدة، وتجنّب تكرار الأسئلة التالية:
${avoidList}

مهم:
- استخرج المصطلحات/الأحكام/التمييزات من هذا الجزء فقط.
- اجعل كل الخيارات الأربعة من ألفاظ هذا الجزء (حتى المشتتات).
- لا تكثر من أرقام المواد.

أنشئ ${need + REFILL_OVERGEN} سؤال QCM من هذا الجزء فقط.

المستوى: ${arabicDifficulty(difficulty)}
${buildDifficultyRules(difficulty, options)}
${buildAnswerRules(options)}

JSON فقط:
{
  "questions": [
    { "question": "", "choices": ["", "", "", ""], "correctIndex": ${singleOnly ? "0" : "0 | [0,1]"}, "explanation": "" }
  ]
}

"""${chunk}"""
`.trim();

        try {
          const raw = await callOpenAI(prompt);
          const parsed = safeJsonParse(raw);
          const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
          for (const item of list) {
            addIfOk({ ...item, __chunk: chunk }, 3);
            if (final.length >= TARGET_QUESTIONS) break;
          }
        } catch {
          // ignore
        }
      }
    }

    if (final.length < TARGET_QUESTIONS) {
      return NextResponse.json(
        {
          status: "ERROR",
          message: `تعذر إنشاء ${TARGET_QUESTIONS} سؤالاً بشكل فريد (تم إنشاء ${final.length} فقط).`,
          ...(debugEnabled ? { debug } : {}),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "OK",
      data: {
        questions: final.slice(0, TARGET_QUESTIONS),
        ...(debugEnabled ? { debug } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ status: "ERROR", message: e?.message || "Internal Server Error" }, { status: 500 });
  }
}
