export const runtime = "nodejs";

/**
 * POST /api/extract-text
 * - reçoit un PDF (FormData)
 * - forward vers le service PDF Railway
 * - renvoie le JSON parsé
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ status: "ERROR", message: "NO_FILE" }, { status: 400 });
    }

    // ✅ FIX: accept server-side var + fallback to NEXT_PUBLIC
    const pdfServiceUrl =
      process.env.PDF_SERVICE_URL ||
      process.env.NEXT_PUBLIC_PDF_SERVICE_URL ||
      "";

    if (!pdfServiceUrl) {
      return Response.json(
        { status: "ERROR", message: "PDF_SERVICE_URL_MISSING" },
        { status: 500 }
      );
    }

    // Forward vers Railway PDF service
    const fd = new FormData();
    fd.append("file", file, file.name); // ✅ keep filename

    const res = await fetch(`${pdfServiceUrl}/extract-text`, {
      method: "POST",
      body: fd,
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      return Response.json(
        { status: "ERROR", message: text || "PDF_SERVICE_ERROR" },
        { status: 500 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json(
        {
          status: "ERROR",
          message: "INVALID_RESPONSE_FROM_PDF_SERVICE",
          raw: text.slice(0, 300),
        },
        { status: 500 }
      );
    }

    return Response.json(data, { status: 200 });
  } catch (e: any) {
    return Response.json(
      { status: "ERROR", message: e?.message || "EXTRACT_FAILED" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS — pas nécessaire ici (même origine: localhost -> localhost),
 * mais on le laisse.
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
