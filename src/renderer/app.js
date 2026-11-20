/* global Kiro, kiro */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (ms) => { const d = new Date(ms); const t = new Date(); if (d.toDateString() === t.toDateString()) return 'hoy'; t.setDate(t.getDate() + 1); if (d.toDateString() === t.toDateString()) return 'mañana'; return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' }); };
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

let D = null;          // datos
let tab = 'home';
let mode = 'collapsed';
let listening = false;
let lastReply = '¡Hola! Soy Kiro. Háblame con el micrófono o escríbeme.';
let lastEmotion = 'feliz';
let noticeTimer = null;
let updateState = null;

Kiro.mount($('#kiroSmall'));
Kiro.mount($('#kiroBig'));

// ---------- Estado (Listo / Escuchando / Pensando / Hablando) ----------
function setStatus(text, kind = '') {
  $('#statusText').textContent = text;
  $('#status').className = 'status ' + kind;
}

// ---------- Modo de la isla ----------
function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  kiro.setMode(m);
  if (m === 'expanded') { render(); setTimeout(() => $('#askInput')?.focus(), 260); }
}
kiro.on.mode((m) => { mode = m; document.body.dataset.mode = m; if (m === 'expanded') render(); });
$('#avatarBtn').onclick = () => setMode('expanded');
$('#barText').onclick = () => setMode('expanded');
$('#meAvatar').onclick = () => listen();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMode('collapsed'); });

// ---------- Barra cerrada ----------
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
    main = `${greet()}${D.settings.name ? ', ' + D.settings.name : ''}`;
    const pend = D.tasks.filter((t) => !t.done).length;
    if (next) sub = `${next.kind === 'timer' ? 'Timer en ' + mmss(next.at - Date.now()) : 'Recordatorio ' + fmtDay(next.at) + ' ' + fmtTime(next.at)}: ${next.text}`;
    else if (pend) sub = plural(pend, 'tarea pendiente', 'tareas pendientes');
    else sub = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  if (updateState?.status === 'downloading') sub = updateState.message;
  $('#barMain').textContent = main;
  $('#barSub').textContent = sub;
  updateCounts();
}
function updateCounts() {
  const pend = D.tasks.filter((t) => !t.done).length;
  $('#cTasks').textContent = pend || '';
  const w = D.habits.find((h) => h.style === 'agua') || D.habits[0];
  $('#cHabits').textContent = w ? `${w.today}/${w.goal}` : '';
  $('#cFocus').textContent = D.focus.active ? mmss(D.focus.active.endsAt - Date.now()) : '';
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
  speak(a.text);
  setTimeout(() => Kiro.set('feliz'), 4000);
});

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

