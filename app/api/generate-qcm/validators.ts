// app/api/generate-qcm/validators.ts

export type Difficulty = "easy" | "medium" | "hard";

export type Options = {
  singleAnswer: boolean;
  multipleAnswers: boolean;
  allowNoCorrect: boolean;
};

export type QCMQuestion = {
  question: string;
  choices: string[];
  correctIndex: number | number[] | null;
  explanation: string;

  // NEW (optional)
  evidenceIds?: string[];
  evidenceQuote?: string;
};

function normalizeWhitespace(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(s: string) {
  return normalizeWhitespace(s)
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[،؛]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(s: string) {
  const t = normalizeWhitespace(s);
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}

/**
 * Extract evidence IDs like: p03-02, p3-2, P12-01
 * Normalize to lowercase without spaces.
 */
export function extractEvidenceIdsFromText(text: string): Set<string> {
  const set = new Set<string>();
  const re = /\b[pP]\s*\d{1,3}\s*-\s*\d{1,3}\b/g;
  const m = text.match(re) || [];
  for (const raw of m) {
    set.add(raw.replace(/\s+/g, "").toLowerCase());
  }
  return set;
}

/**
 * Trivia numeric memorization questions (low quality):
 * Example: "ما مقدار التركة..." with numeric-only choices.
 */
export function looksLikeTriviaNumber(question: string, choices: string[]): boolean {
  const q = normalizeForSearch(question);

  const numericChoiceCount = (choices || []).reduce((acc, c) => {
    const cc = normalizeForSearch(c);
    const hasDigits = /[\d\u0660-\u0669]/.test(cc);
    const fewLetters = (cc.match(/[\p{L}\p{Script=Arabic}]/gu) || []).length <= 3;
    const isMoneyOrPercent = /(دولار|ريال|درهم|دينار|£|\$|€|%|٪)/i.test(cc);
    return acc + (hasDigits && (fewLetters || isMoneyOrPercent) ? 1 : 0);
  }, 0);

  const triviaStems = [
    "كم",
    "ما مقدار",
    "ما قيمة",
    "كم تبلغ",
    "كم عدد",
    "ما هو المبلغ",
    "ما هي القيمة",
    "ما مقدار التركة",
  ];

  const isTriviaStem = triviaStems.some((s) => q.includes(s));
  const isMostlyNumbers = numericChoiceCount >= 3;

  // Allow if it’s clearly about interest/rate/supply-demand context
  const allowedContext = /(معدل|فائدة|نسبة|منحنى|عرض|طلب|%|٪)/i.test(q);

  return isTriviaStem && isMostlyNumbers && !allowedContext;
}

/**
 * Suspicious math questions (often ambiguous with text extraction):
 * numeric choices + "after borrowing / actually / net" etc.
 */
export function suspiciousMathQuestion(question: string, choices: string[]): boolean {
  const q = normalizeForSearch(question);

  const hasMathMarkers =
    /(\+|\-|\*|\/|×|÷|%|٪)/.test(question) ||
    /(بعد|قبل|فعلي|فعلياً|الاقتراض|خصم|زيادة|ينقص|يزيد|صافي|net)/i.test(q);

  if (!hasMathMarkers) return false;

  const numericChoiceCount = (choices || []).reduce((acc, c) => {
    const cc = normalizeForSearch(c);
    const hasDigits = /[\d\u0660-\u0669]/.test(cc);
    const fewLetters = (cc.match(/[\p{L}\p{Script=Arabic}]/gu) || []).length <= 3;
    return acc + (hasDigits && fewLetters ? 1 : 0);
  }, 0);

  return numericChoiceCount >= 3;
}

/**
 * Evidence validation:
 * - evidenceQuote is required and must be present literally in the same chunk
 * - evidenceQuote should be short (roughly 6–35 words)
 * - evidenceIds: if provided, must exist in extracted ids
 *   BUT if the document has zero ids, we don’t reject.
 */
export function evidenceValid(q: QCMQuestion, chunk: string, allEvidenceIds: Set<string>): boolean {
  const quote = normalizeWhitespace(q.evidenceQuote || "");
  const wc = wordCount(quote);

  if (!quote) return true;
  if (wc < 6 || wc > 35) return false;

  const chunkKey = normalizeForSearch(chunk);
  const quoteKey = normalizeForSearch(quote);

  if (!chunkKey.includes(quoteKey)) return false;

  const ids = Array.isArray(q.evidenceIds) ? q.evidenceIds : [];
  if (ids.length === 0) return true; // OK if no ids included

  // If the PDF has no ids at all, don’t reject
  if (allEvidenceIds.size === 0) return true;

  for (const rawId of ids) {
    const id = String(rawId || "").replace(/\s+/g, "").toLowerCase();
    if (!id) return false;
    if (!allEvidenceIds.has(id)) return false;
  }

  return true;
}

