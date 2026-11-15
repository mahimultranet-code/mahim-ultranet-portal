const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      if (!env.DB) {
        return json({ ok: false, service: "mahim-ultranet-api-v2", database: "not_configured" }, 503);
      }

      try {
        await env.DB.prepare("SELECT 1 AS healthy").first();
        return json({
          ok: true,
          service: "mahim-ultranet-api-v2",
          database: "connected",
        });
      } catch {
        return json({
          ok: false,
          service: "mahim-ultranet-api-v2",
          database: "unavailable",
        }, 503);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  },
};
