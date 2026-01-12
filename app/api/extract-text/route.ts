export const runtime = "nodejs";

function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function safeJsonParse(text: string) {
  // Strip code fences just in case
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return { ok: true as const, data: JSON.parse(cleaned) };
  } catch {
    return { ok: false as const, data: null };
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ status: "ERROR", message: "NO_FILE" }, { status: 400 });
    }

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

    const url = `${trimSlash(pdfServiceUrl)}/extract-text`;

    // Forward vers Railway PDF service
    const fd = new FormData();
    fd.append("file", file, file.name);

    const res = await fetch(url, {
      method: "POST",
      body: fd,
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    // ---- If upstream failed, return structured error without crashing JSON.parse
    if (!res.ok) {
      // common case: 413 text response like "Request Entity Too Large"
      const isTooLarge =
        res.status === 413 ||
        /request entity too large/i.test(rawText) ||
        rawText.toLowerCase().startsWith("request en");

      return Response.json(
        {
          status: "ERROR",
          message: isTooLarge ? "PDF_TOO_LARGE" : "PDF_SERVICE_ERROR",
          upstreamStatus: res.status,
          upstreamContentType: contentType,
          rawPreview: rawText.slice(0, 400),
        },
        { status: res.status } // keep upstream status (important!)
      );
    }

    // ---- Upstream OK: try to parse JSON
    if (contentType.includes("application/json")) {
      const parsed = safeJsonParse(rawText);
      if (parsed.ok) {
        return Response.json(parsed.data, { status: 200 });
      }
      // content-type says json but body isn't valid json
      return Response.json(
        {
          status: "ERROR",
          message: "INVALID_JSON_FROM_PDF_SERVICE",
          upstreamStatus: res.status,
          upstreamContentType: contentType,
          rawPreview: rawText.slice(0, 400),
        },
        { status: 502 }
      );
    }

    // ---- Upstream returned text/html even though OK (rare but happens with proxies)
    const parsed = safeJsonParse(rawText);
    if (parsed.ok) {
      return Response.json(parsed.data, { status: 200 });
    }

    return Response.json(
      {
        status: "ERROR",
        message: "NON_JSON_RESPONSE_FROM_PDF_SERVICE",
        upstreamStatus: res.status,
        upstreamContentType: contentType,
        rawPreview: rawText.slice(0, 400),
      },
      { status: 502 }
    );
  } catch (e: any) {
    return Response.json(
      { status: "ERROR", message: e?.message || "EXTRACT_FAILED" },
      { status: 500 }
    );
  }
}

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
