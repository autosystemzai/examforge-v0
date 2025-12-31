export const runtime = "nodejs";

/**
 * DEBUG MODE — extract-text
 * Affiche les variables d'environnement visibles par CE runtime
 */
export async function POST(req: Request) {
  return Response.json({
    PDF_SERVICE_URL: process.env.PDF_SERVICE_URL ?? "MISSING",
    PDF_SERVICE_URL_TEST: process.env.PDF_SERVICE_URL_TEST ?? "TEST_MISSING",
    NODE_ENV: process.env.NODE_ENV,
  });
}

/**
 * OPTIONS — nécessaire pour le preflight (FormData + POST)
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
