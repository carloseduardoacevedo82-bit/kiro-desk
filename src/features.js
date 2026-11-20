// Lógica de tareas, recordatorios, timers, hábitos, enfoque, ordenar escritorio y abrir apps.
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { spawn } = require('child_process');
const store = require('./store');

const S = () => store.get();

// ---------- Tareas ----------
function addTask(text) {
  text = String(text || '').trim();
  if (!text) throw new Error('La tarea está vacía');
  const t = { id: store.id(), text, done: false, createdAt: Date.now(), doneAt: null };
  S().tasks.unshift(t);
  store.save();
  return t;
}
function toggleTask(id) {
  const t = S().tasks.find((x) => x.id === id);
  if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; store.save(); }
  return t;
}
function completeTaskByText(text) {
  const q = norm(text);
  const t = S().tasks.find((x) => !x.done && norm(x.text).includes(q));
  if (t) { t.done = true; t.doneAt = Date.now(); store.save(); }
  return t;
}
function deleteTask(id) {
  S().tasks = S().tasks.filter((x) => x.id !== id);
  store.save();
}

// ---------- Recordatorios y timers ----------
function addReminder(text, at, kind = 'reminder') {
  if (!Number.isFinite(at)) throw new Error('No entendí la hora');
  const r = { id: store.id(), text: String(text || (kind === 'timer' ? 'Timer' : 'Recordatorio')).trim(), at, fired: false, kind };
  S().reminders.push(r);
  S().reminders.sort((a, b) => a.at - b.at);
  store.save();
  return r;
}
function deleteReminder(id) {
  S().reminders = S().reminders.filter((x) => x.id !== id);
  store.save();
}
// Devuelve los vencidos y los marca como disparados.
function takeDue(now = Date.now()) {
  const due = S().reminders.filter((r) => !r.fired && r.at <= now);
  due.forEach((r) => { r.fired = true; });
  // Limpia los disparados de hace más de 2 días.
  S().reminders = S().reminders.filter((r) => !r.fired || now - r.at < 2 * 86400000);
  if (due.length) store.save();
  return due;
}

