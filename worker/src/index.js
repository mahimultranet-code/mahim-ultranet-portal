const SERVICE = "mahim-ultranet-api-v2";
const ALLOWED_ORIGIN = "https://mahimultranet-code.github.io";
const SESSION_COOKIE = "__Host-ultranet_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 210000;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function fail(error, status, headers) {
  return json({ ok: false, error }, status, headers);
}

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  const hash = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return false;
  const expected = parts[3];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(parts[2]), iterations },
    key,
    256,
  );
  const actual = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function readJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > 4096) throw new Error("payload_too_large");
  const raw = await request.text();
  if (raw.length > 4096) throw new Error("payload_too_large");
  return JSON.parse(raw);
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

async function rateLimit(db, request, action, identity = "") {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(`${action}|${ip}|${identity}`);
  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = 15 * 60;
  await db.prepare(
    `INSERT INTO rate_limits (rate_key, window_started_at, attempts)
     VALUES (?, ?, 1)
     ON CONFLICT(rate_key) DO UPDATE SET
       attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE WHEN window_started_at <= ? THEN ? ELSE window_started_at END`,
  ).bind(key, now, now - windowSeconds, now - windowSeconds, now).run();
  const row = await db.prepare("SELECT attempts FROM rate_limits WHERE rate_key = ?").bind(key).first();
  return Number(row?.attempts || 0) <= 8;
}

async function createSession(db, customerId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, customer_id, expires_at) VALUES (?, ?, ?)",
  ).bind(tokenHash, customerId, expiresAt).run();
  return token;
}

async function getSessionCustomer(db, request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    `SELECT c.id, c.name, c.mobile, c.email, c.role, c.is_verified, c.mikrotik_username
     FROM sessions s JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ? AND s.expires_at > ? LIMIT 1`,
  ).bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

function publicCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email || null,
    role: row.role,
    is_verified: Boolean(row.is_verified),
    mikrotik_username: row.mikrotik_username || null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, service: SERVICE, database: "not_configured" }, 503, cors);
      try {
        await env.DB.prepare("SELECT 1 AS healthy").first();
        return json({ ok: true, service: SERVICE, database: "connected" }, 200, cors);
      } catch {
        return json({ ok: false, service: SERVICE, database: "unavailable" }, 503, cors);
      }
    }

    const adminPaymentAction = url.pathname.match(/^\/admin\/payments\/(\d+)\/(approve|reject)$/);
    if (!["/auth/register", "/auth/login", "/auth/me", "/auth/logout", "/wallet", "/wallet/transactions", "/packages", "/payments/request", "/payments/mine", "/admin/payments"].includes(url.pathname) && !adminPaymentAction) {
      return fail("not_found", 404, cors);
    }
    if (!env.DB) return fail("service_unavailable", 503, cors);
    if (origin !== ALLOWED_ORIGIN) return fail("origin_not_allowed", 403);
    if (!["GET", "POST"].includes(request.method)) return fail("method_not_allowed", 405, cors);

    try {
      if (url.pathname === "/auth/register" && request.method === "POST") {
        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

        if (name.length < 2 || name.length > 80) return fail("invalid_name", 400, cors);
        if (!/^01[3-9]\d{8}$/.test(mobile)) return fail("invalid_mobile", 400, cors);
        if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
          return fail("invalid_email", 400, cors);
        }
        if (password.length < 10 || password.length > 128) return fail("weak_password", 400, cors);
        if (password !== confirmPassword) return fail("password_mismatch", 400, cors);
        if (!(await rateLimit(env.DB, request, "register", mobile))) return fail("too_many_attempts", 429, cors);

        const passwordHash = await hashPassword(password);
        let customer;
        try {
          customer = await env.DB.prepare(
            `INSERT INTO customers (name, mobile, password_hash, role, email)
             VALUES (?, ?, ?, 'customer', ?)`,
          ).bind(name, mobile, passwordHash, email || null).run();
        } catch {
          return fail("registration_unavailable", 409, cors);
        }

        const customerId = Number(customer.meta?.last_row_id);
        if (!Number.isSafeInteger(customerId) || customerId < 1) {
          return fail("registration_unavailable", 500, cors);
        }
        try {
          await env.DB.prepare("INSERT INTO wallets (customer_id, balance_taka) VALUES (?, 0)").bind(customerId).run();
        } catch {
          await env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(customerId).run();
          return fail("registration_unavailable", 500, cors);
        }
        const token = await createSession(env.DB, customerId);
        const row = await env.DB.prepare(
          "SELECT id, name, mobile, email, role, is_verified, mikrotik_username FROM customers WHERE id = ?",
        ).bind(customerId).first();
        return json({ ok: true, customer: publicCustomer(row) }, 201, {
          ...cors,
          "set-cookie": sessionCookie(token),
        });
      }

      if (url.pathname === "/auth/login" && request.method === "POST") {
        const body = await readJson(request);
        const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (!/^01[3-9]\d{8}$/.test(mobile) || password.length < 1 || password.length > 128) {
          return fail("invalid_credentials", 401, cors);
        }
        if (!(await rateLimit(env.DB, request, "login", mobile))) return fail("too_many_attempts", 429, cors);
        const row = await env.DB.prepare(
          "SELECT id, name, mobile, email, role, is_verified, mikrotik_username, password_hash FROM customers WHERE mobile = ? LIMIT 1",
        ).bind(mobile).first();
        if (!row || !(await verifyPassword(password, row.password_hash))) {
          return fail("invalid_credentials", 401, cors);
        }
        const token = await createSession(env.DB, row.id);
        return json({ ok: true, customer: publicCustomer(row) }, 200, {
          ...cors,
          "set-cookie": sessionCookie(token),
        });
      }

      if (url.pathname === "/auth/me" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        return json({ ok: true, customer: publicCustomer(customer) }, 200, cors);
      }

      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const token = cookieValue(request, SESSION_COOKIE);
        if (token && token.length <= 128) {
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
        }
        return json({ ok: true }, 200, { ...cors, "set-cookie": clearSessionCookie() });
      }

      if (url.pathname === "/packages" && request.method === "GET") {
        const result = await env.DB.prepare(
          "SELECT id, price_taka, duration, duration_minutes, speed_mbps, service_type FROM packages WHERE is_active = 1 ORDER BY price_taka ASC, id ASC",
        ).all();
        return json({ ok: true, packages: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/wallet" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const wallet = await env.DB.prepare(
          "SELECT balance_taka FROM wallets WHERE customer_id = ? LIMIT 1",
        ).bind(customer.id).first();
        if (!wallet) return fail("wallet_not_found", 404, cors);
        return json({ ok: true, balance_taka: Number(wallet.balance_taka) }, 200, cors);
      }

      if (url.pathname === "/wallet/transactions" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 20);
        const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20;
        const result = await env.DB.prepare(
          "SELECT id, type, amount_taka, status, reference, created_at FROM wallet_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT ?",
        ).bind(customer.id, limit).all();
        return json({ ok: true, transactions: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/payments/request" && request.method === "POST") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const body = await readJson(request);
        const method = typeof body.method === "string" ? body.method.trim().toLowerCase() : "";
        const senderMobile = typeof body.sender_mobile === "string" ? body.sender_mobile.trim() : "";
        const transactionId = typeof body.transaction_id === "string" ? body.transaction_id.trim().toUpperCase() : "";
        const amount = Number(body.amount_taka);
        if (!["bkash", "nagad"].includes(method)) return fail("invalid_payment_method", 400, cors);
        if (!/^01[3-9]\d{8}$/.test(senderMobile)) return fail("invalid_sender_mobile", 400, cors);
        if (!/^[A-Z0-9-]{6,32}$/.test(transactionId)) return fail("invalid_transaction_id", 400, cors);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 50000) return fail("invalid_amount", 400, cors);
        if (!(await rateLimit(env.DB, request, "payment-request", String(customer.id)))) {
          return fail("too_many_attempts", 429, cors);
        }
        try {
          const inserted = await env.DB.prepare(
            "INSERT INTO payment_requests (customer_id, method, sender_mobile, transaction_id, amount_taka, status) VALUES (?, ?, ?, ?, ?, 'pending')",
          ).bind(customer.id, method, senderMobile, transactionId, amount).run();
          return json({
            ok: true,
            payment: {
              id: Number(inserted.meta?.last_row_id),
              method,
              sender_mobile: senderMobile,
              transaction_id: transactionId,
              amount_taka: amount,
              status: "pending",
            },
            message: "payment_submitted_for_manual_review",
          }, 201, cors);
        } catch {
          return fail("transaction_id_already_used_or_request_invalid", 409, cors);
        }
      }

      if (url.pathname === "/payments/mine" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 20);
        const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20;
        const result = await env.DB.prepare(
          "SELECT id, method, sender_mobile, transaction_id, amount_taka, status, created_at FROM payment_requests WHERE customer_id = ? ORDER BY id DESC LIMIT ?",
        ).bind(customer.id, limit).all();
        return json({ ok: true, payments: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/admin/payments" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const status = url.searchParams.get("status") || "pending";
        if (!["pending", "approved", "rejected"].includes(status)) return fail("invalid_status", 400, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
        const result = await env.DB.prepare(
          "SELECT p.id, p.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, p.method, p.sender_mobile, p.transaction_id, p.amount_taka, p.status, p.created_at FROM payment_requests p JOIN customers c ON c.id = p.customer_id WHERE p.status = ? ORDER BY p.id DESC LIMIT ?",
        ).bind(status, limit).all();
        return json({ ok: true, payments: result.results || [] }, 200, cors);
      }

      if (adminPaymentAction && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const paymentId = Number(adminPaymentAction[1]);
        const action = adminPaymentAction[2];
        if (!Number.isSafeInteger(paymentId) || paymentId < 1) return fail("invalid_payment_id", 400, cors);
        if (!(await rateLimit(env.DB, request, "admin-payment-action", String(admin.id)))) {
          return fail("too_many_attempts", 429, cors);
        }

        if (action === "approve") {
          const results = await env.DB.batch([
            env.DB.prepare(
              "UPDATE payment_requests SET status = 'approved' WHERE id = ? AND status = 'pending'",
            ).bind(paymentId),
            env.DB.prepare(
              "INSERT OR IGNORE INTO wallets (customer_id, balance_taka) SELECT customer_id, 0 FROM payment_requests WHERE id = ? AND status = 'approved'",
            ).bind(paymentId),
            env.DB.prepare(
              "INSERT OR IGNORE INTO wallet_transactions (customer_id, type, amount_taka, status, reference) SELECT customer_id, 'recharge', amount_taka, 'success', 'payment:' || id FROM payment_requests WHERE id = ? AND status = 'approved'",
            ).bind(paymentId),
            env.DB.prepare(
              "UPDATE wallets SET balance_taka = balance_taka + (SELECT amount_taka FROM payment_requests WHERE id = ?) WHERE customer_id = (SELECT customer_id FROM payment_requests WHERE id = ?) AND changes() = 1",
            ).bind(paymentId, paymentId),
            env.DB.prepare(
              "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'payment_approved', 'payment_id=' || ? WHERE changes() = 1",
            ).bind(admin.id, paymentId),
          ]);
          const changed = Number(results?.[0]?.meta?.changes || 0);
          if (changed !== 1) return fail("payment_not_pending_or_not_found", 409, cors);
          return json({ ok: true, payment_id: paymentId, status: "approved" }, 200, cors);
        }

        const results = await env.DB.batch([
          env.DB.prepare(
            "UPDATE payment_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'",
          ).bind(paymentId),
          env.DB.prepare(
            "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'payment_rejected', 'payment_id=' || ? WHERE changes() = 1",
          ).bind(admin.id, paymentId),
        ]);
        const changed = Number(results?.[0]?.meta?.changes || 0);
        if (changed !== 1) return fail("payment_not_pending_or_not_found", 409, cors);
        return json({ ok: true, payment_id: paymentId, status: "rejected" }, 200, cors);
      }
    } catch (error) {
      if (error?.message === "payload_too_large") return fail("payload_too_large", 413, cors);
      if (error instanceof SyntaxError) return fail("invalid_json", 400, cors);
      return fail("internal_error", 500, cors);
    }

    return fail("not_found", 404, cors);
  },
};
