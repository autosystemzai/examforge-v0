import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { examId: string; type: string } }
) {
  const { examId, type } = params;

  if (!["qcm", "correction"].includes(type)) {
    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  }

  const filePath = path.join(os.tmpdir(), "examforge", examId, `${type}.pdf`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${type}.pdf"`,
    },
  });
}