// ---------- Voz de salida ----------
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
  const u = new SpeechSynthesisUtterance(text.replace(/["“”«»]/g, ''));
  if (voiceEs) u.voice = voiceEs;
  u.lang = voiceEs?.lang || 'es-ES';
  u.rate = 1.05; u.pitch = 1.15;
  const prev = Kiro.get();
  u.onstart = () => { Kiro.set('hablando'); setStatus('Hablando', 'busy'); };
  u.onend = () => { Kiro.set(prev === 'hablando' ? 'feliz' : prev); setStatus('Listo'); };
  speechSynthesis.speak(u);
}

// ---------- Conversación ----------
function say(text, emotion = 'feliz') {
  lastReply = text;
  lastEmotion = emotion;
  const b = $('#bubble');
  if (b) { b.classList.remove('thinking'); b.textContent = text; }
  Kiro.set(emotion);
}

async function send(text, source = 'text') {
  text = text.trim();
  if (!text) return;
  const b = $('#bubble');
  if (b) { b.textContent = 'Pensando'; b.classList.add('thinking'); }
  Kiro.set('pensando');
  setStatus('Pensando', 'busy');
  if (mode === 'collapsed') { $('#barMain').textContent = 'Pensando…'; $('#barSub').textContent = text; }
  const r = await kiro.input(text, source);
  setStatus('Listo');
  if (r?.error) { say(`Uy: ${r.error}`, 'triste'); return; }
  say(r.reply, r.emotion);
  if (r.badge) showBadge(r.badge);
  if (mode !== 'expanded' && r.reply && !r.confirm) notice({ title: r.badge || 'Kiro', text: r.reply, timeout: 7000, actions: [{ label: 'Abrir', run: () => setMode('expanded') }] });
  speak(r.reply);
  if (r.confirm?.kind === 'organize') { tab = 'pc'; setMode('expanded'); }
  else if (r.badge && mode === 'expanded') render();
  setTimeout(() => Kiro.set('feliz'), 5000);
}

// ---------- Micrófono ----------
async function listen() {
  if (listening) { kiro.voice.stop(); return; }
  listening = true;
  speechSynthesis.cancel();
  document.querySelectorAll('.mic').forEach((m) => m.classList.add('on'));
  Kiro.set('escuchando');
  setStatus('Escuchando', 'listen');
  if (mode === 'expanded') say('Te escucho…', 'escuchando'); else updateBar();
  const r = await kiro.voice.listen();
  listening = false;
  document.querySelectorAll('.mic').forEach((m) => m.classList.remove('on'));
  setStatus('Listo');
  updateBar();
  if (r?.error) { say(r.error, 'preocupado'); if (mode !== 'expanded') notice({ title: 'Micrófono', text: r.error, timeout: 6000 }); return; }
  if (!r?.text) { say('No escuché nada. Prueba otra vez o escríbeme.', 'confundido'); setTimeout(() => Kiro.set('feliz'), 2500); return; }
  send(r.text, 'voice');
}
$('#micBar').onclick = listen;
kiro.on.voiceTrigger(listen);
kiro.on.voiceHeard(({ text, listening: l }) => {
  if (l) { chime(); Kiro.set('escuchando'); setStatus('Escuchando', 'listen'); notice({ title: 'Kiro', text: 'Te escucho…', timeout: 8000 }); return; }
  if (text) send(text, 'voice');
});
kiro.on.state((s) => { Kiro.set(s); if (s === 'pensando') setStatus('Pensando', 'busy'); });

// ---------- Menú lateral ----------
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
  ({ home: viewHome, tasks: viewTasks, habits: viewHabits, focus: viewFocus, pc: viewPC, settings: viewSettings }[tab])(v);
  v.scrollTop = 0;
}

const MIC_SVG = '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5v6.6l12 1.9-12 1.9z"/></svg>';

function viewHome(v) {
  const pend = D.tasks.filter((t) => !t.done);
  const water = D.habits.find((h) => h.style === 'agua');
  const next = D.reminders[0];
  v.innerHTML = `
    <h1>${greet()}${D.settings.name ? ', ' + esc(D.settings.name) : ''}</h1>
    <p class="sub">${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <div class="say"><div class="bubble" id="bubble"></div></div>
    <form class="ask" id="askForm" autocomplete="off">
      <input id="askInput" placeholder="Escríbele a Kiro…" maxlength="500">
      <button type="button" class="mic${listening ? ' on' : ''}" id="micPanel" title="Hablar">${MIC_SVG}</button>
      <button type="submit" class="send" title="Enviar">${SEND_SVG}</button>
    </form>
    <div class="chips">
      <button class="chip" data-go="tasks"><i style="background:var(--blue)"></i>${pend.length}<small>pendientes</small></button>
      ${water ? `<button class="chip" data-inc="${water.id}" title="+1 vaso"><i style="background:var(--blue);border-radius:50% 50% 50% 0;transform:rotate(-45deg)"></i>${water.today}/${water.goal}<small>agua</small></button>` : ''}
      <button class="chip" data-go="focus"><i style="background:var(--lime)"></i>${D.focus.todayMinutes}<small>min enfoque</small></button>
    </div>
    ${next ? `<div class="row" style="background:var(--card)"><span class="tag lime">${next.kind === 'timer' ? 'Timer' : fmtDay(next.at)}</span><span class="grow">${esc(next.text)}</span><span class="when">${fmtTime(next.at)}</span></div>` : ''}`;
  const b = $('#bubble', v);
  b.textContent = lastReply;
  $('#askForm', v).onsubmit = (e) => { e.preventDefault(); const i = $('#askInput', v); const t = i.value; i.value = ''; send(t); };
  $('#micPanel', v).onclick = listen;
  bindCommon(v);
}

function taskRow(t) {
  return `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-toggle="${t.id}" title="Marcar"></button><span class="grow" title="${esc(t.text)}">${esc(t.text)}</span><button class="x" data-deltask="${t.id}" title="Borrar">✕</button></div>`;
}

function viewTasks(v) {
  const pend = D.tasks.filter((t) => !t.done);
  const done = D.tasks.filter((t) => t.done).slice(0, 10);
  v.innerHTML = `
    <h1>Tareas</h1>
    <p class="sub">${pend.length ? plural(pend.length, 'pendiente') : 'Todo al día'} · ${plural(D.reminders.length, 'recordatorio')}</p>
    <form class="addrow" id="addTask"><input placeholder="Nueva tarea…" maxlength="200"><button class="btn primary">Agregar</button></form>
    <div class="list">${pend.map(taskRow).join('') || '<div class="empty">No hay tareas pendientes.</div>'}</div>
    ${D.reminders.length ? `<div class="section">Recordatorios</div><div class="list">${D.reminders.map((r) => `
      <div class="row"><span class="tag ${r.kind === 'timer' ? 'lime' : ''}">${r.kind === 'timer' ? 'Timer' : fmtDay(r.at)}</span><span class="grow">${esc(r.text)}</span><span class="when">${fmtTime(r.at)}</span><button class="x" data-delrem="${r.id}" title="Quitar">✕</button></div>`).join('')}</div>` : ''}
    ${done.length ? `<div class="section">Hechas</div><div class="list">${done.map(taskRow).join('')}</div>` : ''}
    <p class="hint">También puedes decir «recuérdame pagar la luz a las 6 pm».</p>`;
  $('#addTask', v).onsubmit = async (e) => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) { await kiro.tasks.add(i.value); showBadge('Tarea'); } };
  bindCommon(v);
}

