// Puente con listen.ps1 (reconocimiento de voz de Windows, sin internet).
const path = require('path');
const { spawn } = require('child_process');

function scriptPath() {
  // Dentro del instalador el script va desempaquetado (asarUnpack).
  return path.join(__dirname, 'listen.ps1').replace('app.asar', 'app.asar.unpacked');
}

function run(args, onLine) {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(), ...args], { windowsHide: true });
  let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(line); }
  });
  return p;
}

function parse(line) {
  if (line.startsWith('TEXT:')) {
    const body = line.slice(5);
    const k = body.lastIndexOf('|');
    return { text: body.slice(0, k).trim(), confidence: parseFloat(body.slice(k + 1)) || 0 };
  }
  if (line.startsWith('ERROR:')) return { error: line.slice(6) };
  return null;
}

let current = null;

// Escucha una frase. Resuelve { text, confidence } o rechaza con mensaje.
function listenOnce(timeout = 8) {
  stopOnce();
  return new Promise((resolve, reject) => {
    let result = null;
    const p = run(['-Once', '-Timeout', String(timeout)], (line) => {
      const r = parse(line);
      if (r) result = r;
    });
    current = p;
    p.on('close', () => {
      if (current === p) current = null;
      if (result?.error) reject(new Error(result.error));
      else resolve(result || { text: '', confidence: 0 });
    });
    p.on('error', (e) => reject(e));
  });
}
function stopOnce() {
  if (current) { try { current.kill(); } catch { /* */ } current = null; }
}

// Escucha continua para la palabra clave "Kiro".
let wake = null;
function startWake(onPhrase) {
  stopWake();
  wake = run([], (line) => {
    const r = parse(line);
    if (r?.text) onPhrase(r);
  });
  wake.on('close', () => { wake = null; });
}
function stopWake() {
  if (wake) { try { wake.kill(); } catch { /* */ } wake = null; }
}
const pauseWake = () => { if (wake) { stopWake(); return true; } return false; };

module.exports = { listenOnce, stopOnce, startWake, stopWake, pauseWake };
