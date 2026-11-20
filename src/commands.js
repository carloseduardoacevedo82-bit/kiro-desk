// Entiende comandos en español sin IA (rápido) y ejecuta acciones (también las que propone la IA).
const F = require('./features');
const { norm } = F;

const WORDNUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45, cincuenta: 50, sesenta: 60, noventa: 90 };
const NUM = '(\\d+(?:[.,]\\d+)?|' + Object.keys(WORDNUM).join('|') + ')';
let organizePreviewAt = 0;
const toNum = (s) => (WORDNUM[s] ?? parseFloat(String(s).replace(',', '.')));

// "10 minutos", "media hora", "2 horas", "30 segundos" -> ms
function parseDuration(t) {
  if (/\bmedia hora\b/.test(t)) return 30 * 60000;
  if (/\bun cuarto de hora\b/.test(t)) return 15 * 60000;
  const m = t.match(new RegExp(NUM + '\\s*(h|hr|hrs|hora|horas|m|min|mins|minuto|minutos|s|seg|segundo|segundos)\\b'));
  if (!m) return null;
  const n = toNum(m[1]);
  const u = m[2][0];
  let ms = u === 'h' ? n * 3600000 : u === 's' ? n * 1000 : n * 60000;
  const extra = t.match(new RegExp('(?:hora|horas)\\s+y\\s+' + NUM + '\\s*(?:minutos?|min)'));
  if (u === 'h' && extra) ms += toNum(extra[1]) * 60000;
  if (u === 'h' && /\by media\b/.test(t)) ms += 30 * 60000;
  return ms > 0 ? ms : null;
}

