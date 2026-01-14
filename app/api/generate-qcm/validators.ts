// app/api/generate-qcm/validators.ts

// ✅ removed Difficulty (we no longer use difficulty levels)

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

function hasArabicLetters(s: string) {
  return /[\p{Script=Arabic}\p{L}]/u.test(String(s || ""));
}

function extractNumbers(s: string): number[] {
  const t = normalizeForSearch(s);

  // Normalize Arabic-Indic digits to Western digits
  const toWestern = (ch: string) => {
    const code = ch.charCodeAt(0);
    // Arabic-Indic ٠١٢٣٤٥٦٧٨٩ (0660-0669)
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return ch;
  };

  const normalizedDigits = t
    .split("")
    .map((ch) => toWestern(ch))
    .join("");

  const matches = normalizedDigits.match(/\b\d+(?:\.\d+)?\b/g) || [];
  const nums: number[] = [];
  for (const m of matches) {
    const v = Number(m);
    if (Number.isFinite(v)) nums.push(v);
  }
  return nums;
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
 * - evidenceQuote should be present in the same chunk
 * - evidenceQuote should be short (roughly 6–35 words)
 * - evidenceIds: if provided, must exist in extracted ids
 *   BUT if the document has zero ids, we don’t reject.
 */
export function evidenceValid(q: QCMQuestion, chunk: string, allEvidenceIds: Set<string>): boolean {
  const quote = normalizeWhitespace(q.evidenceQuote || "");
  const wc = wordCount(quote);

  if (!quote) return true; // soft
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

/* =========================================================
   ✅ NEW #1: Ambiguous single-answer detector
   هدفها قتل أسئلة مثل:
   - "ما الذي يمكن أن يؤدي إلى ..." (أكثر من خيار صحيح)
   - خيارات متقاربة جداً/مرادفات (B و C نفس المعنى)
   ========================================================= */

function jaccardTokens(a: string, b: string) {
  const ta = new Set(
    normalizeForSearch(a)
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
  );
  const tb = new Set(
    normalizeForSearch(b)
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 3)
  );
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function ambiguousSingleAnswerQuestion(question: string, choices: string[], options: Options): boolean {
  const singleOnly = options.singleAnswer && !options.multipleAnswers;
  if (!singleOnly) return false;

  const q = normalizeForSearch(question);

  // Stems that commonly allow multiple correct answers in real life
  const multiCauseStems = [
    "ما الذي يمكن أن يؤدي",
    "أي مما يلي يمكن أن يؤدي",
    "أي العوامل",
    "من الأسباب",
    "ما الأسباب",
    "ما الذي قد يسبب",
    "ما الذي يسبب",
    "أي مما يلي يساهم",
    "ما الذي يساهم",
  ];

  const isMultiCause = multiCauseStems.some((s) => q.includes(s));

  // If question is of "causes/lead to" type, and choices look like different valid causes -> ambiguous
  // Heuristic: if 2+ choices are "actionable/causal" (tax cuts, spending, etc.) we flag.
  if (isMultiCause) {
    const causalKeywords = /(زيادة|خفض|تخفيض|رفع|تقليل|توسيع|تقييد|حظر|فرض|إلغاء|إنفاق|نفقات|ضرائب|الإيرادات|البرامج)/i;
    const causalCount = (choices || []).filter((c) => causalKeywords.test(normalizeForSearch(c))).length;
    if (causalCount >= 2) return true;
  }

  // Synonym/near-duplicate choices => ambiguity
  for (let i = 0; i < (choices || []).length; i++) {
    for (let j = i + 1; j < (choices || []).length; j++) {
      const a = choices[i];
      const b = choices[j];
      if (!a || !b) continue;
      if (jaccardTokens(a, b) >= 0.72) return true;
    }
  }

  // Special case: repeated neutral options
  const neutralPattern = /(لا\s*(يؤثر|تؤثر|يتغير|تتغير)|يبقى كما هو|تظل ثابتة)/i;
  const neutralCount = (choices || []).filter((c) => neutralPattern.test(normalizeForSearch(c))).length;
  if (neutralCount >= 2) return true;

  return false;
}

/* =========================================================
   ✅ NEW #2: Bad-number / salary-loan sanity checker
   ========================================================= */

export function badNumberQuestion(question: string, choices: string[]): boolean {
  const q = normalizeForSearch(question);
  const hasDigitsInChoices = (choices || []).some((c) => /[\d\u0660-\u0669]/.test(String(c || "")));
  if (!hasDigitsInChoices) return false;

  const salaryWords = /(راتب|دخل|الأجر|مرتب)/i;
  const loanWords = /(اقتراض|قرض|إقراض|يسلف|سلفة|استدان)/i;

  if (salaryWords.test(q) && loanWords.test(q)) {
    return true;
  }

  const numsAll = (choices || []).flatMap((c) => extractNumbers(c));
  if (numsAll.length < 3) return false;

  const positives = numsAll.filter((n) => n > 0);
  if (positives.length < 3) return false;

  const sorted = [...positives].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;

  const tooSmall = positives.some((n) => median >= 1000 && n > 0 && median / n >= 8);
  const tooLarge = positives.some((n) => median > 0 && median <= 200 && n / median >= 8);

  if (tooSmall || tooLarge) return true;

  const qNums = extractNumbers(question);
  if (qNums.length >= 1) {
    const base = qNums[0];
    if (Number.isFinite(base) && base >= 100) {
      const close = positives.some((n) => Math.abs(n - base) <= Math.max(2, Math.round(base * 0.03)));
      if (!close) return true;
    }
  }

  return false;
}
