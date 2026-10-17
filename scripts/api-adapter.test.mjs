import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

// Test the HTTP adapter without a browser or real staff credentials.
const savedFetch = globalThis.fetch;
const savedChannel = globalThis.BroadcastChannel;
globalThis.BroadcastChannel = undefined;
const { api, apiResponse, auth, privateImage, ApiError } =
  await import("../src/api.ts");
globalThis.BroadcastChannel = savedChannel;
const session = {
  accessToken: "test-access",
  staff: {
    id: "staff-test",
    name: "Test",
    email: "test@example.test",
    role: "MODERATOR",
  },
  expiresInSeconds: 900,
};
const reply = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
afterEach(() => {
  globalThis.fetch = savedFetch;
  auth.set(null);
});

test("existing catalog calls keep numeric If-Match and decoded response", async () => {
  auth.set(session);
  globalThis.fetch = async (path, init) => {
    assert.equal(path, "/api/operations/v1/categories/category-id");
    assert.equal(init.headers.get("If-Match"), '"7"');
    assert.equal(init.headers.get("Authorization"), "Bearer test-access");
    assert.equal(init.headers.get("X-Admin-Client"), "web");
    assert.equal(init.headers.get("Idempotency-Key"), "catalog-test-key");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(JSON.parse(init.body), { title: "Test category" });
    return reply({ version: 8 });
  };
  assert.deepEqual(
    await api(
      "/categories/category-id",
      "PUT",
      { title: "Test category" },
      7,
      "catalog-test-key",
    ),
    { version: 8 },
  );
});

test("review uses exact server ETag and exposes updated ETag", async () => {
  auth.set(session);
  const tag = '"club-submission-test-id-v2"';
  globalThis.fetch = async (path, init) => {
    assert.equal(path, "/api/operations/v1/club-submissions/test-id/review");
    assert.equal(init.headers.get("If-Match"), tag);
    assert.deepEqual(JSON.parse(init.body), {
      checkedSections: ["club"],
      feedback: [],
    });
    return reply({ revision: 3 }, 200, {
      ETag: '"club-submission-test-id-v3"',
    });
  };
  assert.deepEqual(
    await apiResponse(
      "/club-submissions/test-id/review",
      "PUT",
      { checkedSections: ["club"], feedback: [] },
      tag,
      "review-test-key",
    ),
    { data: { revision: 3 }, etag: '"club-submission-test-id-v3"' },
  );
});

test("401 refresh preserves decision body, original If-Match and idempotency key", async () => {
  auth.set(session);
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({
      path,
      auth: init.headers.get("Authorization"),
      key: init.headers.get("Idempotency-Key"),
      tag: init.headers.get("If-Match"),
      body: init.body,
    });
    if (path.endsWith("/auth/refresh"))
      return reply({ ...session, accessToken: "renewed-access" });
    if (init.headers.get("Authorization") === "Bearer test-access")
      return reply({ code: "UNAUTHORIZED" }, 401);
    return reply({ state: "APPROVED" });
  };
  await api(
    "/club-submissions/test-id/decision",
    "POST",
    { decision: "APPROVE", feedback: [] },
    '"club-submission-test-id-v3"',
    "stable-decision-key",
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[2].auth, "Bearer renewed-access");
  for (const key of ["key", "tag", "body"])
    assert.equal(calls[0][key], calls[2][key]);
});

test("private moderation image requires bearer and a supported image content type", async () => {
  auth.set(session);
  globalThis.fetch = async (_path, init) => {
    assert.equal(init.headers.get("Authorization"), "Bearer test-access");
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/png" },
    });
  };
  const url = await privateImage("/club-submissions/test-id/media/photo-id");
  assert(url.startsWith("blob:"));
  URL.revokeObjectURL(url);
  globalThis.fetch = async () =>
    new Response("<html>login</html>", {
      headers: { "Content-Type": "text/html" },
    });
  await assert.rejects(
    privateImage("/club-submissions/test-id/media/photo-id"),
  );
});

test("version conflict retains status and server code for reconciliation UI", async () => {
  auth.set(session);
  globalThis.fetch = async () =>
    reply({ code: "SUBMISSION_VERSION_CONFLICT" }, 412);
  await assert.rejects(
    api(
      "/club-submissions/test-id/review",
      "PUT",
      { checkedSections: [], feedback: [] },
      '"club-submission-test-id-v1"',
    ),
    (e) =>
      e instanceof ApiError &&
      e.status === 412 &&
      e.code === "SUBMISSION_VERSION_CONFLICT" &&
      !e.message.includes("другой сотрудник") && e.message.includes("Состояние заявки изменилось"),
  );
});
