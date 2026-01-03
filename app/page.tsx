"use client";

import { useEffect, useMemo, useState } from "react";

type Difficulty = "easy" | "medium" | "hard";
type QcmMode = "single" | "multiple";
type Pack = "3" | "10" | "30";

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [qcmMode, setQcmMode] = useState<QcmMode>("single");

  const [html, setHtml] = useState<{ exam: string; correction: string } | null>(null);

  const [selectedPack, setSelectedPack] = useState<Pack>("3");

  // ✅ NEW (UI): email + credits
  const [email, setEmail] = useState("");
  const [creditsText, setCreditsText] = useState("");
  const [checking, setChecking] = useState(false);

  const pdfServiceBase = useMemo(() => {
    // Railway backend (for credits + webhook). Put this in Vercel env:
    // NEXT_PUBLIC_PDF_SERVICE_URL=https://examforge-pdf-service-production.up.railway.app
    return (
      process.env.NEXT_PUBLIC_PDF_SERVICE_URL ||
      "https://examforge-pdf-service-production.up.railway.app"
    );
  }, []);

  const packPricing = useMemo(() => {
    return {
      "3": { price: 5, per: 2.0, label: "3 امتحانات" },
      "10": { price: 12, per: 1.8, label: "10 امتحانات" },
      "30": { price: 24, per: 1.5, label: "30 امتحانات" },
    } as Record<Pack, { price: number; per: number; label: string }>;
  }, []);

  const payhipLinks = useMemo(() => {
    const fallback = "https://payhip.com/b/06TAx";
    return {
      "3": process.env.NEXT_PUBLIC_PAYHIP_PACK_3_URL || fallback,
      "10": process.env.NEXT_PUBLIC_PAYHIP_PACK_10_URL || fallback,
      "30": process.env.NEXT_PUBLIC_PAYHIP_PACK_30_URL || fallback,
    } as Record<Pack, string>;
  }, []);

  const payUrl = payhipLinks[selectedPack];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      setPaid(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // ✅ load saved email
  useEffect(() => {
    const saved = window.localStorage.getItem("examforge_email") || "";
    if (saved) setEmail(saved);
  }, []);

  function isValidEmail(v: string) {
    const s = v.trim();
    return s.includes("@") && s.includes(".");
  }

  // ✅ check credits from Railway backend
  async function handleCheckEmail() {
    if (busy || checking) return;
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) return;

    setChecking(true);
    window.localStorage.setItem("examforge_email", e);

    try {
      const r = await fetch(`${pdfServiceBase}/credits/${encodeURIComponent(e)}`, {
        method: "GET",
      });

      const data = await r.json().catch(() => null);

      if (!r.ok || !data || typeof data.credits !== "number") {
        setCreditsText("");
        setPaid(false);
        return;
      }

      setCreditsText(String(data.credits));
      setPaid(data.credits > 0);
    } catch {
      setCreditsText("");
      setPaid(false);
    } finally {
      setChecking(false);
    }
  }

  // ✅ auto-check credits if email already saved
  useEffect(() => {
    const e = email.trim().toLowerCase();
    if (!e || !isValidEmail(e)) return;

    (async () => {
      try {
        const r = await fetch(`${pdfServiceBase}/credits/${encodeURIComponent(e)}`);
        const data = await r.json().catch(() => null);
        if (r.ok && data && typeof data.credits === "number") {
          setCreditsText(String(data.credits));
          setPaid(data.credits > 0);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, pdfServiceBase]);

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

  const selectedInfo = packPricing[selectedPack];

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
            marginBottom: 18,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            منصة إنشاء امتحانات (QCM)
          </h1>
        </div>

        {/* Payment */}
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
              marginBottom: 10,
              borderBottom: "2px solid rgba(255,255,255,0.35)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            اختر العرض
          </div>

          {/* ✅ PDF note */}
          <div
            style={{
              width: "fit-content",
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.045)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.72)",
              fontSize: 11,
              fontWeight: 650,
              margin: "0 auto 12px auto",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            <span>الخدمة تعمل مع ملفات PDF نصية فقط</span>
          </div>

          <div style={{ marginBottom: 10 }}>
            {/* offers container width fixed (buttons become narrower) */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ width: 280 }}>
                <OfferRow
                  pack="3"
                  selectedPack={selectedPack}
                  onSelect={setSelectedPack}
                  label={packPricing["3"].label}
                  price={`$${packPricing["3"].price}`}
                />
                <OfferRow
                  pack="10"
                  selectedPack={selectedPack}
                  onSelect={setSelectedPack}
                  label={packPricing["10"].label}
                  price={`$${packPricing["10"].price}`}
                />
                <OfferRow
                  pack="30"
                  selectedPack={selectedPack}
                  onSelect={setSelectedPack}
                  label={packPricing["30"].label}
                  price={`$${packPricing["30"].price}`}
                />
              </div>
            </div>

            <a
              href={payUrl}
              style={{
                display: "block",
                width: 280,
                padding: "9px 0",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(59,130,246,0.45)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
                textDecoration: "none",
                pointerEvents: busy ? "none" : "auto",
                opacity: busy ? 0.6 : 1,
                margin: "10px auto 0 auto",
              }}
            >
              الدفع الآن ({selectedInfo.label})
            </a>

            <div
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "rgba(255,255,255,0.75)",
                marginTop: 10,
              }}
            >
              🔒 دفع آمن – الرجوع مباشرة بعد الدفع
            </div>
          </div>

          {paid ? (
            <div style={{ textAlign: "center", fontSize: 12, color: "#86efac", fontWeight: 700 }}>
              ✅ تم الدفع
            </div>
          ) : null}
        </div>

        {/* Email block (now real: reads credits from backend) */}
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "rgba(255,255,255,0.055)",
            border: "1px solid rgba(255,255,255,0.12)",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              display: "inline-block",
              paddingBottom: 5,
              marginBottom: 10,
              borderBottom: "2px solid rgba(255,255,255,0.35)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            البريد الإلكتروني
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              inputMode="email"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                outline: "none",
                fontSize: 13,
                direction: "ltr",
              }}
            />

            <button
              type="button"
              onClick={handleCheckEmail}
              disabled={!isValidEmail(email) || busy || checking}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: !isValidEmail(email) || busy || checking ? "not-allowed" : "pointer",
                opacity: !isValidEmail(email) || busy || checking ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {checking ? "..." : "تحقق"}
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
            استخدم نفس البريد الإلكتروني الذي تم الدفع به
          </div>

          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#fff" }}>
            الرصيد المتبقي: {creditsText}
            {email.trim() ? " امتحان" : ""}
          </div>
        </div>

        <Section title="مستوى الصعوبة :">
          <Radio label="سهل" checked={difficulty === "easy"} onChange={() => setDifficulty("easy")} />
          <Radio
            label="متوسط"
            checked={difficulty === "medium"}
            onChange={() => setDifficulty("medium")}
          />
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
              opacity: paid ? 1 : 0.6,
              pointerEvents: paid ? "auto" : "none",
            }}
            title={!paid ? "يرجى الدفع أولاً" : undefined}
          >
            📤 تحميل ملف الدرس
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <div style={{ marginTop: 8, fontSize: 12 }}>{file ? file.name : "لم يتم اختيار أي ملف"}</div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!file || busy || !paid}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background: !paid || busy ? "rgba(255,255,255,0.22)" : "rgba(59,130,246,0.45)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: !paid || busy ? "not-allowed" : "pointer",
            marginBottom: 20,
          }}
        >
          {busy ? "⏳ جاري إنشاء الامتحان..." : "إنشاء الامتحان"}
        </button>

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

