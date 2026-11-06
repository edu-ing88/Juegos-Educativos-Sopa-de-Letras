/* =========================================================
   SOPA DE LETRAS — lógica del juego (JavaScript puro)
   Módulos: Config · Palabras guardadas · Generador · Sonido
            · Selección · Cronómetro · Flujo del juego
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 1. Configuración ---------- */
  const STORAGE_KEY = 'sopaLetras.palabras';   // misma clave que usa palabras.js
  const POINTS = 10;                           // puntos por palabra

  /* @gen-start  (sección pura, sin DOM) */
  const MIN_SIZE = 12, MAX_SIZE = 30;
  // 8 orientaciones [fila, columna]: horizontal, vertical y las 4 diagonales, cada una en ambos sentidos
  const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[-1,1],[1,-1]];
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÑ';
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Convierte una palabra a su forma de tablero: mayúsculas, sin tildes, conservando la Ñ
  function normalize(w) {
    return String(w).normalize('NFC').toUpperCase().replace(/Ñ/g, '\u0001')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');
  }

  // Intenta colocar una palabra; recorre las direcciones empezando por la preferida (reparto variado)
  function placeWord(grid, key, n, order) {
    const len = key.length;
    if (len > n) return null;
    for (const [dr, dc] of order) {
      // rangos de inicio que garantizan que la palabra cabe completa
      const rLo = dr < 0 ? len - 1 : 0, rHi = dr > 0 ? n - len : n - 1;
      const cLo = dc < 0 ? len - 1 : 0, cHi = dc > 0 ? n - len : n - 1;
      for (let t = 0; t < 40; t++) {
        const r0 = rLo + rand(rHi - rLo + 1), c0 = cLo + rand(cHi - cLo + 1);
        let fits = true;
        for (let i = 0; i < len && fits; i++) {
          const cell = grid[r0 + dr * i][c0 + dc * i];
          fits = cell === '' || cell === key[i];   // permite cruces sólo si la letra coincide
        }
        if (!fits) continue;
        for (let i = 0; i < len; i++) grid[r0 + dr * i][c0 + dc * i] = key[i];
        return { key, r: r0, c: c0, dr, dc };
      }
    }
    return null;
  }

  function tryFill(words, n) {
    const grid = Array.from({ length: n }, () => Array(n).fill(''));
    const base = shuffle(DIRS), placed = [], failed = [];
    [...words].sort((a, b) => b.key.length - a.key.length).forEach((w, i) => {
      const k = i % base.length;
      const p = placeWord(grid, w.key, n, base.slice(k).concat(base.slice(0, k)));
      p ? placed.push({ ...p, show: w.show }) : failed.push(w);
    });
    return { grid, n, placed, failed };
  }

  // Genera la cuadrícula; si no caben todas las palabras, la agranda automáticamente
  function buildGrid(words) {
    const total = words.reduce((s, w) => s + w.key.length, 0);
    const longest = Math.max(...words.map(w => w.key.length));
    let n = Math.min(MAX_SIZE, Math.max(MIN_SIZE, longest, Math.ceil(Math.sqrt(total * 2.2))));
    let best;
    for (;;) {
      best = null;
      for (let a = 0; a < 30; a++) {
        const r = tryFill(words, n);
        if (!best || r.placed.length > best.placed.length) best = r;
        if (!r.failed.length) break;
      }
      if (!best.failed.length || n >= MAX_SIZE) break;
      n++;
    }
    best.grid = best.grid.map(row => row.map(ch => ch || ALPHABET[rand(ALPHABET.length)]));
    return best;   // { grid, n, placed, failed }
  }

  // Celdas en línea recta (8 direcciones) desde a hasta el punto b
  function linePath(a, b, n) {
    let dr = b.r - a.r, dc = b.c - a.c;
    const ar = Math.abs(dr), ac = Math.abs(dc);
    if (ar > 2 * ac) dc = 0;
    else if (ac > 2 * ar) dr = 0;
    else { const m = Math.max(ar, ac); dr = Math.sign(dr) * m; dc = Math.sign(dc) * m; }
    const m = Math.max(Math.abs(dr), Math.abs(dc)), sr = Math.sign(dr), sc = Math.sign(dc), path = [];
    for (let i = 0; i <= m; i++) {
      const r = a.r + sr * i, c = a.c + sc * i;
      if (r < 0 || r >= n || c < 0 || c >= n) break;
      path.push({ r, c });
    }
    return path;
  }
  /* @gen-end */

  /* ---------- 2. Palabras guardadas (localStorage) ---------- */
  // Lee la lista creada en palabras.html. Devuelve [] si no hay nada guardado.
  function loadWords() {
    let raw = [];
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) return [];
    const seen = new Set(), out = [];
    raw.forEach(w => {
      const key = normalize(w);
      if (key.length < 2 || key.length > MAX_SIZE || seen.has(key)) return;
      seen.add(key);
      out.push({ show: String(w).toUpperCase().trim(), key });   // show conserva tildes
    });
    return out;
  }

  /* ---------- 3. DOM y estado ---------- */
  const $ = id => document.getElementById(id);
  const el = {
    start: $('screen-start'), game: $('screen-game'), countdown: $('countdown'), cdText: $('countdown-text'),
    board: $('board'), list: $('word-list'), score: $('score'), progress: $('progress'), timer: $('timer'),
    modal: $('modal'), msg: $('modal-msg'), resScore: $('res-score'), resWords: $('res-words'), resTime: $('res-time'),
    sound: $('btn-sound'), abandon: $('modal-abandon'), btnStart: $('btn-start'), startNotice: $('start-notice'), gameNotice: $('game-notice')
  };
  const state = { words: [], grid: [], size: 12, found: new Set(), score: 0, seconds: 0, tick: null,
                  playing: false, sound: true, dragging: false, start: null, path: [], cdTimers: [] };

  /* Pantalla de inicio: avisa si todavía no hay palabras guardadas */
  function refreshStart() {
    const n = loadWords().length;
    el.btnStart.disabled = n === 0;
    el.startNotice.classList.toggle('empty', n === 0);
    el.startNotice.textContent = n === 0
      ? 'Aún no hay palabras. Primero regístralas desde el botón PALABRAS.'
      : `Palabras guardadas: ${n}`;
  }

  /* ---------- 4. Sonido (Web Audio API) ---------- */
  let audioCtx = null;
  function tone(freq, start, dur, type = 'sine', vol = 0.2) {
    if (!state.sound) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + start;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur);
  }
  const sounds = {
    ok:   () => { tone(660, 0, .15); tone(880, .12, .25); },
    bad:  () => { tone(220, 0, .12, 'square', .12); tone(160, .1, .18, 'square', .12); },
    win:  () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * .14, .3, 'triangle', .25)),
    tick: () => tone(500, 0, .1, 'sine', .15),
    go:   () => tone(900, 0, .35, 'triangle', .25)
  };

  /* ---------- 5. Renderizado ---------- */
  function renderBoard() {
    el.board.innerHTML = '';
    el.board.style.setProperty('--n', state.size);
    state.grid.forEach((row, r) => row.forEach((ch, c) => {
      const d = document.createElement('div');
      d.className = 'cell'; d.textContent = ch; d.dataset.r = r; d.dataset.c = c; d.setAttribute('role', 'gridcell');
      el.board.appendChild(d);
    }));
  }
  function renderWords() {
    el.list.innerHTML = '';
    state.words.forEach(w => { const li = document.createElement('li'); li.dataset.key = w.key; li.textContent = w.show; el.list.appendChild(li); });
  }
  function updateHud() {
    el.score.textContent = state.score;
    el.progress.textContent = `${state.found.size} de ${state.words.length}`;
  }
  const cellAt = (r, c) => el.board.children[r * state.size + c];
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  /* ---------- 6. Selección con mouse / táctil (Pointer Events) ---------- */
  function cellFromEvent(e) {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    return t && t.classList.contains('cell') ? { r: +t.dataset.r, c: +t.dataset.c } : null;
  }
  function paintSelection() {
    document.querySelectorAll('.cell.selected').forEach(x => x.classList.remove('selected'));
    state.path.forEach(p => cellAt(p.r, p.c).classList.add('selected'));
  }
  function onDown(e) {
    if (!state.playing) return;
    const p = cellFromEvent(e); if (!p) return;
    e.preventDefault(); state.dragging = true; state.start = p; state.path = [p]; paintSelection();
  }
  function onMove(e) {
    if (!state.dragging) return;
    const p = cellFromEvent(e); if (!p) return;
    state.path = linePath(state.start, p, state.size); paintSelection();
  }
  function onUp() {
    if (!state.dragging) return;
    state.dragging = false;
    checkSelection();
  }

  // Valida la selección (sentido normal o inverso) y evita puntos duplicados
  function checkSelection() {
    const letters = state.path.map(p => state.grid[p.r][p.c]).join('');
    const rev = [...letters].reverse().join('');
    const hit = letters.length > 1 ? state.words.find(w => w.key === letters || w.key === rev) : null;
    const cells = state.path.map(p => cellAt(p.r, p.c));
    cells.forEach(c => c.classList.remove('selected'));

    if (hit && !state.found.has(hit.key)) {
      state.found.add(hit.key);
      state.score += POINTS;
      cells.forEach(c => c.classList.add('found'));
      el.list.querySelector(`[data-key="${hit.key}"]`).classList.add('found');
      updateHud();
      state.found.size === state.words.length ? finish() : sounds.ok();
    } else if (state.path.length > 1 && !hit) {
      sounds.bad();
      cells.forEach(c => { c.classList.add('wrong'); setTimeout(() => c.classList.remove('wrong'), 350); });
    }
    state.path = [];
  }

  /* ---------- 7. Cronómetro ---------- */
  function startTimer() {
    stopTimer(); state.seconds = 0; el.timer.textContent = '00:00';
    state.tick = setInterval(() => { state.seconds++; el.timer.textContent = fmt(state.seconds); }, 1000);
  }
  function stopTimer() { clearInterval(state.tick); state.tick = null; }

  /* ---------- 8. Flujo del juego ---------- */
  function showScreen(name) {
    el.start.classList.toggle('active', name === 'start');
    el.game.classList.toggle('active', name === 'game');
  }

  // Prepara una partida nueva con las palabras guardadas. Devuelve false si no hay palabras.
  function resetGame() {
    state.cdTimers.forEach(clearTimeout); state.cdTimers = [];
    stopTimer();
    const words = loadWords();
    if (!words.length) return false;
    const res = buildGrid(words);
    Object.assign(state, { words: res.placed.map(p => ({ key: p.key, show: p.show })).sort((a, b) => a.show.localeCompare(b.show, 'es')),
      grid: res.grid, size: res.n, found: new Set(), score: 0, seconds: 0, playing: false, dragging: false, path: [] });
    // Si alguna palabra no cupo (listas enormes), se informa al usuario
    el.gameNotice.hidden = !res.failed.length;
    el.gameNotice.textContent = res.failed.length
      ? `No cupieron ${res.failed.length} palabra(s): ${res.failed.map(w => w.show).join(', ')}. Reduce la lista en PALABRAS.` : '';
    renderBoard(); renderWords(); updateHud();
    el.timer.textContent = '00:00'; el.modal.hidden = true; el.board.classList.remove('locked');
    return true;
  }

  // Cuenta regresiva 3, 2, 1, ¡EMPEZAR! y luego arranca el cronómetro
  function runCountdown() {
    if (!resetGame()) { showScreen('start'); refreshStart(); return; }
    showScreen('game');
    const steps = ['3', '2', '1', '¡EMPEZAR!'];
    el.countdown.hidden = false;
    steps.forEach((txt, i) => {
      state.cdTimers.push(setTimeout(() => {
        el.cdText.textContent = txt;
        el.cdText.style.animation = 'none'; void el.cdText.offsetWidth; el.cdText.style.animation = '';
        el.cdText.style.fontSize = txt.length > 1 ? 'clamp(2.5rem, 12vw, 6rem)' : '';
        i < 3 ? sounds.tick() : sounds.go();
      }, i * 900));
    });
    state.cdTimers.push(setTimeout(() => { el.countdown.hidden = true; state.playing = true; startTimer(); }, steps.length * 900));
  }

  function finish() {
    state.playing = false; stopTimer(); el.board.classList.add('locked');
    sounds.win();
    const t = state.seconds;
    el.resScore.textContent = state.score;
    el.resWords.textContent = `${state.found.size}/${state.words.length}`;
    el.resTime.textContent = fmt(t);
    el.msg.textContent = t <= 90 ? '¡Increíble! Tienes una vista de águila y una rapidez asombrosa.'
                      : t <= 180 ? '¡Muy bien! Buen ojo y buena concentración. Intenta superar tu tiempo.'
                      : '¡Lo lograste! La constancia te hace mejorar: vuelve a jugar y reduce tu tiempo.';
    setTimeout(() => { el.modal.hidden = false; }, 700); // deja ver la última palabra marcada
  }

  function exitToStart() {
    state.cdTimers.forEach(clearTimeout); stopTimer(); state.playing = false;
    el.countdown.hidden = true; el.modal.hidden = true; if (el.abandon) el.abandon.hidden = true;
    showScreen('start'); refreshStart();
  }

  /* ---------- 9. Eventos ---------- */
  el.btnStart.addEventListener('click', runCountdown);
  $('btn-again').addEventListener('click', runCountdown);
  $('btn-exit').addEventListener('click', exitToStart);
  $('btn-restart').addEventListener('click', runCountdown);
  el.sound.addEventListener('click', () => {
    state.sound = !state.sound;
    el.sound.textContent = state.sound ? '🔊 Sonido' : '🔇 Sin sonido';
    el.sound.setAttribute('aria-pressed', state.sound);
  });
  el.board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  el.board.addEventListener('contextmenu', e => e.preventDefault());
  // Abandonar: pide confirmación antes de salir (protegido: si falta el HTML, el resto del juego sigue funcionando)
  const btnAbandon = $('btn-abandon'), btnYes = $('btn-abandon-yes'), btnNo = $('btn-abandon-no');
  if (el.abandon && btnAbandon && btnYes && btnNo) {
    btnAbandon.addEventListener('click', () => { el.abandon.hidden = false; btnNo.focus(); });
    btnYes.addEventListener('click', () => { el.abandon.hidden = true; exitToStart(); });
    btnNo.addEventListener('click', () => { el.abandon.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.abandon.hidden) el.abandon.hidden = true; });
  }
  // Al volver desde palabras.html (incluso desde la caché del navegador) se recarga la lista guardada
  window.addEventListener('pageshow', refreshStart);

  refreshStart();
})();
