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
