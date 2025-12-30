import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ examId: string; type: string }> }
) {
  const { examId, type } = await context.params;

  if (!["qcm", "correction"].includes(type)) {
    return NextResponse.json(
      { error: "TYPE_INVALIDE" },
      { status: 400 }
    );
  }

  const baseDir = path.join(os.tmpdir(), "examforge", examId);
  const filePath = path.join(baseDir, `${type}.pdf`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "FICHIER_INTROUVABLE" },
      { status: 404 }
    );
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${type}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}