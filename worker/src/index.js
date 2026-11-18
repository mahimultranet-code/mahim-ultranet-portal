const SERVICE = "mahim-ultranet-api-v2-staging";
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
    "access-control-allow-headers": "Content-Type, Idempotency-Key, X-Admin-Setup-Secret",
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
    const adminComplaintReply = url.pathname.match(/^\/admin\/complaints\/(\d+)\/reply$/);
    const adminComplaintAllowed = Boolean(adminComplaintReply);
    const adminPackageAction = url.pathname.match(/^\/admin\/packages\/(\d+)$/);
    const adminEmergencyAction = url.pathname.match(/^\/admin\/emergency\/(\d+)\/(approve|reject|activated)$/);
    const adminPasswordResetAction = url.pathname.match(/^\/admin\/password-resets\/(\d+)\/complete$/);
    const adminPackageAllowed = url.pathname === "/admin/packages" || Boolean(adminPackageAction);
    if (!["/auth/register", "/auth/login", "/auth/me", "/auth/logout", "/wallet", "/wallet/transactions", "/packages", "/payments/request", "/payments/mine", "/admin/payments", "/packages/purchase", "/packages/mine", "/admin/bootstrap", "/admin/dashboard", "/admin/customers", "/admin/package-orders", "/complaints", "/complaints/mine", "/admin/complaints", "/emergency/request", "/emergency/mine", "/admin/emergency", "/password-reset/request", "/admin/password-resets"].includes(url.pathname) && !adminPaymentAction && !adminComplaintAllowed && !adminPackageAllowed && !adminEmergencyAction && !adminPasswordResetAction) {
      return fail("not_found", 404, cors);
    }
    if (!env.DB) return fail("service_unavailable", 503, cors);
    const allowOriginlessPublicRead = (origin === null || origin === "null") && request.method === "GET" && url.pathname === "/packages";
    if (origin !== ALLOWED_ORIGIN && !allowOriginlessPublicRead) return fail("origin_not_allowed", 403, cors);
    if (!["GET", "POST"].includes(request.method)) return fail("method_not_allowed", 405, cors);

    try {
      if (url.pathname === "/admin/bootstrap" && request.method === "POST") {
        if (typeof env.ADMIN_SETUP_SECRET !== "string" || env.ADMIN_SETUP_SECRET.length < 16) {
          return fail("admin_setup_unavailable", 503, cors);
        }
        if (!(await rateLimit(env.DB, request, "admin-bootstrap"))) {
          return fail("too_many_attempts", 429, cors);
        }
        const suppliedSecret = request.headers.get("X-Admin-Setup-Secret") || "";
        const expectedHash = await sha256(env.ADMIN_SETUP_SECRET);
        const suppliedHash = await sha256(suppliedSecret);
        let secretMismatch = expectedHash.length ^ suppliedHash.length;
        for (let i = 0; i < Math.min(expectedHash.length, suppliedHash.length); i++) {
          secretMismatch |= expectedHash.charCodeAt(i) ^ suppliedHash.charCodeAt(i);
        }
        if (secretMismatch !== 0) return fail("invalid_setup_secret", 403, cors);

        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (name.length < 2 || name.length > 80) return fail("invalid_name", 400, cors);
        if (!/^01[3-9]\d{8}$/.test(mobile)) return fail("invalid_mobile", 400, cors);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
          return fail("invalid_email", 400, cors);
        }
        if (password.length < 12 || password.length > 128) return fail("weak_password", 400, cors);
        const passwordHash = await hashPassword(password);
        const inserted = await env.DB.prepare(
          "INSERT INTO customers (name, mobile, password_hash, role, email, is_verified) SELECT ?, ?, ?, 'admin', ?, 1 WHERE NOT EXISTS (SELECT 1 FROM customers WHERE role = 'admin')",
        ).bind(name, mobile, passwordHash, email).run();
        const adminId = Number(inserted.meta?.last_row_id || 0);
        if (Number(inserted.meta?.changes || 0) !== 1 || !Number.isSafeInteger(adminId) || adminId < 1) {
          return fail("admin_already_initialized_or_mobile_unavailable", 409, cors);
        }
        await env.DB.prepare(
          "INSERT OR IGNORE INTO wallets (customer_id, balance_taka) VALUES (?, 0)",
        ).bind(adminId).run();
        const token = await createSession(env.DB, adminId);
        const admin = await env.DB.prepare(
          "SELECT id, name, mobile, email, role, is_verified, mikrotik_username FROM customers WHERE id = ?",
        ).bind(adminId).first();
        return json({ ok: true, customer: publicCustomer(admin) }, 201, {
          ...cors,
          "set-cookie": sessionCookie(token),
        });
      }

      if (url.pathname === "/password-reset/request" && request.method === "POST") {
        const body = await readJson(request);
        const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
        if (!/^01[3-9]\d{8}$/.test(mobile)) return fail("invalid_mobile", 400, cors);
        if (!(await rateLimit(env.DB, request, "password-reset-request", mobile))) return fail("too_many_attempts", 429, cors);
        await env.DB.prepare(
          "INSERT INTO password_reset_requests (customer_id, status) SELECT id, 'pending' FROM customers WHERE mobile = ? AND role = 'customer' AND NOT EXISTS (SELECT 1 FROM password_reset_requests WHERE customer_id = customers.id AND status = 'pending')",
        ).bind(mobile).run();
        return json({ ok: true, message: "if_account_exists_reset_request_submitted" }, 202, cors);
      }

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
          "SELECT id, price_taka, duration, duration_minutes, speed_mbps, service_type FROM packages WHERE is_active = 1 AND NOT (service_type = 'hotspot' AND duration_minutes = 300 AND duration = '৫ ঘণ্টা') ORDER BY price_taka ASC, id ASC",
        ).all();
        return json({ ok: true, packages: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/packages/purchase" && request.method === "POST") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const body = await readJson(request);
        const packageId = Number(body.package_id);
        const idempotencyKey = request.headers.get("Idempotency-Key") || body.idempotency_key || "";
        if (!Number.isSafeInteger(packageId) || packageId < 1) return fail("invalid_package_id", 400, cors);
        if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
          return fail("valid_idempotency_key_required", 400, cors);
        }
        if (!(await rateLimit(env.DB, request, "package-purchase", String(customer.id)))) {
          return fail("too_many_attempts", 429, cors);
        }
        const pkg = await env.DB.prepare(
          "SELECT id, price_taka, duration, duration_minutes, speed_mbps, service_type FROM packages WHERE id = ? AND is_active = 1 AND NOT (service_type = 'hotspot' AND duration_minutes = 300 AND duration = '৫ ঘণ্টা') LIMIT 1",
        ).bind(packageId).first();
        if (!pkg) return fail("package_not_available", 404, cors);
        const reference = "pkg:" + customer.id + ":" + idempotencyKey;
        const existing = await env.DB.prepare(
          "SELECT id, type, amount_taka, status, reference, created_at FROM wallet_transactions WHERE customer_id = ? AND reference = ? LIMIT 1",
        ).bind(customer.id, reference).first();
        if (existing) {
          return json({ ok: true, replayed: true, transaction: existing, activation_status: "pending" }, 200, cors);
        }

        const results = await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO wallet_transactions (customer_id, type, amount_taka, status, reference) SELECT ?, 'package_purchase', ?, 'success', ? WHERE EXISTS (SELECT 1 FROM wallets WHERE customer_id = ? AND balance_taka >= ?) AND NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE reference = ?)",
          ).bind(customer.id, pkg.price_taka, reference, customer.id, pkg.price_taka, reference),
          env.DB.prepare(
            "UPDATE wallets SET balance_taka = balance_taka - ? WHERE customer_id = ? AND changes() = 1",
          ).bind(pkg.price_taka, customer.id),
          env.DB.prepare(
            "INSERT INTO customer_packages (customer_id, package_id, service_type, price_taka, speed_mbps, status) SELECT ?, ?, ?, ?, ?, 'pending' WHERE changes() = 1",
          ).bind(customer.id, pkg.id, pkg.service_type, pkg.price_taka, pkg.speed_mbps),
        ]);
        const ledgerInserted = Number(results?.[0]?.meta?.changes || 0);
        if (ledgerInserted !== 1) {
          const balance = await env.DB.prepare(
            "SELECT balance_taka FROM wallets WHERE customer_id = ? LIMIT 1",
          ).bind(customer.id).first();
          return fail(balance ? "insufficient_wallet_balance_or_duplicate_request" : "wallet_not_found", 409, cors);
        }
        const orderId = Number(results?.[2]?.meta?.last_row_id || 0);
        const order = orderId ? await env.DB.prepare(
          "SELECT id, package_id, service_type, price_taka, speed_mbps, status, created_at FROM customer_packages WHERE id = ? AND customer_id = ? LIMIT 1",
        ).bind(orderId, customer.id).first() : null;
        const wallet = await env.DB.prepare(
          "SELECT balance_taka FROM wallets WHERE customer_id = ? LIMIT 1",
        ).bind(customer.id).first();
        return json({
          ok: true,
          order,
          balance_taka: Number(wallet?.balance_taka || 0),
          activation_status: "pending",
          message: "payment_deducted_package_waiting_for_router_activation",
        }, 201, cors);
      }

      if (url.pathname === "/packages/mine" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 20);
        const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 20;
        const result = await env.DB.prepare(
          "SELECT cp.id, cp.package_id, cp.service_type, cp.price_taka, cp.speed_mbps, cp.started_at, cp.expires_at, cp.status, cp.created_at, p.duration FROM customer_packages cp LEFT JOIN packages p ON p.id = cp.package_id WHERE cp.customer_id = ? ORDER BY cp.id DESC LIMIT ?",
        ).bind(customer.id, limit).all();
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
        if (!Number.isSafeInteger(amount) || amount < 10 || amount > 50000) return fail("minimum_recharge_is_10_taka", 400, cors);
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
          "SELECT p.id, p.method, p.sender_mobile, p.transaction_id, p.amount_taka, p.status, p.created_at, COALESCE(t.amount_taka, 0) AS debt_paid_taka, p.amount_taka - COALESCE(t.amount_taka, 0) AS wallet_credited_taka FROM payment_requests p LEFT JOIN emergency_debt_transactions t ON t.payment_id = p.id WHERE p.customer_id = ? ORDER BY p.id DESC LIMIT ?",
        ).bind(customer.id, limit).all();
        return json({ ok: true, payments: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/emergency/request" && request.method === "POST") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        if (customer.role !== "customer") return fail("customer_account_required", 403, cors);
        if (!(await rateLimit(env.DB, request, "emergency-request", String(customer.id)))) return fail("too_many_attempts", 429, cors);
        const result = await env.DB.prepare(
          "INSERT INTO emergency_requests (customer_id, fee_taka, status) SELECT ?, 20, 'pending' WHERE (SELECT created_at FROM customers WHERE id = ?) <= datetime('now', '-3 months') AND (SELECT COUNT(*) FROM payment_requests WHERE customer_id = ? AND status = 'approved' AND amount_taka >= 10) >= 10 AND NOT EXISTS (SELECT 1 FROM emergency_debts WHERE customer_id = ? AND amount_due_taka > 0) AND NOT EXISTS (SELECT 1 FROM emergency_requests e2 WHERE e2.customer_id = ? AND (e2.status = 'pending' OR (e2.status = 'approved' AND NOT EXISTS (SELECT 1 FROM emergency_activation_confirmations a2 WHERE a2.request_id = e2.id))))",
        ).bind(customer.id, customer.id, customer.id, customer.id, customer.id).run();
        if (Number(result.meta?.changes || 0) !== 1) return fail("not_eligible_or_existing_debt_or_pending_request", 409, cors);
        return json({ ok: true, request_id: Number(result.meta?.last_row_id), fee_taka: 20, duration_minutes: 300, duration_hours: 5, status: "pending", activation_status: "pending_routeros_verification" }, 201, cors);
      }

      if (url.pathname === "/emergency/mine" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const [requests, debt] = await Promise.all([
          env.DB.prepare("SELECT e.id, e.fee_taka, e.status, e.created_at, CASE WHEN a.request_id IS NULL THEN 0 ELSE 1 END AS activation_confirmed FROM emergency_requests e LEFT JOIN emergency_activation_confirmations a ON a.request_id = e.id WHERE e.customer_id = ? ORDER BY e.id DESC LIMIT 20").bind(customer.id).all(),
          env.DB.prepare("SELECT amount_due_taka FROM emergency_debts WHERE customer_id = ?").bind(customer.id).first(),
        ]);
        return json({ ok: true, requests: requests.results || [], amount_due_taka: Number(debt?.amount_due_taka || 0) }, 200, cors);
      }

      if (url.pathname === "/admin/emergency" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const status = url.searchParams.get("status") || "pending";
        if (!["pending", "approved", "rejected"].includes(status)) return fail("invalid_status", 400, cors);
        const result = await env.DB.prepare(
          "SELECT e.id, e.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, e.fee_taka, e.status, e.created_at, CASE WHEN a.request_id IS NULL THEN 0 ELSE 1 END AS activation_confirmed FROM emergency_requests e JOIN customers c ON c.id = e.customer_id LEFT JOIN emergency_activation_confirmations a ON a.request_id = e.id WHERE e.status = ? ORDER BY e.id DESC LIMIT 100",
        ).bind(status).all();
        return json({ ok: true, requests: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/complaints" && request.method === "POST") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const body = await readJson(request);
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (subject.length < 3 || subject.length > 120) return fail("invalid_subject", 400, cors);
        if (message.length < 10 || message.length > 2000) return fail("invalid_message", 400, cors);
        if (!(await rateLimit(env.DB, request, "complaint", String(customer.id)))) {
          return fail("too_many_attempts", 429, cors);
        }
        const inserted = await env.DB.prepare(
          "INSERT INTO complaints (customer_id, subject, message, status) VALUES (?, ?, ?, 'pending')",
        ).bind(customer.id, subject, message).run();
        return json({ ok: true, complaint_id: Number(inserted.meta?.last_row_id), status: "pending" }, 201, cors);
      }

      if (url.pathname === "/complaints/mine" && request.method === "GET") {
        const customer = await getSessionCustomer(env.DB, request);
        if (!customer) return fail("unauthorized", 401, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 30);
        const limit = Number.isInteger(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 30;
        const result = await env.DB.prepare(
          "SELECT id, subject, message, status, admin_reply, created_at FROM complaints WHERE customer_id = ? ORDER BY id DESC LIMIT ?",
        ).bind(customer.id, limit).all();
        return json({ ok: true, complaints: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/admin/packages" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const result = await env.DB.prepare(
          "SELECT id, price_taka, duration, duration_minutes, speed_mbps, service_type, is_active FROM packages ORDER BY service_type ASC, price_taka ASC, id ASC",
        ).all();
        return json({ ok: true, packages: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/admin/packages" && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const body = await readJson(request);
        const price = Number(body.price_taka);
        const durationMinutes = Number(body.duration_minutes);
        const speed = Number(body.speed_mbps);
        const duration = typeof body.duration === "string" ? body.duration.trim() : "";
        const serviceType = typeof body.service_type === "string" ? body.service_type : "";
        if (!Number.isSafeInteger(price) || price < 1 || price > 100000) return fail("invalid_price", 400, cors);
        if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 525600) return fail("invalid_duration", 400, cors);
        if (!Number.isSafeInteger(speed) || speed < 1 || speed > 1000) return fail("invalid_speed", 400, cors);
        if (!duration || duration.length > 40) return fail("invalid_duration_label", 400, cors);
        if (!["hotspot", "pppoe"].includes(serviceType)) return fail("invalid_service_type", 400, cors);
        const active = body.is_active === false || body.is_active === 0 ? 0 : 1;
        const result = await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO packages (price_taka, duration, duration_minutes, speed_mbps, service_type, is_active) VALUES (?, ?, ?, ?, ?, ?)",
          ).bind(price, duration, durationMinutes, speed, serviceType, active),
          env.DB.prepare(
            "INSERT INTO admin_logs (admin_id, action, details) VALUES (?, 'package_created', ?)",
          ).bind(admin.id, JSON.stringify({ price_taka: price, duration, duration_minutes: durationMinutes, speed_mbps: speed, service_type: serviceType, is_active: active })),
        ]);
        const packageId = Number(result?.[0]?.meta?.last_row_id || 0);
        return json({ ok: true, package_id: packageId }, 201, cors);
      }

      if (adminPackageAction && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const packageId = Number(adminPackageAction[1]);
        if (!Number.isSafeInteger(packageId) || packageId < 1) return fail("invalid_package_id", 400, cors);
        const body = await readJson(request);
        const price = Number(body.price_taka);
        const durationMinutes = Number(body.duration_minutes);
        const speed = Number(body.speed_mbps);
        const duration = typeof body.duration === "string" ? body.duration.trim() : "";
        const serviceType = typeof body.service_type === "string" ? body.service_type : "";
        if (!Number.isSafeInteger(price) || price < 1 || price > 100000) return fail("invalid_price", 400, cors);
        if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 525600) return fail("invalid_duration", 400, cors);
        if (!Number.isSafeInteger(speed) || speed < 1 || speed > 1000) return fail("invalid_speed", 400, cors);
        if (!duration || duration.length > 40) return fail("invalid_duration_label", 400, cors);
        if (!["hotspot", "pppoe"].includes(serviceType)) return fail("invalid_service_type", 400, cors);
        const active = body.is_active === false || body.is_active === 0 ? 0 : 1;
        const result = await env.DB.batch([
          env.DB.prepare(
            "UPDATE packages SET price_taka = ?, duration = ?, duration_minutes = ?, speed_mbps = ?, service_type = ?, is_active = ? WHERE id = ?",
          ).bind(price, duration, durationMinutes, speed, serviceType, active, packageId),
          env.DB.prepare(
            "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'package_updated', 'package_id=' || ? WHERE changes() = 1",
          ).bind(admin.id, packageId),
        ]);
        if (Number(result?.[0]?.meta?.changes || 0) !== 1) return fail("package_not_found", 404, cors);
        return json({ ok: true, package_id: packageId, is_active: active }, 200, cors);
      }

      if (url.pathname === "/admin/package-orders" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const status = url.searchParams.get("status") || "pending";
        if (!["pending", "active", "rejected", "expired"].includes(status)) return fail("invalid_status", 400, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
        const result = await env.DB.prepare(
          "SELECT cp.id, cp.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, cp.package_id, p.duration, cp.service_type, cp.price_taka, cp.speed_mbps, cp.status, cp.created_at FROM customer_packages cp JOIN customers c ON c.id = cp.customer_id LEFT JOIN packages p ON p.id = cp.package_id WHERE cp.status = ? ORDER BY cp.id DESC LIMIT ?",
        ).bind(status, limit).all();
        return json({ ok: true, orders: result.results || [] }, 200, cors);
      }

      if (url.pathname === "/admin/complaints" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const status = url.searchParams.get("status") || "pending";
        if (!["pending", "in_progress", "resolved"].includes(status)) return fail("invalid_status", 400, cors);
        const rawLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
        const result = await env.DB.prepare(
          "SELECT x.id, x.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, x.subject, x.message, x.status, x.admin_reply, x.created_at FROM complaints x JOIN customers c ON c.id = x.customer_id WHERE x.status = ? ORDER BY x.id DESC LIMIT ?",
        ).bind(status, limit).all();
        return json({ ok: true, complaints: result.results || [] }, 200, cors);
      }

      if (adminComplaintReply && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const complaintId = Number(adminComplaintReply[1]);
        if (!Number.isSafeInteger(complaintId) || complaintId < 1) return fail("invalid_complaint_id", 400, cors);
        const body = await readJson(request);
        const reply = typeof body.reply === "string" ? body.reply.trim() : "";
        const status = typeof body.status === "string" ? body.status : "resolved";
        if (reply.length < 2 || reply.length > 2000) return fail("invalid_reply", 400, cors);
        if (!["in_progress", "resolved"].includes(status)) return fail("invalid_status", 400, cors);
        const results = await env.DB.batch([
          env.DB.prepare(
            "UPDATE complaints SET admin_reply = ?, status = ? WHERE id = ?",
          ).bind(reply, status, complaintId),
          env.DB.prepare(
            "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'complaint_replied', 'complaint_id=' || ? WHERE changes() = 1",
          ).bind(admin.id, complaintId),
        ]);
        if (Number(results?.[0]?.meta?.changes || 0) !== 1) return fail("complaint_not_found", 404, cors);
        return json({ ok: true, complaint_id: complaintId, status }, 200, cors);
      }

      if (adminEmergencyAction && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const requestId = Number(adminEmergencyAction[1]);
        const action = adminEmergencyAction[2];
        if (!Number.isSafeInteger(requestId) || requestId < 1) return fail("invalid_emergency_request_id", 400, cors);
        if (action === "approve") {
          const results = await env.DB.batch([
            env.DB.prepare(
              "UPDATE emergency_requests SET status = 'approved' WHERE id = ? AND status = 'pending' AND (SELECT created_at FROM customers WHERE id = emergency_requests.customer_id) <= datetime('now', '-3 months') AND (SELECT COUNT(*) FROM payment_requests WHERE customer_id = emergency_requests.customer_id AND status = 'approved' AND amount_taka >= 10) >= 10 AND NOT EXISTS (SELECT 1 FROM emergency_debts WHERE customer_id = emergency_requests.customer_id AND amount_due_taka > 0) AND NOT EXISTS (SELECT 1 FROM emergency_requests e2 WHERE e2.customer_id = emergency_requests.customer_id AND e2.status = 'approved' AND NOT EXISTS (SELECT 1 FROM emergency_activation_confirmations a2 WHERE a2.request_id = e2.id))",
            ).bind(requestId),
            env.DB.prepare(
              "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'emergency_request_approved', 'emergency_request_id=' || ? WHERE changes() = 1",
            ).bind(admin.id, requestId),
          ]);
          if (Number(results?.[0]?.meta?.changes || 0) !== 1) return fail("request_not_pending_or_not_eligible_or_debt_exists", 409, cors);
          return json({ ok: true, request_id: requestId, status: "approved", fee_taka: 20, duration_minutes: 300, duration_hours: 5, activation_status: "awaiting_routeros_confirmation", debt_created: false }, 200, cors);
        }
        if (action === "activated") {
          if (!(await rateLimit(env.DB, request, "admin-emergency-activation", String(admin.id)))) return fail("too_many_attempts", 429, cors);
          const results = await env.DB.batch([
            env.DB.prepare(
              "INSERT INTO emergency_activation_confirmations (request_id, customer_id, confirmed_by) SELECT e.id, e.customer_id, ? FROM emergency_requests e WHERE e.id = ? AND e.status = 'approved' AND NOT EXISTS (SELECT 1 FROM emergency_activation_confirmations a WHERE a.request_id = e.id) AND NOT EXISTS (SELECT 1 FROM emergency_debts d WHERE d.customer_id = e.customer_id AND d.amount_due_taka > 0)",
            ).bind(admin.id, requestId),
            env.DB.prepare(
              "INSERT INTO emergency_debts (customer_id, amount_due_taka) SELECT e.customer_id, e.fee_taka FROM emergency_requests e JOIN emergency_activation_confirmations a ON a.request_id = e.id WHERE e.id = ? AND changes() = 1 ON CONFLICT(customer_id) DO UPDATE SET amount_due_taka = emergency_debts.amount_due_taka + excluded.amount_due_taka, updated_at = CURRENT_TIMESTAMP WHERE emergency_debts.amount_due_taka = 0",
            ).bind(requestId),
            env.DB.prepare(
              "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'emergency_routeros_activation_confirmed', 'emergency_request_id=' || ? WHERE changes() = 1",
            ).bind(admin.id, requestId),
          ]);
          if (Number(results?.[0]?.meta?.changes || 0) !== 1) return fail("request_not_approved_or_already_activated_or_debt_exists", 409, cors);
          return json({ ok: true, request_id: requestId, activation_status: "confirmed_by_admin", debt_created_taka: 20 }, 200, cors);
        }
        const results = await env.DB.batch([
          env.DB.prepare("UPDATE emergency_requests SET status = 'rejected' WHERE id = ? AND status = 'pending'").bind(requestId),
          env.DB.prepare("INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'emergency_request_rejected', 'emergency_request_id=' || ? WHERE changes() = 1").bind(admin.id, requestId),
        ]);
        if (Number(results?.[0]?.meta?.changes || 0) !== 1) return fail("request_not_pending_or_not_found", 409, cors);
        return json({ ok: true, request_id: requestId, status: "rejected" }, 200, cors);
      }

      if (url.pathname === "/admin/password-resets" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const status = url.searchParams.get("status") || "pending";
        if (!["pending", "resolved"].includes(status)) return fail("invalid_status", 400, cors);
        const result = await env.DB.prepare(
          "SELECT r.id, r.customer_id, c.name AS customer_name, c.mobile AS customer_mobile, r.status, r.admin_note, r.created_at FROM password_reset_requests r JOIN customers c ON c.id = r.customer_id WHERE r.status = ? ORDER BY r.id DESC LIMIT 100",
        ).bind(status).all();
        return json({ ok: true, requests: result.results || [] }, 200, cors);
      }

      if (adminPasswordResetAction && request.method === "POST") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const resetId = Number(adminPasswordResetAction[1]);
        if (!Number.isSafeInteger(resetId) || resetId < 1) return fail("invalid_reset_id", 400, cors);
        const body = await readJson(request);
        const password = typeof body.new_password === "string" ? body.new_password : "";
        if (password.length < 10 || password.length > 128) return fail("weak_password", 400, cors);
        const passwordHash = await hashPassword(password);
        const results = await env.DB.batch([
          env.DB.prepare("UPDATE customers SET password_hash = ? WHERE id = (SELECT customer_id FROM password_reset_requests WHERE id = ? AND status = 'pending')").bind(passwordHash, resetId),
          env.DB.prepare("UPDATE password_reset_requests SET status = 'resolved', admin_note = 'Password reset completed; administrator must share the new password securely' WHERE id = ? AND status = 'pending' AND changes() = 1").bind(resetId),
          env.DB.prepare("INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'password_reset_completed', 'reset_request_id=' || ? WHERE changes() = 1").bind(admin.id, resetId),
          env.DB.prepare("DELETE FROM sessions WHERE customer_id = (SELECT customer_id FROM password_reset_requests WHERE id = ? AND status = 'resolved') AND changes() = 1").bind(resetId),
        ]);
        if (Number(results?.[0]?.meta?.changes || 0) !== 1 || Number(results?.[1]?.meta?.changes || 0) !== 1) return fail("reset_request_not_pending_or_not_found", 409, cors);
        return json({ ok: true, reset_request_id: resetId, status: "resolved", sessions_revoked: true, message: "share_the_new_password_with_customer_securely" }, 200, cors);
      }

      if (url.pathname === "/admin/dashboard" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const [customers, pendingPayments, pendingPackages, pendingComplaints, pendingEmergency, pendingPasswordResets, emergencyDebtTotal, walletTotal] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS total FROM customers WHERE role = 'customer'").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM payment_requests WHERE status = 'pending'").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM customer_packages WHERE status = 'pending'").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM complaints WHERE status = 'pending'").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM emergency_requests WHERE status = 'pending'").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM password_reset_requests WHERE status = 'pending'").first(),
          env.DB.prepare("SELECT COALESCE(SUM(amount_due_taka), 0) AS total FROM emergency_debts").first(),
          env.DB.prepare("SELECT COALESCE(SUM(balance_taka), 0) AS total FROM wallets").first(),
        ]);
        return json({
          ok: true,
          summary: {
            total_customers: Number(customers?.total || 0),
            pending_payments: Number(pendingPayments?.total || 0),
            pending_package_orders: Number(pendingPackages?.total || 0),
            pending_complaints: Number(pendingComplaints?.total || 0),
            pending_emergency_requests: Number(pendingEmergency?.total || 0),
            pending_password_resets: Number(pendingPasswordResets?.total || 0),
            emergency_debt_total_taka: Number(emergencyDebtTotal?.total || 0),
            wallet_balance_total_taka: Number(walletTotal?.total || 0),
          },
        }, 200, cors);
      }

      if (url.pathname === "/admin/customers" && request.method === "GET") {
        const admin = await getSessionCustomer(env.DB, request);
        if (!admin) return fail("unauthorized", 401, cors);
        if (admin.role !== "admin") return fail("forbidden", 403, cors);
        const search = (url.searchParams.get("q") || "").trim().slice(0, 80);
        const rawLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isInteger(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
        const result = await env.DB.prepare(
          "SELECT c.id, c.name, c.mobile, c.email, c.is_verified, c.mikrotik_username, c.created_at, COALESCE(w.balance_taka, 0) AS balance_taka FROM customers c LEFT JOIN wallets w ON w.customer_id = c.id WHERE c.role = 'customer' AND (? = '' OR c.name LIKE '%' || ? || '%' OR c.mobile LIKE '%' || ? || '%') ORDER BY c.id DESC LIMIT ?",
        ).bind(search, search, search, limit).all();
        return json({ ok: true, customers: result.results || [] }, 200, cors);
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
              "INSERT INTO emergency_debt_transactions (payment_id, customer_id, amount_taka) SELECT p.id, p.customer_id, MIN(d.amount_due_taka, p.amount_taka) FROM payment_requests p JOIN emergency_debts d ON d.customer_id = p.customer_id WHERE p.id = ? AND p.status = 'approved' AND d.amount_due_taka > 0 AND NOT EXISTS (SELECT 1 FROM emergency_debt_transactions WHERE payment_id = p.id)",
            ).bind(paymentId),
            env.DB.prepare(
              "UPDATE emergency_debts SET amount_due_taka = amount_due_taka - (SELECT amount_taka FROM emergency_debt_transactions WHERE payment_id = ?) , updated_at = CURRENT_TIMESTAMP WHERE customer_id = (SELECT customer_id FROM payment_requests WHERE id = ?) AND changes() = 1",
            ).bind(paymentId, paymentId),
            env.DB.prepare(
              "INSERT OR IGNORE INTO wallet_transactions (customer_id, type, amount_taka, status, reference) SELECT p.customer_id, 'recharge', p.amount_taka - COALESCE((SELECT amount_taka FROM emergency_debt_transactions WHERE payment_id = p.id), 0), 'success', 'payment:' || p.id FROM payment_requests p WHERE p.id = ? AND p.status = 'approved' AND p.amount_taka > COALESCE((SELECT amount_taka FROM emergency_debt_transactions WHERE payment_id = p.id), 0)",
            ).bind(paymentId),
            env.DB.prepare(
              "UPDATE wallets SET balance_taka = balance_taka + (SELECT p.amount_taka - COALESCE((SELECT amount_taka FROM emergency_debt_transactions WHERE payment_id = p.id), 0) FROM payment_requests p WHERE p.id = ?) WHERE customer_id = (SELECT customer_id FROM payment_requests WHERE id = ?) AND changes() = 1",
            ).bind(paymentId, paymentId),
            env.DB.prepare(
              "INSERT INTO admin_logs (admin_id, action, details) SELECT ?, 'payment_approved', 'payment_id=' || ? WHERE changes() = 1",
            ).bind(admin.id, paymentId),
          ]);
          const changed = Number(results?.[0]?.meta?.changes || 0);
          if (changed !== 1) return fail("payment_not_pending_or_not_found", 409, cors);
          const settlement = await env.DB.prepare(
            "SELECT p.amount_taka, COALESCE(t.amount_taka, 0) AS debt_paid_taka, p.amount_taka - COALESCE(t.amount_taka, 0) AS wallet_credited_taka FROM payment_requests p LEFT JOIN emergency_debt_transactions t ON t.payment_id = p.id WHERE p.id = ?",
          ).bind(paymentId).first();
          return json({ ok: true, payment_id: paymentId, status: "approved", debt_paid_taka: Number(settlement?.debt_paid_taka || 0), wallet_credited_taka: Number(settlement?.wallet_credited_taka || 0) }, 200, cors);
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
