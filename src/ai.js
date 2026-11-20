// IA local con Ollama (http://127.0.0.1:11434). No envía nada a internet.
const store = require('./store');

const OLLAMA = 'http://127.0.0.1:11434';

function systemPrompt() {
  const now = new Date();
  const name = store.get().settings.name;
  return `Eres Kiro, un asistente de escritorio simpático, breve y útil que vive en la parte de arriba de la pantalla de una PC con Windows.
Hablas SIEMPRE en español neutro (Perú), con frases cortas (máximo 2 oraciones), cálidas y sin emojis.${name ? ` El usuario se llama ${name}.` : ''}
Fecha y hora actual: ${now.toLocaleString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.

Responde SOLO con un JSON válido con esta forma:
{"reply": "lo que dices al usuario", "emotion": "feliz|neutral|pensando|sorprendido|triste|emocionado|carinoso|preocupado", "actions": []}

Acciones posibles (úsalas solo si el usuario lo pide claramente; si falta un dato, pregúntalo en "reply" y deja actions vacío):
- {"type":"add_task","text":"..."}
- {"type":"complete_task","text":"parte del nombre"}
- {"type":"reminder","text":"...","in_minutes":N}  o  {"type":"reminder","text":"...","time":"HH:MM","day":"hoy|mañana"}
- {"type":"timer","minutes":N,"label":"..."}
- {"type":"focus_start","minutes":25}
- {"type":"focus_stop"}
- {"type":"break"}
- {"type":"habit_inc","name":"agua"}
- {"type":"add_habit","name":"...","goal":N}
- {"type":"open_app","name":"excel|word|calculadora|navegador|youtube|gmail|whatsapp|bloc de notas|explorador|descargas"}
- {"type":"organize_desktop"}
- {"type":"list_tasks"}
No inventes que hiciste algo si no pusiste la acción. Nunca ejecutes comandos del sistema ni borres archivos.`;
}

async function status() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    const model = store.get().settings.model;
    const names = (j.models || []).map((m) => m.name);
    return { running: true, hasModel: names.some((n) => n === model || n.startsWith(model + ':') || n.split(':')[0] === model.split(':')[0] && model.endsWith(n.split(':')[1] || '')), models: names, model };
  } catch {
    return { running: false, hasModel: false, models: [], model: store.get().settings.model };
  }
}

// Descarga el modelo mostrando progreso (onProgress(pct, texto)).
async function pullModel(onProgress) {
  const model = store.get().settings.model;
  const r = await fetch(`${OLLAMA}/api/pull`, { method: 'POST', body: JSON.stringify({ name: model, stream: true }) });
  if (!r.ok) throw new Error('No pude descargar el modelo');
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      const pct = j.total ? Math.round((j.completed || 0) / j.total * 100) : null;
      onProgress?.(pct, j.status);
    }
  }
}

async function ask(userText) {
  const s = store.get();
  const history = s.chat.slice(-8).map((m) => ({ role: m.role, content: m.content }));
  const body = {
    model: s.settings.model,
    stream: false,
    format: 'json',
    keep_alive: '30m',
    options: { temperature: 0.4, num_ctx: 2048, num_predict: 200 },
    messages: [{ role: 'system', content: systemPrompt() }, ...history, { role: 'user', content: userText }],
  };
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Ollama respondió ${r.status}`);
  const j = await r.json();
  let out;
  try { out = JSON.parse(j.message?.content || '{}'); } catch { out = { reply: j.message?.content || '' }; }
  // Los modelos pequeños a veces devuelven la acción suelta o una lista.
  let actions = Array.isArray(out.actions) ? out.actions : out.action && typeof out.action === 'object' ? [out.action] : [];
  if (Array.isArray(out)) { actions = out; out = {}; }
  if (out.type && typeof out.type === 'string') actions = [out];
  actions = actions.filter((a) => a && typeof a.type === 'string');
  const reply = String(out.reply || out.respuesta || out.response || '').trim() || (actions.length ? '' : 'Mmm, no te entendí bien. ¿Me lo repites?');
  remember('user', userText);
  if (reply) remember('assistant', reply);
  return { reply, emotion: out.emotion || (actions.length ? 'feliz' : 'neutral'), actions };
}

// Precarga el modelo en memoria para que la primera respuesta sea más rápida.
function warmup() {
  fetch(`${OLLAMA}/api/generate`, { method: 'POST', body: JSON.stringify({ model: store.get().settings.model, prompt: '', keep_alive: '30m' }) }).catch(() => {});
}

function remember(role, content) {
  const s = store.get();
  s.chat.push({ role, content, at: Date.now() });
  s.chat = s.chat.slice(-60);
  store.save();
}

module.exports = { ask, status, pullModel, warmup, remember };
