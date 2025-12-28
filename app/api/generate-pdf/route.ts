import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ===== helpers ===== */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ===== EXAM HTML ===== */

function buildExamHtml(questions: any[]) {
  let html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: "Times New Roman", serif;
    margin: 40px 50px;
    line-height: 1.7;
    color: #000;
  }
  h1 {
    text-align: center;
    margin-bottom: 40px;
  }
  .question {
    margin-bottom: 24px;
  }
  .question-title {
    font-weight: bold;
    margin-bottom: 10px;
  }
  .choice {
    margin-right: 20px;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
<h1>امتحان QCM</h1>
`;

  questions.forEach((q: any, i: number) => {
    html += `
<div class="question">
  <div class="question-title">
    ${i + 1}. ${escapeHtml(q.question)}
  </div>
`;
    q.choices.forEach((c: string, j: number) => {
      html += `
  <div class="choice">
    ${String.fromCharCode(65 + j)}. ${escapeHtml(c)}
  </div>
`;
    });
    html += `</div>`;
  });

  html += `
</body>
</html>
`;

  return html;
}

/* ===== CORRECTION HTML ===== */

function buildCorrectionHtml(questions: any[]) {
  let html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: "Times New Roman", serif;
    margin: 40px 50px;
    line-height: 1.7;
    color: #000;
  }
  h1 {
    text-align: center;
    margin-bottom: 40px;
  }
  .question {
    margin-bottom: 26px;
  }
  .answer {
    margin-right: 24px;
    color: #1f5c3a;
    font-weight: bold;
  }
</style>
</head>
<body>
<h1>تصحيح امتحان QCM</h1>
`;

  questions.forEach((q: any, i: number) => {
    let answer = "—";

    if (typeof q.correctIndex === "number") {
      answer = String.fromCharCode(65 + q.correctIndex);
    } else if (Array.isArray(q.correctIndex)) {
      answer = q.correctIndex
        .map((n: number) => String.fromCharCode(65 + n))
        .join(", ");
    }

    html += `
<div class="question">
  ${i + 1}. ${escapeHtml(q.question)}
  <div class="answer">✔ ${answer}</div>
</div>
`;
  });

  html += `
</body>
</html>
`;

  return html;
}

/* ===== ROUTE ===== */

export async function POST(req: Request) {
  try {
    const { questions } = await req.json();

    if (!Array.isArray(questions) || !questions.length) {
      throw new Error("Questions invalides");
    }

    // ⚠️ PDF SERVER DISABLED (VERCEL SAFE)
    // HTML est prêt pour phase 2

    buildExamHtml(questions);
    buildCorrectionHtml(questions);

    return NextResponse.json({
      status: "OK",
      message: "PDF generation temporarily disabled (deployment safe)",
      files: null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: "ERROR", message: e.message || "Erreur PDF" },
      { status: 500 }
    );
  }
}



