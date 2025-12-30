import { NextResponse } from "next/server";
import { cleanText } from "@/lib/cleanText";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rawText = body?.text;

    if (!rawText || typeof rawText !== "string") {
      return NextResponse.json(
        { status: "ERROR", step: "C5", message: "NO_TEXT_PROVIDED" },
        { status: 400 }
      );
    }

    const cleanedText = cleanText(rawText);

    return NextResponse.json({
      status: "OK",
      step: "C5",
      rawLength: rawText.length,
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
