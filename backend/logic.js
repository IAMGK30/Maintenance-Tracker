// logic.js  – shared business logic (action calculation, template filling)

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  return isNaN(d) ? null : d;
};

const diffDays = (a, b) => {
  if (!a || !b) return null;
  return Math.round((a - b) / 86400000);
};

const fmtDate = (v) => {
  const d = parseDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Calculate action level based on due date and status.
 */
const getAction = (task) => {
  if (task.status === 'Done') return '';
  const due = parseDate(task.dueDate);
  if (!due) return 'Upcoming';
  const diff = diffDays(today(), due);
  if (diff < 0) return 'Upcoming';
  if (diff === 0) return 'Due';
  if (diff <= 2) return 'Gentle Reminder';
  if (diff <= 5) return 'Reminder';
  if (diff <= 7) return 'Urgent';
  return 'Escalate';
};

/**
 * Days overdue (null if not overdue or Done).
 */
const getDaysOverdue = (task) => {
  if (task.status === 'Done') return null;
  const due = parseDate(task.dueDate);
  if (!due) return null;
  const d = diffDays(today(), due);
  return d > 0 ? d : null;
};

/**
 * Should an email be sent for this task right now?
 */
const canEmail = (task, intervalDays = 2) => {
  if (task.status === 'Done') return false;
  const action = getAction(task);
  if (!['Gentle Reminder', 'Reminder', 'Urgent', 'Escalate'].includes(action)) return false;
  if (!task.lastEmailSent) return true;
  const last = parseDate(task.lastEmailSent);
  const d = diffDays(today(), last);
  return d !== null && d >= intervalDays;
};

/**
 * Fill template variables.
 */
const fillTemplate = (str, task, senderName) => {
  const overdue = getDaysOverdue(task) ?? 0;
  return str
    .replace(/{{taskName}}/g,       task.name || '')
    .replace(/{{taskId}}/g,         task.id || '')
    .replace(/{{location}}/g,       task.location || '')
    .replace(/{{dueDate}}/g,        fmtDate(task.dueDate))
    .replace(/{{overdue}}/g,        String(overdue))
    .replace(/{{concernedName}}/g,  task.concernedName || 'Team')
    .replace(/{{managerName}}/g,    task.managerName || 'Manager')
    .replace(/{{senderName}}/g,     senderName || 'TaskEscalate');
};

/**
 * Enrich a raw DB task row with computed fields.
 */
const enrichTask = (task) => ({
  ...task,
  action:      getAction(task),
  daysOverdue: getDaysOverdue(task),
});

module.exports = { getAction, getDaysOverdue, canEmail, fillTemplate, enrichTask, fmtDate };
