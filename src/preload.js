const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (fn) => { const l = (_e, p) => fn(p); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); };

contextBridge.exposeInMainWorld('kiro', {
  getData: call('data:get'),
  setMode: call('island:mode'),
  pin: call('island:pin'),
  input: call('input'),
  tasks: { add: call('tasks:add'), toggle: call('tasks:toggle'), remove: call('tasks:delete') },
  reminders: { remove: call('reminders:delete') },
  habits: { add: call('habits:add'), inc: call('habits:inc'), remove: call('habits:delete') },
  focus: { start: call('focus:start'), stop: call('focus:stop') },
  desktop: { scan: call('desktop:scan'), organize: call('desktop:organize'), undo: call('desktop:undo'), open: call('desktop:open') },
  voice: { listen: call('voice:listen'), stop: call('voice:stop') },
  settings: { set: call('settings:set') },
  ai: { status: call('ai:status'), pull: call('ai:pull'), openOllama: call('ai:openOllama') },
  chat: { clear: call('chat:clear') },
  update: { check: call('update:check'), install: call('update:install'), postpone: call('update:postpone'), state: call('update:state') },
  quit: call('app:quit'),
  on: {
    data: on('data'),
    mode: on('island:mode'),
    alert: on('alert'),
    state: on('kiro:state'),
    voiceTrigger: on('voice:trigger'),
    voiceHeard: on('voice:heard'),
    pull: on('ai:pull'),
    update: on('update:state'),
  },
});
