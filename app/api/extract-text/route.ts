import { NextResponse } from "next/server";
import { cleanText } from "@/lib/cleanText";

// ✅ CommonJS import (OBLIGATOIRE ici)
const pdfParse = require("pdf-parse");

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

    // PDF → Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse PDF
    const parsed = await pdfParse(buffer);

    if (!parsed.text || !parsed.text.trim()) {
      throw new Error("PDF_EMPTY_OR_UNREADABLE");
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
