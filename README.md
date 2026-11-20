# Kiro Desk

Asistente de escritorio para Windows: una "isla" arriba de la pantalla con un personaje animado (Kiro) que te ayuda con tareas, recordatorios, timers, hábitos, modo enfoque 25/5, ordenar el escritorio y abrir apps. Le hablas por voz o le escribes. La IA corre **en tu PC** con Ollama (modelo `llama3.2:3b`). Tus datos no salen de tu computadora.

## Usarlo
- **Ctrl+Alt+K**: hablarle · **Ctrl+Alt+Espacio**: abrir/cerrar el panel · **Esc**: cerrar.
- Ejemplos: "agrega tarea revisar planilla", "recuérdame pagar la luz a las 6 pm", "timer de 10 minutos", "modo enfoque", "tomé un vaso de agua", "abre Excel", "ordena el escritorio".
- Ícono en la bandeja (junto al reloj): abrir, buscar actualizaciones, iniciar con Windows, salir.
- Datos en `%APPDATA%\Kiro Desk\kiro-data.json`.

## Requisitos
- Windows 10/11 64 bits, 8 GB de RAM.
- [Ollama](https://ollama.com/download/windows) con el modelo `llama3.2:3b` (la app lo descarga desde Ajustes). Sin Ollama igual entiende los comandos básicos.
- Voz: reconocimiento de voz de Windows en español (ya viene instalado: es-ES).

## Actualizaciones automáticas
La app instalada revisa GitHub Releases de este repositorio al abrir y cada 2 horas. Si hay versión nueva, la descarga sola y la instala al minuto (o al cerrar, si estás en modo enfoque).

### Publicar una versión nueva
1. Sube el número en `package.json` (por ejemplo `0.1.0` → `0.1.1`).
2. En PowerShell, dentro de la carpeta del proyecto:
   ```powershell
   $env:GH_TOKEN = (gh auth token); npm run release
   ```
   Esto crea el instalador y lo publica en GitHub Releases con `latest.yml`. Todas las PCs con Kiro Desk se actualizan solas.

## Desarrollo
```powershell
npm install
node node_modules/electron/install.js   # npm 11 no corre el postinstall de Electron
npm start
npm run dist                             # instalador en dist/
```
