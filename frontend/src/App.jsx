import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fd = (v) => {
  if (!v) return '—';
  const d = new Date(v); d.setHours(0,0,0,0);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
};

// ── Action colours ────────────────────────────────────────────────────────────
const AC = {
  '':                { label:'Done',           tc:'#4ade80', bg:'rgba(74,222,128,.14)',  bc:'rgba(74,222,128,.35)' },
  'Upcoming':        { label:'Upcoming',       tc:'#93c5fd', bg:'rgba(147,197,253,.12)', bc:'rgba(147,197,253,.3)' },
  'Due':             { label:'Due Today',      tc:'#fde68a', bg:'rgba(253,230,138,.14)', bc:'rgba(253,230,138,.35)' },
  'Gentle Reminder': { label:'Gentle Reminder',tc:'#fef08a', bg:'rgba(254,240,138,.12)', bc:'rgba(254,240,138,.3)' },
  'Reminder':        { label:'Reminder',       tc:'#facc15', bg:'rgba(250,204,21,.14)',  bc:'rgba(250,204,21,.35)' },
  'Urgent':          { label:'Urgent',         tc:'#fb923c', bg:'rgba(251,146,60,.17)',  bc:'rgba(251,146,60,.4)' },
  'Escalate':        { label:'Escalate',       tc:'#f87171', bg:'rgba(248,113,113,.18)', bc:'rgba(248,113,113,.45)' },
};

// ── Tiny UI atoms ─────────────────────────────────────────────────────────────
const Badge = ({ action }) => {
  const m = AC[action] ?? AC['Upcoming'];
  return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, color:m.tc, background:m.bg, border:`1px solid ${m.bc}`, whiteSpace:'nowrap' }}>{m.label}</span>;
};

const Btn = ({ children, onClick, grad, outline, small, full, disabled, danger }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ background: danger ? 'linear-gradient(135deg,#7f1d1d,#991b1b)' : grad || 'transparent',
      border: outline ? `1px solid ${outline}` : 'none', borderRadius:8,
      padding: small ? '5px 11px' : '7px 13px',
      color: (grad || danger) ? '#fff' : outline ? '#94a3b8' : '#94a3b8',
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize: small ? 11 : 12, fontWeight:700,
      display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
      opacity: disabled ? 0.5 : 1, width: full ? '100%' : 'auto', justifyContent:'center' }}>
    {children}
  </button>
);