function OfferRow({
  pack,
  selectedPack,
  onSelect,
  label,
  price,
}: {
  pack: Pack;
  selectedPack: Pack;
  onSelect: (p: Pack) => void;
  label: string;
  price: string;
}) {
  const active = selectedPack === pack;

  return (
    <button
      type="button"
      onClick={() => onSelect(pack)}
      style={{
        width: "100%",
        display: "block",
        margin: "0 0 8px 0",
        padding: "9px 12px",
        borderRadius: 12,
        border: active ? "1px solid rgba(59,130,246,0.85)" : "1px solid rgba(255,255,255,0.14)",
        background: active ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.035)",
        color: "#fff",
        cursor: "pointer",
      }}
      aria-pressed={active}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            border: active ? "3px solid rgba(59,130,246,0.95)" : "2px solid rgba(255,255,255,0.55)",
            boxSizing: "border-box",
            flex: "0 0 12px",
          }}
        />

        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "100%",
              maxWidth: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, textAlign: "right" }}>{label}</span>

            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                textAlign: "left",
                direction: "ltr",
                unicodeBidi: "isolate",
                minWidth: 52,
              }}
            >
              {price}
            </span>
          </div>
        </div>

        <input
          type="radio"
          name="pack"
          checked={active}
          onChange={() => onSelect(pack)}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        />
      </div>
    </button>
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
        padding: 16,
        borderRadius: 14,
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.12)",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "inline-block",
          paddingBottom: 5,
          marginBottom: 10,
          borderBottom: "2px solid rgba(255,255,255,0.35)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

function Radio({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: "block", cursor: "pointer", fontSize: 13 }}>
      <input type="radio" checked={checked} onChange={onChange} /> {label}
    </label>
  );
}
