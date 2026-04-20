// scheduler.js  – node-cron daily email dispatch
const cron = require('node-cron');
const { Tasks, Logs, Settings } = require('./db');
const { getAction, canEmail, fillTemplate, enrichTask } = require('./logic');
const { sendEmail } = require('./mailer');

let currentJob = null;
let lastRunResult = null;

/**
 * Run one complete scheduler pass:
 * - Load all tasks + settings
 * - Find eligible tasks
 * - Send emails
 * - Update last_email_sent
 * - Log everything
 */
const runSchedulerNow = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[Scheduler] Running at ${startedAt}`);

  const rawSettings = Settings.getAll();
  const intervalDays = parseInt(rawSettings.intervalDays) || 2;
  const templates = JSON.parse(rawSettings.templates || '{}');
  const allTasks = Tasks.all().map(enrichTask);

  const eligible = allTasks.filter(t => canEmail(t, intervalDays));
  console.log(`[Scheduler] ${allTasks.length} tasks total, ${eligible.length} eligible for email`);

  const results = [];

  for (const task of eligible) {
    const action = getAction(task);
    const tpl = templates[action] || { subject: `Reminder: ${task.name}`, body: '' };

    const subject = fillTemplate(tpl.subject, task, rawSettings.senderName);
    const body    = fillTemplate(tpl.body,    task, rawSettings.senderName);

    const toAddr = action === 'Escalate' ? task.managerEmail : task.concernedEmail;
    const ccAddr = action === 'Escalate' ? task.concernedEmail : '';

    // Send via Nodemailer
    const result = await sendEmail({
      settings: rawSettings,
      to: toAddr,
      cc: ccAddr,
      subject,
      body,
    });

    const today = new Date().toISOString().slice(0, 10);

    // Log the attempt
    const logEntry = Logs.insert({
      taskId:    task.id,
      taskName:  task.name,
      action,
      fromAddr:  `${rawSettings.senderName} <${rawSettings.senderEmail}>`,
      toAddr,
      ccAddr:    ccAddr || '',
      subject,
      body,
      status:    result.success ? 'sent' : 'failed',
      errorMsg:  result.error || '',
    });

    if (result.success) {
      Tasks.updateLastEmailSent(task.id, today);
      console.log(`[Scheduler] ✓ Sent ${action} email for task ${task.id} → ${toAddr}`);
    } else {
      console.error(`[Scheduler] ✗ Failed for task ${task.id}: ${result.error}`);
    }

    results.push({ taskId: task.id, action, to: toAddr, success: result.success, error: result.error });
  }

  lastRunResult = {
    ranAt: startedAt,
    total: allTasks.length,
    eligible: eligible.length,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };

  console.log(`[Scheduler] Done. Sent: ${lastRunResult.sent}, Failed: ${lastRunResult.failed}`);
  return lastRunResult;
};

/**
 * Parse "HH:MM" into a cron expression "MM HH * * *"
 */
const timeToCron = (timeStr) => {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return `${m || 0} ${h || 8} * * *`;
};

/**
 * Start (or restart) the cron job with the current settings.
 */
const startScheduler = () => {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  const settings = Settings.getAll();
  if (settings.schedulerEnabled !== 'true') {
    console.log('[Scheduler] Disabled — not starting cron job');
    return;
  }

  const cronExpr = timeToCron(settings.schedulerTime);
  console.log(`[Scheduler] Starting cron: "${cronExpr}" (${settings.schedulerTime} daily)`);

  currentJob = cron.schedule(cronExpr, async () => {
    await runSchedulerNow();
  }, { timezone: 'UTC' });
};

/**
 * Stop the cron job.
 */
const stopScheduler = () => {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    console.log('[Scheduler] Stopped');
  }
};

const getLastRunResult = () => lastRunResult;

module.exports = { startScheduler, stopScheduler, runSchedulerNow, getLastRunResult };