// ---------- Hábitos ----------
const HABIT_STYLES = ['agua', 'leer', 'ejercicio', 'meditar', 'caminar', 'dormir', 'fruta', 'estudiar', 'estirar', 'escribir', 'vitaminas', 'sin-pantalla', 'orden', 'gratitud', 'musica'];
function addHabit(name, goal = 1, style = 'agua') {
  name = String(name || '').trim();
  if (!name) throw new Error('Ponle un nombre al hábito');
  const h = { id: store.id(), name, goal: Math.max(1, Math.min(50, Number(goal) || 1)), style: HABIT_STYLES.includes(style) ? style : guessStyle(name), log: {} };
  S().habits.push(h);
  store.save();
  return h;
}
function guessStyle(name) {
  const n = norm(name);
  const map = { agua: 'agua', vaso: 'agua', leer: 'leer', libro: 'leer', pesas: 'ejercicio', ejercicio: 'ejercicio', gym: 'ejercicio', medit: 'meditar', camin: 'caminar', pasos: 'caminar', dorm: 'dormir', fruta: 'fruta', estudi: 'estudiar', estir: 'estirar', escrib: 'escribir', diario: 'escribir', vitamin: 'vitaminas', pantalla: 'sin-pantalla', orden: 'orden', gracias: 'gratitud', gratitud: 'gratitud', musica: 'musica', guitarra: 'musica' };
  for (const k of Object.keys(map)) if (n.includes(k)) return map[k];
  return 'agua';
}
function habitInc(id, delta = 1) {
  const h = S().habits.find((x) => x.id === id);
  if (!h) return null;
  const d = store.today();
  h.log[d] = Math.max(0, (h.log[d] || 0) + delta);
  store.save();
  return h;
}
function habitIncByName(name, delta = 1) {
  const q = norm(name);
  const h = S().habits.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)) || x.style === guessStyle(name));
  return h ? habitInc(h.id, delta) : null;
}
function deleteHabit(id) {
  S().habits = S().habits.filter((x) => x.id !== id);
  store.save();
}
function streak(h) {
  let n = 0;
  const d = new Date();
  if ((h.log[store.today(d)] || 0) < h.goal) d.setDate(d.getDate() - 1); // hoy aún no cuenta
  while ((h.log[store.today(d)] || 0) >= h.goal) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- Enfoque (pomodoro 25/5) ----------
const WORK_MIN = 25;
const BREAK_MIN = 5;
function focusStart(minutes = WORK_MIN) {
  const m = Math.max(1, Math.min(180, Number(minutes) || WORK_MIN));
  S().focus.active = { phase: 'work', minutes: m, startedAt: Date.now(), endsAt: Date.now() + m * 60000 };
  store.save();
  return S().focus.active;
}
function focusBreak(minutes = BREAK_MIN) {
  S().focus.active = { phase: 'break', minutes, startedAt: Date.now(), endsAt: Date.now() + minutes * 60000 };
  store.save();
  return S().focus.active;
}
function focusStop() {
  const a = S().focus.active;
  if (a && a.phase === 'work') logFocus(Math.round((Date.now() - a.startedAt) / 60000));
  S().focus.active = null;
  store.save();
}
function logFocus(minutes) {
  if (minutes < 1) return;
  S().focus.sessions.push({ date: store.today(), minutes });
  S().focus.sessions = S().focus.sessions.slice(-500);
}
// Llamado por el reloj: avanza fases. Devuelve evento o null.
function focusTick(now = Date.now()) {
  const a = S().focus.active;
  if (!a || now < a.endsAt) return null;
  if (a.phase === 'work') {
    logFocus(a.minutes);
    focusBreak();
    return 'break';
  }
  S().focus.active = null;
  store.save();
  return 'done';
}
function focusWeek() {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    const key = store.today(d);
    out.push({ date: key, day: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'][d.getDay()], minutes: S().focus.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.minutes, 0) });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---------- Ordenar escritorio ----------
const CATS = {
  'Imágenes': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'svg', 'tif', 'tiff', 'ico'],
  'PDF': ['pdf'],
  'Documentos': ['doc', 'docx', 'odt', 'rtf', 'txt', 'md'],
  'Hojas de cálculo': ['xls', 'xlsx', 'xlsm', 'csv', 'ods'],
  'Presentaciones': ['ppt', 'pptx', 'odp'],
  'Videos': ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'webm'],
  'Música': ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'],
  'Comprimidos': ['zip', 'rar', '7z', 'tar', 'gz'],
  'Instaladores': ['exe', 'msi'],
};
const SKIP_EXT = ['lnk', 'url', 'ini', 'tmp', 'crdownload', 'part', 'bat', 'cmd', 'ps1'];
const ORDER_DIR = 'Escritorio ordenado';

function desktopDir() { return app.getPath('desktop'); }
function catOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!ext || SKIP_EXT.includes(ext)) return null;
  for (const [cat, exts] of Object.entries(CATS)) if (exts.includes(ext)) return cat;
  return 'Otros';
}
function desktopScan() {
  const dir = desktopDir();
  const groups = {};
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') || name.startsWith('~$')) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    const cat = catOf(name);
    if (!cat) continue;
    (groups[cat] ||= []).push(name);
    total++;
  }
  return { dir, total, groups, canUndo: !!S().organizerUndo };
}
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const base = p.slice(0, -ext.length || undefined);
  for (let i = 2; ; i++) { const c = `${base} (${i})${ext}`; if (!fs.existsSync(c)) return c; }
}
function desktopOrganize() {
  const { dir, groups } = desktopScan();
  const moves = [];
  const errors = [];
  for (const [cat, files] of Object.entries(groups)) {
    const target = path.join(dir, ORDER_DIR, cat);
    fs.mkdirSync(target, { recursive: true });
    for (const f of files) {
      const from = path.join(dir, f);
      const to = uniquePath(path.join(target, f));
      try { fs.renameSync(from, to); moves.push({ from, to }); } catch (e) { errors.push(`${f}: ${e.code || e.message}`); }
    }
  }
  if (moves.length) { S().organizerUndo = { at: Date.now(), moves }; store.save(); }
  return { moved: moves.length, errors };
}
function desktopUndo() {
  const u = S().organizerUndo;
  if (!u) return { restored: 0, errors: [] };
  let restored = 0;
  const errors = [];
  for (const m of [...u.moves].reverse()) {
    try {
      if (fs.existsSync(m.to)) { fs.renameSync(m.to, uniquePath(m.from)); restored++; }
    } catch (e) { errors.push(`${path.basename(m.to)}: ${e.code || e.message}`); }
  }
  // Borra carpetas que quedaron vacías (solo las nuestras).
  const root = path.join(desktopDir(), ORDER_DIR);
  try {
    for (const c of fs.readdirSync(root)) { const p = path.join(root, c); if (fs.statSync(p).isDirectory() && !fs.readdirSync(p).length) fs.rmdirSync(p); }
    if (!fs.readdirSync(root).length) fs.rmdirSync(root);
  } catch { /* nada */ }
  S().organizerUndo = null;
  store.save();
  return { restored, errors };
}

