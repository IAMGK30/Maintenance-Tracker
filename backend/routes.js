// routes.js  – all REST API routes
const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const router  = express.Router();

const { Tasks, Logs, Settings } = require('./db');
const { enrichTask, canEmail, getAction, fillTemplate } = require('./logic');
const { sendEmail, testConnection } = require('./mailer');
const { startScheduler, stopScheduler, runSchedulerNow, getLastRunResult } = require('./scheduler');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Tasks CRUD ────────────────────────────────────────────────────────────────

// GET /api/tasks  — list all tasks with computed fields
router.get('/tasks', (req, res) => {
  try {
    const tasks = Tasks.all().map(enrichTask);
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/tasks/:id', (req, res) => {
  try {
    const task = Tasks.byId(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: enrichTask(task) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks  — create
router.post('/tasks', (req, res) => {
  try {
    const { id, name, location, dueDate, status, concernedName, concernedEmail,
            managerName, managerEmail, lastEmailSent } = req.body;

    if (!id || !name || !dueDate) {
      return res.status(400).json({ success: false, error: 'id, name, dueDate are required' });
    }

    // Check duplicate
    if (Tasks.byId(id)) {
      return res.status(409).json({ success: false, error: `Task ID "${id}" already exists` });
    }

    const task = Tasks.insert({
      id, name, location: location || '', dueDate, status: status || 'Pending',
      concernedName: concernedName || '', concernedEmail: concernedEmail || '',
      managerName: managerName || '', managerEmail: managerEmail || '',
      lastEmailSent: lastEmailSent || '',
    });
    res.status(201).json({ success: true, data: enrichTask(task) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id  — update
router.put('/tasks/:id', (req, res) => {
  try {
    if (!Tasks.byId(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const updated = Tasks.update(req.params.id, req.body);
    res.json({ success: true, data: enrichTask(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/done  — mark as done
router.patch('/tasks/:id/done', (req, res) => {
  try {
    if (!Tasks.byId(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const updated = Tasks.markDone(req.params.id);
    res.json({ success: true, data: enrichTask(updated) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', (req, res) => {
  try {
    if (!Tasks.byId(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    Tasks.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Excel Import ──────────────────────────────────────────────────────────────
router.post('/tasks/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const mode = req.body.mode || 'merge'; // merge | overwrite

    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const COL_MAP = {
      'Task ID': 'id',
      'Product / Task Name': 'name',
      'Location': 'location',
      'Due Date': 'dueDate',
      'Task Status': 'status',
      'Concerned Person Name': 'concernedName',
      'Concerned Person Email': 'concernedEmail',
      'Manager Name': 'managerName',
      'Manager Email': 'managerEmail',
      'Last Email Sent Date': 'lastEmailSent',
    };

    const parsed = rows.map(row => {
      const t = { id:'', name:'', location:'', dueDate:'', status:'Pending',
                  concernedName:'', concernedEmail:'', managerName:'', managerEmail:'', lastEmailSent:'' };
      Object.entries(COL_MAP).forEach(([xl, key]) => {
        if (row[xl] !== undefined) {
          const v = row[xl];
          t[key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').trim();
        }
      });
      return t;
    }).filter(t => t.id && t.name);

    if (!parsed.length) {
      return res.status(400).json({ success: false, error: 'No valid rows found. Check column headers.' });
    }

    let count;
    if (mode === 'overwrite') {
      count = Tasks.replaceAll(parsed);
    } else {
      count = Tasks.upsertMany(parsed);
    }

    res.json({ success: true, imported: count, mode });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Email ─────────────────────────────────────────────────────────────────────

// POST /api/email/send/:taskId  — send email for one task
router.post('/email/send/:taskId', async (req, res) => {
  try {
    const task = Tasks.byId(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const rawSettings = Settings.getAll();
    const intervalDays = parseInt(rawSettings.intervalDays) || 2;
    const enriched = enrichTask(task);

    if (!canEmail(enriched, intervalDays)) {
      return res.status(400).json({
        success: false,
        error: `Email not eligible: task is Done, or last email was sent within ${intervalDays} days`,
      });
    }

    const action = getAction(enriched);
    const templates = JSON.parse(rawSettings.templates || '{}');
    const tpl = templates[action] || { subject: `Reminder: ${task.name}`, body: '' };

    const subject = fillTemplate(tpl.subject, enriched, rawSettings.senderName);
    const body    = fillTemplate(tpl.body,    enriched, rawSettings.senderName);
    const toAddr  = action === 'Escalate' ? task.managerEmail : task.concernedEmail;
    const ccAddr  = action === 'Escalate' ? task.concernedEmail : '';

    const result = await sendEmail({ settings: rawSettings, to: toAddr, cc: ccAddr, subject, body });

    const today = new Date().toISOString().slice(0, 10);
    const logEntry = Logs.insert({
      taskId: task.id, taskName: task.name, action,
      fromAddr: `${rawSettings.senderName} <${rawSettings.senderEmail}>`,
      toAddr, ccAddr: ccAddr || '', subject, body,
      status: result.success ? 'sent' : 'failed',
      errorMsg: result.error || '',
    });

    if (result.success) {
      Tasks.updateLastEmailSent(task.id, today);
    }

    res.json({ success: result.success, log: logEntry, error: result.error });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/email/preview/:taskId  — get preview without sending
router.get('/email/preview/:taskId', (req, res) => {
  try {
    const task = Tasks.byId(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const rawSettings = Settings.getAll();
    const enriched = enrichTask(task);
    const action = getAction(enriched);
    const templates = JSON.parse(rawSettings.templates || '{}');
    const tpl = templates[action] || { subject: `Reminder: ${task.name}`, body: '' };

    const subject = fillTemplate(tpl.subject, enriched, rawSettings.senderName);
    const body    = fillTemplate(tpl.body,    enriched, rawSettings.senderName);
    const toAddr  = action === 'Escalate' ? task.managerEmail : task.concernedEmail;
    const ccAddr  = action === 'Escalate' ? task.concernedEmail : '';

    res.json({
      success: true,
      preview: {
        from: `${rawSettings.senderName} <${rawSettings.senderEmail}>`,
        to: toAddr, cc: ccAddr, replyTo: rawSettings.replyTo,
        subject, body, action,
        eligible: canEmail(enriched, parseInt(rawSettings.intervalDays) || 2),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Logs ──────────────────────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    res.json({ success: true, data: Logs.all(limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Scheduler ─────────────────────────────────────────────────────────────────
router.post('/scheduler/run', async (req, res) => {
  try {
    const result = await runSchedulerNow();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/scheduler/status', (req, res) => {
  const settings = Settings.getAll();
  res.json({
    success: true,
    enabled: settings.schedulerEnabled === 'true',
    time: settings.schedulerTime,
    lastRun: getLastRunResult(),
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  try {
    const s = Settings.getAll();
    // Never send passwords to frontend in plain text (mask them)
    const safe = { ...s };
    if (safe.smtpPass) safe.smtpPass = '••••••••';
    if (safe.sendgridKey) safe.sendgridKey = safe.sendgridKey.slice(0, 8) + '••••';
    if (safe.mailgunKey) safe.mailgunKey = safe.mailgunKey.slice(0, 8) + '••••';
    // Parse templates JSON
    try { safe.templates = JSON.parse(safe.templates); } catch {}
    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const body = { ...req.body };
    // If templates is an object, stringify it
    if (body.templates && typeof body.templates === 'object') {
      body.templates = JSON.stringify(body.templates);
    }
    // Don't overwrite passwords if they're still masked
    if (body.smtpPass === '••••••••') delete body.smtpPass;
    if (body.sendgridKey && body.sendgridKey.includes('••••')) delete body.sendgridKey;
    if (body.mailgunKey && body.mailgunKey.includes('••••')) delete body.mailgunKey;

    Settings.setMany(body);

    // Restart scheduler with new settings
    stopScheduler();
    startScheduler();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/test-email  — test SMTP connection
router.post('/settings/test-email', async (req, res) => {
  try {
    const settings = Settings.getAll();
    const result = await testConnection(settings);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
