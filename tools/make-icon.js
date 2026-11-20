// Genera el ícono (256 px) a partir del personaje. Uso: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const kiro = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'kiro.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  const html = `<html><head><style>${css} html,body{margin:0;padding:0;background:transparent} *{animation:none!important}
    .bg{width:256px;height:256px;border-radius:56px;background:radial-gradient(circle at 50% 35%,#1e2533,#0c0d12);display:grid;place-items:center}
    .kiro{width:210px;height:210px}</style></head><body><div class="bg"><div class="kiro" id="k"></div></div>
    <script>${kiro};Kiro.mount(document.getElementById('k'));Kiro.set('feliz');</script></body></html>`;
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 600));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const png = img.resize({ width: 256, height: 256 }).toPNG();
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), png);
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'renderer', 'icon.png'), png);
  console.log('icon ok', png.length);
  app.quit();
});
