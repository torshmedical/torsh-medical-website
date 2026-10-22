#!/usr/bin/env node
/* Render every public page in Chromium across the supported breakpoints.
 * Optional dependency: Playwright. Run with: node tools/browser_qa.cjs
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PREVIEWS = path.resolve(ROOT, "..", "previews");
const WIDTHS = [320, 390, 620, 768, 1024, 1440, 1920];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json; charset=utf-8" };

function htmlFiles() {
  const folders = ["", "products", "solutions", "insights"];
  return folders.flatMap(folder => fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".html"))
    .map(entry => path.posix.join(folder, entry.name))).sort();
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function server() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/enquiries" && request.method === "POST") {
      let body = "";
      request.on("data", chunk => { body += chunk; });
      request.on("end", () => {
        const data = JSON.parse(body || "{}");
        if (!data.name || !data.email || !data.consent) return sendJson(response, { error: "Invalid QA request" }, 400);
        sendJson(response, { reference: "TMT-QA-000001" }, 201);
      });
      return;
    }
    if (url.pathname === "/api/admin/enquiries" && request.method === "GET") {
      return sendJson(response, { items: [{ id: "11111111-1111-4111-8111-111111111111", reference: "TMT-QA-000001", created_at: "2026-10-21T05:30:00.000Z", status: "new", category: "product", category_label: "Product or technical requirement", name: "QA Visitor", organisation: "QA Hospital", email: "qa@example.invalid", phone: "", interest: "Flexible ureteroscope", message: "This is a safe browser-QA enquiry record." }] });
    }
    if (/^\/api\/admin\/enquiries\/[0-9a-f-]{36}$/i.test(url.pathname) && request.method === "PATCH") return sendJson(response, { ok: true });
    if (url.pathname === "/api/auth/profile" && request.method === "GET") return sendJson(response, { email: "" });
    if (url.pathname === "/api/mail/profile" && request.method === "GET") {
      return sendJson(response, { email: "victor@torshmedical.com", mailbox: "victor@torshmedical.com" });
    }
    if (url.pathname === "/api/mail/messages" && request.method === "GET") {
      const folder = url.searchParams.get("folder") || "inbox";
      const outbound = folder === "sent";
      return sendJson(response, { unread: outbound ? 0 : 1, items: [{
        id: "22222222-2222-4222-8222-222222222222",
        direction: outbound ? "outbound" : "inbound",
        message_at: "2026-10-21T06:30:00.000Z",
        from_name: outbound ? "TORSH Medical Technologies" : "Procurement Office",
        from_email: outbound ? "victor@torshmedical.com" : "procurement@example.invalid",
        to: outbound ? ["buyer@example.invalid"] : ["victor@torshmedical.com"],
        correspondent: outbound ? "buyer@example.invalid" : "Procurement Office",
        subject: "Product information request",
        preview: "Please share the available product-family information for our review.",
        is_read: false,
        is_starred: false,
        trashed: folder === "trash",
        has_attachments: true
      }] });
    }
    if (url.pathname === "/api/mail/messages/22222222-2222-4222-8222-222222222222" && request.method === "GET") {
      return sendJson(response, {
        id: "22222222-2222-4222-8222-222222222222", direction: "inbound", message_at: "2026-10-21T06:30:00.000Z",
        from_name: "Procurement Office", from_email: "procurement@example.invalid", to: ["victor@torshmedical.com"], cc: [], bcc: [],
        subject: "Product information request", text_body: "Hello TORSH,\n\nPlease share the available product-family information for our review.\n\nRegards,\nProcurement Office",
        is_read: false, is_starred: false, trashed: false,
        attachments: [{ id: "33333333-3333-4333-8333-333333333333", filename: "requirements.pdf", content_type: "application/pdf", size: 16384 }]
      });
    }
    if (url.pathname === "/api/mail/messages/22222222-2222-4222-8222-222222222222" && request.method === "PATCH") return sendJson(response, { ok: true });
    if (url.pathname === "/api/mail/send" && request.method === "POST") return sendJson(response, { ok: true, message_id: "qa-message", archived: true }, 201);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = path.resolve(ROOT, `.${pathname}`);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404); response.end("Not found"); return;
    }
    response.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(target).pipe(response);
  });
}

(async () => {
  fs.mkdirSync(PREVIEWS, { recursive: true });
  const pages = htmlFiles();
  const report = { method: "Chromium against a local HTTP server with mocked same-origin contact, admin and mail API responses.", widths: WIDTHS, pages, layouts: [], interactions: {}, issues: [], runtime_errors: [] };
  const app = server();
  await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BINARY || chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => report.runtime_errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") report.runtime_errors.push(message.text()); });

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const file of pages) {
      await page.goto(`${origin}/${file}`, { waitUntil: "load" });
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        h1: document.querySelectorAll("main h1").length,
        missingImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
        emptyIcons: [...document.querySelectorAll("svg[data-torsh-icon]")].filter(icon => !icon.children.length).length,
        overflow: [...document.querySelectorAll("main *,.header-inner,.site-footer *")].filter(element => {
          if (element.closest("svg,dialog,[hidden],.form-honeypot,.insight-filters")) return false;
          const style = getComputedStyle(element), rect = element.getBoundingClientRect();
          return style.display !== "none" && rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
        }).slice(0, 6).map(element => `${element.tagName}.${element.className}`)
      }));
      report.layouts.push({ page: file, viewport: width, ...metrics });
      if (metrics.scroll > width + 1 || metrics.h1 !== 1 || metrics.missingImages || metrics.emptyIcons || metrics.overflow.length) report.issues.push({ page: file, width, metrics });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/index.html`, { waitUntil: "load" });
  await page.locator("[data-search-open]").click();
  await page.locator("#site-search-input").fill("ureteral");
  if ((await page.locator('[data-search-item]:not([hidden]) a').count()) < 1) throw new Error("Search result was not visible");
  await page.keyboard.press("Escape");
  report.interactions.search_filter_and_escape = "pass";

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-menu-toggle]").click();
  if (!(await page.locator("#primary-navigation").isVisible())) throw new Error("Mobile menu did not open");
  await page.keyboard.press("Escape");
  report.interactions.mobile_menu_and_escape = "pass";

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/contact.html?interest=single-use-flexible-ureteroscopes`, { waitUntil: "load" });
  if ((await page.locator('a[href="mailto:info@torshmedical.com"]').count()) !== 1) throw new Error("Contact email missing");
  if ((await page.locator('a[href="tel:8800133070"]').count()) !== 1) throw new Error("Contact phone missing");
  if ((await page.locator('[name="interest"]').inputValue()) !== "Single Use Flexible Ureteroscopes") throw new Error("Interest prefill failed");
  await page.locator('[name="name"]').fill("QA Visitor");
  await page.locator('[name="organisation"]').fill("QA Hospital");
  await page.locator('[name="email"]').fill("qa@example.invalid");
  await page.locator('[name="message"]').fill("This is a safe browser-QA enquiry submission.");
  await page.locator('[name="consent"]').check();
  await page.locator('[data-enquiry-form] button[type="submit"]').click();
  await page.locator('[data-form-status][data-state="success"]').waitFor();
  report.interactions.contact_prefill_validation_and_mock_submission = "pass";

  await page.goto(`${origin}/admin.html`, { waitUntil: "load" });
  await page.locator(".admin-card").waitFor();
  await page.locator(".admin-card__actions button").click();
  await page.locator(".admin-card").waitFor();
  report.interactions.admin_load_and_mock_status_update = "pass";

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/mail.html`, { waitUntil: "load" });
  await page.locator(".mail-row").waitFor();
  await page.locator(".mail-row").click();
  await page.locator(".mail-reader__body").waitFor();
  if (!(await page.locator(".mail-reader__body").textContent()).includes("Hello TORSH")) throw new Error("Mail reader content did not load");
  await page.locator("[data-compose-open]").click();
  await page.locator('[name="to"]').fill("buyer@example.invalid");
  await page.locator('[name="subject"]').fill("QA reply");
  await page.locator('[name="text"]').fill("This is a safe mocked mail portal test.");
  await page.locator('[data-compose-form] button[type="submit"]').click();
  await page.locator('[data-compose-state][data-state="success"]').waitFor();
  report.interactions.mail_load_read_and_mock_send = "pass";

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/index.html`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(PREVIEWS, "homepage-desktop.png"), fullPage: true });
  await page.goto(`${origin}/contact.html`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(PREVIEWS, "contact-desktop.png"), fullPage: true });
  await page.goto(`${origin}/login.html`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(PREVIEWS, "login-desktop.png"), fullPage: true });
  await page.goto(`${origin}/mail.html`, { waitUntil: "load" });
  await page.locator(".mail-row").waitFor();
  await page.screenshot({ path: path.join(PREVIEWS, "mail-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/contact.html`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(PREVIEWS, "contact-mobile.png"), fullPage: true });
  await page.goto(`${origin}/login.html`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(PREVIEWS, "login-mobile.png"), fullPage: true });
  await page.goto(`${origin}/mail.html`, { waitUntil: "load" });
  await page.locator(".mail-row").waitFor();
  await page.locator("[data-mail-menu]").click();
  if (!(await page.locator("[data-mail-sidebar]").isVisible())) throw new Error("Mail sidebar did not open on mobile");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(PREVIEWS, "mail-mobile.png"), fullPage: true });

  await browser.close();
  await new Promise(resolve => app.close(resolve));
  report.layout_count = report.layouts.length;
  if (report.runtime_errors.length) report.issues.push({ runtime_errors: report.runtime_errors });
  report.result = report.issues.length ? "NEEDS FIXES" : "PASS";
  fs.writeFileSync(path.join(ROOT, "docs", "qa-results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ result: report.result, layout_count: report.layout_count, interactions: report.interactions, issues: report.issues }, null, 2));
  process.exitCode = report.result === "PASS" ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