// Escenas por estilo de hábito
const GLYPH = {
  leer: '<path d="M14 22h20v30H14zM36 22h20v30H36z" fill="#74b9ff"/><path d="M35 22v30" stroke="#000" stroke-width="2"/>',
  ejercicio: '<rect x="12" y="32" width="8" height="16" rx="2" fill="#f6a05a"/><rect x="50" y="32" width="8" height="16" rx="2" fill="#f6a05a"/><rect x="20" y="38" width="30" height="4" fill="#ccc"/>',
  meditar: '<circle cx="35" cy="24" r="7" fill="#b79cff"/><path d="M20 52q15-24 30 0z" fill="#b79cff"/><path d="M14 54h42" stroke="#b79cff" stroke-width="4" stroke-linecap="round"/>',
  caminar: '<circle cx="36" cy="18" r="6" fill="#c3f53c"/><path d="M36 26l-6 14 8 6-4 10M30 40l-8 14M36 30l10 6" stroke="#c3f53c" stroke-width="4" fill="none" stroke-linecap="round"/>',
  dormir: '<path d="M44 16a20 20 0 1 0 12 32 16 16 0 0 1-12-32z" fill="#ffd56b"/>',
  fruta: '<circle cx="35" cy="40" r="16" fill="#ff7d9c"/><path d="M35 24q2-8 9-9" stroke="#8be04e" stroke-width="3" fill="none"/>',
  estudiar: '<path d="M10 30l25-12 25 12-25 12z" fill="#74b9ff"/><path d="M20 36v10q15 8 30 0V36" fill="#4f8fd8"/>',
  estirar: '<circle cx="35" cy="16" r="6" fill="#f6a05a"/><path d="M35 24v18M35 42l-8 14M35 42l8 14M35 28l-16-10M35 28l16-10" stroke="#f6a05a" stroke-width="4" stroke-linecap="round"/>',
  escribir: '<rect x="16" y="14" width="34" height="42" rx="4" fill="#e8e8e8"/><path d="M22 26h22M22 34h22M22 42h14" stroke="#999" stroke-width="3"/>',
  vitaminas: '<rect x="18" y="28" width="34" height="14" rx="7" fill="#ff7d9c"/><rect x="35" y="28" width="17" height="14" rx="7" fill="#ffd56b"/>',
  'sin-pantalla': '<rect x="14" y="20" width="42" height="28" rx="3" fill="#555"/><path d="M12 14l46 42" stroke="#ff6b6b" stroke-width="5" stroke-linecap="round"/>',
  orden: '<rect x="14" y="16" width="18" height="18" rx="3" fill="#c3f53c"/><rect x="38" y="16" width="18" height="18" rx="3" fill="#74b9ff"/><rect x="14" y="40" width="18" height="18" rx="3" fill="#f6a05a"/><rect x="38" y="40" width="18" height="18" rx="3" fill="#b79cff"/>',
  gratitud: '<path d="M35 56s-20-12-20-26a10 10 0 0 1 20-3 10 10 0 0 1 20 3c0 14-20 26-20 26z" fill="#ff7d9c"/>',
  musica: '<path d="M28 48V20l22-6v28" stroke="#b79cff" stroke-width="4" fill="none"/><circle cx="24" cy="48" r="6" fill="#b79cff"/><circle cx="46" cy="42" r="6" fill="#b79cff"/>',
};
function scene(h) {
  const p = Math.min(1, h.today / h.goal);
  if (h.style === 'agua') {
    const y = 60 - 42 * p;
    return `<svg class="scene" viewBox="0 0 70 70"><defs><clipPath id="g${h.id}"><path d="M17 14h36l-5 46H22z"/></clipPath></defs>
      <rect x="0" y="${y}" width="70" height="70" fill="#74b9ff" clip-path="url(#g${h.id})"><animate attributeName="y" values="${y};${y - 1.5};${y}" dur="2s" repeatCount="indefinite"/></rect>
      <path d="M17 14h36l-5 46H22z" fill="none" stroke="#dbeaff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  }
  const C = 2 * Math.PI * 31;
  return `<svg class="scene" viewBox="0 0 70 70"><circle cx="35" cy="35" r="31" fill="none" stroke="#26262a" stroke-width="4"/>
    <circle cx="35" cy="35" r="31" fill="none" stroke="#c3f53c" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 35 35)"/>
    <g style="transform-origin:35px 35px;${p >= 1 ? 'animation:bounce 1s infinite' : ''}">${GLYPH[h.style] || GLYPH.orden}</g></svg>`;
}

function viewHabits(v) {
  const met = D.habits.filter((h) => h.today >= h.goal).length;
  v.innerHTML = `
    <h1>Hábitos</h1>
    <p class="sub">${D.habits.length ? `${met} de ${D.habits.length} cumplidos hoy` : 'Crea tu primer hábito'}</p>
    <div class="habits">${D.habits.map((h) => `
      <div class="habit ${h.today >= h.goal ? 'met' : ''}">
        <button class="del" data-delhabit="${h.id}" title="Borrar">✕</button>
        ${scene(h)}
        <div class="name">${esc(h.name)}</div>
        <div class="countl">${h.today} de ${h.goal} hoy</div>
        ${h.streak ? `<div class="streak">Racha: ${plural(h.streak, 'día')}</div>` : ''}
        <div class="acts"><button class="btn primary" data-inc="${h.id}">+1</button><button class="btn" data-dec="${h.id}">Deshacer</button></div>
      </div>`).join('')}</div>
    <div class="section">Nuevo hábito</div>
    <form class="addrow" id="addHabit">
      <input name="n" placeholder="Ej.: Leer 10 páginas" maxlength="40" style="flex:2">
      <input name="g" type="number" min="1" max="50" value="1" title="Meta diaria" style="width:62px;flex:none;border-radius:99px">
      <select name="s" style="flex:1;border-radius:99px">${D.habitStyles.map((s) => `<option>${s}</option>`).join('')}</select>
      <button class="btn primary">Crear</button>
    </form>`;
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
    <h1>Enfoque</h1>
    <p class="sub">25 minutos de trabajo, 5 de descanso · ${Math.floor(total / 60)} h ${total % 60} min esta semana</p>
    <div class="focus-wrap">
      <div class="ring" id="ring"></div>
      <div class="chart">${D.focus.week.map((d) => `<div class="col ${d.minutes ? 'has' : ''}" title="${d.minutes} min"><div class="barv" style="height:${Math.max(4, Math.round(d.minutes / max * 72))}px"></div><span>${d.day}</span></div>`).join('')}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      ${a ? '<button class="btn big danger" id="fStop">Detener</button>' : '<button class="btn big primary" id="f25">Empezar 25 min</button><button class="btn" id="f50">50 min</button><button class="btn" id="f15">15 min</button>'}
    </div>
    <p class="hint">También puedes decir «modo enfoque». La cuenta regresiva se ve en la isla.</p>`;
  renderFocusRing();
  if (a) $('#fStop', v).onclick = () => kiro.focus.stop();
  else { $('#f25', v).onclick = () => startFocus(25); $('#f50', v).onclick = () => startFocus(50); $('#f15', v).onclick = () => startFocus(15); }
}
function startFocus(m) { kiro.focus.start(m); showBadge('Enfoque'); speak(`Modo enfoque de ${m} minutos. ¡Tú puedes!`); }
function renderFocusRing() {
  const el = $('#ring');
  if (!el) return;
  const a = D.focus.active;
  const C = 2 * Math.PI * 66;
  const p = a ? Math.max(0, (a.endsAt - Date.now()) / (a.minutes * 60000)) : 1;
  const col = a?.phase === 'break' ? '#74b9ff' : '#c3f53c';
  el.innerHTML = `<svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="66" fill="none" stroke="#1b1b1e" stroke-width="10"/>
    <circle cx="75" cy="75" r="66" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>
    <div class="lbl"><div><b>${a ? mmss(a.endsAt - Date.now()) : '25:00'}</b><span class="muted small">${a ? (a.phase === 'work' ? 'Enfoque' : 'Descanso') : 'Listo'}</span></div></div>`;
}

