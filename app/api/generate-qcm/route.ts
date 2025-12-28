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

  if (options.singleAnswer) {
    rules.push("قد يحتوي السؤال على إجابة صحيحة واحدة فقط.");
  }

  if (options.multipleAnswers) {
    rules.push(
      "قد يحتوي السؤال على عدة إجابات صحيحة (من 1 إلى 4 اختيارات صحيحة)."
    );
  }

  if (options.allowNoCorrect) {
    rules.push(
      "في بعض الأسئلة، تكون العبارة «لا توجد إجابة صحيحة» هي الإجابة الصحيحة الوحيدة."
    );
  }

  return rules.join("\n");
}

function normalizeOne(q: any): QCMQuestion | null {
  if (!q) return null;

  const question = String(q.question || "").trim();
  const explanation = String(q.explanation || "").trim();

  const choices = Array.isArray(q.choices)
    ? q.choices.map((c: any) => String(c).trim()).slice(0, 4)
    : [];

  if (!question) return null;
  if (choices.length !== 4) return null;
  if (choices.some((c: string) => !c)) return null;

  let correctIndex = q.correctIndex;

  if (typeof correctIndex === "number") {
    if (correctIndex < 0 || correctIndex > 3) correctIndex = null;
  } else if (Array.isArray(correctIndex)) {
    correctIndex = correctIndex.filter(
      (n: any) => Number.isInteger(n) && n >= 0 && n <= 3
    );
    if (!correctIndex.length) correctIndex = null;
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
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content:
            "أنت أستاذ جامعي صارم. أرجع JSON صالح فقط بدون أي شرح إضافي.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}`);
  }

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
      return NextResponse.json(
        { status: "ERROR", message: "Texte insuffisant" },
        { status: 400 }
      );
    }

    const prompt = `
أنت أستاذ جامعي مختص في إعداد الامتحانات الأكاديمية.

أنشئ ${PROMPT_QUESTIONS} سؤال QCM من النص فقط.

المستوى: ${arabicDifficulty(difficulty)}

قواعد الإجابات:
${buildAnswerRules(options)}

قواعد إلزامية (مهمة جدًا):
- يُمنع منعًا باتًا طرح أسئلة عن الفكرة العامة أو موضوع النص.
- يُمنع استعمال صيغ مثل:
  "يتحدث النص عن..."
  "ما هو موضوع النص..."
  "ما هو الهدف من النص..."
- يجب أن يكون كل سؤال مرتبطًا بمعلومة أو مفهوم محدد ورد صراحة في النص.
- استخرج الأسئلة من التفاصيل، العلاقات، النتائج، أو الاستخدامات.
- الأسئلة يجب أن تكون تحليلية أو تطبيقية، وليس أسئلة فهم سطحي.
- تجنب الأسئلة الوصفية العامة.
- لا تضف أي معلومة غير موجودة في النص.

أسلوب الاختيارات:
- اختيارات طويلة نسبيًا.
- إدخال اختيارات خادعة وقريبة من الصحيح.
- بعض الاختيارات قد تكون صحيحة جزئيًا لكنها غير دقيقة.
- لا تكرر نفس نمط السؤال.

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
      return NextResponse.json(
        { status: "ERROR", message: "JSON OpenAI invalide" },
        { status: 500 }
      );
    }

    const questions = (parsed.questions || [])
      .map(normalizeOne)
      .filter(Boolean)
      .slice(0, TARGET_QUESTIONS);

    if (questions.length < TARGET_QUESTIONS) {
      return NextResponse.json(
        {
          status: "ERROR",
          message: `Questions insuffisantes (${questions.length}/${TARGET_QUESTIONS})`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "OK",
      data: { questions },
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: "ERROR", message: e.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
