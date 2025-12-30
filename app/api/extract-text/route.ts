import { NextResponse } from "next/server";
import { cleanText } from "@/lib/cleanText";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { status: "ERROR", step: "C5", message: "NO_FILE_PROVIDED" },
        { status: 400 }
      );
    }

    /* =====================================================
       🔧 POLYFILLS OBLIGATOIRES POUR pdf-parse SUR VERCEL
       ===================================================== */
    (global as any).DOMMatrix = class {};
    (global as any).ImageData = class {};
    (global as any).Path2D = class {};

    // Import dynamique APRÈS polyfills (VERSION CORRECTE)
const pdfParseModule = await import("pdf-parse");
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;


    // PDF → Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse PDF
    const parsed = await pdfParse(buffer);

    if (!parsed.text || !parsed.text.trim()) {
      return NextResponse.json(
        { status: "ERROR", step: "C5", message: "PDF_EMPTY_OR_UNREADABLE" },
        { status: 400 }
      );
    }

    // Clean text
    const cleanedText = cleanText(parsed.text);

    return NextResponse.json({
      status: "OK",
      step: "C5",
      rawLength: parsed.text.length,
      cleanedLength: cleanedText.length,
      preview: cleanedText.slice(0, 300),
      cleanedText,
    });
  } catch (err: any) {
    console.error("C5 ERROR:", err);
    return NextResponse.json(
      {
        status: "ERROR",
        step: "C5",
        message: err?.message || "C5_FAILED",
      },
      { status: 500 }
    );
  }
}
