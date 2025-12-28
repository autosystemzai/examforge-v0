import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const entry = formData.get("file");

    if (!(entry instanceof File)) {
      return NextResponse.json(
        { status: "ERROR", step: "C5", message: "NO_FILE" },
        { status: 400 }
      );
    }

    // 1) écrire le PDF uploadé
    const arrayBuffer = await entry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${entry.name}`);
    fs.writeFileSync(tmpPath, buffer);

    // 2) appel parser PDF (ton script CommonJS)
    const output = execFileSync("node", ["scripts/parsepdf.js", tmpPath], {
      encoding: "utf-8",
    });

    const parsed = JSON.parse(output.trim());

    if (parsed.error) {
      throw new Error(parsed.error);
    }

    // 3) cleanText (ton module.exports)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cleanText } = require("../../../scripts/clean-text.js");

    const cleanedText = cleanText(parsed.text || "");

    return NextResponse.json({
      status: "OK",
      step: "C5",
      pages: parsed.pages,
      rawLength: parsed.textLength ?? (parsed.text ? parsed.text.length : 0),
      cleanedLength: cleanedText.length,
      preview: cleanedText.slice(0, 300),
      cleanedText,
    });
  } catch (err: any) {
    console.error("C5 ERROR:", err);
    return NextResponse.json(
      { status: "ERROR", step: "C5", message: err?.message || "C5_FAILED" },
      { status: 500 }
    );
  }
}

