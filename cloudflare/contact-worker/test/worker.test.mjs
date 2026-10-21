import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const env = {
  MAILBOX_EMAILS: "victor@torshmedical.com,krishna@torshmedical.com,admin@torshmedical.com,info@torshmedical.com",
  ADMIN_EMAILS: "victor@torshmedical.com,krishna@torshmedical.com,admin@torshmedical.com,info@torshmedical.com"
};

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
