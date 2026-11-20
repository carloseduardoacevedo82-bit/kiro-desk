/* global Kiro, kiro */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms) => { const d = new Date(ms); const t = new Date(); if (d.toDateString() === t.toDateString()) return 'hoy'; t.setDate(t.getDate() + 1); if (d.toDateString() === t.toDateString()) return 'mañana'; return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' }); };
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

let D = null;          // snapshot de datos
let tab = 'home';
let mode = 'collapsed';
let listening = false;
let lastReply = '';
let noticeTimer = null;
let updateState = null;
let pendingConfirm = null;

Kiro.mount($('#kiroSmall'));
Kiro.mount($('#kiroBig'));

// ---------- Modo de la isla ----------
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  kiro.setMode(m);
  if (m === 'expanded') { render(); setTimeout(() => $('#askInput').focus(), 250); }
}
kiro.on.mode((m) => { mode = m; document.body.dataset.mode = m; if (m === 'expanded') render(); });
$('#avatarBtn').onclick = () => setMode('expanded');
$('#barText').onclick = () => setMode('expanded');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMode('collapsed'); });

// ---------- Barra ----------
function updateBar() {
  if (!D) return;
  const f = D.focus.active;
  const next = D.reminders[0];
  let main;
  let sub = '';
  if (f) {
    main = `${f.phase === 'work' ? 'Enfoque' : 'Descanso'} · ${mmss(f.endsAt - Date.now())}`;
    sub = f.phase === 'work' ? 'Concéntrate, yo cuido el tiempo' : 'Estira, toma agua';
  } else if (listening) {
    main = 'Te escucho…';
    sub = 'Habla ahora';
  } else {
    const h = new Date().getHours();
    main = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${D.settings.name ? ', ' + D.settings.name : ''}`;
    const pend = D.tasks.filter((t) => !t.done).length;
    if (next) sub = `${next.kind === 'timer' ? 'Timer' : 'Recordatorio'} ${next.kind === 'timer' ? 'en ' + mmss(next.at - Date.now()) : fmtDay(next.at) + ' ' + fmtTime(next.at)}: ${next.text}`;
    else if (pend) sub = `${pend} tarea${pend === 1 ? '' : 's'} pendiente${pend === 1 ? '' : 's'}`;
    else sub = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  if (updateState?.status === 'downloading') sub = updateState.message;
  $('#barMain').textContent = main;
  $('#barSub').textContent = sub;
}
setInterval(() => { updateBar(); if (mode === 'expanded' && tab === 'focus' && D?.focus.active) renderFocusRing(); }, 1000);

function showBadge(word) {
  const b = $('#badge');
  b.textContent = word;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(showBadge.t);
  showBadge.t = setTimeout(() => b.classList.remove('show'), 3500);
}

// ---------- Avisos ----------
function notice({ title, text, actions = [], timeout = 0 }) {
  $('#noticeTitle').textContent = title;
  $('#noticeText').textContent = text;
  const box = $('#noticeActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' primary' : '');
    b.textContent = a.label;
    b.onclick = () => { a.run?.(); if (!a.keep) closeNotice(); };
    box.appendChild(b);
  }
  if (mode !== 'expanded') setMode('notice');
  $('#island').classList.remove('pulse'); void $('#island').offsetWidth; $('#island').classList.add('pulse');
  clearTimeout(noticeTimer);
  if (timeout) noticeTimer = setTimeout(closeNotice, timeout);
}
function closeNotice() {
  clearTimeout(noticeTimer);
  if (mode === 'notice') setMode('collapsed');
}

kiro.on.alert((a) => {
  if (a.sound) chime();
  Kiro.set(a.emotion || 'sorprendido');
  if (mode === 'expanded') say(`${a.title}: ${a.text}`, a.emotion);
  else notice({ title: a.title, text: a.text, actions: [{ label: 'Listo', primary: true }], timeout: 30000 });
  if (D?.settings.voiceReplies) speak(a.text);
  setTimeout(() => Kiro.set('feliz'), 4000);
});

// Sonido suave (sin archivos)
function chime() {
  try {
    const ctx = new AudioContext();
    [[880, 0], [1318.5, 0.16], [1760, 0.32]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.6);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* sin audio */ }
}

// ---------- Voz de salida (voces de Windows) ----------
let voiceEs = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voiceEs = vs.find((v) => /es[-_](PE|MX|US|419)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
speechSynthesis.onvoiceschanged = pickVoice;
pickVoice();
function speak(text) {
  if (!text || !D?.settings.voiceReplies) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/["“”]/g, ''));
  if (voiceEs) u.voice = voiceEs;
  u.lang = voiceEs?.lang || 'es-ES';
  u.rate = 1.05; u.pitch = 1.15;
  const prev = Kiro.get();
  u.onstart = () => Kiro.set('hablando');
  u.onend = () => Kiro.set(prev === 'hablando' ? 'feliz' : prev);
  speechSynthesis.speak(u);
}

// ---------- Conversación ----------
function say(text, emotion = 'feliz') {
  lastReply = text;
  const b = $('#bubble');
  b.classList.remove('thinking');
  b.textContent = text;
  Kiro.set(emotion);
}

async function send(text, source = 'text') {
  text = text.trim();
  if (!text) return;
  $('#bubble').textContent = 'Pensando';
  $('#bubble').classList.add('thinking');
  Kiro.set('pensando');
  if (mode === 'collapsed') { $('#barMain').textContent = 'Pensando…'; $('#barSub').textContent = text; }
  const r = await kiro.input(text, source);
  if (r?.error) { say(`Uy: ${r.error}`, 'triste'); return; }
  say(r.reply, r.emotion);
  if (r.badge) showBadge(r.badge);
  if (mode !== 'expanded' && r.reply) notice({ title: r.badge || 'Kiro', text: r.reply, timeout: r.confirm ? 0 : 7000, actions: r.confirm ? [] : [{ label: 'Abrir', run: () => setMode('expanded') }] });
  speak(r.reply);
  if (r.confirm?.kind === 'organize') { pendingConfirm = r.confirm; tab = 'pc'; setMode('expanded'); }
  setTimeout(() => Kiro.set('feliz'), 5000);
}

$('#askForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#askInput').value;
  $('#askInput').value = '';
  send(v);
};

// ---------- Micrófono ----------
async function listen() {
  if (listening) { kiro.voice.stop(); return; }
  listening = true;
  speechSynthesis.cancel();
  document.querySelectorAll('.mic').forEach((m) => m.classList.add('on'));
  Kiro.set('escuchando');
  if (mode === 'expanded') say('Te escucho…', 'escuchando'); else updateBar();
  const r = await kiro.voice.listen();
  listening = false;
  document.querySelectorAll('.mic').forEach((m) => m.classList.remove('on'));
  updateBar();
  if (r?.error) { say(r.error, 'preocupado'); if (mode !== 'expanded') notice({ title: 'Micrófono', text: r.error, timeout: 6000 }); return; }
  if (!r?.text) { say('No escuché nada. Prueba otra vez o escríbeme.', 'confundido'); Kiro.set('feliz'); return; }
  if (mode === 'expanded') $('#askInput').value = '';
  send(r.text, 'voice');
}
$('#micBar').onclick = listen;
$('#micPanel').onclick = listen;
kiro.on.voiceTrigger(listen);
kiro.on.voiceHeard(({ text, listening: l }) => {
  if (l) { chime(); Kiro.set('escuchando'); notice({ title: 'Kiro', text: 'Te escucho…', timeout: 8000 }); return; }
  if (text) send(text, 'voice');
});
kiro.on.state((s) => Kiro.set(s));

// ---------- Pestañas ----------
$('#tabs').onclick = (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
};

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (!D) return;
  const v = $('#view');
  const fn = { home: viewHome, tasks: viewTasks, habits: viewHabits, focus: viewFocus, pc: viewPC, settings: viewSettings }[tab];
  fn(v);
}

function viewHome(v) {
  const pend = D.tasks.filter((t) => !t.done);
  const doneToday = D.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()).length;
  const water = D.habits.find((h) => h.style === 'agua');
  v.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${pend.length}</b><span>pendientes</span></div>
      <div class="stat"><b>${doneToday}</b><span>hechas hoy</span></div>
      <div class="stat"><b>${D.focus.todayMinutes}</b><span>min enfoque</span></div>
    </div>
    ${water ? `<div class="card"><h3>${esc(water.name)} <span class="pill">${water.today} de ${water.goal}</span></h3>
      <div style="display:flex;align-items:center;gap:12px">${scene(water)}<div style="flex:1">
      <div class="progress"><i style="width:${Math.min(100, water.today / water.goal * 100)}%"></i></div>
      <div class="acts" style="display:flex;gap:6px;margin-top:10px"><button class="btn primary" data-inc="${water.id}">+1 vaso</button><button class="btn" data-dec="${water.id}">Deshacer</button></div>
      </div></div></div>` : ''}
    <div class="card"><h3>Próximo</h3>${D.reminders.length ? D.reminders.slice(0, 4).map((r) => `
      <div class="row"><span class="pill">${r.kind === 'timer' ? 'Timer' : fmtDay(r.at)}</span><span class="grow">${esc(r.text)}</span><span class="muted small">${fmtTime(r.at)}</span><button class="x" data-delrem="${r.id}" title="Quitar">✕</button></div>`).join('') : '<div class="empty">Sin recordatorios. Prueba: "recuérdame llamar a mamá a las 7 pm"</div>'}</div>
    <div class="card"><h3>Tareas de hoy</h3>${pend.length ? pend.slice(0, 5).map(taskRow).join('') : '<div class="empty">Todo listo. ¡Bien!</div>'}</div>`;
  bindCommon(v);
}

function taskRow(t) {
  return `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-toggle="${t.id}" title="Marcar"></button><span class="grow" title="${esc(t.text)}">${esc(t.text)}</span><button class="x" data-deltask="${t.id}" title="Borrar">✕</button></div>`;
}

function viewTasks(v) {
  const pend = D.tasks.filter((t) => !t.done);
  const done = D.tasks.filter((t) => t.done).slice(0, 15);
  v.innerHTML = `
    <div class="card"><h3>Pendientes <span class="pill">${pend.length}</span></h3>
      ${pend.length ? pend.map(taskRow).join('') : '<div class="empty">No hay tareas pendientes</div>'}
      <form class="addrow" id="addTask"><input placeholder="Nueva tarea…" maxlength="200"><button class="btn primary">Agregar</button></form>
    </div>
    ${done.length ? `<div class="card"><h3>Hechas</h3>${done.map(taskRow).join('')}</div>` : ''}
    <div class="card"><h3>Recordatorios y timers</h3>${D.reminders.length ? D.reminders.map((r) => `
      <div class="row"><span class="pill">${r.kind === 'timer' ? 'Timer' : fmtDay(r.at)}</span><span class="grow">${esc(r.text)}</span><span class="muted small">${fmtTime(r.at)}</span><button class="x" data-delrem="${r.id}">✕</button></div>`).join('') : '<div class="empty">Dile a Kiro: "recuérdame…" o "timer de 10 minutos"</div>'}</div>`;
  $('#addTask', v).onsubmit = async (e) => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) { await kiro.tasks.add(i.value); showBadge('Tarea'); } };
  bindCommon(v);
}

