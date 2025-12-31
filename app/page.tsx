"use client";

import { useEffect, useState } from "react";

type Difficulty = "easy" | "medium" | "hard";
type QcmMode = "single" | "multiple";

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [qcmMode, setQcmMode] = useState<QcmMode>("single");

  const [html, setHtml] = useState<{ exam: string; correction: string } | null>(
    null
  );

  /* ===== Payhip return ===== */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      setPaid(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  /* ===== Safe JSON helper ===== */
  async function safeJson(res: Response) {
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error("Réponse serveur invalide");
    }
  }

  async function handleGenerate() {
    if (!file || busy || !paid) return;

    try {
      setBusy(true);
      setHtml(null);

      /* ===== C5 extract ===== */
      const fd = new FormData();
      fd.append("file", file);

      const r1 = await fetch("/api/extract-text", {
        method: "POST",
        body: fd,
      });

      const c5 = await safeJson(r1);
      if (c5.status !== "OK") throw new Error(c5.message || "Extraction échouée");

      /* ===== C6 QCM ===== */
      const r2 = await fetch("/api/generate-qcm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanedText: c5.cleanedText,
          difficulty,
          options: {
            singleAnswer: qcmMode === "single",
            multipleAnswers: qcmMode === "multiple",
            allowNoCorrect: true,
          },
        }),
      });

      const c6 = await safeJson(r2);
      if (c6.status !== "OK") throw new Error(c6.message || "QCM échoué");

      /* ===== C7 HTML exam + correction ===== */
      const r3 = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: c6.data.questions }),
      });

      const c7 = await safeJson(r3);
      if (c7.status !== "OK") throw new Error(c7.message || "HTML échoué");

      setHtml({
        exam: c7.examHtml,
        correction: c7.correctionHtml,
      });
    } catch (e: any) {
      alert(e?.message || "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  function openHtml(html: string) {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at top right, #163b5f, #070f1f)",
        direction: "rtl",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 420,
          padding: 36,
          borderRadius: 22,
          background: "rgba(255,255,255,0.085)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: 28 }}>
          منصة إنشاء اختبارات (QCM)
        </h1>

        <Section title="مستوى الصعوبة :">
          <Radio label="سهل" checked={difficulty === "easy"} onChange={() => setDifficulty("easy")} />
          <Radio label="متوسط" checked={difficulty === "medium"} onChange={() => setDifficulty("medium")} />
          <Radio label="صعب" checked={difficulty === "hard"} onChange={() => setDifficulty("hard")} />
        </Section>

        <Section title="نوع الأسئلة :">
          <Radio label="إجابة صحيحة واحدة" checked={qcmMode === "single"} onChange={() => setQcmMode("single")} />
          <Radio label="عدة إجابات صحيحة" checked={qcmMode === "multiple"} onChange={() => setQcmMode("multiple")} />
        </Section>

        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <label style={{ cursor: "pointer" }}>
            📤 تحميل ملف الدرس
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <div style={{ fontSize: 12 }}>{file ? file.name : "لم يتم اختيار ملف"}</div>
        </div>

        <a href="https://payhip.com/b/06TAx" style={payBtn}>
          الدفع ($2)
        </a>

        <button
          onClick={handleGenerate}
          disabled={!file || busy || !paid}
          style={generateBtn(!paid || busy)}
        >
          {busy ? "⏳ جاري الإنشاء..." : "إنشاء الامتحان"}
        </button>

        {html && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => openHtml(html.exam)} style={downloadBtn}>
              📄 عرض الامتحان
            </button>
            <button onClick={() => openHtml(html.correction)} style={downloadBtn}>
              📘 عرض التصحيح
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/* ===== UI helpers ===== */

const downloadBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "#fff",
};

const payBtn: React.CSSProperties = {
  display: "block",
  textAlign: "center",
  marginBottom: 10,
  padding: "12px 0",
  borderRadius: 14,
  background: "rgba(59,130,246,0.45)",
  color: "#fff",
  textDecoration: "none",
};

const generateBtn = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "14px 0",
  borderRadius: 14,
  background: disabled ? "rgba(255,255,255,0.22)" : "rgba(59,130,246,0.45)",
  border: "none",
  color: "#fff",
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  marginBottom: 18,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function Radio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <input type="radio" checked={checked} onChange={onChange} /> {label}
    </label>
  );
}

