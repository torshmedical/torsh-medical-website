import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const env = {
  MAILBOX_EMAILS: "victor@torshmedical.com,krishna@torshmedical.com,admin@torshmedical.com,info@torshmedical.com",
  ADMIN_EMAILS: "victor@torshmedical.com,krishna@torshmedical.com,admin@torshmedical.com,info@torshmedical.com"
};

class MockKV {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}

function request(path, email = "", options = {}) {
  const headers = new Headers(options.headers || {});
  if (email) headers.set("Cf-Access-Authenticated-User-Email", email);
  return new Request(`https://torshmedical.com${path}`, { ...options, headers });
}

test("mail profile rejects an unauthenticated request", async () => {
  const response = await worker.fetch(request("/api/mail/profile"), env);
  assert.equal(response.status, 403);
});

test("mail profile accepts only an exact approved mailbox", async () => {
  const response = await worker.fetch(request("/api/mail/profile", "Victor@TORSHmedical.com"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    email: "victor@torshmedical.com",
    mailbox: "victor@torshmedical.com"
  });
  const denied = await worker.fetch(request("/api/mail/profile", "sales@torshmedical.com"), env);
  assert.equal(denied.status, 403);
});

test("public enquiry endpoint rejects an unapproved origin before storage", async () => {
  const response = await worker.fetch(request("/api/enquiries", "", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" },
    body: "{}"
  }), env);
  assert.equal(response.status, 403);
});

test("mail send validates recipients before using bindings", async () => {
  const response = await worker.fetch(request("/api/mail/send", "victor@torshmedical.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: ["not-an-email"], subject: "Test", text: "Message", attachments: [] })
  }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /recipient/i);
});

test("email handler rejects recipient addresses outside the mailbox allowlist", async () => {
  let reason = "";
  await worker.email({
    to: "unknown@torshmedical.com",
    setReject(value) { reason = value; }
  }, env);
  assert.match(reason, /not available/i);
});

test("one-time code creates and clears a secure mailbox session", async () => {
  const authEnv = {
    ...env,
    MAIL_STORE: new MockKV(),
    RATE_LIMIT_SALT: "test-only-salt",
    BREVO_API_KEY: "test-key",
    BREVO_SENDER_EMAIL: "info@torshmedical.com"
  };
  const originalFetch = globalThis.fetch;
  let deliveredCode = "";
  globalThis.fetch = async (_url, options) => {
    const outbound = JSON.parse(options.body);
    deliveredCode = outbound.subject.match(/^\d{6}/)?.[0] || "";
    return new Response(JSON.stringify({ messageId: "test-message" }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const sent = await worker.fetch(request("/api/auth/request-code", "", {
      method: "POST",
      headers: { Origin: "https://torshmedical.com", "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.8" },
      body: JSON.stringify({ email: "Victor@TORSHmedical.com" })
    }), authEnv);
    assert.equal(sent.status, 200);
    assert.match(deliveredCode, /^\d{6}$/);

    const verified = await worker.fetch(request("/api/auth/verify-code", "", {
      method: "POST",
      headers: { Origin: "https://torshmedical.com", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "victor@torshmedical.com", code: deliveredCode })
    }), authEnv);
    assert.equal(verified.status, 200);
    const cookie = verified.headers.get("Set-Cookie");
    assert.match(cookie, /^torsh_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);

    const sessionCookie = cookie.split(";")[0];
    const profile = await worker.fetch(request("/api/auth/profile", "", { headers: { Cookie: sessionCookie } }), authEnv);
    assert.equal(profile.status, 200);
    assert.deepEqual(await profile.json(), { email: "victor@torshmedical.com" });

    const mailbox = await worker.fetch(request("/api/mail/profile", "", { headers: { Cookie: sessionCookie } }), authEnv);
    assert.equal(mailbox.status, 200);

    const loggedOut = await worker.fetch(request("/api/auth/logout", "", {
      method: "POST",
      headers: { Origin: "https://torshmedical.com", Cookie: sessionCookie }
    }), authEnv);
    assert.equal(loggedOut.status, 200);
    assert.match(loggedOut.headers.get("Set-Cookie"), /Max-Age=0/);

    const afterLogout = await worker.fetch(request("/api/auth/profile", "", { headers: { Cookie: sessionCookie } }), authEnv);
    assert.equal(afterLogout.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one-time code endpoints reject cross-site requests", async () => {
  const response = await worker.fetch(request("/api/auth/request-code", "", {
    method: "POST",
    headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "victor@torshmedical.com" })
  }), { ...env, MAIL_STORE: new MockKV() });
  assert.equal(response.status, 403);
});