const Inp = ({ label, value, onChange, type='text', placeholder, hint, mono, pw, req: required }) => (
  <div style={{ marginBottom:11 }}>
    {label && <label style={{ display:'block', fontSize:10, color:'#4a6a8a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>
      {label}{required && <span style={{ color:'#f87171' }}> *</span>}
    </label>}
    <input type={pw ? 'password' : type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''}
      style={{ width:'100%', boxSizing:'border-box', background:'#060e1c', border:'1px solid #1a3050', borderRadius:7, padding:'7px 10px', color:'#e2e8f0', fontSize:13, outline:'none', fontFamily: mono ? 'monospace' : 'inherit' }} />
    {hint && <div style={{ fontSize:10, color:'#2d4a6b', marginTop:2 }}>{hint}</div>}
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom:11 }}>
    {label && <label style={{ display:'block', fontSize:10, color:'#4a6a8a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width:'100%', boxSizing:'border-box', background:'#060e1c', border:'1px solid #1a3050', borderRadius:7, padding:'7px 10px', color:'#e2e8f0', fontSize:13, outline:'none' }}>
      {options.map(o => <option key={o.v !== undefined ? o.v : o} value={o.v !== undefined ? o.v : o}>{o.l || o}</option>)}
    </select>
  </div>
);

const TA = ({ label, value, onChange, rows = 7 }) => (
  <div style={{ marginBottom:11 }}>
    {label && <label style={{ display:'block', fontSize:10, color:'#4a6a8a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{label}</label>}
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      style={{ width:'100%', boxSizing:'border-box', background:'#060e1c', border:'1px solid #1a3050', borderRadius:7, padding:'7px 10px', color:'#e2e8f0', fontSize:12, outline:'none', resize:'vertical', fontFamily:'monospace', lineHeight:1.65 }} />
  </div>
);

const Toggle = ({ value, onChange, label }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'9px 12px', background:'#060e1c', borderRadius:7, border:'1px solid #1a3050' }}>
    <span style={{ fontSize:13, color:'#94a3b8' }}>{label}</span>
    <div onClick={() => onChange(!value)} style={{ width:38, height:21, borderRadius:11, background: value ? '#2563eb' : '#1a3050', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
      <div style={{ position:'absolute', top:2.5, left: value ? 18 : 2.5, width:16, height:16, borderRadius:8, background:'#fff', transition:'left .2s' }} />
    </div>
  </div>
);

const SH = ({ icon, text }) => (
  <div style={{ display:'flex', alignItems:'center', gap:7, margin:'14px 0 9px' }}>
    <span style={{ fontSize:14 }}>{icon}</span>
    <span style={{ fontSize:9, fontWeight:800, color:'#2d4a6b', textTransform:'uppercase', letterSpacing:'0.1em' }}>{text}</span>
    <div style={{ flex:1, height:1, background:'#1a3050' }} />
  </div>
);

// ── Modal shell ───────────────────────────────────────────────────────────────
const Modal = ({ children, onClose, wide }) => (
  <div onClick={e => e.target === e.currentTarget && onClose()}
    style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', backdropFilter:'blur(5px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:14 }}>
    <div style={{ background:'#0a1628', border:'1px solid #1a3050', borderRadius:14, width:'100%', maxWidth: wide ? 860 : 620, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(0,0,0,.7)' }}>
      {children}
    </div>
  </div>
);
const MH = ({ title, onClose }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', borderBottom:'1px solid #1a3050', flexShrink:0 }}>
    <span style={{ fontWeight:800, fontSize:14, color:'#e2e8f0' }}>{title}</span>
    <button onClick={onClose} style={{ background:'none', border:'none', color:'#4a6a8a', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
  </div>
);
const MB = ({ children }) => <div style={{ overflowY:'auto', flex:1, padding:18 }}>{children}</div>;
const MF = ({ children }) => <div style={{ padding:'11px 18px', borderTop:'1px solid #1a3050', display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>{children}</div>;

// ── Default templates (for reset) ─────────────────────────────────────────────
const DEFAULT_TEMPLATES = {
  'Gentle Reminder': { subject:'Gentle Reminder: {{taskName}} is still pending', body:"Dear {{concernedName}},\n\nThis is a gentle reminder that the task below is still pending:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease update the status at your earliest convenience.\n\nRegards,\n{{senderName}}" },
  'Reminder':        { subject:'Reminder: {{taskName}} is overdue by {{overdue}} day(s)', body:"Dear {{concernedName}},\n\nThe task below is now {{overdue}} day(s) overdue:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease take immediate action.\n\nRegards,\n{{senderName}}" },
  'Urgent':          { subject:'⚠️ URGENT: {{taskName}} is critically overdue!', body:"Dear {{concernedName}},\n\n⚠️ URGENT: This task is critically overdue by {{overdue}} days:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nImmediate action required.\n\nRegards,\n{{senderName}}" },
  'Escalate':        { subject:'🚨 ESCALATION: {{taskName}} — Manager Action Required', body:"Dear {{managerName}},\n\nFormal escalation: task assigned to {{concernedName}} is {{overdue}} days overdue:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nYour intervention is requested.\n\ncc: {{concernedName}}\n\nRegards,\n{{senderName}}" },
  'Due':             { subject:'Due Today: {{taskName}}', body:"Dear {{concernedName}},\n\nThis task is due today:\n\n  Task:     {{taskName}} (ID: {{taskId}})\n  Location: {{location}}\n  Due Date: {{dueDate}}\n\nPlease complete it and mark as Done.\n\nRegards,\n{{senderName}}" },
};
const TPL_ACTS = ['Gentle Reminder','Reminder','Urgent','Escalate','Due'];
const VARS = '{{taskName}}  {{taskId}}  {{location}}  {{dueDate}}  {{overdue}}  {{concernedName}}  {{managerName}}  {{senderName}}';

// ── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ initial, onSave, onClose, notify }) {
  const [s, setS] = useState(() => ({
    senderName:'', senderEmail:'', replyTo:'', companyName:'', signature:'',
    emailProvider:'smtp', smtpHost:'smtp.gmail.com', smtpPort:'587', smtpUser:'', smtpPass:'', smtpSecure:'TLS',
    sendgridKey:'', mailgunKey:'', mailgunDomain:'',
    schedulerEnabled: true, schedulerTime:'08:00', intervalDays:'2',
    templates: DEFAULT_TEMPLATES,
    ...initial,
    schedulerEnabled: initial?.schedulerEnabled === true || initial?.schedulerEnabled === 'true',
    templates: (typeof initial?.templates === 'string') ? JSON.parse(initial.templates) : (initial?.templates || DEFAULT_TEMPLATES),
  }));
  const [tab, setTab] = useState('sender');
  const [ta, setTa]   = useState('Gentle Reminder');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);

  const set = (k, v) => setS(p => ({ ...p, [k]: v }));
  const setT = (a, f, v) => setS(p => ({ ...p, templates: { ...p.templates, [a]: { ...p.templates[a], [f]: v } } }));

  const testConn = async () => {
    setTesting(true);
    try {
      const r = await api.testEmail();
      notify(r.success ? '✓ SMTP connection successful!' : `✗ ${r.error}`, r.success ? 'ok' : 'err');
    } catch (e) { notify('Test failed: ' + e.message, 'err'); }
    setTesting(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(s);
    } finally { setSaving(false); }
  };

  const TABS = [
    { id:'sender', icon:'✉️', lbl:'Sender' },
    { id:'smtp',   icon:'🔌', lbl:'SMTP / API' },
    { id:'sched',  icon:'⏰', lbl:'Scheduler' },
    { id:'tpl',    icon:'📝', lbl:'Templates' },
  ];

  return (
    <Modal onClose={onClose} wide>
      <MH title="⚙️ Settings" onClose={onClose} />
      <div style={{ display:'flex', flex:1, minHeight:0 }}>
        <div style={{ width:145, borderRight:'1px solid #1a3050', padding:'10px 7px', flexShrink:0, display:'flex', flexDirection:'column', gap:3 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 11px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                background: tab === t.id ? 'linear-gradient(135deg,#1d4ed8,#4338ca)' : 'transparent',
                color: tab === t.id ? '#fff' : '#4a6a8a', textAlign:'left' }}>
              {t.icon} {t.lbl}
            </button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:18 }}>
          {tab === 'sender' && <>
            <SH icon="✉️" text="Sender Identity" />
            <Inp label="Sender Name" value={s.senderName} onChange={v => set('senderName', v)} placeholder="TaskEscalate System" hint="Shown as From name in emails" />
            <Inp label="From Email Address" value={s.senderEmail} onChange={v => set('senderEmail', v)} type="email" placeholder="noreply@yourcompany.com" />
            <Inp label="Reply-To Email (optional)" value={s.replyTo} onChange={v => set('replyTo', v)} type="email" placeholder="admin@yourcompany.com" hint="Leave blank to use From address" />
            <SH icon="🏢" text="Branding" />
            <Inp label="Company Name" value={s.companyName} onChange={v => set('companyName', v)} placeholder="Acme Corp" />
            <Inp label="Email Signature Line" value={s.signature} onChange={v => set('signature', v)} placeholder="Powered by TaskEscalate · Acme Corp" />
          </>}

          {tab === 'smtp' && <>
            <SH icon="🔌" text="Email Provider" />
            <Sel label="Provider" value={s.emailProvider} onChange={v => set('emailProvider', v)}
              options={[{ v:'smtp', l:'SMTP (Gmail / Outlook / Custom)' }, { v:'sendgrid', l:'SendGrid API' }, { v:'mailgun', l:'Mailgun API' }]} />
            {s.emailProvider === 'smtp' && <>
              <SH icon="🖥️" text="SMTP Configuration" />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 90px', gap:'0 10px' }}>
                <Inp label="Host" value={s.smtpHost} onChange={v => set('smtpHost', v)} placeholder="smtp.gmail.com" mono />
                <Inp label="Port" value={s.smtpPort} onChange={v => set('smtpPort', v)} placeholder="587" mono />
              </div>
              <Sel label="Security" value={s.smtpSecure} onChange={v => set('smtpSecure', v)} options={['TLS','SSL','None']} />
              <Inp label="Username" value={s.smtpUser} onChange={v => set('smtpUser', v)} placeholder="you@gmail.com" mono />
              <Inp label="Password / App Password" value={s.smtpPass} onChange={v => set('smtpPass', v)} pw placeholder="••••••••" hint="Gmail: Google Account → Security → App Passwords" />
              <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:6 }}>
                <Btn outline="#166534" onClick={testConn} disabled={testing} small>
                  {testing ? '⏳ Testing…' : '🧪 Test Connection'}
                </Btn>
                <span style={{ fontSize:10, color:'#2d4a6b' }}>Verifies SMTP credentials are working</span>
              </div>
              <div style={{ marginTop:12, padding:'9px 12px', background:'rgba(251,191,36,.07)', border:'1px solid rgba(251,191,36,.2)', borderRadius:7, fontSize:11, color:'#fbbf24', lineHeight:1.7 }}>
                💡 Gmail: smtp.gmail.com : 587 / TLS — use an App Password<br />
                💡 Outlook: smtp.office365.com : 587 / TLS<br />
                💡 Yahoo: smtp.mail.yahoo.com : 465 / SSL
              </div>
            </>}
            {s.emailProvider === 'sendgrid' && <>
              <SH icon="🔑" text="SendGrid" />
              <Inp label="API Key" value={s.sendgridKey} onChange={v => set('sendgridKey', v)} pw placeholder="SG.xxxxxxxxxxxxxxxxxxxx" mono hint="app.sendgrid.com → Settings → API Keys" />
            </>}
            {s.emailProvider === 'mailgun' && <>
              <SH icon="🔑" text="Mailgun" />
              <Inp label="API Key" value={s.mailgunKey} onChange={v => set('mailgunKey', v)} pw placeholder="key-xxxxxxxxxxxxxxxx" mono />
              <Inp label="Domain" value={s.mailgunDomain} onChange={v => set('mailgunDomain', v)} placeholder="mg.yourdomain.com" mono />
            </>}
          </>}

          {tab === 'sched' && <>
            <SH icon="⏰" text="Scheduler" />
            <Toggle label="Enable Daily Scheduler" value={s.schedulerEnabled} onChange={v => set('schedulerEnabled', v)} />
            <Inp label="Run Time (24h)" value={s.schedulerTime} onChange={v => set('schedulerTime', v)} type="time" hint="Time of day the scheduler fires (server-side cron)" />
            <Inp label="Email Interval (days)" value={s.intervalDays} onChange={v => set('intervalDays', v)} type="number" hint="Min days before re-sending email for same task. Default: 2" />
            <SH icon="📊" text="Escalation Thresholds (read-only)" />
            {[['Upcoming','Today < Due Date','#93c5fd'],['Due','Today = Due Date','#fde68a'],['Gentle Reminder','1–2 days overdue','#fef08a'],['Reminder','3–5 days overdue','#facc15'],['Urgent','6–7 days overdue','#fb923c'],['Escalate','> 7 days overdue','#f87171']].map(([a,r,c]) => (
              <div key={a} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 11px', background:'#060e1c', border:'1px solid #1a3050', borderRadius:6, marginBottom:4 }}>
                <span style={{ fontSize:12, color:c, fontWeight:700 }}>{a}</span>
                <span style={{ fontSize:11, color:'#2d4a6b', fontFamily:'monospace' }}>{r}</span>
              </div>
            ))}
          </>}

          {tab === 'tpl' && <>
            <SH icon="📝" text="Email Templates" />
            <div style={{ padding:'7px 11px', background:'rgba(96,165,250,.07)', border:'1px solid rgba(96,165,250,.18)', borderRadius:7, fontSize:10, color:'#60a5fa', fontFamily:'monospace', lineHeight:2, marginBottom:13 }}>{VARS}</div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14 }}>
              {TPL_ACTS.map(a => { const m = AC[a] || AC['Upcoming']; return (
                <button key={a} onClick={() => setTa(a)}
                  style={{ padding:'4px 11px', borderRadius:99, border:`1px solid ${ta===a?m.bc:'#1a3050'}`, background: ta===a ? m.bg : 'transparent', color: ta===a ? m.tc : '#4a6a8a', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {a}
                </button>
              );})}
            </div>
            <Inp label={`Subject — ${ta}`} value={s.templates[ta]?.subject || ''} onChange={v => setT(ta, 'subject', v)} />
            <TA label={`Body — ${ta}`} value={s.templates[ta]?.body || ''} onChange={v => setT(ta, 'body', v)} rows={10} />
            <Btn outline="#1a3050" small onClick={() => setT(ta, 'subject', DEFAULT_TEMPLATES[ta]?.subject||'') || setT(ta, 'body', DEFAULT_TEMPLATES[ta]?.body||'')}>↺ Reset to Default</Btn>
          </>}
        </div>
      </div>
      <MF>
        <Btn outline="#1a3050" onClick={onClose}>Cancel</Btn>
        <Btn grad="linear-gradient(135deg,#2563eb,#4f46e5)" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </Btn>
      </MF>
    </Modal>
  );
}

// ── Task Form Modal ───────────────────────────────────────────────────────────
const BLK = { id:'', name:'', location:'', dueDate:'', status:'Pending', concernedName:'', concernedEmail:'', managerName:'', managerEmail:'' };

function TaskModal({ init, onSave, onClose }) {
  const [f, setF] = useState(init || BLK);
  const [err, setErr] = useState({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!init;
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const ok = () => {
    const e = {};
    if (!f.id.trim()) e.id = 'Required';
    if (!f.name.trim()) e.name = 'Required';
    if (!f.dueDate) e.dueDate = 'Required';
    if (!f.concernedEmail.trim()) e.concernedEmail = 'Required';
    setErr(e); return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!ok()) return;
    setSaving(true);
    try { await onSave(f); } finally { setSaving(false); }
  };

  const fi = (label, key, type='text', required) => (
    <div style={{ marginBottom:11 }}>
      <label style={{ display:'block', fontSize:10, color:'#4a6a8a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>
        {label}{required && <span style={{ color:'#f87171' }}> *</span>}
      </label>
      <input type={type} value={f[key] || ''} onChange={e => set(key, e.target.value)}
        style={{ width:'100%', boxSizing:'border-box', background:'#060e1c', border:`1px solid ${err[key] ? '#f87171' : '#1a3050'}`, borderRadius:7, padding:'7px 10px', color:'#e2e8f0', fontSize:13, outline:'none' }} />
      {err[key] && <span style={{ fontSize:10, color:'#f87171' }}>{err[key]}</span>}
    </div>
  );

  return (
    <Modal onClose={onClose}>
      <MH title={isEdit ? `Edit Task · ${init.id}` : 'Add New Task'} onClose={onClose} />
      <MB>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
          <div>{fi('Task ID','id','text',true)}{fi('Task Name','name','text',true)}{fi('Location','location')}{fi('Due Date','dueDate','date',true)}</div>
          <div>{fi('Concerned Person','concernedName')}{fi('Concerned Email','concernedEmail','email',true)}{fi('Manager Name','managerName')}{fi('Manager Email','managerEmail','email')}</div>
        </div>
        <Sel label="Status" value={f.status} onChange={v => set('status', v)} options={['Pending','Done']} />
      </MB>
      <MF>
        <Btn outline="#1a3050" onClick={onClose}>Cancel</Btn>
        <Btn grad="linear-gradient(135deg,#2563eb,#4f46e5)" onClick={submit} disabled={saving}>
          {saving ? '⏳…' : isEdit ? 'Update Task' : 'Add Task'}
        </Btn>
      </MF>
    </Modal>
  );
}

// ── Email Preview Modal ───────────────────────────────────────────────────────
function EmailModal({ taskId, onClose, onGoSettings, notify, refreshTasks }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.previewEmail(taskId)
      .then(r => setPreview(r.preview))
      .catch(e => notify('Preview failed: ' + e.message, 'err'))
      .finally(() => setLoading(false));
  }, [taskId]);

  const send = async () => {
    setSending(true);
    try {
      const r = await api.sendEmail(taskId);
      if (r.success) {
        notify('✓ Email sent & logged!');
        refreshTasks();
        onClose();
      } else {
        notify('Send failed: ' + r.error, 'err');
      }
    } catch (e) { notify(e.message, 'err'); }
    setSending(false);
  };

  return (
    <Modal onClose={onClose}>
      <MH title="✉️ Email Preview" onClose={onClose} />
      <MB>
        {loading ? <div style={{ textAlign:'center', padding:'24px', color:'#4a6a8a' }}>Loading preview…</div> : preview ? <>
          <div style={{ background:'#060e1c', border:'1px solid #1a3050', borderRadius:9, padding:14, marginBottom:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'65px 1fr', gap:'5px 10px', fontSize:12, marginBottom:11 }}>
              <span style={{ color:'#2d4a6b', fontWeight:700 }}>From:</span><span style={{ color:'#94a3b8' }}>{preview.from}</span>
              <span style={{ color:'#2d4a6b', fontWeight:700 }}>To:</span><span style={{ color:'#60a5fa' }}>{preview.to}</span>
              {preview.cc && <><span style={{ color:'#2d4a6b', fontWeight:700 }}>CC:</span><span style={{ color:'#60a5fa' }}>{preview.cc}</span></>}
              {preview.replyTo && <><span style={{ color:'#2d4a6b', fontWeight:700 }}>Reply-To:</span><span style={{ color:'#94a3b8' }}>{preview.replyTo}</span></>}
              <span style={{ color:'#2d4a6b', fontWeight:700 }}>Subject:</span><span style={{ color:'#fde047', fontWeight:700 }}>{preview.subject}</span>
            </div>
            <div style={{ borderTop:'1px solid #1a3050', paddingTop:11, fontSize:12, color:'#94a3b8', whiteSpace:'pre-wrap', fontFamily:'monospace', lineHeight:1.7 }}>{preview.body}</div>
          </div>
          {!preview.eligible && <div style={{ padding:'8px 12px', background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', borderRadius:7, color:'#f87171', fontSize:12, marginBottom:10 }}>
            ⚠️ Not eligible — email sent within interval or task is Done.
          </div>}
          <div style={{ fontSize:11, color:'#2d4a6b' }}>Action: <Badge action={preview.action} /> · Edit template in ⚙️ Settings</div>
        </> : <div style={{ color:'#f87171' }}>Failed to load preview.</div>}
      </MB>
      <MF>
        <Btn outline="#1a3050" onClick={onGoSettings} small>✎ Edit Template</Btn>
        <div style={{ flex:1 }} />
        <Btn outline="#1a3050" onClick={onClose}>Close</Btn>
        <Btn grad="linear-gradient(135deg,#2563eb,#4f46e5)" onClick={send} disabled={sending || !preview?.eligible}>
          {sending ? '⏳ Sending…' : 'Send ✉'}
        </Btn>
      </MF>
    </Modal>
  );
}

// ── Scheduler Result Modal ────────────────────────────────────────────────────
function SchedResultModal({ result, onClose }) {
  return (
    <Modal onClose={onClose}>
      <MH title="🕐 Scheduler Result" onClose={onClose} />
      <MB>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:16 }}>
          {[['Tasks','total','#60a5fa'],['Eligible','eligible','#fde047'],['Sent','sent','#4ade80'],['Failed','failed','#f87171']].map(([l,k,c]) => (
            <div key={k} style={{ background:'#060e1c', border:'1px solid #1a3050', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:c }}>{result[k]}</div>
              <div style={{ fontSize:9, color:'#2d4a6b', textTransform:'uppercase', fontWeight:700, letterSpacing:'0.07em', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
        {result.results?.length > 0 && (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead><tr>
              {['Task ID','Action','To','Status'].map(h => <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:'#2d4a6b', fontWeight:700, fontSize:9, textTransform:'uppercase', borderBottom:'1px solid #1a3050' }}>{h}</th>)}
            </tr></thead>
            <tbody>{result.results.map((r, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #0a1628' }}>
                <td style={{ padding:'6px 8px', color:'#4a6a8a', fontFamily:'monospace' }}>{r.taskId}</td>
                <td style={{ padding:'6px 8px' }}><Badge action={r.action} /></td>
                <td style={{ padding:'6px 8px', color:'#60a5fa', fontSize:10 }}>{r.to}</td>
                <td style={{ padding:'6px 8px' }}>
                  <span style={{ color: r.success ? '#4ade80' : '#f87171', fontWeight:700, fontSize:11 }}>
                    {r.success ? '✓ Sent' : `✗ ${r.error || 'Failed'}`}
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {result.results?.length === 0 && <div style={{ textAlign:'center', color:'#2d4a6b', fontStyle:'italic', padding:'12px 0' }}>No eligible tasks found for this run.</div>}
      </MB>
      <MF><Btn outline="#1a3050" onClick={onClose}>Close</Btn></MF>
    </Modal>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks]       = useState([]);
  const [logs, setLogs]         = useState([]);
  const [settings, setSettings] = useState(null);
  const [schedStatus, setSchedStatus] = useState(null);
  const [schedResult, setSchedResult] = useState(null);

  const [view, setView]         = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [doneTask, setDoneTask] = useState(null);
  const [emailTaskId, setEmailTaskId] = useState(null);

  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);

  const [fs, setFs] = useState('All');
  const [fa, setFa] = useState('All');
  const [fl, setFl] = useState('All');
  const [q, setQ]   = useState('');

  const [toast, setToast]       = useState(null);
  const fileRef                 = useRef();
  const [upMode, setUpMode]     = useState('merge');

  const notify = (msg, type='ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  // ── Load everything ──
  const loadTasks    = useCallback(async () => { try { const r = await api.getTasks(); setTasks(r.data || []); } catch (e) { notify('Load failed: ' + e.message, 'err'); } }, []);
  const loadLogs     = useCallback(async () => { try { const r = await api.getLogs(); setLogs(r.data || []); } catch {/**/} }, []);
  const loadSettings = useCallback(async () => { try { const r = await api.getSettings(); setSettings(r.data); } catch {/**/} }, []);
  const loadSchedStatus = useCallback(async () => { try { const r = await api.schedulerStatus(); setSchedStatus(r); } catch {/**/} }, []);

  useEffect(() => {
    Promise.all([loadTasks(), loadLogs(), loadSettings(), loadSchedStatus()])
      .finally(() => setLoading(false));
    const interval = setInterval(() => { loadTasks(); loadSchedStatus(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Actions ──
  const runScheduler = async () => {
    setRunning(true);
    try {
      const r = await api.runScheduler();
      setSchedResult(r.result);
      setView('schedResult');
      await Promise.all([loadTasks(), loadLogs()]);
      notify(`Scheduler done · ${r.result.sent} sent, ${r.result.failed} failed`);
    } catch (e) { notify('Scheduler error: ' + e.message, 'err'); }
    setRunning(false);
  };

  const handleAdd = async (f) => {
    try { await api.createTask(f); await loadTasks(); setView(null); notify('Task added ✓'); }
    catch (e) { notify(e.message, 'err'); }
  };

  const handleEdit = async (f) => {
    try { await api.updateTask(f.id, f); await loadTasks(); setView(null); notify('Task updated ✓'); }
    catch (e) { notify(e.message, 'err'); }
  };

  const markDone = async () => {
    try { await api.markDone(doneTask.id); await loadTasks(); setView(null); setDoneTask(null); notify('Marked Done ✓'); }
    catch (e) { notify(e.message, 'err'); }
  };

  const delTask = async (id) => {
    try { await api.deleteTask(id); setTasks(p => p.filter(t => t.id !== id)); notify('Deleted', 'info'); }
    catch (e) { notify(e.message, 'err'); }
  };

  const saveSettings = async (s) => {
    try {
      await api.saveSettings({ ...s, schedulerEnabled: String(s.schedulerEnabled) });
      setSettings(s);
      setView(null);
      notify('Settings saved ✓');
      await loadSchedStatus();
    } catch (e) { notify(e.message, 'err'); }
  };

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const r = await api.importTasks(file, upMode);
      await loadTasks();
      setView(null);
      notify(`Imported ${r.imported} tasks (${r.mode})`);
    } catch (e) { notify(e.message, 'err'); }
    e.target.value = '';
  };

  const exportCSV = () => {
    const h = ['Task ID','Name','Location','Due Date','Status','Action','Concerned Person','Email','Manager','Mgr Email','Last Email Sent','Days Overdue'];
    const rows = tasks.map(t => [t.id,t.name,t.location,t.dueDate,t.status,t.action||'',t.concernedName,t.concernedEmail,t.managerName,t.managerEmail,t.lastEmailSent,t.daysOverdue??'']);
    const csv = [h,...rows].map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'tasks.csv'; a.click();
  };

  // ── Filter ──
  const locs  = ['All', ...new Set(tasks.map(t => t.location).filter(Boolean))];
  const aOpts = ['All','Upcoming','Due','Gentle Reminder','Reminder','Urgent','Escalate','Done'];
  const filtered = tasks.filter(t => {
    const disp = t.status === 'Done' ? 'Done' : (t.action || 'Upcoming');
    if (fs !== 'All' && t.status !== fs) return false;
    if (fa !== 'All' && disp !== fa) return false;
    if (fl !== 'All' && t.location !== fl) return false;
    if (q && !Object.values(t).join(' ').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const ST = {
    total: tasks.length, pending: tasks.filter(t => t.status === 'Pending').length,
    done: tasks.filter(t => t.status === 'Done').length,
    urgent: tasks.filter(t => t.action === 'Urgent').length,
    esc: tasks.filter(t => t.action === 'Escalate').length,
    emails: logs.length,
  };

  const inpSel = { background:'#0a1628', border:'1px solid #1a3050', borderRadius:7, padding:'6px 10px', color:'#94a3b8', fontSize:11, cursor:'pointer', outline:'none' };

  if (loading) return (
    <div style={{ background:'#060e1c', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a6a8a', fontSize:14 }}>
      ⚡ Loading TaskEscalate…
    </div>
  );

  return (
    <div style={{ fontFamily:'system-ui,sans-serif', background:'#060e1c', minHeight:'100vh', color:'#e2e8f0' }}>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#060e1c}::-webkit-scrollbar-thumb{background:#1a3050;border-radius:3px}button:hover{filter:brightness(1.12)}input:focus,select:focus,textarea:focus{outline:2px solid #2563eb;outline-offset:-1px}@keyframes pop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Toast */}
      {toast && <div style={{ position:'fixed', top:14, right:14, zIndex:9999, animation:'pop .2s ease',
        background: toast.type==='ok' ? '#052e16' : toast.type==='err' ? '#1e0a0a' : '#0c1930',
        border:`1px solid ${toast.type==='ok'?'#166534':toast.type==='err'?'#7f1d1d':'#1a3050'}`,
        borderRadius:9, padding:'9px 15px', fontWeight:700, fontSize:13,
        color: toast.type==='ok'?'#4ade80':toast.type==='err'?'#f87171':'#93c5fd',
        boxShadow:'0 6px 30px rgba(0,0,0,.6)' }}>
        {toast.msg}
      </div>}

      {/* Header */}
      <div style={{ background:'#0a1628', borderBottom:'1px solid #1a3050', padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, position:'sticky', top:0, zIndex:50 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:17, background:'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>⚡ TaskEscalate</div>
          <div style={{ fontSize:10, color:'#1a3050', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:1 }}>
            Task Reminder & Escalation · Backend Connected
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <Btn grad="linear-gradient(135deg,#1d4ed8,#4338ca)" onClick={runScheduler} disabled={running}>
            {running ? '⏳ Running…' : '▶ Run Scheduler'}
          </Btn>
          <Btn outline="#1a3050" onClick={async () => { await loadLogs(); setView('log'); }}>📋 Log ({logs.length})</Btn>
          <Btn outline="#1a3050" onClick={() => setView('upload')}>📤 Upload Excel</Btn>
          <Btn outline="#1a3050" onClick={exportCSV}>📥 Export CSV</Btn>
          <Btn outline="#374151" onClick={() => setView('settings')}>⚙️ Settings</Btn>
          <Btn grad="linear-gradient(135deg,#2563eb,#7c3aed)" onClick={() => { setEditTask(null); setView('form'); }}>＋ New Task</Btn>
        </div>
      </div>

      {/* Config bar */}
      <div style={{ background:'#070d1a', borderBottom:'1px solid #0f2040', padding:'4px 18px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap', fontSize:11 }}>
        <span style={{ color:'#1a3050', fontWeight:800, fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em' }}>Config:</span>
        {settings ? <>
          <span style={{ color:'#2d4a6b' }}>From: <span style={{ color:'#60a5fa' }}>{settings.senderName} &lt;{settings.senderEmail}&gt;</span></span>
          <span style={{ color:'#2d4a6b' }}>Provider: <span style={{ color:'#a78bfa', fontWeight:700, textTransform:'uppercase' }}>{settings.emailProvider}</span></span>
          <span style={{ color:'#2d4a6b' }}>Interval: <span style={{ color:'#fde047', fontWeight:700 }}>{settings.intervalDays}d</span></span>
          <span style={{ color:'#2d4a6b' }}>Scheduler: <span style={{ color: schedStatus?.enabled ? '#4ade80' : '#f87171', fontWeight:700 }}>{schedStatus?.enabled ? 'ON' : 'OFF'}</span> @ {settings.schedulerTime}</span>
          {schedStatus?.lastRun && <span style={{ color:'#1a3050' }}>Last run: {new Date(schedStatus.lastRun.ranAt).toLocaleTimeString()}</span>}
        </> : <span style={{ color:'#2d4a6b' }}>Loading settings…</span>}
        <span onClick={() => setView('settings')} style={{ marginLeft:'auto', cursor:'pointer', color:'#4a6a8a', fontSize:10, fontWeight:700, border:'1px solid #1a3050', padding:'2px 8px', borderRadius:5 }}>Edit ⚙️</span>
      </div>

      <div style={{ padding:'14px 18px' }}>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:14 }}>
          {[['Total',ST.total,'#60a5fa'],['Pending',ST.pending,'#fde047'],['Done',ST.done,'#4ade80'],['Urgent',ST.urgent,'#fb923c'],['Escalate',ST.esc,'#f87171'],['Emails Sent',ST.emails,'#a78bfa']].map(([l,v,c]) => (
            <div key={l} style={{ background:'#0a1628', border:'1px solid #1a3050', borderRadius:10, padding:'10px 12px' }}>
              <div style={{ fontSize:21, fontWeight:900, color:c, lineHeight:1, letterSpacing:'-0.04em' }}>{v}</div>
              <div style={{ fontSize:9, color:'#2d4a6b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:10, alignItems:'center' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search…" style={{ ...inpSel, minWidth:170, color:'#e2e8f0' }} />
          <select style={inpSel} value={fs} onChange={e => setFs(e.target.value)}><option value="All">All Statuses</option><option>Pending</option><option>Done</option></select>
          <select style={inpSel} value={fa} onChange={e => setFa(e.target.value)}>{aOpts.map(a => <option key={a} value={a}>{a === 'All' ? 'All Actions' : a}</option>)}</select>
          <select style={inpSel} value={fl} onChange={e => setFl(e.target.value)}>{locs.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}</select>
          <Btn outline="#1a3050" small onClick={loadTasks}>↺ Refresh</Btn>
          <span style={{ marginLeft:'auto', fontSize:11, color:'#2d4a6b', fontWeight:600 }}>{filtered.length}/{tasks.length}</span>
        </div>

        {/* Table */}
        <div style={{ background:'#08111f', border:'1px solid #1a3050', borderRadius:11, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:12 }}>
            <thead>
              <tr>{['Task ID','Name','Location','Due Date','Status','Action','Concerned','Email','Manager','Mgr Email','Last Sent','Overdue','Actions'].map(h => (
                <th key={h} style={{ background:'#060e1c', padding:'8px 9px', textAlign:'left', color:'#2d4a6b', fontWeight:700, fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em', whiteSpace:'nowrap', borderBottom:'1px solid #1a3050' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={13} style={{ padding:'28px', textAlign:'center', color:'#1a3050', fontStyle:'italic' }}>No tasks found.</td></tr>
                : filtered.map((t, i) => {
                  const ak = t.status === 'Done' ? '' : (t.action || '');
                  return (
                    <tr key={t.id}
                      style={{ background: i%2===0?'transparent':(AC[ak]?.bg?.replace('.14','0.04')||'transparent'), borderBottom:'1px solid #0a1628', transition:'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = AC[ak]?.bg?.replace('.18','0.07') || 'rgba(255,255,255,.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = i%2===0?'transparent':(AC[ak]?.bg?.replace('.14','0.04')||'transparent')}>
                      <td style={{ padding:'7px 9px', color:'#2d4a6b', fontFamily:'monospace', fontSize:11 }}>{t.id}</td>
                      <td style={{ padding:'7px 9px', color:'#e2e8f0', fontWeight:600, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.name}>{t.name}</td>
                      <td style={{ padding:'7px 9px', color:'#4a6a8a', whiteSpace:'nowrap' }}>{t.location||'—'}</td>
                      <td style={{ padding:'7px 9px', color:'#4a6a8a', fontFamily:'monospace', fontSize:11, whiteSpace:'nowrap' }}>{fd(t.dueDate)}</td>
                      <td style={{ padding:'7px 9px' }}>
                        <span style={{ padding:'2px 7px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap',
                          background: t.status==='Done'?'rgba(74,222,128,.12)':'rgba(250,204,21,.1)',
                          color: t.status==='Done'?'#4ade80':'#facc15',
                          border:`1px solid ${t.status==='Done'?'rgba(74,222,128,.3)':'rgba(250,204,21,.25)'}` }}>
                          {t.status==='Done'?'✓ Done':'● Pending'}
                        </span>
                      </td>
                      <td style={{ padding:'7px 9px' }}><Badge action={ak} /></td>
                      <td style={{ padding:'7px 9px', color:'#94a3b8', whiteSpace:'nowrap' }}>{t.concernedName||'—'}</td>
                      <td style={{ padding:'7px 9px', color:'#2d4a6b', fontSize:11, whiteSpace:'nowrap' }}>{t.concernedEmail||'—'}</td>
                      <td style={{ padding:'7px 9px', color:'#94a3b8', whiteSpace:'nowrap' }}>{t.managerName||'—'}</td>
                      <td style={{ padding:'7px 9px', color:'#2d4a6b', fontSize:11, whiteSpace:'nowrap' }}>{t.managerEmail||'—'}</td>
                      <td style={{ padding:'7px 9px', color:'#2d4a6b', fontFamily:'monospace', fontSize:11, whiteSpace:'nowrap' }}>{fd(t.lastEmailSent)}</td>
                      <td style={{ padding:'7px 9px', textAlign:'center' }}>
                        {t.daysOverdue != null
                          ? <span style={{ fontWeight:800, fontFamily:'monospace', fontSize:12, color: t.daysOverdue>7?'#f87171':t.daysOverdue>4?'#fb923c':'#fde047' }}>{t.daysOverdue}d</span>
                          : <span style={{ color:'#1a3050' }}>—</span>}
                      </td>
                      <td style={{ padding:'7px 9px' }}>
                        <div style={{ display:'flex', gap:4 }}>
                          {t.status !== 'Done' && <button title="Email" onClick={() => { setEmailTaskId(t.id); setView('email'); }}
                            style={{ background:'rgba(37,99,235,.18)', border:'1px solid rgba(37,99,235,.35)', borderRadius:5, padding:'3px 7px', color:'#60a5fa', cursor:'pointer', fontSize:11 }}>✉</button>}
                          <button title="Edit" onClick={() => { setEditTask(t); setView('form'); }}
                            style={{ background:'rgba(255,255,255,.04)', border:'1px solid #1a3050', borderRadius:5, padding:'3px 7px', color:'#4a6a8a', cursor:'pointer', fontSize:11 }}>✎</button>
                          {t.status !== 'Done' && <button title="Mark Done" onClick={() => { setDoneTask(t); setView('done'); }}
                            style={{ background:'rgba(74,222,128,.1)', border:'1px solid rgba(74,222,128,.25)', borderRadius:5, padding:'3px 7px', color:'#4ade80', cursor:'pointer', fontSize:11 }}>✓</button>}
                          <button title="Delete" onClick={() => delTask(t.id)}
                            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.25)', borderRadius:5, padding:'3px 7px', color:'#f87171', cursor:'pointer', fontSize:11 }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ marginTop:9, display:'flex', flexWrap:'wrap', gap:5, alignItems:'center' }}>
          <span style={{ fontSize:9, color:'#1a3050', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700 }}>Legend:</span>
          {Object.entries(AC).filter(([k]) => k !== '').map(([k,m]) => (
            <span key={k} style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700, color:m.tc, background:m.bg, border:`1px solid ${m.bc}` }}>{m.label}</span>
          ))}
        </div>
      </div>

      {/* ── Modals ── */}
      {view === 'settings' && settings && <SettingsModal initial={settings} onSave={saveSettings} onClose={() => setView(null)} notify={notify} />}

      {view === 'form' && <TaskModal init={editTask} onSave={editTask ? handleEdit : handleAdd} onClose={() => setView(null)} />}

      {view === 'email' && emailTaskId && <EmailModal taskId={emailTaskId} onClose={() => setView(null)} onGoSettings={() => setView('settings')} notify={notify} refreshTasks={loadTasks} />}

      {view === 'schedResult' && schedResult && <SchedResultModal result={schedResult} onClose={() => setView(null)} />}

      {view === 'done' && doneTask && (
        <Modal onClose={() => setView(null)}>
          <MH title="Confirm Mark as Done" onClose={() => setView(null)} />
          <MB><p style={{ color:'#94a3b8', lineHeight:1.7 }}>Mark <strong style={{ color:'#e2e8f0' }}>"{doneTask.name}"</strong> as Done?<br /><span style={{ fontSize:12, color:'#4a6a8a' }}>This stops all future email reminders.</span></p></MB>
          <MF>
            <Btn outline="#1a3050" onClick={() => setView(null)}>Cancel</Btn>
            <Btn grad="linear-gradient(135deg,#166534,#15803d)" onClick={markDone}>✓ Mark as Done</Btn>
          </MF>
        </Modal>
      )}

      {view === 'log' && (
        <Modal onClose={() => setView(null)} wide>
          <MH title={`📋 Email Audit Log (${logs.length})`} onClose={() => setView(null)} />
          <MB>
            {logs.length === 0
              ? <div style={{ textAlign:'center', padding:'24px 0', color:'#2d4a6b', fontStyle:'italic' }}>No emails logged yet.</div>
              : <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead><tr>{['#','Time','Task','Action','Status','From','To','CC','Subject'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:'#2d4a6b', fontWeight:700, fontSize:9, textTransform:'uppercase', borderBottom:'1px solid #1a3050' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{logs.map(l => (
                    <tr key={l.id} style={{ borderBottom:'1px solid #0a1628' }}>
                      <td style={{ padding:'6px 8px', color:'#1a3050' }}>{l.id}</td>
                      <td style={{ padding:'6px 8px', color:'#2d4a6b', fontFamily:'monospace', fontSize:10, whiteSpace:'nowrap' }}>{l.sent_at}</td>
                      <td style={{ padding:'6px 8px', color:'#94a3b8', maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.task_name}</td>
                      <td style={{ padding:'6px 8px' }}><Badge action={l.action} /></td>
                      <td style={{ padding:'6px 8px' }}>
                        <span style={{ color: l.status==='sent'?'#4ade80':'#f87171', fontWeight:700 }}>
                          {l.status==='sent'?'✓ Sent':'✗ Failed'}
                        </span>
                        {l.error_msg && <span style={{ color:'#f87171', fontSize:10, display:'block' }}>{l.error_msg}</span>}
                      </td>
                      <td style={{ padding:'6px 8px', color:'#4a6a8a', fontSize:10, whiteSpace:'nowrap' }}>{l.from_addr}</td>
                      <td style={{ padding:'6px 8px', color:'#60a5fa', fontSize:10, whiteSpace:'nowrap' }}>{l.to_addr}</td>
                      <td style={{ padding:'6px 8px', color:'#2d4a6b', fontSize:10 }}>{l.cc_addr||'—'}</td>
                      <td style={{ padding:'6px 8px', color:'#4a6a8a', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:10 }}>{l.subject}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
          </MB>
          <MF><Btn outline="#1a3050" onClick={() => setView(null)}>Close</Btn></MF>
        </Modal>
      )}

      {view === 'upload' && (
        <Modal onClose={() => setView(null)}>
          <MH title="📤 Upload Excel" onClose={() => setView(null)} />
          <MB>
            <p style={{ color:'#4a6a8a', fontSize:12, marginBottom:12, lineHeight:1.6 }}>
              Upload a <code style={{ background:'#1a3050', padding:'1px 5px', borderRadius:4, color:'#93c5fd' }}>.xlsx</code> file.<br />
              <span style={{ fontFamily:'monospace', fontSize:11, color:'#2d4a6b' }}>Columns: Task ID · Product / Task Name · Location · Due Date · Task Status · Concerned Person Name/Email · Manager Name/Email · Last Email Sent Date</span>
            </p>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, color:'#4a6a8a', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Upload Mode</div>
              <div style={{ display:'flex', gap:8 }}>
                {['merge','overwrite'].map(m => (
                  <button key={m} onClick={() => setUpMode(m)}
                    style={{ padding:'7px 14px', borderRadius:7, border:`1px solid ${upMode===m?'#4f46e5':'#1a3050'}`, background: upMode===m?'linear-gradient(135deg,#2563eb,#4f46e5)':'transparent', color: upMode===m?'#fff':'#4a6a8a', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    {m==='merge'?'🔀 Merge':'♻️ Overwrite All'}
                  </button>
                ))}
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={handleFile} />
            <Btn grad="linear-gradient(135deg,#2563eb,#4f46e5)" full onClick={() => fileRef.current?.click()}>📂 Choose .xlsx File</Btn>
          </MB>
        </Modal>
      )}
    </div>
  );
}
