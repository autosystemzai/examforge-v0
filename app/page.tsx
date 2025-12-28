"use client";

import { useState, useEffect } from "react";

type Difficulty = "easy" | "medium" | "hard";
type QcmMode = "single" | "multiple";

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false); // 🔐 VERROU RÉEL
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [qcmMode, setQcmMode] = useState<QcmMode>("single");
  const [links, setLinks] = useState<{
    exam: string;
    correction: string;
  } | null>(null);

  /* =========================
     🔐 DEBLOCAGE APRES REDIRECT
     ========================= */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      setPaid(true);
    }
  }, []);

  /* =========================
     GENERATION (APRES PAIEMENT)
     ========================= */
  async function handleGenerate() {
    if (!file || busy || !paid) return;

    try {
      setBusy(true);
      setLinks(null);

      const fd = new FormData();
      fd.append("file", file);

      const r1 = await fetch("/api/extract-text", {
        method: "POST",
        body: fd,
      });
      const c5 = await r1.json();
      if (c5.status !== "OK") throw new Error(c5.message);

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
      const c6 = await r2.json();
      if (c6.status !== "OK") throw new Error(c6.message);

      const r3 = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: c6.data.questions }),
      });
      const c7 = await r3.json();
      if (c7.status !== "OK") throw new Error(c7.message);

      setLinks(c7.files);
    } catch (e: any) {
      alert(e.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     PAYHIP (PAIEMENT SEUL)
     ========================= */
  function handlePay() {
    if (!file || busy) return;

    const payhipBtn = document.querySelector(
      ".payhip-buy-button"
    ) as HTMLAnchorElement | null;

    if (!payhipBtn) {
      alert("Payment system not loaded");
      return;
    }

    payhipBtn.click();
    // ❌ PAS DE setPaid ICI
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at top right, #163b5f, #070f1f)",
        direction: "rtl",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* PAYHIP BUTTON — OFFSCREEN */}
      <a
        href="https://payhip.com/b/06TAx"
        className="payhip-buy-button"
        data-theme="grey"
        data-product="06TAx"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        Pay
      </a>

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
        {/* TITLE */}
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            منصة إنشاء اختبارات (QCM)
          </h1>
        </div>

        <Section title="مستوى الصعوبة :">
          <Radio label="سهل" checked={difficulty === "easy"} onChange={() => setDifficulty("easy")} />
          <Radio label="متوسط" checked={difficulty === "medium"} onChange={() => setDifficulty("medium")} />
          <Radio label="صعب" checked={difficulty === "hard"} onChange={() => setDifficulty("hard")} />
        </Section>

        <Section title="نوع الأسئلة :">
          <Radio label="إجابة صحيحة واحدة" checked={qcmMode === "single"} onChange={() => setQcmMode("single")} />
          <Radio label="عدة إجابات صحيحة" checked={qcmMode === "multiple"} onChange={() => setQcmMode("multiple")} />
        </Section>

        {/* FILE */}
        <div style={{ marginBottom: 26, textAlign: "center" }}>
          <label
            style={{
              display: "inline-block",
              padding: "10px 18px",
              background: "rgba(59,130,246,0.42)",
              border: "1px solid rgba(59,130,246,0.65)",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "#eef4ff",
            }}
          >
            📤 تحميل ملف الدرس
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <div style={{ marginTop: 8, fontSize: 12 }}>
            {file ? file.name : "لم يتم اختيار أي ملف"}
          </div>
        </div>

        {/* PAY */}
        <button
          onClick={handlePay}
          disabled={!file || busy || paid}
          style={mainBtn(!paid)}
        >
          الدفع (2$)
        </button>

        {/* GENERATE */}
        <button
          onClick={handleGenerate}
          disabled={!paid || busy}
          style={mainBtn(paid)}
        >
          {busy ? "⏳ جاري إنشاء الامتحان..." : "إنشاء الامتحان"}
        </button>

        {links && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <a href={links.exam} target="_blank" style={downloadBtn}>
              📄 تحميل الامتحان
            </a>
            <a href={links.correction} target="_blank" style={downloadBtn}>
              📘 تحميل التصحيح
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

/* ===== STYLES (INCHANGÉS) ===== */

const mainBtn = (active: boolean) => ({
  width: "100%",
  padding: "14px 0",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.15)",
  background: active
    ? "rgba(59,130,246,0.45)"
    : "rgba(255,255,255,0.18)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: active ? "pointer" : "not-allowed",
  marginBottom: 12,
});

const downloadBtn = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "#f1f5f9",
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 16,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.12)",
        marginBottom: 22,
      }}
    >
      <div
        style={{
          display: "inline-block",
          paddingBottom: 6,
          marginBottom: 14,
          borderBottom: "2px solid rgba(255,255,255,0.35)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ lineHeight: 2 }}>{children}</div>
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
    <label style={{ display: "block", cursor: "pointer" }}>
      <input type="radio" checked={checked} onChange={onChange} /> {label}
    </label>
  );
}

