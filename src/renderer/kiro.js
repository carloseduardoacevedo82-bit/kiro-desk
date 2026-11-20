// Personaje Kiro: una gotita menta con hojita. Emociones = combinación de ojos, boca, cejas y animación.
(function () {
  const SVG = `
<svg viewBox="0 0 120 120" class="kiro-svg" aria-hidden="true">
  <defs>
    <radialGradient id="kb" cx="40%" cy="32%" r="75%">
      <stop offset="0" stop-color="#b8ffe4"/><stop offset=".55" stop-color="#5fe0b5"/><stop offset="1" stop-color="#23a983"/>
    </radialGradient>
    <radialGradient id="kc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff8fa3" stop-opacity=".75"/><stop offset="1" stop-color="#ff8fa3" stop-opacity="0"/></radialGradient>
  </defs>
  <g class="k-body">
    <g class="k-leaf"><path d="M60 22c-2-9 3-15 12-17-1 9-5 15-12 17Z" fill="#7cf0a2"/><path d="M60 22c1-6 4-10 9-13" stroke="#2a9d6b" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
    <path class="k-shape" d="M60 20c27 0 46 20 46 47 0 25-19 41-46 41S14 92 14 67c0-27 19-47 46-47Z" fill="url(#kb)"/>
    <ellipse cx="44" cy="40" rx="11" ry="6" fill="#fff" opacity=".35" transform="rotate(-20 44 40)"/>
    <g class="k-cheeks"><circle cx="33" cy="76" r="9" fill="url(#kc)"/><circle cx="87" cy="76" r="9" fill="url(#kc)"/></g>
    <g class="k-brows"><path class="k-brow l" d="M36 52q8-4 15 0"/><path class="k-brow r" d="M69 52q7-4 15 0"/></g>
    <g class="k-eyes">
      <g class="k-eye l"><ellipse class="k-pupil" cx="44" cy="65" rx="6.5" ry="8.5"/><circle class="k-shine" cx="46.5" cy="61.5" r="2.2"/><path class="k-closed" d="M37 66q7 6 14 0"/><path class="k-happy" d="M37 67q7-8 14 0"/></g>
      <g class="k-eye r"><ellipse class="k-pupil" cx="76" cy="65" rx="6.5" ry="8.5"/><circle class="k-shine" cx="78.5" cy="61.5" r="2.2"/><path class="k-closed" d="M69 66q7 6 14 0"/><path class="k-happy" d="M69 67q7-8 14 0"/></g>
    </g>
    <g class="k-mouth">
      <path class="m smile" d="M52 80q8 7 16 0"/>
      <path class="m neutral" d="M54 82h12"/>
      <path class="m sad" d="M52 85q8-6 16 0"/>
      <ellipse class="m open" cx="60" cy="83" rx="5" ry="6"/>
      <path class="m grin" d="M49 79q11 13 22 0Z"/>
      <path class="m wavy" d="M51 83q3-3 6 0t6 0t6 0"/>
      <ellipse class="m talk" cx="60" cy="82" rx="6" ry="3.5"/>
    </g>
    <g class="k-zz"><text x="92" y="30">z</text><text x="100" y="20">z</text></g>
    <g class="k-dots"><circle cx="48" cy="104" r="3"/><circle cx="60" cy="104" r="3"/><circle cx="72" cy="104" r="3"/></g>
  </g>
</svg>`;

  // 12 emociones + estados
  const MAP = {
    feliz: 'e-happy', neutral: 'e-neutral', pensando: 'e-think', sorprendido: 'e-surprise', triste: 'e-sad',
    emocionado: 'e-excited', carinoso: 'e-love', preocupado: 'e-worry', enojado: 'e-angry', confundido: 'e-confused',
    orgulloso: 'e-proud', cansado: 'e-tired',
    // estados
    reposo: 'e-neutral', escuchando: 'e-listen', hablando: 'e-talk', alerta: 'e-surprise', notificacion: 'e-excited', durmiendo: 'e-sleep',
  };

  const els = [];
  let current = 'feliz';
  let blinkT;

  function mount(el) {
    const n = els.length;
    el.innerHTML = SVG.replace(/id="k([bc])"/g, `id="k$1${n}"`).replace(/url\(#k([bc])\)/g, `url(#k$1${n})`);
    els.push(el);
    set(current);
  }
  function set(emotion) {
    current = MAP[emotion] ? emotion : 'neutral';
    for (const el of els) {
      el.className = el.className.replace(/\be-[\w-]+/g, '').trim() + ' ' + MAP[current];
    }
  }
  function blink() {
    clearTimeout(blinkT);
    blinkT = setTimeout(() => {
      els.forEach((el) => { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 140); });
      blink();
    }, 2500 + Math.random() * 3500);
  }
  blink();
  window.Kiro = { mount, set, get: () => current };
})();
