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
<title>امتحان QCM</title>
<style>
  body { font-family: "Times New Roman", serif; margin: 40px 50px; line-height: 1.7; }
  h1 { text-align: center; margin-bottom: 40px; }
  .question { margin-bottom: 24px; }
  .question-title { font-weight: bold; margin-bottom: 10px; }
  .choice { margin-right: 20px; }
</style>
</head>
<body>
<h1>امتحان QCM</h1>
`;

  questions.forEach((q, i) => {
    html += `<div class="question">
      <div class="question-title">${i + 1}. ${escapeHtml(q.question)}</div>`;
    q.choices.forEach((c: string, j: number) => {
      html += `<div class="choice">${String.fromCharCode(65 + j)}. ${escapeHtml(c)}</div>`;
    });
    html += `</div>`;
  });

  html += `</body></html>`;
  return html;
}

/* ===== CORRECTION HTML ===== */
function buildCorrectionHtml(questions: any[]) {
  let html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تصحيح QCM</title>
<style>
  body { font-family: "Times New Roman", serif; margin: 40px 50px; line-height: 1.7; }
  h1 { text-align: center; margin-bottom: 40px; }
  .question { margin-bottom: 26px; }
  .answer { color: green; font-weight: bold; }
</style>
</head>
<body>
<h1>تصحيح امتحان QCM</h1>
`;

  questions.forEach((q, i) => {
    let answer = Array.isArray(q.correctIndex)
      ? q.correctIndex.map((n: number) => String.fromCharCode(65 + n)).join(", ")
      : String.fromCharCode(65 + q.correctIndex);

    html += `<div class="question">
      <div>${i + 1}. ${escapeHtml(q.question)}</div>
      <div class="answer">✔ ${answer}</div>
    </div>`;
  });

  html += `</body></html>`;
  return html;
}

/* ===== ROUTE ===== */
export async function POST(req: Request) {
  const { questions } = await req.json();

  if (!Array.isArray(questions)) {
    return NextResponse.json({ status: "ERROR" }, { status: 400 });
  }

  return NextResponse.json({
    status: "OK",
    examHtml: buildExamHtml(questions),
    correctionHtml: buildCorrectionHtml(questions),
  });
}
