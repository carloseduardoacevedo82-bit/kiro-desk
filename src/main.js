// Kiro Desk — proceso principal.
const path = require('path');
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, Notification, shell, powerMonitor } = require('electron');
const store = require('./store');
const F = require('./features');
const C = require('./commands');
const ai = require('./ai');
const voice = require('./voice');
const updater = require('./updater');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.kirodesk.app');

let win = null;
let tray = null;
let mode = 'collapsed';
let pinned = false;

const SIZES = {
  collapsed: { w: 360, h: 72 },
  notice: { w: 460, h: 160 },
  expanded: { w: 760, h: 440 },
};

function place(m) {
  const { w, h } = SIZES[m];
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: Math.round(wa.x + (wa.width - w) / 2), y: wa.y, width: w, height: h });
}

function setMode(m) {
  if (!win || !SIZES[m]) return;
  mode = m;
  place(m);
  if (m === 'expanded') win.focus();
  send('island:mode', m);
}

function send(ch, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, payload);
}
const refresh = () => send('data', F.snapshot());

function createWindow() {
  win = new BrowserWindow({
    width: SIZES.collapsed.w,
    height: SIZES.collapsed.h,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    icon: iconPath(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  place('collapsed');
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  win.webContents.session.setPermissionCheckHandler((_wc, perm) => perm === 'media');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => { if (mode === 'expanded' && !pinned) setMode('collapsed'); });
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  // No permitir navegar a otros sitios dentro de la isla.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  screen.on('display-metrics-changed', () => place(mode));
}

function iconPath() {
  return path.join(__dirname, 'renderer', 'icon.png');
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Kiro Desk');
  const build = () => Menu.buildFromTemplate([
    { label: 'Abrir Kiro', click: () => { win.show(); setMode('expanded'); } },
    { label: 'Hablarle (Ctrl+Alt+K)', click: () => send('voice:trigger') },
    { type: 'separator' },
    { label: 'Buscar actualizaciones', click: () => { updater.check(); win.show(); setMode('notice'); } },
    { label: 'Iniciar con Windows', type: 'checkbox', checked: store.get().settings.autostart, click: (i) => { setSetting('autostart', i.checked); } },
    { label: `Versión ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(build());
  tray.on('click', () => { win.show(); setMode(mode === 'expanded' ? 'collapsed' : 'expanded'); });
  tray.rebuild = () => tray.setContextMenu(build());
}

function setSetting(key, value) {
  const s = store.get().settings;
  s[key] = value;
  store.save();
  if (key === 'autostart' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!value });
  tray?.rebuild?.();
  refresh();
}

// ---------- Entrada de texto/voz ----------
let thinking = false;
async function handleInput(text, source = 'text') {
  text = String(text || '').trim();
  if (!text) return { reply: '', emotion: 'neutral' };
  const quick = C.quickParse(text);
  if (quick) {
    const r = C.execute(quick);
    ai.remember('user', text);
    ai.remember('assistant', r.said.join(' '));
    refresh();
    return { reply: r.said.join(' '), emotion: r.confirm ? 'pensando' : 'feliz', badge: r.badge, confirm: r.confirm, ok: !!r.badge };
  }
  const st = await ai.status();
  if (!st.running) return { reply: 'Mi cerebro (Ollama) no está encendido. Ábrelo desde el menú Inicio o en Ajustes. Mientras tanto entiendo comandos simples. ' + C.HELP, emotion: 'preocupado' };
  if (!st.hasModel) return { reply: 'Todavía no descargué mi modelo de IA. Ve a Ajustes y pulsa "Descargar modelo".', emotion: 'preocupado' };
  thinking = true;
  send('kiro:state', 'pensando');
  try {
    const out = await ai.ask(C.stripWake(text));
    const r = C.execute(out.actions);
    refresh();
    const reply = [out.reply, ...r.said.filter((s) => !out.reply.includes(s))].join(' ').trim();
    return { reply, emotion: out.emotion, badge: r.badge, confirm: r.confirm, ok: !!r.badge };
  } catch (e) {
    return { reply: `Uy, tuve un problema pensando: ${e.message}`, emotion: 'triste' };
  } finally {
    thinking = false;
  }
}

// ---------- Reloj: recordatorios, timers y enfoque ----------
function tick() {
  const due = F.takeDue();
  for (const r of due) {
    const late = Date.now() - r.at > 90000;
    alert({ title: r.kind === 'timer' ? '¡Tiempo!' : 'Recordatorio', text: late ? `Mientras no estabas: ${r.text}` : r.text, sound: true, emotion: 'sorprendido' });
  }
  const f = F.focusTick();
  if (f === 'break') alert({ title: 'Enfoque', text: '¡Bien hecho! 25 minutos de enfoque. Ahora 5 de descanso.', sound: true, emotion: 'emocionado' });
  if (f === 'done') alert({ title: 'Descanso', text: 'Se acabó el descanso. ¿Otra ronda de enfoque?', sound: true, emotion: 'feliz' });
  if (due.length || f) refresh();
}

function alert({ title, text, sound, emotion }) {
  if (win && !win.isVisible()) win.showInactive();
  if (mode !== 'expanded') setMode('notice');
  send('alert', { title, text, sound, emotion });
  if (Notification.isSupported() && !win?.isFocused()) {
    new Notification({ title: `Kiro · ${title}`, body: text, icon: iconPath(), silent: true }).show();
  }
}

// ---------- IPC ----------
function ipc() {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
    try { const r = await fn(...a); return r; } catch (e) { return { error: e.message }; }
  });
  h('data:get', () => F.snapshot());
  h('island:mode', (m) => setMode(m));
  h('island:pin', (v) => { pinned = !!v; });
  h('input', (text, source) => handleInput(text, source));
  h('tasks:add', (t) => { F.addTask(t); refresh(); });
  h('tasks:toggle', (id) => { F.toggleTask(id); refresh(); });
  h('tasks:delete', (id) => { F.deleteTask(id); refresh(); });
  h('reminders:delete', (id) => { F.deleteReminder(id); refresh(); });
  h('habits:add', (name, goal, style) => { F.addHabit(name, goal, style); refresh(); });
  h('habits:inc', (id, d) => { F.habitInc(id, d); refresh(); });
  h('habits:delete', (id) => { F.deleteHabit(id); refresh(); });
  h('focus:start', (m) => { F.focusStart(m); refresh(); });
  h('focus:stop', () => { F.focusStop(); refresh(); });
  h('desktop:scan', () => { C.markPreview(); return F.desktopScan(); });
  h('desktop:organize', () => { const r = F.desktopOrganize(); refresh(); return r; });
  h('desktop:undo', () => { const r = F.desktopUndo(); refresh(); return r; });
  h('desktop:open', () => shell.openPath(app.getPath('desktop')));
  h('voice:status', () => voice.status());
  h('voice:download', async () => { await voice.download((pct) => send('voice:download', pct)); return voice.status(); });
  h('voice:transcribe', (wav) => voice.transcribe(wav));
  h('settings:set', (k, v) => setSetting(k, v));
  h('ai:status', () => ai.status());
  h('ai:pull', async () => { await ai.pullModel((pct, status) => send('ai:pull', { pct, status })); ai.warmup(); return true; });
  h('ai:openOllama', () => shell.openExternal('https://ollama.com/download/windows'));
  h('chat:clear', () => { store.get().chat = []; store.save(); refresh(); });
  h('update:check', () => updater.check());
  h('update:install', () => updater.installNow());
  h('update:postpone', () => updater.postpone());
  h('update:state', () => updater.getState());
  h('app:quit', () => { app.isQuitting = true; app.quit(); });
}

app.whenReady().then(() => {
  store.load();
  const s = store.get();
  ipc();
  createWindow();
  createTray();

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!s.settings.autostart });
  globalShortcut.register('Control+Alt+K', () => { win.show(); send('voice:trigger'); });
  globalShortcut.register('Control+Alt+Space', () => { win.show(); setMode(mode === 'expanded' ? 'collapsed' : 'expanded'); });

  updater.init({ notify: send, busy: () => !!store.get().focus.active || thinking });

  setInterval(tick, 5000);
  setTimeout(tick, 2500);
  powerMonitor.on('resume', () => setTimeout(tick, 1500));

  ai.status().then((st) => { if (st.running && st.hasModel) ai.warmup(); });
  // Descarga la voz (Whisper) la primera vez, en segundo plano.
  if (!voice.status().ready) voice.download((pct) => send('voice:download', pct)).catch(() => {});
});

app.on('second-instance', () => { if (win) { win.show(); setMode('expanded'); } });
app.on('before-quit', () => { app.isQuitting = true; store.get().lastSeen = Date.now(); store.flush(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