// Escenas animadas simples por estilo de hábito
const GLYPH = {
  leer: '<path d="M14 22h20v30H14zM36 22h20v30H36z" fill="#8ab4ff"/><path d="M35 22v30" stroke="#0c0d12" stroke-width="2"/>',
  ejercicio: '<rect x="12" y="32" width="8" height="16" rx="2" fill="#ffb35c"/><rect x="50" y="32" width="8" height="16" rx="2" fill="#ffb35c"/><rect x="20" y="38" width="30" height="4" fill="#ccc"/>',
  meditar: '<circle cx="35" cy="24" r="7" fill="#c4a5ff"/><path d="M20 52q15-24 30 0z" fill="#c4a5ff"/><path d="M14 54h42" stroke="#c4a5ff" stroke-width="4" stroke-linecap="round"/>',
  caminar: '<circle cx="36" cy="18" r="6" fill="#5fe0b5"/><path d="M36 26l-6 14 8 6-4 10M30 40l-8 14M36 30l10 6" stroke="#5fe0b5" stroke-width="4" fill="none" stroke-linecap="round"/>',
  dormir: '<path d="M44 16a20 20 0 1 0 12 32 16 16 0 0 1-12-32z" fill="#ffd56b"/>',
  fruta: '<circle cx="35" cy="40" r="16" fill="#ff6b81"/><path d="M35 24q2-8 9-9" stroke="#4ade80" stroke-width="3" fill="none"/>',
  estudiar: '<path d="M10 30l25-12 25 12-25 12z" fill="#8ab4ff"/><path d="M20 36v10q15 8 30 0V36" fill="#5f8fe0"/>',
  estirar: '<circle cx="35" cy="16" r="6" fill="#ffb35c"/><path d="M35 24v18M35 42l-8 14M35 42l8 14M35 28l-16-10M35 28l16-10" stroke="#ffb35c" stroke-width="4" stroke-linecap="round"/>',
  escribir: '<rect x="16" y="14" width="34" height="42" rx="4" fill="#e8e8e8"/><path d="M22 26h22M22 34h22M22 42h14" stroke="#999" stroke-width="3"/>',
  vitaminas: '<rect x="18" y="28" width="34" height="14" rx="7" fill="#ff6b81"/><rect x="35" y="28" width="17" height="14" rx="7" fill="#ffd56b"/>',
  'sin-pantalla': '<rect x="14" y="20" width="42" height="28" rx="3" fill="#555"/><path d="M12 14l46 42" stroke="#ff6b81" stroke-width="5" stroke-linecap="round"/>',
  orden: '<rect x="14" y="16" width="18" height="18" rx="3" fill="#5fe0b5"/><rect x="38" y="16" width="18" height="18" rx="3" fill="#8ab4ff"/><rect x="14" y="40" width="18" height="18" rx="3" fill="#ffb35c"/><rect x="38" y="40" width="18" height="18" rx="3" fill="#c4a5ff"/>',
  gratitud: '<path d="M35 56s-20-12-20-26a10 10 0 0 1 20-3 10 10 0 0 1 20 3c0 14-20 26-20 26z" fill="#ff8fa3"/>',
  musica: '<path d="M28 48V20l22-6v28" stroke="#c4a5ff" stroke-width="4" fill="none"/><circle cx="24" cy="48" r="6" fill="#c4a5ff"/><circle cx="46" cy="42" r="6" fill="#c4a5ff"/>',
};
function scene(h) {
  const p = Math.min(1, h.today / h.goal);
  if (h.style === 'agua') {
    const y = 60 - 42 * p;
    return `<svg class="scene" viewBox="0 0 70 70" style="width:74px;height:74px"><defs><clipPath id="g${h.id}"><path d="M17 14h36l-5 46H22z"/></clipPath></defs>
      <rect x="0" y="${y}" width="70" height="70" fill="#5fb8ff" clip-path="url(#g${h.id})" style="transition:y .5s"><animate attributeName="y" values="${y};${y - 1.5};${y}" dur="2s" repeatCount="indefinite"/></rect>
      <path d="M17 14h36l-5 46H22z" fill="none" stroke="#cfe8ff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }
  const C = 2 * Math.PI * 31;
  return `<svg class="scene" viewBox="0 0 70 70" style="width:74px;height:74px"><circle cx="35" cy="35" r="31" fill="none" stroke="#2a2e3b" stroke-width="4"/>
    <circle cx="35" cy="35" r="31" fill="none" stroke="#5fe0b5" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 35 35)"/>
    <g transform="translate(0 0) scale(1)" style="transform-origin:35px 35px;${p >= 1 ? 'animation:bounce 1s infinite' : ''}">${GLYPH[h.style] || GLYPH.orden}</g></svg>`;
}

function viewHabits(v) {
  v.innerHTML = `
    <div class="habits">${D.habits.map((h) => `
      <div class="habit ${h.today >= h.goal ? 'met' : ''}">
        <button class="del" data-delhabit="${h.id}" title="Borrar">✕</button>
        ${scene(h)}
        <div class="name">${esc(h.name)}</div>
        <div class="count">${h.today} de ${h.goal} hoy</div>
        ${h.streak ? `<div class="streak">Racha: ${h.streak} día${h.streak === 1 ? '' : 's'}</div>` : ''}
        <div class="acts"><button class="btn primary" data-inc="${h.id}">+1</button><button class="btn" data-dec="${h.id}">−1</button></div>
      </div>`).join('') || '<div class="empty" style="grid-column:span 2">Crea tu primer hábito abajo</div>'}</div>
    <div class="card" style="margin-top:10px"><h3>Nuevo hábito</h3>
      <form class="addrow" id="addHabit" style="flex-wrap:wrap">
        <input name="n" placeholder="Ej.: Tomar agua" maxlength="40" style="flex:2">
        <input name="g" type="number" min="1" max="50" value="1" title="Meta diaria" style="width:64px;flex:none">
        <select name="s" style="flex:1">${D.habitStyles.map((s) => `<option>${s}</option>`).join('')}</select>
        <button class="btn primary">Crear</button>
      </form></div>`;
  $('#addHabit', v).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.n.value.trim()) return;
    await kiro.habits.add(f.n.value, Number(f.g.value), f.s.value);
    showBadge('Hábito');
  };
  bindCommon(v);
}

function viewFocus(v) {
  const a = D.focus.active;
  const max = Math.max(25, ...D.focus.week.map((d) => d.minutes));
  const total = D.focus.week.reduce((s, d) => s + d.minutes, 0);
  v.innerHTML = `
    <div class="ring-wrap"><div class="ring" id="ring"></div></div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
      ${a ? '<button class="btn danger" id="fStop">Detener</button>' : '<button class="btn primary" id="f25">Enfoque 25 min</button><button class="btn" id="f50">50 min</button><button class="btn" id="f15">15 min</button>'}
    </div>
    <div class="card"><h3>Esta semana <span class="pill">${Math.floor(total / 60)} h ${total % 60} min</span></h3>
      <div class="chart">${D.focus.week.map((d, i) => `<div class="col ${i === 6 ? 'today' : ''}" title="${d.minutes} min"><div class="barv" style="height:${Math.round(d.minutes / max * 70)}px"></div><span>${d.day}</span></div>`).join('')}</div>
    </div>
    <p class="muted small" style="text-align:center">25 minutos de trabajo y 5 de descanso. La cuenta regresiva se ve en la isla.</p>`;
  renderFocusRing();
  if (a) $('#fStop', v).onclick = () => kiro.focus.stop();
  else { $('#f25', v).onclick = () => startFocus(25); $('#f50', v).onclick = () => startFocus(50); $('#f15', v).onclick = () => startFocus(15); }
}
function startFocus(m) { kiro.focus.start(m); showBadge('Enfoque'); speak(`Modo enfoque de ${m} minutos. ¡Tú puedes!`); }
function renderFocusRing() {
  const el = $('#ring');
  if (!el) return;
  const a = D.focus.active;
  const C = 2 * Math.PI * 76;
  const p = a ? Math.max(0, (a.endsAt - Date.now()) / (a.minutes * 60000)) : 1;
  const col = a?.phase === 'break' ? '#8ab4ff' : '#5fe0b5';
  el.innerHTML = `<svg viewBox="0 0 170 170"><circle cx="85" cy="85" r="76" fill="none" stroke="#1e212c" stroke-width="10"/>
    <circle cx="85" cy="85" r="76" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>
    <div class="lbl"><div><b>${a ? mmss(a.endsAt - Date.now()) : '25:00'}</b><span class="muted">${a ? (a.phase === 'work' ? 'Enfoque' : 'Descanso') : 'Listo para empezar'}</span></div></div>`;
}

async function viewPC(v) {
  v.innerHTML = '<div class="empty">Revisando tu escritorio…</div>';
  const s = await kiro.desktop.scan();
  if (s?.error) { v.innerHTML = `<div class="empty">${esc(s.error)}</div>`; return; }
  const cats = Object.entries(s.groups);
  v.innerHTML = `
    <div class="card"><h3>Escritorio <span class="pill">${s.total} archivo${s.total === 1 ? '' : 's'} suelto${s.total === 1 ? '' : 's'}</span></h3>
      ${s.total ? `<div class="files">${cats.map(([c, f]) => `<div class="cat"><div><b>${esc(c)}</b><small>${esc(f.slice(0, 4).join(', '))}${f.length > 4 ? '…' : ''}</small></div><span class="pill">${f.length}</span></div>`).join('')}</div>
      <p class="muted small" style="margin:10px 0">Vista previa: los moveré a la carpeta <b>Escritorio ordenado</b>, separados por tipo. No borro nada y puedes deshacerlo.</p>` : '<div class="empty">Tu escritorio está ordenado</div>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${s.total ? '<button class="btn primary" id="org">Ordenar ahora</button>' : ''}
        ${s.canUndo ? '<button class="btn" id="undo">Deshacer último orden</button>' : ''}
        <button class="btn" id="openDesk">Abrir escritorio</button>
      </div>
    </div>
    <div class="card"><h3>Abrir rápido</h3><div style="display:flex;gap:6px;flex-wrap:wrap">
      ${['navegador', 'excel', 'word', 'calculadora', 'bloc de notas', 'descargas', 'whatsapp', 'youtube'].map((a) => `<button class="btn" data-open="${a}">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}
    </div></div>`;
  if (pendingConfirm) { pendingConfirm = null; say(`Encontré ${s.total} archivos sueltos. Revisa la lista y pulsa "Ordenar ahora".`, 'pensando'); }
  $('#org', v)?.addEventListener('click', async () => {
    const r = await kiro.desktop.organize();
    say(`Listo, ordené ${r.moved} archivo${r.moved === 1 ? '' : 's'}.${r.errors?.length ? ` ${r.errors.length} no se pudieron mover (¿están abiertos?).` : ''}`, 'orgulloso');
    showBadge('Ordenado');
    speak(`Listo, ordené ${r.moved} archivos.`);
    viewPC(v);
  });
  $('#undo', v)?.addEventListener('click', async () => { const r = await kiro.desktop.undo(); say(`Devolví ${r.restored} archivos a su lugar.`, 'feliz'); showBadge('Deshecho'); viewPC(v); });
  $('#openDesk', v).onclick = () => kiro.desktop.open();
  v.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => send(`abre ${b.dataset.open}`); });
}

async function viewSettings(v) {
  const s = D.settings;
  const st = await kiro.ai.status();
  const up = updateState || (await kiro.update.state());
  v.innerHTML = `
    <div class="card"><h3>Cerebro de IA (local)</h3>
      <div class="setting"><span><span class="dot ${st.running ? 'ok' : 'bad'}"></span>Ollama ${st.running ? 'encendido' : 'apagado'}</span>${st.running ? '' : '<button class="btn" id="getOllama">Descargar Ollama</button>'}</div>
      <div class="setting"><span><span class="dot ${st.hasModel ? 'ok' : 'warn'}"></span>Modelo ${esc(s.model)} ${st.hasModel ? 'listo' : 'sin descargar'}</span>${st.running && !st.hasModel ? '<button class="btn primary" id="pull">Descargar modelo (2 GB)</button>' : ''}</div>
      <div class="progress" id="pullBar" style="display:none"><i></i></div><div class="muted small" id="pullTxt"></div>
      <p class="muted small" style="margin-top:6px">Todo se procesa en tu PC. Tus conversaciones no salen a internet.</p>
    </div>
    <div class="card"><h3>Voz</h3>
      <div class="setting"><span>Responder en voz alta</span><button class="switch ${s.voiceReplies ? 'on' : ''}" data-set="voiceReplies"></button></div>
      <div class="setting"><div><div>Escuchar siempre la palabra "Kiro"</div><div class="muted small">Usa el micrófono todo el tiempo. Si no, usa el botón o Ctrl+Alt+K.</div></div><button class="switch ${s.wakeWord ? 'on' : ''}" data-set="wakeWord"></button></div>
    </div>
    <div class="card"><h3>General</h3>
      <div class="setting"><span>Iniciar con Windows</span><button class="switch ${s.autostart ? 'on' : ''}" data-set="autostart"></button></div>
      <div class="setting"><span>Tu nombre</span><input id="nm" value="${esc(s.name)}" placeholder="Opcional" maxlength="30" style="width:150px"></div>
      <div class="setting"><span>Borrar memoria de conversaciones</span><button class="btn danger" id="clr">Borrar</button></div>
    </div>
    <div class="card"><h3>Actualizaciones <span class="pill">v${esc(D.version)}</span></h3>
      <div class="muted" id="upMsg">${esc(up?.message || 'Kiro revisa solo cada 2 horas e instala las nuevas versiones.')}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" id="upCheck">Buscar ahora</button>
        ${up?.status === 'ready' ? '<button class="btn primary" id="upNow">Instalar y reiniciar</button>' : ''}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center" class="muted small"><span>Atajos: Ctrl+Alt+K hablar · Ctrl+Alt+Espacio abrir</span><button class="btn danger" id="quit">Salir</button></div>`;
  v.querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => kiro.settings.set(b.dataset.set, !b.classList.contains('on')); });
  $('#nm', v).onchange = (e) => kiro.settings.set('name', e.target.value.trim());
  $('#clr', v).onclick = async () => { await kiro.chat.clear(); say('Listo, olvidé nuestras conversaciones.', 'carinoso'); };
  $('#upCheck', v).onclick = () => kiro.update.check();
  $('#upNow', v)?.addEventListener('click', () => kiro.update.install());
  $('#quit', v).onclick = () => kiro.quit();
  $('#getOllama', v)?.addEventListener('click', () => kiro.ai.openOllama());
  $('#pull', v)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    $('#pullBar', v).style.display = 'block';
    const r = await kiro.ai.pull();
    if (r?.error) $('#pullTxt', v).textContent = r.error; else { say('¡Ya tengo mi cerebro listo! Pregúntame lo que quieras.', 'emocionado'); render(); }
  });
}
kiro.on.pull(({ pct, status }) => {
  const bar = $('#pullBar i'); const t = $('#pullTxt');
  if (bar && pct != null) bar.style.width = pct + '%';
  if (t) t.textContent = `${status || ''}${pct != null ? ` · ${pct} %` : ''}`;
});

