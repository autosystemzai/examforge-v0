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

/* ================= CONSTANTES ================= */

const TARGET_QUESTIONS = 20;
const PROMPT_QUESTIONS = 30;
const USED_TEXT_MAX_CHARS = 9000;

/* ================= HELPERS ================= */

function arabicDifficulty(d: Difficulty) {
  if (d === "easy") return "سهل";
  if (d === "hard") return "صعب";
  return "متوسط";
}

function buildAnswerRules(options: Options) {
  const rules: string[] = [];

  if (options.singleAnswer) rules.push("قد يحتوي السؤال على إجابة صحيحة واحدة فقط.");
  if (options.multipleAnswers) {
    rules.push("قد يحتوي السؤال على عدة إجابات صحيحة (من 1 إلى 4 اختيارات صحيحة).");
  }
  if (options.allowNoCorrect) {
    rules.push("في بعض الأسئلة، تكون العبارة «لا توجد إجابة صحيحة» هي الإجابة الصحيحة الوحيدة.");
  }

  return rules.join("\n");
}

function normalizeOne(q: any): QCMQuestion | null {
  if (!q) return null;

  const question = String(q.question || "").trim();
  const explanation = String(q.explanation || "").trim();

  const choices: string[] = Array.isArray(q.choices)
    ? q.choices.map((c: any) => String(c ?? "").trim()).slice(0, 4)
    : [];

  if (!question) return null;
  if (choices.length !== 4) return null;
  if (choices.some((c: string) => c.length === 0)) return null;

  let correctIndex: number | number[] | null = q.correctIndex;

  if (typeof correctIndex === "number") {
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) correctIndex = null;
  } else if (Array.isArray(correctIndex)) {
    const cleaned = correctIndex
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 3);

    correctIndex = cleaned.length ? Array.from(new Set(cleaned)) : null;
  } else {
    correctIndex = null;
  }

  return {
    question,
    choices,
    correctIndex,
    explanation: explanation || "—",
  };
}

function normalizeKey(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .trim();
}

/** Shuffle choices + update correctIndex accordingly */
function shuffleQuestion(q: QCMQuestion): QCMQuestion {
  const n = q.choices.length;
  const idx = Array.from({ length: n }, (_, i) => i);

  // Fisher–Yates on index mapping
  for (let i = n - 1; i > 0; i--) {
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
    newCorrect = mapped.length ? mapped : null;
  } else {
    newCorrect = null;
  }

  return { ...q, choices: newChoices, correctIndex: newCorrect };
}

/* ================= OPENAI ================= */

async function callOpenAI(prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: [
            "أنت أستاذ جامعي صارم في إعداد الامتحانات.",
            "أرجع JSON صالح فقط بدون أي شرح إضافي.",
            "مهم: لا تجعل الإجابة الصحيحة دائمًا A. وزّع الإجابات بين A/B/C/D بشكل متوازن وعشوائي.",
          ].join("\n"),
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty OpenAI output");

  return raw;
}

/* ================= ROUTE ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const text = String(body.cleanedText || "").slice(0, USED_TEXT_MAX_CHARS);
    const difficulty: Difficulty = body.difficulty || "medium";
    const options: Options = body.options;

    if (text.length < 200) {
      return NextResponse.json({ status: "ERROR", message: "Texte insuffisant" }, { status: 400 });
    }
    if (!options || typeof options !== "object") {
      return NextResponse.json({ status: "ERROR", message: "Options invalides" }, { status: 400 });
    }

    const prompt = `
أنت أستاذ جامعي مختص في إعداد الامتحانات.

أنشئ ${PROMPT_QUESTIONS} سؤال QCM أكاديمي من النص فقط.

المستوى: ${arabicDifficulty(difficulty)}

قواعد الإجابات:
${buildAnswerRules(options)}

قواعد مهمة جدًا:
- وزّع الإجابة الصحيحة بين A/B/C/D بشكل متوازن وعشوائي (لا تجعلها دائمًا A).
- لا تكرر نفس نمط السؤال.
- تجنب الأسئلة المباشرة أو السطحية.
- استعمل صياغات تحليلية/تطبيقية/مفاهيمية.
- استعمل اختيارات طويلة نسبيًا وخادعة (قريبة من الصحيح).
- لا تضف أي معلومة غير موجودة في النص.

تنسيق صارم — JSON فقط:
{
  "questions": [
    {
      "question": "",
      "choices": ["", "", "", ""],
      "correctIndex": 0 | [0,1] | null,
      "explanation": ""
    }
  ]
}

النص:
"""${text}"""
`.trim();

    const raw = await callOpenAI(prompt);

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ status: "ERROR", message: "JSON OpenAI invalide" }, { status: 500 });
    }

    const seen = new Set<string>();
    const normalized: QCMQuestion[] = [];

    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    for (const item of list) {
      const q = normalizeOne(item);
      if (!q) continue;

      const key = normalizeKey(q.question);
      if (!key || seen.has(key)) continue;

      seen.add(key);

      // IMPORTANT: shuffle choices to avoid "always A"
      normalized.push(shuffleQuestion(q));
    }

    const questions = normalized.slice(0, TARGET_QUESTIONS);

    if (questions.length < TARGET_QUESTIONS) {
      return NextResponse.json(
        {
          status: "ERROR",
          message: `تعذر إنشاء ${TARGET_QUESTIONS} سؤالاً بشكل فريد (تم إنشاء ${questions.length} فقط). حاول تغيير ملف الدرس أو الخيارات`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ status: "OK", data: { questions } });
  } catch (e: any) {
    return NextResponse.json({ status: "ERROR", message: e.message || "Erreur serveur" }, { status: 500 });
  }
}
