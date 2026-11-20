// Actualizaciones automáticas desde GitHub Releases (electron-updater).
// Revisa al abrir y cada 2 horas; descarga sola; instala al cerrar o, si no la usas, en 1 minuto.
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log/main');

let send = () => {};
let isBusy = () => false;
let installTimer = null;
let state = { status: 'idle', version: null, percent: 0, message: '' };

function set(patch) {
  state = { ...state, ...patch };
  send('update:state', state);
}

function init({ notify, busy }) {
  send = notify;
  isBusy = busy || isBusy;
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: 'Buscando actualizaciones…' }));
  autoUpdater.on('update-not-available', () => set({ status: 'latest', message: `Tienes la última versión (${app.getVersion()})` }));
  autoUpdater.on('update-available', (i) => set({ status: 'downloading', version: i.version, percent: 0, message: `Descargando versión ${i.version}…` }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent), message: `Descargando ${state.version || ''}: ${Math.round(p.percent)} %` }));
  autoUpdater.on('update-downloaded', (i) => {
    set({ status: 'ready', version: i.version, percent: 100, message: `Versión ${i.version} lista. Se instalará en 1 minuto.` });
    scheduleInstall();
  });
  autoUpdater.on('error', (e) => {
    log.warn('update error', e);
    set({ status: 'error', message: friendly(e) });
  });

  if (!app.isPackaged) {
    set({ status: 'dev', message: 'Modo desarrollo: las actualizaciones solo funcionan en la app instalada.' });
    return;
  }
  setTimeout(check, 8000);
  setInterval(check, 2 * 60 * 60 * 1000);
}

function friendly(e) {
  const m = String(e?.message || e);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(m)) return 'Sin internet: reviso actualizaciones más tarde.';
  if (/404/.test(m)) return 'Aún no hay versiones publicadas.';
  return 'No pude buscar actualizaciones ahora.';
}

function check() {
  if (!app.isPackaged) return set({ status: 'dev', message: 'Modo desarrollo: las actualizaciones solo funcionan en la app instalada.' });
  if (state.status === 'downloading' || state.status === 'ready') return;
  autoUpdater.checkForUpdates().catch(() => {});
}

// Instala sola en 60 s, salvo que estés en modo enfoque (entonces espera y reintenta).
function scheduleInstall() {
  clearTimeout(installTimer);
  installTimer = setTimeout(() => {
    if (isBusy()) { set({ message: `Versión ${state.version} lista: la instalo al terminar tu sesión de enfoque.` }); return scheduleInstall(); }
    installNow();
  }, 60000);
}
function postpone() {
  clearTimeout(installTimer);
  set({ message: `Versión ${state.version} lista: se instalará cuando cierres Kiro.` });
}
function installNow() {
  if (state.status !== 'ready') return;
  app.isQuitting = true;
  autoUpdater.quitAndInstall(true, true); // silenciosa y vuelve a abrir
}

module.exports = { init, check, installNow, postpone, getState: () => state };
