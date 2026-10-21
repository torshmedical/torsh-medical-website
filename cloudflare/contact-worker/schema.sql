CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'in-progress', 'resolved')),
  name TEXT NOT NULL,
  organisation TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  interest TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  notification_state TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS enquiries_status_created_idx ON enquiries(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL
);

-- Webmail tables are duplicated here for clean installations. Existing
-- deployments should apply migrations/0002_webmail.sql instead.
CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  mailbox TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_id TEXT NOT NULL,
  in_reply_to TEXT NOT NULL DEFAULT '',
  references_header TEXT NOT NULL DEFAULT '',
  message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL,
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  trashed INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  raw_key TEXT NOT NULL DEFAULT '',
  UNIQUE (mailbox, message_id)
);

CREATE INDEX IF NOT EXISTS mail_messages_mailbox_folder_idx ON mail_messages(mailbox, direction, trashed, message_at DESC);
CREATE INDEX IF NOT EXISTS mail_messages_mailbox_starred_idx ON mail_messages(mailbox, is_starred, trashed, message_at DESC);

CREATE TABLE IF NOT EXISTS mail_attachments (
  id TEXT PRIMARY KEY,
  message_id_fk TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  FOREIGN KEY (message_id_fk) REFERENCES mail_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mail_attachments_message_idx ON mail_attachments(message_id_fk, mailbox);
