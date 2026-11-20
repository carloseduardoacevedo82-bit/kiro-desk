// Almacén local en JSON (userData/kiro-data.json). Todo queda en la PC.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  tasks: [],          // {id, text, done, createdAt, doneAt}
  reminders: [],      // {id, text, at (ms), fired, kind:'reminder'|'timer'}
  habits: [],         // {id, name, style, goal, log:{'YYYY-MM-DD': n}}
  focus: { active: null, sessions: [] }, // active:{phase:'work'|'break', endsAt, startedAt}; sessions:[{date, minutes}]
  chat: [],           // últimos mensajes {role, content}
  organizerUndo: null,// {at, moves:[{from,to}]}
  settings: {
    voiceReplies: true,
    wakeWord: false,
    autostart: true,
    model: 'llama3.2:3b',
    voiceModel: 'ggml-base-q5_1.bin',
    name: ''
  },
  lastSeen: 0
};

let file;
let data;
let saveTimer;

function load() {
  file = path.join(app.getPath('userData'), 'kiro-data.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    data = structuredClone(DEFAULTS);
  }
  return data;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

module.exports = { load, save, flush, get: () => data, id, today };
