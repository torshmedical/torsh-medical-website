import PostalMime from "postal-mime";

const CATEGORY_LABELS = Object.freeze({
  product: "Product or technical requirement",
  hospital: "Hospital or procurement enquiry",
  distribution: "Distributor or commercial enquiry",
  research: "Research collaboration",
  manufacturing: "Manufacturing or OEM/ODM",
  other: "Other"
});
const STATUSES = new Set(["new", "in-progress", "resolved"]);
const PUBLIC_ORIGINS = new Set(["https://torshmedical.com", "https://www.torshmedical.com"]);
const DEFAULT_MAILBOXES = Object.freeze([
  "victor@torshmedical.com",
  "krishna@torshmedical.com",
  "admin@torshmedical.com",
  "info@torshmedical.com"
]);
const FOLDERS = new Set(["inbox", "starred", "sent", "trash"]);
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_INBOUND_BYTES = 25 * 1024 * 1024;

function json(data, status = 200, origin = "") {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (PUBLIC_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n").slice(0, max) : "";
}

function configuredMailboxes(env) {
  const configured = String(env.MAILBOX_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return configured.length ? configured : [...DEFAULT_MAILBOXES];
}

function accessIdentity(request, env) {
  const email = clean(request.headers.get("Cf-Access-Authenticated-User-Email"), 160).toLowerCase();
  return configuredMailboxes(env).includes(email) ? email : "";
}

function authorisedAdmin(request, env) {
  const email = clean(request.headers.get("Cf-Access-Authenticated-User-Email"), 160).toLowerCase();
  const allowed = String(env.ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email));
}

function parseJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function messageRecord(row) {
  return {
    ...row,
    is_read: Boolean(row.is_read),
    is_starred: Boolean(row.is_starred),
    trashed: Boolean(row.trashed),
    has_attachments: Boolean(row.has_attachments),
    to: parseJson(row.to_json),
    cc: parseJson(row.cc_json),
    bcc: parseJson(row.bcc_json)
  };
}

function emailAddress(value) {
  if (typeof value === "string") return clean(value, 254).toLowerCase();
  return clean(value?.address, 254).toLowerCase();
}

function emailName(value) {
  return typeof value === "object" ? clean(value?.name, 160) : "";
}

function parsedAddresses(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map(emailAddress).filter(address => EMAIL_PATTERN.test(address));
}

function inputAddresses(value) {
  const list = Array.isArray(value) ? value : [];
  const addresses = list.map(item => clean(item, 254).toLowerCase()).filter(Boolean);
  if (addresses.some(address => !EMAIL_PATTERN.test(address))) throw new Error("One or more recipient addresses are invalid.");
  return [...new Set(addresses)];
}

function stripHtml(value) {
  return clean(String(value || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n"), 200000);
}

function previewText(value) {
  return clean(String(value || "").replace(/\s+/g, " "), 240);
}

function base64Bytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("An attachment could not be decoded.");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function safeFilename(value) {
  return clean(value, 180).replace(/[\\/:*?"<>|\x00-\x1f]/g, "-") || "attachment";
}

function storageKey(mailbox, messageId, filename) {
  return `mail/${mailbox}/${messageId}/${crypto.randomUUID()}-${safeFilename(filename)}`;
}

async function ipKey(request, salt) {
  const ip = request.headers.get("CF-Connecting-IP") || "unavailable";
  const bytes = new TextEncoder().encode(`${salt || "rate-limit"}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function rateLimited(request, env) {
  const key = await ipKey(request, env.RATE_LIMIT_SALT);
  const now = Date.now();
  const windowStart = new Date(now - 15 * 60 * 1000).toISOString();
  const row = await env.DB.prepare("SELECT window_start, request_count FROM rate_limits WHERE ip_hash = ?").bind(key).first();
  if (row && row.window_start > windowStart && row.request_count >= 5) return true;
  if (row && row.window_start > windowStart) {
    await env.DB.prepare("UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_hash = ?").bind(key).run();
  } else {
    await env.DB.prepare("INSERT INTO rate_limits (ip_hash, window_start, request_count) VALUES (?, ?, 1) ON CONFLICT(ip_hash) DO UPDATE SET window_start = excluded.window_start, request_count = 1")
      .bind(key, new Date(now).toISOString()).run();
  }
  if (Math.random() < 0.03) await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(windowStart).run();
  return false;
}

function validateEnquiry(input) {
  const data = {
    name: clean(input.name, 100),
    organisation: clean(input.organisation, 140),
    email: clean(input.email, 160).toLowerCase(),
    phone: clean(input.phone, 30),
    category: clean(input.category, 30),
    interest: clean(input.interest, 160),
    message: clean(input.message, 800),
    consent: input.consent === "yes",
    website: clean(input.website, 120)
  };
  if (data.website) return { bot: true, data };
  if (!data.name || !data.organisation || !data.email || !data.category || !data.message || !data.consent) return { error: "Please complete every required field." };
  if (!EMAIL_PATTERN.test(data.email)) return { error: "Enter a valid reply email address." };
  if (!CATEGORY_LABELS[data.category]) return { error: "Choose a valid enquiry category." };
  if (data.message.length < 20) return { error: "Please add a little more detail to your message." };
  return { data };
}

async function notifyBrevo(env, record) {
  if (!env.BREVO_API_KEY || !env.CONTACT_RECIPIENT || !env.BREVO_SENDER_EMAIL) return "not-configured";
  const text = [
    `New TORSH website enquiry ${record.reference}`,
    `Category: ${record.category_label}`,
    `Name: ${record.name}`,
    `Organisation: ${record.organisation}`,
    `Email: ${record.email}`,
    `Telephone: ${record.phone || "Not supplied"}`,
    `Interest: ${record.interest || "Not supplied"}`,
    "",
    record.message
  ].join("\n");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "TORSH Website", email: env.BREVO_SENDER_EMAIL },
      to: [{ email: env.CONTACT_RECIPIENT }],
      replyTo: { email: record.email, name: record.name },
      subject: `[${record.reference}] ${record.category_label}`,
      textContent: text
    })
  });
  return response.ok ? "sent" : `failed-${response.status}`;
}

async function createEnquiry(request, env, origin) {
  if (!PUBLIC_ORIGINS.has(origin)) return json({ error: "This form accepts requests only from the TORSH website." }, 403, origin);
  if ((Number(request.headers.get("Content-Length")) || 0) > 20000) return json({ error: "The request is too large." }, 413, origin);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid request." }, 400, origin); }
  const checked = validateEnquiry(input || {});
  if (checked.bot) return json({ reference: "received" }, 201, origin);
  if (checked.error) return json({ error: checked.error }, 400, origin);
  if (await rateLimited(request, env)) return json({ error: "Too many attempts. Please wait 15 minutes and try again." }, 429, origin);

  const createdAt = new Date().toISOString();
  const reference = `TMT-${createdAt.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const id = crypto.randomUUID();
  const record = { ...checked.data, id, reference, category_label: CATEGORY_LABELS[checked.data.category], created_at: createdAt };
  await env.DB.prepare(`INSERT INTO enquiries
    (id, reference, created_at, updated_at, status, name, organisation, email, phone, category, category_label, interest, message, notification_state)
    VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .bind(id, reference, createdAt, createdAt, record.name, record.organisation, record.email, record.phone, record.category, record.category_label, record.interest, record.message).run();

  let notification = "not-configured";
  try { notification = await notifyBrevo(env, record); } catch { notification = "failed-network"; }
  await env.DB.prepare("UPDATE enquiries SET notification_state = ? WHERE id = ?").bind(notification, id).run();
  return json({ reference }, 201, origin);
}

async function listEnquiries(request, env) {
  if (!authorisedAdmin(request, env)) return json({ error: "Not authorised." }, 403);
  const status = new URL(request.url).searchParams.get("status") || "all";
  if (status !== "all" && !STATUSES.has(status)) return json({ error: "Invalid status filter." }, 400);
  const query = status === "all"
    ? env.DB.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 200")
    : env.DB.prepare("SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status);
  const result = await query.all();
  return json({ items: result.results || [] });
}

async function updateEnquiry(request, env, id) {
  if (!authorisedAdmin(request, env)) return json({ error: "Not authorised." }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  if (!STATUSES.has(input.status)) return json({ error: "Invalid status." }, 400);
  const result = await env.DB.prepare("UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?")
    .bind(input.status, new Date().toISOString(), id).run();
  if (!result.meta?.changes) return json({ error: "Enquiry not found." }, 404);
  return json({ ok: true });
}

async function mailProfile(request, env) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Use an approved TORSH email address to sign in." }, 403);
  return json({ email: mailbox, mailbox });
}

function listWhere(folder) {
  if (folder === "sent") return "direction = 'outbound' AND trashed = 0";
  if (folder === "starred") return "is_starred = 1 AND trashed = 0";
  if (folder === "trash") return "trashed = 1";
  return "direction = 'inbound' AND trashed = 0";
}

async function listMail(request, env) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Not authorised." }, 403);
  const url = new URL(request.url);
  const folder = clean(url.searchParams.get("folder") || "inbox", 20).toLowerCase();
  const query = clean(url.searchParams.get("q") || "", 100);
  if (!FOLDERS.has(folder)) return json({ error: "Unknown mail folder." }, 400);
  const searchClause = query ? " AND (subject LIKE ? OR preview LIKE ? OR from_email LIKE ? OR from_name LIKE ?)" : "";
  const statement = `SELECT id, direction, message_at, from_name, from_email, to_json, subject, preview,
    is_read, is_starred, trashed, has_attachments
    FROM mail_messages WHERE mailbox = ? AND ${listWhere(folder)}${searchClause}
    ORDER BY message_at DESC LIMIT 200`;
  const prepared = env.DB.prepare(statement);
  const term = `%${query}%`;
  const result = query
    ? await prepared.bind(mailbox, term, term, term, term).all()
    : await prepared.bind(mailbox).all();
  const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_messages WHERE mailbox = ? AND direction = 'inbound' AND trashed = 0 AND is_read = 0")
    .bind(mailbox).first();
  const items = (result.results || []).map(row => ({
    ...messageRecord(row),
    correspondent: row.direction === "outbound" ? (parseJson(row.to_json)[0] || "No recipient") : (row.from_name || row.from_email)
  }));
  return json({ items, unread: Number(unread?.count || 0) });
}

async function getMail(request, env, id) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Not authorised." }, 403);
  const row = await env.DB.prepare("SELECT * FROM mail_messages WHERE id = ? AND mailbox = ?").bind(id, mailbox).first();
  if (!row) return json({ error: "Message not found." }, 404);
  const attachments = await env.DB.prepare("SELECT id, filename, content_type, size FROM mail_attachments WHERE message_id_fk = ? AND mailbox = ? ORDER BY filename")
    .bind(id, mailbox).all();
  return json({ ...messageRecord(row), attachments: attachments.results || [] });
}

async function updateMail(request, env, id) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Not authorised." }, 403);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const updates = [];
  const values = [];
  for (const [key, column] of [["read", "is_read"], ["starred", "is_starred"], ["trashed", "trashed"]]) {
    if (typeof input[key] === "boolean") {
      updates.push(`${column} = ?`);
      values.push(input[key] ? 1 : 0);
    }
  }
  if (!updates.length) return json({ error: "No supported changes were supplied." }, 400);
  const result = await env.DB.prepare(`UPDATE mail_messages SET ${updates.join(", ")} WHERE id = ? AND mailbox = ?`)
    .bind(...values, id, mailbox).run();
  if (!result.meta?.changes) return json({ error: "Message not found." }, 404);
  return json({ ok: true });
}

async function getAttachment(request, env, messageId, attachmentId) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Not authorised." }, 403);
  const row = await env.DB.prepare(`SELECT a.storage_key, a.filename, a.content_type
    FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id_fk
    WHERE a.id = ? AND a.message_id_fk = ? AND a.mailbox = ? AND m.mailbox = ?`)
    .bind(attachmentId, messageId, mailbox, mailbox).first();
  if (!row) return json({ error: "Attachment not found." }, 404);
  const object = await env.MAIL_STORE.get(row.storage_key, { type: "stream" });
  if (!object) return json({ error: "Attachment content is unavailable." }, 404);
  return new Response(object, { headers: {
    "Content-Type": row.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeFilename(row.filename).replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  }});
}

async function archiveOutbound(env, mailbox, input, sentId, attachments) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO mail_messages
    (id, mailbox, direction, message_id, in_reply_to, references_header, message_at, created_at,
      from_name, from_email, to_json, cc_json, bcc_json, subject, text_body, preview,
      is_read, is_starred, trashed, has_attachments, raw_key)
    VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, 'TORSH Medical Technologies', ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?, '')`)
    .bind(id, mailbox, sentId, input.inReplyTo, input.references, now, now, mailbox,
      JSON.stringify(input.to), JSON.stringify(input.cc), JSON.stringify(input.bcc), input.subject,
      input.text, previewText(input.text), attachments.length ? 1 : 0).run();
  for (const attachment of attachments) {
    const attachmentId = crypto.randomUUID();
    const key = storageKey(mailbox, id, attachment.filename);
    await env.MAIL_STORE.put(key, attachment.bytes);
    await env.DB.prepare(`INSERT INTO mail_attachments
      (id, message_id_fk, mailbox, storage_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(attachmentId, id, mailbox, key, attachment.filename, attachment.type, attachment.bytes.byteLength).run();
  }
}

async function sendMail(request, env) {
  const mailbox = accessIdentity(request, env);
  if (!mailbox) return json({ error: "Not authorised." }, 403);
  if ((Number(request.headers.get("Content-Length")) || 0) > 6 * 1024 * 1024) return json({ error: "The message is too large." }, 413);
  let raw;
  try { raw = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  let to;
  let cc;
  let bcc;
  try {
    to = inputAddresses(raw.to);
    cc = inputAddresses(raw.cc);
    bcc = inputAddresses(raw.bcc);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!to.length) return json({ error: "Add at least one recipient." }, 400);
  if (to.length + cc.length + bcc.length > 50) return json({ error: "A message can have at most 50 recipients." }, 400);
  const subject = clean(raw.subject, 300) || "(No subject)";
  const text = clean(raw.text, 200000);
  if (!text) return json({ error: "Write a message before sending." }, 400);
  const sourceAttachments = Array.isArray(raw.attachments) ? raw.attachments.slice(0, 32) : [];
  const attachments = [];
  let attachmentBytes = 0;
  try {
    for (const item of sourceAttachments) {
      const bytes = base64Bytes(item.content);
      attachmentBytes += bytes.byteLength;
      if (attachmentBytes > MAX_ATTACHMENT_BYTES) throw new Error("Attachments must total no more than 4 MB.");
      attachments.push({
        filename: safeFilename(item.filename),
        type: clean(item.type, 120) || "application/octet-stream",
        bytes,
        content: item.content
      });
    }
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  let inReplyTo = "";
  let references = "";
  const replyId = clean(raw.in_reply_to_id, 80);
  if (replyId) {
    const original = await env.DB.prepare("SELECT message_id, references_header FROM mail_messages WHERE id = ? AND mailbox = ?")
      .bind(replyId, mailbox).first();
    if (original) {
      inReplyTo = clean(original.message_id, 998);
      references = clean(`${original.references_header || ""} ${original.message_id || ""}`, 4000);
    }
  }
  if (!env.BREVO_API_KEY) return json({ error: "Outbound mail has not been connected yet." }, 503);
  const outbound = {
    sender: { email: mailbox, name: "TORSH Medical Technologies" },
    to: to.map(email => ({ email })),
    subject,
    textContent: text,
    replyTo: { email: mailbox, name: "TORSH Medical Technologies" }
  };
  if (cc.length) outbound.cc = cc.map(email => ({ email }));
  if (bcc.length) outbound.bcc = bcc.map(email => ({ email }));
  if (attachments.length) outbound.attachment = attachments.map(item => ({ name: item.filename, content: item.content }));
  if (inReplyTo) outbound.headers = { "In-Reply-To": inReplyTo, References: references || inReplyTo };
  let result;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": env.BREVO_API_KEY },
      body: JSON.stringify(outbound)
    });
    if (!response.ok) throw new Error(`Brevo returned ${response.status}`);
    result = await response.json();
  } catch (error) {
    console.error("Email send failed", error?.code || "", error?.message || error);
    return json({ error: "The email service could not send this message. Please try again." }, 502);
  }

  let archived = true;
  try {
    await archiveOutbound(env, mailbox, { to, cc, bcc, subject, text, inReplyTo, references }, clean(result?.messageId, 998) || crypto.randomUUID(), attachments);
  } catch (error) {
    archived = false;
    console.error("Sent mail archive failed", error);
  }
  return json({ ok: true, message_id: result?.messageId || "", archived }, 201);
}

async function archiveInbound(message, env) {
  const mailbox = clean(message.to, 254).toLowerCase();
  if (!configuredMailboxes(env).includes(mailbox)) {
    message.setReject("This TORSH mailbox is not available.");
    return;
  }
  const backup = clean(env.MAIL_FORWARD_ADDRESS, 254).toLowerCase();
  if (Number(message.rawSize || 0) > MAX_INBOUND_BYTES) {
    if (backup && message.canBeForwarded !== false) await message.forward(backup, new Headers({ "X-TORSH-Original-Recipient": mailbox }));
    else message.setReject("Message exceeds the 25 MB mailbox limit.");
    return;
  }

  const raw = await new Response(message.raw).arrayBuffer();
  let parsed;
  try { parsed = await PostalMime.parse(raw); } catch (error) {
    console.error("MIME parsing failed", error);
    if (backup && message.canBeForwarded !== false) await message.forward(backup, new Headers({ "X-TORSH-Original-Recipient": mailbox }));
    else message.setReject("The message format could not be processed.");
    return;
  }

  const headerMessageId = clean(parsed.messageId || message.headers.get("message-id"), 998);
  const externalId = headerMessageId || `<${crypto.randomUUID()}@inbound.torshmedical.com>`;
  let archiveError = null;
  try {
    const existing = await env.DB.prepare("SELECT id FROM mail_messages WHERE mailbox = ? AND message_id = ?").bind(mailbox, externalId).first();
    if (!existing) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const parsedDate = new Date(parsed.date || message.headers.get("date") || now);
    const messageAt = Number.isNaN(parsedDate.getTime()) ? now : parsedDate.toISOString();
    const fromEmail = emailAddress(parsed.from) || clean(message.from, 254).toLowerCase();
    const textBody = clean(parsed.text, 200000) || stripHtml(parsed.html);
    const rawKey = `mail/${mailbox}/${id}/original.eml`;
    const parsedAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    await env.MAIL_STORE.put(rawKey, raw);
    await env.DB.prepare(`INSERT INTO mail_messages
      (id, mailbox, direction, message_id, in_reply_to, references_header, message_at, created_at,
        from_name, from_email, to_json, cc_json, bcc_json, subject, text_body, preview,
        is_read, is_starred, trashed, has_attachments, raw_key)
      VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 0, 0, 0, ?, ?)`)
      .bind(id, mailbox, externalId, clean(parsed.inReplyTo, 998), clean(parsed.references, 4000), messageAt, now,
        emailName(parsed.from), fromEmail, JSON.stringify(parsedAddresses(parsed.to)), JSON.stringify(parsedAddresses(parsed.cc)),
        clean(parsed.subject, 300) || "(No subject)", textBody, previewText(textBody), parsedAttachments.length ? 1 : 0, rawKey).run();
      for (const attachment of parsedAttachments) {
        const attachmentId = crypto.randomUUID();
        const filename = safeFilename(attachment.filename || attachment.contentId || "attachment");
        const contentType = clean(attachment.mimeType, 120) || "application/octet-stream";
        const bytes = attachment.content instanceof Uint8Array ? attachment.content : new Uint8Array(attachment.content || []);
        const key = storageKey(mailbox, id, filename);
        await env.MAIL_STORE.put(key, bytes);
        await env.DB.prepare(`INSERT INTO mail_attachments
          (id, message_id_fk, mailbox, storage_key, filename, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(attachmentId, id, mailbox, key, filename, contentType, bytes.byteLength).run();
      }
    }
  } catch (error) {
    archiveError = error;
    console.error("Inbound mail archive failed", error);
  }

  if (backup && message.canBeForwarded !== false) {
    try { await message.forward(backup, new Headers({ "X-TORSH-Original-Recipient": mailbox })); }
    catch (error) { console.error("Backup forwarding failed", error); }
  } else if (archiveError) {
    throw archiveError;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (!PUBLIC_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
      }});
    }
    if (url.pathname === "/api/enquiries" && request.method === "POST") return createEnquiry(request, env, origin);
    if (url.pathname === "/api/admin/enquiries" && request.method === "GET") return listEnquiries(request, env);
    const enquiryMatch = url.pathname.match(/^\/api\/admin\/enquiries\/([0-9a-f-]{36})$/i);
    if (enquiryMatch && request.method === "PATCH") return updateEnquiry(request, env, enquiryMatch[1]);

    if (url.pathname === "/api/mail/profile" && request.method === "GET") return mailProfile(request, env);
    if (url.pathname === "/api/mail/messages" && request.method === "GET") return listMail(request, env);
    if (url.pathname === "/api/mail/send" && request.method === "POST") return sendMail(request, env);
    const attachmentMatch = url.pathname.match(/^\/api\/mail\/messages\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})$/i);
    if (attachmentMatch && request.method === "GET") return getAttachment(request, env, attachmentMatch[1], attachmentMatch[2]);
    const messageMatch = url.pathname.match(/^\/api\/mail\/messages\/([0-9a-f-]{36})$/i);
    if (messageMatch && request.method === "GET") return getMail(request, env, messageMatch[1]);
    if (messageMatch && request.method === "PATCH") return updateMail(request, env, messageMatch[1]);
    return json({ error: "Not found." }, 404, origin);
  },

  async email(message, env) {
    await archiveInbound(message, env);
  }
};
