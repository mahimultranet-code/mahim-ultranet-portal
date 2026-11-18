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


async function enrollmentRateLimit(db, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await digest("router-enroll|" + ip);
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO rate_limits (rate_key, window_started_at, attempts) VALUES (?, ?, 1)
     ON CONFLICT(rate_key) DO UPDATE SET
       attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE WHEN window_started_at <= ? THEN ? ELSE window_started_at END`,
  ).bind(key, now, now - 900, now - 900, now).run();
  const row = await db.prepare("SELECT attempts FROM rate_limits WHERE rate_key = ?").bind(key).first();
  return Number(row?.attempts || 0) <= 5;
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
      if (!(await enrollmentRateLimit(env.DB, request))) return response({ ok: false, error: "too_many_attempts" }, 429);
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
      const enrolled = await env.DB.prepare("SELECT id FROM routers WHERE router_key = ? LIMIT 1").bind(routerKey).first();
      let queuedOrders = 0;
      if (enrolled) {
        const pending = await env.DB.prepare(
          `SELECT cp.id, cp.service_type, cp.speed_mbps, p.duration_minutes, c.mikrotik_username
           FROM customer_packages cp
           JOIN customers c ON c.id = cp.customer_id
           JOIN packages p ON p.id = cp.package_id
           WHERE cp.status = 'pending' AND cp.router_id IS NULL
             AND c.mikrotik_username IS NOT NULL
           ORDER BY cp.id ASC LIMIT 100`,
        ).all();
        for (const item of pending.results || []) {
          if (!/^[A-Za-z0-9_.@-]{1,64}$/.test(item.mikrotik_username || "")) continue;
          const jobType = item.service_type === "pppoe" ? "activate_pppoe" : "activate_hotspot";
          const profile = item.service_type === "pppoe" ? "Mahim-PPPoE-10M" : "Mahim-Hotspot-5M";
          const payload = JSON.stringify({
            customer_package_id: Number(item.id),
            username: item.mikrotik_username,
            service_type: item.service_type,
            profile,
            speed_mbps: Number(item.speed_mbps),
            duration_minutes: Number(item.duration_minutes),
          });
          const queued = await env.DB.prepare(
            "INSERT OR IGNORE INTO router_jobs (router_id, job_type, payload_json, idempotency_key) VALUES (?, ?, ?, ?)",
          ).bind(enrolled.id, jobType, payload, "activate:package:" + item.id).run();
          if (Number(queued.meta?.changes || 0) === 1) {
            await env.DB.prepare("UPDATE customer_packages SET router_id = ? WHERE id = ? AND status = 'pending'").bind(enrolled.id, item.id).run();
            queuedOrders++;
          }
        }
        const emergencyPending = await env.DB.prepare(
          `SELECT e.id, c.mikrotik_username
           FROM emergency_requests e JOIN customers c ON c.id = e.customer_id
           WHERE e.status = 'approved' AND e.access_status = 'pending'
             AND e.router_id IS NULL AND c.mikrotik_username IS NOT NULL
           ORDER BY e.id ASC LIMIT 100`,
        ).all();
        for (const item of emergencyPending.results || []) {
          if (!/^[A-Za-z0-9_.@-]{1,64}$/.test(item.mikrotik_username || "")) continue;
          const payload = JSON.stringify({
            emergency_request_id: Number(item.id),
            username: item.mikrotik_username,
            service_type: "hotspot",
            profile: "Mahim-Hotspot-5M",
            duration_minutes: 300,
          });
          const queued = await env.DB.prepare(
            "INSERT OR IGNORE INTO router_jobs (router_id, job_type, payload_json, idempotency_key) VALUES (?, 'emergency_activate', ?, ?)",
          ).bind(enrolled.id, payload, "activate:emergency:" + item.id).run();
          if (Number(queued.meta?.changes || 0) === 1) {
            await env.DB.prepare("UPDATE emergency_requests SET router_id = ? WHERE id = ? AND access_status = 'pending'").bind(enrolled.id, item.id).run();
            queuedOrders++;
          }
        }
      }
      return response({ ok: true, router_key: routerKey, router_token: plainToken, queued_orders: queuedOrders, message: "store_token_securely_once" }, 201);
    }

    if (url.pathname === "/router/poll" && request.method === "GET") {
      const router = await authenticate(request, env.DB);
      if (!router) return response({ ok: false, error: "unauthorized" }, 401);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE routers SET last_seen_at = ? WHERE id = ?").bind(now, router.id).run();
      await env.DB.prepare(
        "UPDATE router_jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE router_id = ? AND status = 'leased' AND attempts >= 8 AND lease_until < datetime('now')",
      ).bind(router.id).run();
      const job = await env.DB.prepare(
        `UPDATE router_jobs
         SET status = 'leased', attempts = attempts + 1,
             lease_until = datetime('now', '+90 seconds')
         WHERE id = (
           SELECT id FROM router_jobs
           WHERE router_id = ? AND attempts < 8
             AND (status = 'queued' OR (status = 'leased' AND lease_until < datetime('now')))
           ORDER BY id ASC LIMIT 1
         )
         RETURNING id, job_type, payload_json, idempotency_key, attempts`,
      ).bind(router.id).first();
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
      const leasedJob = await env.DB.prepare(
        "SELECT job_type, payload_json FROM router_jobs WHERE id = ? AND router_id = ? AND status = 'leased' LIMIT 1",
      ).bind(jobId, router.id).first();
      if (!leasedJob) return response({ ok: false, error: "job_not_leased_or_not_found" }, 409);
      let jobPayload;
      try { jobPayload = JSON.parse(leasedJob.payload_json); } catch { return response({ ok: false, error: "invalid_job_payload" }, 500); }
      if (status === "applied" && ["activate_hotspot", "activate_pppoe"].includes(leasedJob.job_type)) {
        if (!Number.isSafeInteger(Number(jobPayload.customer_package_id)) ||
            !Number.isSafeInteger(Number(jobPayload.duration_minutes)) ||
            Number(jobPayload.duration_minutes) < 1 ||
            !["hotspot", "pppoe"].includes(jobPayload.service_type)) {
          return response({ ok: false, error: "invalid_activation_job_payload" }, 422);
        }
      }
      if (status === "applied" && leasedJob.job_type === "emergency_activate") {
        if (!Number.isSafeInteger(Number(jobPayload.emergency_request_id)) ||
            Number(jobPayload.duration_minutes) !== 300 ||
            jobPayload.service_type !== "hotspot" ||
            jobPayload.profile !== "Mahim-Hotspot-5M") {
          return response({ ok: false, error: "invalid_emergency_job_payload" }, 422);
        }
      }
      if (status === "applied" && leasedJob.job_type === "emergency_expire") {
        if (!Number.isSafeInteger(Number(jobPayload.emergency_request_id)) ||
            jobPayload.service_type !== "hotspot") {
          return response({ ok: false, error: "invalid_emergency_expiry_payload" }, 422);
        }
      }
      const details = JSON.stringify(body.details ?? {}).slice(0, 2000);
      const result = await env.DB.prepare(
        `UPDATE router_jobs SET status = ?, result_json = ?, completed_at = CURRENT_TIMESTAMP, lease_until = NULL
         WHERE id = ? AND router_id = ? AND status = 'leased'`,
      ).bind(status, details, jobId, router.id).run();
      if (Number(result.meta?.changes || 0) !== 1) return response({ ok: false, error: "job_not_leased_or_not_found" }, 409);
      if (status === "applied" && ["activate_hotspot", "activate_pppoe"].includes(leasedJob.job_type)) {
        await env.DB.prepare(
          `UPDATE customer_packages
           SET status = 'active',
               started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
               expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ? || ' minutes')
           WHERE id = ? AND status = 'pending' AND router_id = ?`,
        ).bind(Number(jobPayload.duration_minutes), Number(jobPayload.customer_package_id), router.id).run();
      } else if (status === "applied" && leasedJob.job_type === "disable_access") {
        await env.DB.prepare(
          "UPDATE customer_packages SET status = 'expired' WHERE id = ? AND router_id = ? AND status IN ('active', 'expiring')",
        ).bind(Number(jobPayload.customer_package_id), router.id).run();
      } else if (status === "applied" && leasedJob.job_type === "emergency_activate") {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE emergency_requests SET router_id = ?, access_status = 'active', expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+300 minutes') WHERE id = ? AND status = 'approved' AND access_status = 'pending' AND approved_by IS NOT NULL",
          ).bind(router.id, Number(jobPayload.emergency_request_id)),
          env.DB.prepare(
            "INSERT INTO emergency_activation_confirmations (request_id, customer_id, confirmed_by) SELECT id, customer_id, approved_by FROM emergency_requests WHERE id = ? AND status = 'approved' AND access_status = 'active' AND NOT EXISTS (SELECT 1 FROM emergency_activation_confirmations a WHERE a.request_id = emergency_requests.id)",
          ).bind(Number(jobPayload.emergency_request_id)),
          env.DB.prepare(
            "INSERT INTO emergency_debts (customer_id, amount_due_taka) SELECT e.customer_id, e.fee_taka FROM emergency_requests e JOIN emergency_activation_confirmations a ON a.request_id = e.id WHERE e.id = ? AND NOT EXISTS (SELECT 1 FROM emergency_debts d WHERE d.customer_id = e.customer_id AND d.amount_due_taka > 0) ON CONFLICT(customer_id) DO UPDATE SET amount_due_taka = emergency_debts.amount_due_taka + excluded.amount_due_taka, updated_at = CURRENT_TIMESTAMP WHERE emergency_debts.amount_due_taka = 0",
          ).bind(Number(jobPayload.emergency_request_id)),
          env.DB.prepare(
            "INSERT INTO admin_logs (admin_id, action, details) SELECT approved_by, 'emergency_routeros_activation_confirmed', 'emergency_request_id=' || id FROM emergency_requests WHERE id = ? AND access_status = 'active'",
          ).bind(Number(jobPayload.emergency_request_id)),
        ]);
      } else if (status === "applied" && leasedJob.job_type === "emergency_expire") {
        await env.DB.prepare(
          "UPDATE emergency_requests SET access_status = 'expired' WHERE id = ? AND router_id = ? AND access_status IN ('active', 'expiring')",
        ).bind(Number(jobPayload.emergency_request_id), router.id).run();
      }
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
