-- QBO integration: OAuth token storage + import log.

CREATE TABLE qbo_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  realm_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,
  refresh_token_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);

CREATE TABLE qbo_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  txn_date TEXT NOT NULL,
  line_count INTEGER NOT NULL,
  total_debits_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  qbo_je_id TEXT,
  error_detail TEXT,
  imported_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE INDEX qbo_import_log_doc_idx ON qbo_import_log(doc_number, txn_date);