// Colores por tipo de archivo (chips)
const CAT_COLOR = { 'Imágenes': '#74b9ff', 'PDF': '#ff6b6b', 'Documentos': '#f4f4f5', 'Hojas de cálculo': '#8be04e', 'Presentaciones': '#f6a05a', 'Videos': '#b79cff', 'Música': '#ff7d9c', 'Comprimidos': '#ffd56b', 'Instaladores': '#5ee0d0', 'Otros': '#8d8d93' };

async function viewPC(v) {
  const s = await kiro.desktop.scan();
  if (s?.error) { v.innerHTML = `<h1>Mi PC</h1><p class="sub">${esc(s.error)}</p>`; return; }
  const cats = Object.entries(s.groups).sort((a, b) => b[1].length - a[1].length);
  v.innerHTML = `
    <h1>Mi PC</h1>
    <p class="sub">Tu escritorio · ${s.total ? plural(s.total, 'archivo suelto', 'archivos sueltos') : 'ordenado'}</p>
    ${s.total ? `<div class="chips">${cats.map(([c, f]) => `<span class="chip" title="${esc(c)}: ${esc(f.slice(0, 6).join(', '))}${f.length > 6 ? '…' : ''}"><i style="background:${CAT_COLOR[c] || '#8d8d93'}"></i>${f.length}</span>`).join('')}</div>
      <button class="btn big primary" id="org">Ordenar ahora</button>
      <p class="hint">También puedes decir «sí, ordénalo». Nunca borra nada.</p>` : '<p class="hint">No hay archivos sueltos en tu escritorio.</p>'}
    ${s.canUndo ? '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn" id="undo">Deshacer último orden</button><button class="btn" id="openDesk">Abrir escritorio</button></div>' : ''}
    <div class="section">Abrir rápido</div>
    <div class="chips">${['navegador', 'excel', 'word', 'calculadora', 'descargas', 'whatsapp'].map((a) => `<button class="chip" data-open="${a}" style="font-size:13px">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>`;
  $('#org', v)?.addEventListener('click', organize);
  $('#undo', v)?.addEventListener('click', async () => { const r = await kiro.desktop.undo(); say(`Devolví ${plural(r.restored, 'archivo')} a su lugar.`, 'feliz'); showBadge('Deshecho'); viewPC(v); });
  $('#openDesk', v)?.addEventListener('click', () => kiro.desktop.open());
  v.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => send(`abre ${b.dataset.open}`); });
}
async function organize() {
  const r = await kiro.desktop.organize();
  const msg = `Listo, ordené ${plural(r.moved, 'archivo')} en la carpeta Escritorio ordenado.${r.errors?.length ? ` ${r.errors.length} no se pudieron mover (¿están abiertos?).` : ''}`;
  say(msg, 'orgulloso');
  showBadge('Ordenado');
  speak(msg);
  if (tab === 'pc') viewPC($('#view'));
}

async function viewSettings(v) {
  const s = D.settings;
  const st = await kiro.ai.status();
  const up = updateState || (await kiro.update.state());
  v.innerHTML = `
    <h1>Ajustes</h1>
    <p class="sub">Versión ${esc(D.version)} · todo se guarda en tu PC</p>
    <div class="setting"><span><span class="dot ${st.running ? 'ok' : 'bad'}"></span>IA local (Ollama) ${st.running ? 'encendida' : 'apagada'}</span>${st.running ? '' : '<button class="btn" id="getOllama">Descargar Ollama</button>'}</div>
    <div class="setting"><span><span class="dot ${st.hasModel ? 'ok' : 'warn'}"></span>Modelo ${esc(s.model)} ${st.hasModel ? 'listo' : 'sin descargar'}</span>${st.running && !st.hasModel ? '<button class="btn primary" id="pull">Descargar (2 GB)</button>' : ''}</div>
    <div class="progress" id="pullBar" style="display:none"><i></i></div><div class="muted small" id="pullTxt"></div>
    <div class="setting"><span>Responder en voz alta</span><button class="switch ${s.voiceReplies ? 'on' : ''}" data-set="voiceReplies"></button></div>
    <div class="setting"><div><div>Escuchar siempre «Kiro»</div><div class="muted small">Si no, usa el micrófono o Ctrl+Alt+K.</div></div><button class="switch ${s.wakeWord ? 'on' : ''}" data-set="wakeWord"></button></div>
    <div class="setting"><span>Iniciar con Windows</span><button class="switch ${s.autostart ? 'on' : ''}" data-set="autostart"></button></div>
    <div class="setting"><span>Tu nombre</span><input id="nm" value="${esc(s.name)}" placeholder="Opcional" maxlength="30" style="width:160px;border-radius:99px"></div>
    <div class="setting"><div><div>Actualizaciones</div><div class="muted small" id="upMsg">${esc(up?.message || 'Se buscan solas cada 2 horas.')}</div></div>
      <div style="display:flex;gap:6px">${up?.status === 'ready' ? '<button class="btn primary" id="upNow">Instalar</button>' : ''}<button class="btn" id="upCheck">Buscar</button></div></div>
    <div class="setting"><span>Borrar memoria de conversaciones</span><button class="btn danger" id="clr">Borrar</button></div>
    <div class="setting"><span class="muted small">Ctrl+Alt+K hablar · Ctrl+Alt+Espacio abrir · Esc cerrar</span><button class="btn danger" id="quit">Salir</button></div>`;
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
    if (r?.error) $('#pullTxt', v).textContent = r.error; else { say('¡Ya tengo mi cerebro listo!', 'emocionado'); render(); }
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
  v.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { tab = b.dataset.go; render(); }; });
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
  const m = $('#upMsg'); if (m) m.textContent = u.message;
  updateBar();
});

// ---------- Datos ----------
kiro.on.data((d) => {
  D = d;
  updateBar();
  // Re-dibuja salvo que el usuario esté escribiendo o en Mi PC/Ajustes (vistas con carga propia).
  if (mode === 'expanded' && !['pc', 'settings'].includes(tab) && document.activeElement?.tagName !== 'INPUT') render();
});
kiro.getData().then((d) => {
  D = d;
  updateBar();
  const h = new Date().getHours();
  Kiro.set(h >= 23 || h < 6 ? 'cansado' : 'feliz');
  if (!d.habits.length) kiro.habits.add('Tomar agua', 8, 'agua');
});