// "a las 3 pm", "a las 15:30", "mañana a las 8 de la noche", "en 10 minutos" -> timestamp
function parseWhen(t, now = new Date()) {
  const rel = t.match(/\b(?:en|dentro de)\s+(.+)/);
  if (rel) { const d = parseDuration(rel[1]); if (d) return now.getTime() + d; }
  const m = t.match(new RegExp('\\b(?:a las|a la|para las|a eso de las)\\s+' + NUM + '(?::(\\d{2})|\\s+y\\s+(media|cuarto|' + NUM.slice(1, -1) + '))?\\s*(am|pm|a\\.?m\\.?|p\\.?m\\.?|de la manana|de la tarde|de la noche|de la madrugada)?'));
  if (!m) return null;
  let h = toNum(m[1]);
  let min = m[2] ? parseInt(m[2], 10) : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : m[3] ? toNum(m[3]) : 0;
  const suf = (m[4] || '').replace(/\./g, '');
  if ((suf === 'pm' || /tarde|noche/.test(suf)) && h < 12) h += 12;
  if ((suf === 'am' || /manana|madrugada/.test(suf)) && h === 12) h = 0;
  if (!suf && h >= 1 && h <= 7) h += 12; // "a las 3" casi siempre es de la tarde
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(h, min);
  if (/\bpasado manana\b/.test(t)) d.setDate(d.getDate() + 2);
  else if (/\bmanana\b/.test(t.replace(/de la manana/g, ''))) d.setDate(d.getDate() + 1);
  else if (d.getTime() <= now.getTime()) {
    // Sin am/pm y ya pasó: prueba la tarde; si no, mañana.
    if (!suf && h < 12 && d.getTime() + 12 * 3600000 > now.getTime()) d.setHours(h + 12);
    else d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

function stripWake(text) {
  return text.replace(/^\s*(oye\s+|hey\s+|ok\s+)?(kiro|quiero|kilo|ciro|chiro)\b[\s,.:!]*/i, '').trim();
}

// Devuelve lista de acciones o null si no reconoce el comando.
function quickParse(raw) {
  // Whisper a veces separa "recuérdame" en "recuerda me / recuerda mi".
  const t = norm(stripWake(raw)).replace(/^recuerda (me|mi)\b/, 'recuerdame').replace(/^recordame\b/, 'recuerdame').replace(/^agrega\s*ta\s+tarea\b/, 'agrega tarea').replace(/^agrega\s*ta\s*e?\s*rea\b/, 'agrega tarea');
  if (!t) return null;
  let m;

  if (/^(ordena|organiza|limpia)( el| mi)? escritorio/.test(t)) return [{ type: 'organize_desktop' }];
  if (/^(deshace|deshaz|deshacer)( el)? (orden|escritorio)/.test(t)) return [{ type: 'undo_desktop' }];
  // "sí, ordénalo" confirma siempre; "sí / dale / hazlo" solo justo después de la vista previa.
  if (/^(si |ya |ok |dale )?(ordenalo|ordenalos|ordenala|ordenalas)( ya| ahora| por favor)?$/.test(t)) return [{ type: 'organize_confirm' }];
  if (/^(si|dale|hazlo|si hazlo|si dale|ok|claro)$/.test(t) && Date.now() - organizePreviewAt < 5 * 60000) return [{ type: 'organize_confirm' }];

  if ((m = t.match(/^(?:pon|crea|inicia|empieza|activa)?\s*(?:un\s+)?(?:timer|temporizador|alarma|cronometro)\s+(?:de\s+)?(.+)/))) {
    const d = parseDuration(m[1]);
    if (d) return [{ type: 'timer', ms: d, label: '' }];
  }
  if ((m = t.match(/^(?:avisame|despiertame)\s+en\s+(.+)/))) {
    const d = parseDuration(m[1]);
    if (d) return [{ type: 'timer', ms: d, label: '' }];
  }

  if (/^(modo )?(enfoque|concentracion|pomodoro|focus)\b|^(empieza|inicia|activa) (el )?(modo )?(enfoque|concentracion|pomodoro|focus)|^quiero concentrarme/.test(t)) {
    const d = parseDuration(t);
    return [{ type: 'focus_start', minutes: d ? Math.round(d / 60000) : 25 }];
  }
  if (/^(para|deten|termina|cancela|sal del?) (el )?(modo )?(enfoque|concentracion|pomodoro|focus)/.test(t)) return [{ type: 'focus_stop' }];
  if (/^(tomemos|toma|tomar|tomo) (un )?(descanso|break|pausa)|^descanso$/.test(t)) return [{ type: 'break' }];

  if ((m = t.match(/^(?:recuerdame|recordarme|recordatorio(?: de| para)?|avisame(?: de| que)?)\s+(.+)/))) {
    const when = parseWhen(m[1]);
    let text = m[1]
      .replace(/\b(?:en|dentro de)\s+.+?(segundos?|minutos?|min|horas?|hora y media|media hora)\b/, '')
      .replace(/\b(?:pasado )?manana\b(?! de)/, '')
      .replace(/\b(?:a las|a la|para las|a eso de las)\s+\S+(?:\s*(?::\d{2}|y media|y cuarto|am|pm|de la manana|de la tarde|de la noche|de la madrugada))*/, '')
      .replace(/^\s*(que|de|a)\s+/, '')
      .trim();
    if (when) return [{ type: 'reminder', text: restore(text, raw) || 'Recordatorio', at: when }];
    return null; // sin hora: que la IA pregunte
  }

  if ((m = t.match(/^(?:agrega|anade|apunta|anota|crea|nueva)\s+(?:una\s+|la\s+)?tarea(?:\s*:)?\s+(.+)/)) || (m = t.match(/^tarea\s*:?\s+(.+)/)) || (m = t.match(/^(?:agrega|anade|apunta|anota)\s+(.+?)\s+a (?:mis |las )?tareas$/))) {
    return [{ type: 'add_task', text: capital(restore(m[1], raw)) }];
  }
  if ((m = t.match(/^(?:marca|completa|termine|ya hice|hecho)\s+(?:la\s+)?(?:tarea\s+)?(.+?)(?:\s+como\s+(?:hecha|completada|lista))?$/))) {
    return [{ type: 'complete_task', text: m[1] }];
  }

  if ((m = t.match(/^(?:tome|tomé|bebi|me tome)\s+(?:un\s+|otro\s+)?(vaso|agua)/)) || /^(un )?vaso de agua$/.test(t) || /^\+1 agua$/.test(t)) return [{ type: 'habit_inc', name: 'agua' }];

  if ((m = t.match(/^(?:abre|abrir|abreme|lanza|inicia)\s+(?:el |la |los |mis )?(.+)/))) {
    const key = Object.keys(F.APPS).find((k) => m[1].includes(norm(k)));
    if (key) return [{ type: 'open_app', name: key }];
  }

  if (/^(que hora es|hora)$/.test(t)) return [{ type: 'say', text: `Son las ${new Date().toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' }).replace(/.$/, '')}.` }];
  if (/^(que tareas tengo|mis tareas|tareas pendientes)$/.test(t)) return [{ type: 'list_tasks' }];
  if (/^(ayuda|que puedes hacer|comandos)$/.test(t)) return [{ type: 'help' }];
  return null;
}

// Devuelve las tildes/ñ originales a las palabras normalizadas.
function restore(text, raw) {
  const map = {};
  for (const w of String(raw).split(/[\s,.;:!?¡¿"']+/)) if (w) map[norm(w)] ??= w.toLowerCase();
  return text.split(' ').map((w) => map[w] || w).join(' ');
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' }).replace(/\.$/, '');
const fmtDur = (ms) => { const m = Math.round(ms / 60000); if (ms < 60000) return `${Math.round(ms / 1000)} segundos`; if (m < 60) return `${m} minuto${m === 1 ? '' : 's'}`; const h = Math.floor(m / 60); const r = m % 60; return `${h} hora${h === 1 ? '' : 's'}${r ? ` y ${r} min` : ''}`; };
const isTomorrow = (ms) => new Date(ms).toDateString() !== new Date().toDateString();

const HELP = 'Puedo: agregar tareas ("agrega tarea llamar al banco"), recordarte cosas ("recuérdame pagar la luz a las 6 pm"), poner timers ("timer de 5 minutos"), modo enfoque 25/5, contar hábitos ("tomé un vaso de agua"), abrir apps ("abre Excel") y ordenar tu escritorio.';

// Ejecuta acciones. Devuelve { said: [frases], badge: 'palabra corta' | null, needsConfirm }.
function execute(actions) {
  const said = [];
  let badge = null;
  let confirm = null;
  for (const a of actions || []) {
    try {
      switch (a.type) {
        case 'add_task': { const t = F.addTask(a.text); said.push(`Tarea agregada: ${t.text}.`); badge = 'Tarea'; break; }
        case 'complete_task': { const t = F.completeTaskByText(a.text); said.push(t ? `Listo, marqué "${t.text}" como hecha.` : `No encontré una tarea pendiente con "${a.text}".`); if (t) badge = 'Hecho'; break; }
        case 'reminder': {
          let at = Number(a.at);
          if (!Number.isFinite(at) && a.in_minutes) at = Date.now() + Number(a.in_minutes) * 60000;
          if (!Number.isFinite(at) && a.time) at = parseWhen(norm(`${a.day === 'manana' || a.day === 'mañana' ? 'manana ' : ''}a las ${a.time}`));
          const clean = String(a.text || '').replace(/^(recuerda(me)?|recordar|acordarme de)\s+(que\s+|de\s+)?/i, '').replace(/\s+(en|dentro de)\s+\d+\s*(minutos?|horas?|min)\.?$/i, '').trim();
          const r = F.addReminder(clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Recordatorio', at);
          said.push(`Te recuerdo "${r.text}" ${isTomorrow(r.at) ? 'mañana ' : ''}a las ${fmtTime(r.at)}.`);
          badge = 'Recordatorio';
          break;
        }
        case 'timer': {
          const ms = Number(a.ms) || Number(a.minutes) * 60000;
          if (!ms) throw new Error('¿De cuánto tiempo el timer?');
          F.addReminder(a.label || `Timer de ${fmtDur(ms)}`, Date.now() + ms, 'timer');
          said.push(`Timer de ${fmtDur(ms)} en marcha.`);
          badge = 'Timer';
          break;
        }
        case 'focus_start': { const f = F.focusStart(a.minutes); said.push(`Modo enfoque: ${f.minutes} minutos. ¡Tú puedes!`); badge = 'Enfoque'; break; }
        case 'focus_stop': F.focusStop(); said.push('Modo enfoque detenido.'); badge = 'Pausa'; break;
        case 'break': { F.focusStop(); F.addReminder('Fin del descanso', Date.now() + 5 * 60000, 'timer'); said.push('Tómate 5 minutos. Te aviso cuando termine.'); badge = 'Descanso'; break; }
        case 'habit_inc': {
          const h = F.habitIncByName(a.name || 'agua', a.delta || 1);
          if (h) { const n = h.log[require('./store').today()] || 0; said.push(`${h.name}: ${n} de ${h.goal}.${n >= h.goal ? ' ¡Meta cumplida!' : ''}`); badge = '+1'; }
          else said.push(`No tienes un hábito "${a.name}". Créalo en la pestaña Hábitos.`);
          break;
        }
        case 'add_habit': { const h = F.addHabit(a.name, a.goal); said.push(`Hábito creado: ${h.name} (meta ${h.goal} al día).`); badge = 'Hábito'; break; }
        case 'open_app': { const k = F.openApp(a.name); said.push(k ? `Abriendo ${k}.` : `No sé abrir "${a.name}" todavía.`); if (k) badge = 'Abierto'; break; }
        case 'organize_desktop': {
          const s = F.desktopScan();
          if (!s.total) { said.push('Tu escritorio ya está ordenado.'); break; }
          confirm = { kind: 'organize', scan: s };
          organizePreviewAt = Date.now();
          said.push(`Encontré ${s.total} archivo${s.total === 1 ? '' : 's'} suelto${s.total === 1 ? '' : 's'} en el escritorio. ¿Lo ordeno? Di «sí, ordénalo».`);
          break;
        }
        case 'organize_confirm': {
          organizePreviewAt = 0;
          const r = F.desktopOrganize();
          said.push(r.moved ? `Listo, ordené ${r.moved} archivo${r.moved === 1 ? '' : 's'} en la carpeta Escritorio ordenado.${r.errors.length ? ` ${r.errors.length} no se pudieron mover.` : ''}` : 'Tu escritorio ya está ordenado.');
          if (r.moved) badge = 'Ordenado';
          break;
        }
        case 'undo_desktop': { const r = F.desktopUndo(); said.push(r.restored ? `Devolví ${r.restored} archivos a su lugar.` : 'No hay nada que deshacer.'); badge = 'Deshecho'; break; }
        case 'list_tasks': {
          const p = F.snapshot().tasks.filter((t) => !t.done);
          said.push(p.length ? `Tienes ${p.length} pendiente${p.length === 1 ? '' : 's'}: ${p.slice(0, 5).map((t) => t.text).join(', ')}.` : 'No tienes tareas pendientes. ¡Bien!');
          break;
        }
        case 'help': said.push(HELP); break;
        case 'say': if (a.text) said.push(String(a.text)); break;
        default: break;
      }
    } catch (e) {
      said.push(e.message);
    }
  }
  return { said, badge, confirm };
}

const markPreview = () => { organizePreviewAt = Date.now(); };
module.exports = { markPreview, quickParse, execute, parseWhen, parseDuration, stripWake, HELP };
