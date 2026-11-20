// Graba del micrófono y corta solo cuando dejas de hablar. Devuelve un WAV 16 kHz mono.
(function () {
  const RATE = 16000;
  let stream = null;
  let ctx = null;

  async function open() {
    if (stream && stream.active) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new AudioContext({ sampleRate: RATE });
  }
  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    ctx?.close().catch(() => {});
    ctx = null;
  }

  // opts: { maxMs, waitMs (sin voz -> se rinde), silenceMs, onLevel(0..1), signal:{stop:false} }
  async function record(opts = {}) {
    const { maxMs = 12000, waitMs = 7000, silenceMs = 1100, onLevel, signal = {} } = opts;
    await open();
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const chunks = [];
    const t0 = performance.now();
    let floor = 0.01;
    let speechAt = 0;
    let lastVoice = 0;
    let n = 0;
    return await new Promise((resolve) => {
      const finish = (hadSpeech) => {
        proc.disconnect(); src.disconnect();
        if (!hadSpeech) return resolve(null);
        resolve(toWav(chunks));
      };
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d));
        let s = 0;
        for (let i = 0; i < d.length; i++) s += d[i] * d[i];
        const rms = Math.sqrt(s / d.length);
        const now = performance.now();
        n++;
        if (n < 6) floor = Math.max(floor, rms); // primeros ~0,7 s: ruido de fondo
        const thr = Math.max(0.018, floor * 2.6);
        onLevel?.(Math.min(1, rms / 0.15));
        if (rms > thr) { if (!speechAt) speechAt = now; lastVoice = now; }
        if (signal.stop) return finish(!!speechAt);
        if (speechAt && now - lastVoice > silenceMs && now - speechAt > 400) return finish(true);
        if (!speechAt && now - t0 > waitMs) return finish(false);
        if (now - t0 > maxMs) return finish(!!speechAt);
      };
      src.connect(proc);
      proc.connect(ctx.destination);
    });
  }

  function toWav(chunks) {
    let len = 0;
    for (const c of chunks) len += c.length;
    const buf = new ArrayBuffer(44 + len * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len * 2, true);
    let o = 44;
    for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
    return buf;
  }

  window.Recorder = { record, close };
})();
