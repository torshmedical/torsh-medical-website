# QA report — TORSH website v5.0

## Automated coverage

- Source build: **25 generated pages** from one content file.
- Static checks: **1,227 local references**, 33 icon definitions and 38 SVG files.
- Browser layout: **25 pages × 7 viewport widths = 175 checks** at 320, 390, 620, 768, 1024, 1440 and 1920 pixels.
- No horizontal document overflow, missing images, empty icons, duplicate main headings or JavaScript runtime errors.
- Search filtering and Escape dismissal passed.
- Mobile menu opening and Escape dismissal passed.
- Contact query-string prefill, native validation, character count and a mocked same-origin successful submission passed.
- Admin request loading and a mocked status update passed.

The browser test runs against a local HTTP server. It mocks the Cloudflare endpoints so it never sends a real enquiry or changes production data. Machine-readable results are in `docs/qa-results.json`.

## Visual review

The desktop and mobile homepage and contact screenshots were reviewed after the automated run. The contact form collapses to one column, maintains readable labels and keeps the primary action full-width on small screens. The homepage hero uses the new high-resolution conceptual endoscope image and retains the on-page disclosure that it is not a released product.

## Backend and security review

- Public form input is length-limited and validated again at the Worker.
- A hidden honeypot and a 15-minute hashed-IP rate limit reduce simple automated abuse.
- No Cloudflare, D1 or Brevo secret is present in public code.
- Admin DOM nodes are built with `textContent`; submitted content is not injected as HTML.
- The Worker requires the Cloudflare Access authenticated-email header and an explicit administrator allowlist.
- `workers_dev` is disabled so the custom-domain Access policy cannot be bypassed through a public Worker hostname.
- The public form origin allowlist is limited to `torshmedical.com` and `www.torshmedical.com`.

## Publication gate

Do not enable the production form until the D1 database, Worker route, Cloudflare Access application and at least one approved administrator email are configured. Brevo notification is optional; enquiries remain available in the admin workspace without it.

This review is not a clinical, regulatory, penetration-testing or formal accessibility certification.
