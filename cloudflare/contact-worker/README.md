# TORSH contact and mail service

This Cloudflare Worker supplies the server-side features that cannot run securely on GitHub Pages:

- `POST /api/enquiries` validates, rate-limits and stores public contact requests in D1.
- `/api/admin/*` lists and updates requests for users authenticated by Cloudflare Access.
- `/api/mail/*` powers the protected TORSH Mail inbox, search, sent mail, attachments and message state.
- The `email()` handler archives inbound messages in D1/KV and forwards a safety copy to the existing verified destination.
- Brevo transactional email sends mail from the signed-in TORSH mailbox without requiring Cloudflare's paid Email Sending feature.

## Required Cloudflare setup

1. Use the D1 database named `torsh-enquiries`. New installations apply `schema.sql`; existing installations apply `migrations/0002_webmail.sql`.
2. Use the Workers KV namespace named `torsh-mail` for raw messages and attachments. KV stays within the Workers Free plan; its namespace ID is bound as `MAIL_STORE`.
3. Authenticate `torshmedical.com` in Brevo and register the four mailbox addresses as transactional senders. Store `BREVO_API_KEY` as a Worker secret; it is shared with the optional contact-form notification path.
4. Create a Cloudflare Access self-hosted application covering `torshmedical.com/mail.html`, `torshmedical.com/api/mail/*`, `torshmedical.com/admin.html` and `torshmedical.com/api/admin/*`. Allow exactly `victor@torshmedical.com`, `krishna@torshmedical.com`, `admin@torshmedical.com` and `info@torshmedical.com`.
5. Set the `MAIL_FORWARD_ADDRESS` Worker variable to an already verified Email Routing destination. This maintains the current Gmail safety copy and allows one-time PIN delivery before the webmail portal is open.
6. Store `RATE_LIMIT_SALT` as a Worker secret.
7. Install dependencies with `pnpm install`, validate with `pnpm check`, then deploy. Configure the four Email Routing triggers in the Cloudflare dashboard so the restricted Git build token does not need account-wide email-routing write access.
8. Optional contact-form notification: set `CONTACT_RECIPIENT` and `BREVO_SENDER_EMAIL` to verified Brevo addresses. The form still stores enquiries when notification is not configured; the mail composer requires the Brevo key.

## Security model

- The portal trusts the Access-authenticated email only on routes protected by Cloudflare Access. Keep the API and page path in the same Access application.
- Every D1 and KV read is scoped to the authenticated mailbox; the browser cannot request another user's message or attachment.
- Inbound HTML is never rendered. The client displays a plain-text extraction with `textContent`.
- The Worker limits total outgoing attachments to 4 MB, recipient count to 50 and inbound archives to 25 MB.
- Brevo is the only outbound transport. On its Free plan, provider limits and Brevo branding apply.
- `workers_dev` remains disabled so the Access policy cannot be bypassed through a public Worker hostname.

Never commit `.dev.vars`, API keys, destination inboxes or authentication credentials.
