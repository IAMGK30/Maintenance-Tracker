// db.js  – SQLite database layer
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'taskescalate.db');
const db = new Database(DB_PATH);

// Enable WAL for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT    PRIMARY KEY,
    name          TEXT    NOT NULL,
    location      TEXT    DEFAULT '',
    due_date      TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'Pending',
    concerned_name  TEXT  DEFAULT '',
    concerned_email TEXT  DEFAULT '',
    manager_name    TEXT  DEFAULT '',
    manager_email   TEXT  DEFAULT '',
    last_email_sent TEXT  DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT    NOT NULL,
    task_name   TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    from_addr   TEXT    NOT NULL,
    to_addr     TEXT    NOT NULL,
    cc_addr     TEXT    DEFAULT '',
    subject     TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'sent',  -- sent | failed
    error_msg   TEXT    DEFAULT '',
    sent_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Tasks ─────────────────────────────────────────────────────────────────────
const taskCols = `id, name, location, due_date as dueDate, status,
  concerned_name as concernedName, concerned_email as concernedEmail,
  manager_name as managerName, manager_email as managerEmail,
  last_email_sent as lastEmailSent, created_at as createdAt, updated_at as updatedAt`;

const Tasks = {
  all: () => db.prepare(`SELECT ${taskCols} FROM tasks ORDER BY due_date ASC`).all(),

  byId: (id) => db.prepare(`SELECT ${taskCols} FROM tasks WHERE id = ?`).get(id),

  insert: db.transaction((t) => {
    db.prepare(`
      INSERT INTO tasks (id, name, location, due_date, status,
        concerned_name, concerned_email, manager_name, manager_email, last_email_sent)
      VALUES (@id, @name, @location, @dueDate, @status,
        @concernedName, @concernedEmail, @managerName, @managerEmail, @lastEmailSent)
    `).run(t);
    return Tasks.byId(t.id);
  }),

  update: db.transaction((id, fields) => {
    const allowed = ['name','location','dueDate','status','concernedName',
                     'concernedEmail','managerName','managerEmail','lastEmailSent'];
    const colMap = { dueDate:'due_date', concernedName:'concerned_name',
                     concernedEmail:'concerned_email', managerName:'manager_name',
                     managerEmail:'manager_email', lastEmailSent:'last_email_sent' };
    const sets = Object.keys(fields)
      .filter(k => allowed.includes(k))
      .map(k => `${colMap[k] || k} = @${k}`)
      .concat(["updated_at = datetime('now')"]);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @_id`)
      .run({ ...fields, _id: id });
    return Tasks.byId(id);
  }),

  updateLastEmailSent: (id, date) => {
    db.prepare(`UPDATE tasks SET last_email_sent = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(date, id);
  },

  markDone: (id) => {
    db.prepare(`UPDATE tasks SET status = 'Done', updated_at = datetime('now') WHERE id = ?`).run(id);
    return Tasks.byId(id);
  },

  delete: (id) => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },

  upsertMany: db.transaction((rows) => {
    const stmt = db.prepare(`
      INSERT INTO tasks (id, name, location, due_date, status,
        concerned_name, concerned_email, manager_name, manager_email, last_email_sent)
      VALUES (@id, @name, @location, @dueDate, @status,
        @concernedName, @concernedEmail, @managerName, @managerEmail, @lastEmailSent)
      ON CONFLICT(id) DO UPDATE SET
        name            = excluded.name,
        location        = excluded.location,
        due_date        = excluded.due_date,
        status          = excluded.status,
        concerned_name  = excluded.concerned_name,
        concerned_email = excluded.concerned_email,
        manager_name    = excluded.manager_name,
        manager_email   = excluded.manager_email,
        last_email_sent = excluded.last_email_sent,
        updated_at      = datetime('now')
    `);
    rows.forEach(r => stmt.run(r));
    return rows.length;
  }),

  replaceAll: db.transaction((rows) => {
    db.prepare('DELETE FROM tasks').run();
    const stmt = db.prepare(`
      INSERT INTO tasks (id, name, location, due_date, status,
        concerned_name, concerned_email, manager_name, manager_email, last_email_sent)
      VALUES (@id, @name, @location, @dueDate, @status,
        @concernedName, @concernedEmail, @managerName, @managerEmail, @lastEmailSent)
    `);
    rows.forEach(r => stmt.run(r));
    return rows.length;
  }),
};

// ── Email Logs ────────────────────────────────────────────────────────────────
const Logs = {
  all: (limit = 200) => db.prepare(`
    SELECT * FROM email_logs ORDER BY id DESC LIMIT ?
  `).all(limit),

  insert: (log) => {
    const info = db.prepare(`
      INSERT INTO email_logs (task_id, task_name, action, from_addr, to_addr, cc_addr, subject, body, status, error_msg)
      VALUES (@taskId, @taskName, @action, @fromAddr, @toAddr, @ccAddr, @subject, @body, @status, @errorMsg)
    `).run(log);
    return db.prepare('SELECT * FROM email_logs WHERE id = ?').get(info.lastInsertRowid);
  },
};

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  senderName: 'TaskEscalate System',
  senderEmail: 'noreply@yourcompany.com',
  replyTo: '',
  companyName: 'Your Company',
  signature: 'Powered by TaskEscalate',
  emailProvider: 'smtp',
  smtpHost: 'smtp.gmail.com',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  smtpSecure: 'TLS',
  sendgridKey: '',
  mailgunKey: '',
  mailgunDomain: '',
  schedulerEnabled: 'true',
  schedulerTime: '08:00',
  intervalDays: '2',
  templates: JSON.stringify({
    "Gentle Reminder": {
      subject: "Gentle Reminder: {{taskName}} is still pending",
      body: "Dear {{concernedName}},\n\nThis is a gentle reminder that the task below is still pending:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease update the status at your earliest convenience.\n\nRegards,\n{{senderName}}"
    },
    "Reminder": {
      subject: "Reminder: {{taskName}} is overdue by {{overdue}} day(s)",
      body: "Dear {{concernedName}},\n\nThe task below is now {{overdue}} day(s) overdue:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease take immediate action.\n\nRegards,\n{{senderName}}"
    },
    "Urgent": {
      subject: "⚠️ URGENT: {{taskName}} is critically overdue!",
      body: "Dear {{concernedName}},\n\n⚠️ URGENT: The task below is critically overdue by {{overdue}} days:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nImmediate action is required.\n\nRegards,\n{{senderName}}"
    },
    "Escalate": {
      subject: "🚨 ESCALATION: {{taskName}} — Manager Action Required",
      body: "Dear {{managerName}},\n\nFormal escalation: the task assigned to {{concernedName}} is {{overdue}} days overdue:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nYour immediate intervention is requested.\n\ncc: {{concernedName}}\n\nRegards,\n{{senderName}}"
    },
    "Due": {
      subject: "Due Today: {{taskName}}",
      body: "Dear {{concernedName}},\n\nThis task is due today:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease complete it and mark as Done.\n\nRegards,\n{{senderName}}"
    }
  })
};

const Settings = {
  getAll: () => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    // Merge with defaults for any missing keys
    return { ...DEFAULT_SETTINGS, ...map };
  },

  get: (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : DEFAULT_SETTINGS[key];
  },

  setMany: db.transaction((obj) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    Object.entries(obj).forEach(([k, v]) => stmt.run(k, String(v)));
  }),
};

module.exports = { db, Tasks, Logs, Settings };
