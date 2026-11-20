// Voz a texto con Whisper (whisper.cpp) en la PC, sin internet.
// La grabación la hace la ventana (micrófono) y aquí se transcribe el WAV.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { execFile } = require('child_process');
const store = require('./store');

const MODELS = {
  'ggml-base-q5_1.bin': { mb: 57, label: 'rápido' },
  'ggml-small-q5_1.bin': { mb: 181, label: 'más preciso' },
};
const DEFAULT_MODEL = 'ggml-base-q5_1.bin';
const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

// Palabras que ayudan a Whisper a entender los comandos de Kiro.
const PROMPT = 'Kiro, agrega tarea, recuérdame, recordatorio, timer de 5 minutos, modo enfoque, tomé un vaso de agua, abre Excel, ordena el escritorio, sí, ordénalo.';

function binDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'whisper') : path.join(__dirname, '..', 'vendor', 'whisper');
}
function modelDir() { return path.join(app.getPath('userData'), 'whisper'); }
function modelName() { return MODELS[store.get().settings.voiceModel] ? store.get().settings.voiceModel : DEFAULT_MODEL; }
function modelPath() { return path.join(modelDir(), modelName()); }

function status() {
  const p = modelPath();
  let size = 0;
  try { size = fs.statSync(p).size; } catch { /* no existe */ }
  const need = MODELS[modelName()].mb * 1024 * 1024 * 0.95;
  return { ready: size >= need, model: modelName(), label: MODELS[modelName()].label, mb: MODELS[modelName()].mb, downloading: !!downloading };
}

// Descarga el modelo con reanudación y reintentos (la red a veces se corta).
let downloading = null;
function download(onProgress) {
  if (downloading) return downloading;
  downloading = (async () => {
    fs.mkdirSync(modelDir(), { recursive: true });
    const name = modelName();
    const final = path.join(modelDir(), name);
    const part = final + '.part';
    let total = 0;
    for (let attempt = 0; attempt < 25; attempt++) {
      let have = 0;
      try { have = fs.statSync(part).size; } catch { /* nuevo */ }
      let out = null;
      let stall = null;
      try {
        // Si la descarga se queda colgada 20 s, se corta y se reanuda.
        const ac = new AbortController();
        stall = setTimeout(() => ac.abort(), 20000);
        const r = await fetch(HF + name, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: ac.signal });
        if (r.status === 416) break; // ya está completo
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if (have && r.status === 200) { have = 0; fs.rmSync(part, { force: true }); }
        total = have + Number(r.headers.get('content-length') || 0);
        out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
        let done = have;
        for await (const chunk of r.body) {
          clearTimeout(stall);
          stall = setTimeout(() => ac.abort(), 20000);
          out.write(chunk);
          done += chunk.length;
          onProgress?.(total ? Math.round(done / total * 100) : null);
        }
        clearTimeout(stall);
        await new Promise((res) => out.end(res));
        out = null;
        if (!total || fs.statSync(part).size >= total) break;
      } catch {
        clearTimeout(stall);
        if (out) await new Promise((res) => out.end(res));
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
    if (fs.statSync(part).size < MODELS[name].mb * 1024 * 1024 * 0.95) throw new Error('No pude descargar la voz. Revisa tu internet.');
    fs.renameSync(part, final);
    return true;
  })().finally(() => { downloading = null; });
  return downloading;
}

// Recibe un WAV (16 kHz mono) y devuelve el texto.
async function transcribe(wavBuffer) {
  if (!status().ready) throw new Error('La voz aún no está lista: se está descargando (Ajustes).');
  const wav = path.join(os.tmpdir(), `kiro-${Date.now()}.wav`);
  fs.writeFileSync(wav, Buffer.from(wavBuffer));
  // 4 hilos y audio_ctx 1000 (hasta ~20 s de audio). Sin --prompt: con él Whisper junta palabras ("agregataerea").
  const threads = String(Math.max(2, Math.min(4, os.cpus().length - 1)));
  try {
    const text = await new Promise((resolve, reject) => {
      execFile(path.join(binDir(), 'whisper-cli.exe'),
        ['-m', modelPath(), '-f', wav, '-l', 'es', '-t', threads, '-nt', '-np', '-bs', '1', '-ac', '1000'],
        { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (err, stdout) => (err ? reject(new Error('No pude entender el audio')) : resolve(stdout)));
    });
    return clean(text);
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

function clean(t) {
  t = String(t || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  // Whisper a veces "alucina" frases típicas cuando solo hay ruido.
  if (/^(gracias( por ver(lo|el video)?)?|subt[ií]tulos.*|¡?suscr[ií]bete.*|\.+|…)$/i.test(t)) return '';
  if (t === PROMPT || PROMPT.includes(t) && t.length > 40) return '';
  return t;
}

module.exports = { status, download, transcribe, MODELS };