function bindCommon(v) {
  v.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = () => { kiro.tasks.toggle(b.dataset.toggle); if (!b.classList.contains('on')) { showBadge('Hecho'); Kiro.set('orgulloso'); setTimeout(() => Kiro.set('feliz'), 2500); } }; });
  v.querySelectorAll('[data-deltask]').forEach((b) => { b.onclick = () => kiro.tasks.remove(b.dataset.deltask); });
  v.querySelectorAll('[data-delrem]').forEach((b) => { b.onclick = () => kiro.reminders.remove(b.dataset.delrem); });
  v.querySelectorAll('[data-inc]').forEach((b) => { b.onclick = () => { kiro.habits.inc(b.dataset.inc, 1); showBadge('+1'); }; });
  v.querySelectorAll('[data-dec]').forEach((b) => { b.onclick = () => kiro.habits.inc(b.dataset.dec, -1); });
  v.querySelectorAll('[data-delhabit]').forEach((b) => { b.onclick = () => kiro.habits.remove(b.dataset.delhabit); });
}

// ---------- Actualizaciones ----------
kiro.on.update((u) => {
  updateState = u;
  if (u.status === 'ready') {
    Kiro.set('emocionado');
    notice({
      title: 'Actualización',
      text: u.message,
      actions: [{ label: 'Reiniciar ahora', primary: true, run: () => kiro.update.install() }, { label: 'Al cerrar', run: () => kiro.update.postpone() }],
      timeout: 55000,
    });
  }
  if (mode === 'expanded' && tab === 'settings') { const m = $('#upMsg'); if (m) m.textContent = u.message; }
  updateBar();
});

// ---------- Datos ----------
kiro.on.data((d) => { D = d; updateBar(); if (mode === 'expanded' && tab !== 'pc') render(); });
kiro.getData().then((d) => {
  D = d;
  updateBar();
  const h = new Date().getHours();
  Kiro.set(h >= 23 || h < 6 ? 'cansado' : 'feliz');
  if (!d.habits.length) kiro.habits.add('Tomar agua', 8, 'agua');
});
