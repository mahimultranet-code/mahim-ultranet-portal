const TOKEN_PREFIX = "Bearer ";

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function digest(value) {
  const data = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(data), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 4096) throw new Error("payload_too_large");
  return JSON.parse(text);
}

async function authenticate(request, db) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith(TOKEN_PREFIX)) return null;
  const raw = authorization.slice(TOKEN_PREFIX.length);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(raw)) return null;
  const row = await db.prepare(
    "SELECT id, router_key FROM routers WHERE token_hash = ? AND enabled = 1 LIMIT 1",
  ).bind(await digest(raw)).first();
  return row || null;
}

export async function handleRouterAgent(request, env, url) {
  if (!url.pathname.startsWith("/router/")) return null;
  if (!env.DB) return response({ ok: false, error: "service_unavailable" }, 503);

  try {
    if (url.pathname === "/router/enroll" && request.method === "POST") {
      if (typeof env.ROUTER_ENROLLMENT_SECRET !== "string" || env.ROUTER_ENROLLMENT_SECRET.length < 32) {
        return response({ ok: false, error: "router_enrollment_unavailable" }, 503);
      }
      const supplied = request.headers.get("X-Router-Enroll-Secret") || "";
      const expectedHash = await digest(env.ROUTER_ENROLLMENT_SECRET);
      const suppliedHash = await digest(supplied);
      if (!safeEqual(expectedHash, suppliedHash)) return response({ ok: false, error: "unauthorized" }, 401);
      const body = await readBody(request);
      const routerKey = typeof body.router_key === "string" ? body.router_key.trim() : "";
      const routerName = typeof body.router_name === "string" ? body.router_name.trim() : "";
      const version = typeof body.routeros_version === "string" ? body.routeros_version.trim().slice(0, 40) : null;
      if (!/^[A-Za-z0-9_-]{3,64}$/.test(routerKey) || routerName.length < 2 || routerName.length > 80) {
        return response({ ok: false, error: "invalid_router_details" }, 400);
      }
      const plainToken = token();
      await env.DB.prepare(
        `INSERT INTO routers (router_key, router_name, routeros_version, token_hash, enabled)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(router_key) DO UPDATE SET
           router_name = excluded.router_name,
           routeros_version = excluded.routeros_version,
           token_hash = excluded.token_hash,
           enabled = 1`,
      ).bind(routerKey, routerName, version, await digest(plainToken)).run();
      return response({ ok: true, router_key: routerKey, router_token: plainToken, message: "store_token_securely_once" }, 201);
    }

    if (url.pathname === "/router/poll" && request.method === "GET") {
      const router = await authenticate(request, env.DB);
      if (!router) return response({ ok: false, error: "unauthorized" }, 401);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE routers SET last_seen_at = ? WHERE id = ?").bind(now, router.id).run();
      const job = await env.DB.prepare(
        `UPDATE router_jobs
         SET status = 'leased', attempts = attempts + 1,
             lease_until = datetime('now', '+90 seconds')
         WHERE id = (
           SELECT id FROM router_jobs
           WHERE router_id = ? AND attempts < 8
             AND (status = 'queued' OR (status = 'leased' AND lease_until < ?))
           ORDER BY id ASC LIMIT 1
         )
         RETURNING id, job_type, payload_json, idempotency_key, attempts`,
      ).bind(router.id, now).first();
      if (!job) return response({ ok: true, job: null, server_time: now });
      return response({
        ok: true,
        server_time: now,
        job: {
          id: Number(job.id),
          type: job.job_type,
          payload: JSON.parse(job.payload_json),
          idempotency_key: job.idempotency_key,
          attempt: Number(job.attempts),
        },
      });
    }

    const ack = url.pathname.match(/^\/router\/jobs\/(\d+)\/ack$/);
    if (ack && request.method === "POST") {
      const router = await authenticate(request, env.DB);
      if (!router) return response({ ok: false, error: "unauthorized" }, 401);
      const jobId = Number(ack[1]);
      const body = await readBody(request);
      const status = body.status;
      if (!Number.isSafeInteger(jobId) || !["applied", "failed"].includes(status)) {
        return response({ ok: false, error: "invalid_acknowledgement" }, 400);
      }
      const details = JSON.stringify(body.details ?? {}).slice(0, 2000);
      const result = await env.DB.prepare(
        `UPDATE router_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP, lease_until = NULL
         WHERE id = ? AND router_id = ? AND status = 'leased'`,
      ).bind(status, details, jobId, router.id).run();
      if (Number(result.meta?.changes || 0) !== 1) return response({ ok: false, error: "job_not_leased_or_not_found" }, 409);
      await env.DB.prepare(
        "INSERT INTO router_events (router_id, job_id, event_type, details_json) VALUES (?, ?, ?, ?)",
      ).bind(router.id, jobId, status, details).run();
      return response({ ok: true, job_id: jobId, status });
    }

    return response({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    if (error?.message === "payload_too_large") return response({ ok: false, error: "payload_too_large" }, 413);
    if (error instanceof SyntaxError) return response({ ok: false, error: "invalid_json" }, 400);
    return response({ ok: false, error: "internal_error" }, 500);
  }
}
