// api.js – typed API client for the TaskEscalate backend
const BASE = '/api';

const req = async (method, path, body, isForm = false) => {
  const opts = {
    method,
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
    body: body
      ? isForm ? body : JSON.stringify(body)
      : undefined,
  };
  const res = await fetch(BASE + path, opts);
  const json = await res.json();
  if (!json.success && res.status >= 400) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
};

export const api = {
  // Tasks
  getTasks:       ()         => req('GET',    '/tasks'),
  getTask:        (id)       => req('GET',    `/tasks/${id}`),
  createTask:     (data)     => req('POST',   '/tasks', data),
  updateTask:     (id, data) => req('PUT',    `/tasks/${id}`, data),
  markDone:       (id)       => req('PATCH',  `/tasks/${id}/done`),
  deleteTask:     (id)       => req('DELETE', `/tasks/${id}`),
  importTasks:    (file, mode) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', mode);
    return req('POST', '/tasks/import', fd, true);
  },

  // Email
  sendEmail:      (taskId)   => req('POST',   `/email/send/${taskId}`),
  previewEmail:   (taskId)   => req('GET',    `/email/preview/${taskId}`),

  // Logs
  getLogs:        (limit=200) => req('GET',   `/logs?limit=${limit}`),

  // Scheduler
  runScheduler:   ()         => req('POST',   '/scheduler/run'),
  schedulerStatus:()         => req('GET',    '/scheduler/status'),

  // Settings
  getSettings:    ()         => req('GET',    '/settings'),
  saveSettings:   (data)     => req('PUT',    '/settings', data),
  testEmail:      ()         => req('POST',   '/settings/test-email'),
};
