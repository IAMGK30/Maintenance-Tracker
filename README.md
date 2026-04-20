# ⚡ TaskEscalate — Full Stack Task Reminder & Escalation System

A production-ready system with **Node.js backend**, **SQLite database**, **real email sending**, and **automated daily scheduler**.

---

## 🗂 Project Structure

```
taskescalate/
├── backend/
│   ├── server.js       ← Express entry point
│   ├── routes.js       ← All REST API routes
│   ├── db.js           ← SQLite database layer (better-sqlite3)
│   ├── logic.js        ← Action calculation, template filling
│   ├── mailer.js       ← Nodemailer email sending
│   ├── scheduler.js    ← node-cron daily scheduler
│   ├── .env.example    ← Environment template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx     ← Full React UI
│   │   ├── api.js      ← API client
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── start.sh            ← Setup script
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (https://nodejs.org)

### 1. Install dependencies
```bash
bash start.sh
```

### 2. Configure email (backend/.env or via UI Settings)
```bash
# backend/.env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 3. Start backend
```bash
cd backend
node server.js
# API running at http://localhost:3001
```

### 4. Start frontend (new terminal)
```bash
cd frontend
npm run dev
# UI running at http://localhost:5173
```

### 5. Open browser
```
http://localhost:5173
```

---

## 📧 Email Configuration (via UI Settings → SMTP / API tab)

### Gmail (recommended for testing)
| Field    | Value |
|----------|-------|
| Provider | SMTP |
| Host     | smtp.gmail.com |
| Port     | 587 |
| Security | TLS |
| Username | your.email@gmail.com |
| Password | **App Password** (not your main password) |

**How to get a Gmail App Password:**
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Search "App passwords" → create one for "Mail"
4. Use the 16-char password in Settings

### Outlook / Office 365
| Field    | Value |
|----------|-------|
| Host     | smtp.office365.com |
| Port     | 587 |
| Security | TLS |
| Username | your.email@outlook.com |
| Password | Your account password |

### SendGrid (production recommended)
1. Create account at https://app.sendgrid.com
2. Settings → API Keys → Create Key → Full Access
3. Paste key in Settings → SendGrid API Key

### Mailgun
1. Sign up at https://mailgun.com
2. Get API key from Dashboard
3. Add your verified sending domain

---

## 🔌 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | List all tasks (with computed action/daysOverdue) |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| PATCH | `/api/tasks/:id/done` | Mark task as Done |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/import` | Import Excel (.xlsx) |
| GET | `/api/email/preview/:id` | Preview email for task |
| POST | `/api/email/send/:id` | Send email for task |
| GET | `/api/logs` | Email audit log |
| POST | `/api/scheduler/run` | Trigger scheduler manually |
| GET | `/api/scheduler/status` | Scheduler status + last run |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Save settings |
| POST | `/api/settings/test-email` | Test SMTP connection |

---

## ⏰ Scheduler

- Runs daily at configured time (default: 08:00 UTC)
- Checks all Pending tasks
- Sends emails only if: action requires email AND last sent ≥ interval days ago
- Updates `last_email_sent` after each successful send
- Full audit log with sent/failed status and error messages

---

## 📊 Action Logic

| Action | Condition |
|--------|-----------|
| Upcoming | Today < Due Date |
| Due | Today = Due Date |
| Gentle Reminder | 1–2 days overdue |
| Reminder | 3–5 days overdue |
| Urgent | 6–7 days overdue |
| Escalate | > 7 days overdue |
| (blank) | Task is Done |

Email routing:
- Gentle Reminder / Reminder / Urgent → Concerned Person
- Escalate → Manager (CC: Concerned Person)

---

## 🗄 Database

SQLite file: `backend/taskescalate.db` (auto-created on first run)

Tables:
- `tasks` — all task data
- `email_logs` — full email audit trail
- `settings` — key-value config store

---

## 🏭 Production Deployment

```bash
# Build frontend
cd frontend && npm run build

# Set production env
cd backend
echo "NODE_ENV=production" >> .env

# Start (serves frontend + API on same port)
node server.js
# Open http://localhost:3001
```

For process management use PM2:
```bash
npm install -g pm2
pm2 start backend/server.js --name taskescalate
pm2 save && pm2 startup
```
