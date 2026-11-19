import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const PORTAL_ORIGIN = "https://mahimultranet-code.github.io";

test("health reports a connected staging database", async () => {
  const env = {
    DB: {
      prepare(sql) {
        assert.equal(sql, "SELECT 1 AS healthy");
        return { first: async () => ({ healthy: 1 }) };
      },
    },
  };
  const response = await worker.fetch(
    new Request("https://staging.example/health", { method: "GET", headers: { Origin: PORTAL_ORIGIN } }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), PORTAL_ORIGIN);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "mahim-ultranet-api-v2-staging",
    database: "connected",
  });
});

test("health fails closed when the D1 binding is missing", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/health", { method: "GET" }),
    {},
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).database, "not_configured");
});

test("portal preflight is allowed only for the configured portal origin", async () => {
  const allowed = await worker.fetch(
    new Request("https://staging.example/auth/login", {
      method: "OPTIONS",
      headers: { Origin: PORTAL_ORIGIN, "Access-Control-Request-Method": "POST" },
    }),
    {},
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), PORTAL_ORIGIN);

  const denied = await worker.fetch(
    new Request("https://staging.example/auth/login", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example", "Access-Control-Request-Method": "POST" },
    }),
    {},
  );
  assert.equal(denied.status, 403);
});

test("authenticated API routes reject an untrusted browser origin", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/auth/me", {
      method: "GET",
      headers: { Origin: "https://untrusted.example" },
    }),
    { DB: {} },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "origin_not_allowed");
});


function routerDb({ enrollmentAttempts = 1, router = null } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (sql.includes("SELECT attempts FROM rate_limits")) return { attempts: enrollmentAttempts };
              if (sql.includes("SELECT id, router_key FROM routers")) return router;
              return null;
            },
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

test("router poll requires a valid enrolled router token", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/router/poll", { method: "GET" }),
    { DB: routerDb() },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("router job acknowledgement requires a valid enrolled router token", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/router/jobs/123/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    }),
    { DB: routerDb() },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("router enrollment fails closed when its secret is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/router/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10" },
      body: JSON.stringify({ router_key: "lab-router-01", router_name: "Lab Router" }),
    }),
    { DB: routerDb(), ROUTER_ENROLLMENT_SECRET: "" },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "router_enrollment_unavailable");
});

test("router enrollment rate limit blocks excessive attempts", async () => {
  const response = await worker.fetch(
    new Request("https://staging.example/router/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.11" },
      body: JSON.stringify({ router_key: "lab-router-01", router_name: "Lab Router" }),
    }),
    { DB: routerDb({ enrollmentAttempts: 6 }), ROUTER_ENROLLMENT_SECRET: "x".repeat(40) },
  );
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, "too_many_attempts");
});


test("admin cannot manually confirm emergency activation or create debt", async () => {
  let batchCalled = false;
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (sql.includes("FROM sessions s JOIN customers c")) {
                return { id: 7, name: "Admin", mobile: "01900000000", role: "admin", is_verified: 1 };
              }
              return null;
            },
          };
        },
      };
    },
    batch() {
      batchCalled = true;
      throw new Error("manual activation must not write to the database");
    },
  };
  const response = await worker.fetch(
    new Request("https://staging.example/admin/emergency/42/activated", {
      method: "POST",
      headers: {
        Origin: PORTAL_ORIGIN,
        Cookie: "__Host-ultranet_session=test-session-token",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    { DB: db },
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "router_confirmation_required");
  assert.equal(batchCalled, false);
});
