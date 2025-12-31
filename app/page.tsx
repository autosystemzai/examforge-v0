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

  // 🔧 MODIF : on stocke du HTML au lieu de liens
  const [html, setHtml] = useState<{ exam: string; correction: string } | null>(
    null
  );

  // ✅ Détection du retour Payhip
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      setPaid(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function handleGenerate() {
    if (!file || busy || !paid) return;

    try {
      setBusy(true);
      setHtml(null);

      const fd = new FormData();
      fd.append("file", file);

      const r1 = await fetch("/api/extract-text", { method: "POST", body: fd });
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

      // 🔧 MODIF : on récupère le HTML
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

  // 🔧 MODIF : ouverture HTML dans nouvel onglet
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
          <Radio
            label="إجابة صحيحة واحدة"
            checked={qcmMode === "single"}
            onChange={() => setQcmMode("single")}
          />
          <Radio
            label="عدة إجابات صحيحة"
            checked={qcmMode === "multiple"}
            onChange={() => setQcmMode("multiple")}
          />
        </Section>

        <div style={{ marginBottom: 18, textAlign: "center" }}>
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

        <a
          href="https://payhip.com/b/06TAx"
          style={{
            display: "block",
            width: "100%",
            padding: "12px 0",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(59,130,246,0.45)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            textDecoration: "none",
            marginBottom: 8,
            pointerEvents: busy ? "none" : "auto",
            opacity: busy ? 0.6 : 1,
          }}
        >
          الدفع ($2)
        </a>

        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            marginBottom: 18,
          }}
        >
          🔒 دفع آمن – الرجوع مباشرة بعد الدفع
        </div>

        <button
          onClick={handleGenerate}
          disabled={!file || busy || !paid}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background:
              !paid || busy ? "rgba(255,255,255,0.22)" : "rgba(59,130,246,0.45)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: !paid || busy ? "not-allowed" : "pointer",
            marginBottom: 20,
          }}
        >
          {busy ? "⏳ جاري إنشاء الامتحان..." : "إنشاء الامتحان"}
        </button>

        {/* 🔧 MODIF : boutons ouvrant le HTML */}
        {html && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
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

const downloadBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "#f1f5f9",
  fontSize: 12,
  fontWeight: 600,
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