// ---------- Abrir apps (solo lista permitida) ----------
const APPS = {
  'navegador': { url: 'https://www.google.com' },
  'google': { url: 'https://www.google.com' },
  'chrome': { cmd: 'chrome' },
  'edge': { cmd: 'msedge' },
  'youtube': { url: 'https://www.youtube.com' },
  'gmail': { url: 'https://mail.google.com' },
  'correo': { url: 'https://mail.google.com' },
  'whatsapp': { url: 'https://web.whatsapp.com' },
  'bloc de notas': { cmd: 'notepad' },
  'notas': { cmd: 'notepad' },
  'calculadora': { cmd: 'calc' },
  'explorador': { cmd: 'explorer' },
  'archivos': { cmd: 'explorer' },
  'descargas': { folder: 'downloads' },
  'documentos': { folder: 'documents' },
  'escritorio': { folder: 'desktop' },
  'word': { cmd: 'winword' },
  'excel': { cmd: 'excel' },
  'powerpoint': { cmd: 'powerpnt' },
  'paint': { cmd: 'mspaint' },
  'configuracion': { url: 'ms-settings:' },
  'spotify': { url: 'spotify:' },
};
function openApp(name) {
  const q = norm(name);
  const key = Object.keys(APPS).find((k) => q.includes(norm(k)));
  if (!key) return null;
  const a = APPS[key];
  if (a.url) shell.openExternal(a.url);
  else if (a.folder) shell.openPath(app.getPath(a.folder));
  else spawn('cmd.exe', ['/c', 'start', '', a.cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return key;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Resumen para la UI.
function snapshot() {
  const s = S();
  const t = store.today();
  return {
    tasks: s.tasks,
    reminders: s.reminders.filter((r) => !r.fired),
    habits: s.habits.map((h) => ({ ...h, today: h.log[t] || 0, streak: streak(h) })),
    focus: { active: s.focus.active, week: focusWeek(), todayMinutes: s.focus.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0) },
    settings: s.settings,
    chat: s.chat.slice(-20),
    habitStyles: HABIT_STYLES,
    version: app.getVersion(),
  };
}

module.exports = {
  addTask, toggleTask, completeTaskByText, deleteTask,
  addReminder, deleteReminder, takeDue,
  addHabit, habitInc, habitIncByName, deleteHabit,
  focusStart, focusStop, focusTick,
  desktopScan, desktopOrganize, desktopUndo,
  openApp, APPS, norm, snapshot,
};
