/* =========================================================
   PALABRAS — administración de la lista (localStorage)
   Edición con teclado: editar = escribir, eliminar = borrar el texto.
   ========================================================= */
(() => {
  'use strict';

  const STORAGE_KEY = 'sopaLetras.palabras';     // misma clave que usa script.js
  const MAX_LEN = 20, MIN_LEN = 2;
  const VALID = /^[A-ZÁÉÍÓÚÜÑ]+$/;               // letras, tildes y Ñ

  const $ = id => document.getElementById(id);
  const ui = { form: $('add-form'), input: $('new-word'), list: $('words'), count: $('count'), msg: $('msg'), empty: $('empty'), save: $('btn-save'), clear: $('btn-clear') };

  /* ---------- Utilidades ---------- */
  // Clave de comparación: sin tildes pero conservando la Ñ (ÁRBOL = ARBOL, pero ÑU ≠ NU)
  function keyOf(w) {
    return w.normalize('NFC').toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'Ñ');
  }
  const clean = v => v.normalize('NFC').toUpperCase().trim();
  const rows = () => [...ui.list.querySelectorAll('input')];

  function say(text, type) { ui.msg.textContent = text; ui.msg.className = 'msg ' + (type || ''); }

  // Devuelve un texto de error o '' si la palabra es válida
  function problem(w) {
    if (/\s/.test(w)) return 'Escribe una sola palabra, sin espacios.';
    if (!VALID.test(w)) return 'Usa solo letras (se permiten tildes y Ñ).';
    if (w.length < MIN_LEN) return `La palabra debe tener al menos ${MIN_LEN} letras.`;
    return '';
  }

  /* ---------- Lista ---------- */
  function addRow(value) {
    const li = document.createElement('li');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = value; inp.maxLength = MAX_LEN; inp.spellcheck = false;
    inp.setAttribute('aria-label', 'Palabra (bórrala para eliminarla)');
    li.appendChild(inp); ui.list.appendChild(li);

    // Mientras se escribe: mayúsculas automáticas y validación visual
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      inp.value = inp.value.toUpperCase();
      inp.setSelectionRange(pos, pos);
      refresh();
    });
    // Enter confirma la edición (si quedó vacía, se elimina)
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Backspace' && inp.value === '') { e.preventDefault(); removeRow(li, true); }
    });
    inp.addEventListener('blur', () => { if (!inp.value.trim()) removeRow(li, false); });
    return inp;
  }

  function removeRow(li, focusPrev) {
    const prev = li.previousElementSibling;
    li.remove(); refresh();
    if (focusPrev && prev) prev.querySelector('input').focus(); else if (focusPrev) ui.input.focus();
  }

  // Marca duplicados / inválidos y actualiza el contador y el estado vacío
  function refresh() {
    const seen = new Map();
    let n = 0;
    rows().forEach(inp => {
      const w = clean(inp.value);
      inp.classList.remove('dup', 'bad');
      if (!w) return;
      n++;
      if (problem(w)) inp.classList.add('bad');
      const k = keyOf(w);
      if (seen.has(k)) { inp.classList.add('dup'); seen.get(k).classList.add('dup'); } else seen.set(k, inp);
    });
    ui.count.textContent = n;
    ui.empty.hidden = ui.list.children.length > 0;
  }

  /* ---------- Agregar ---------- */
  ui.form.addEventListener('submit', e => {
    e.preventDefault();
    const w = clean(ui.input.value);
    if (!w) return say('Escribe una palabra antes de agregarla.', 'error');
    const err = problem(w);
    if (err) return say(err, 'error');
    if (rows().some(i => keyOf(clean(i.value)) === keyOf(w))) return say(`"${w}" ya está en la lista.`, 'error');
    addRow(w); refresh();
    ui.input.value = ''; ui.input.focus();
    say(`"${w}" agregada.`, 'ok');
  });
  ui.input.addEventListener('input', () => { ui.input.value = ui.input.value.toUpperCase(); });

  /* ---------- Guardar ---------- */
  ui.save.addEventListener('click', () => {
    const words = rows().map(i => clean(i.value)).filter(Boolean);
    // Lista vacía: también se guarda (por ejemplo, al borrar con el teclado la única palabra)
    if (!words.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        say('Lista guardada sin palabras. Agrega nuevas para poder jugar.', 'ok');
      } catch (err) {
        say('No se pudo guardar: el navegador bloquea el almacenamiento local.', 'error');
      }
      return;
    }
    const bad = words.find(problem);
    if (bad) return say(`Revisa "${bad}": ${problem(bad)}`, 'error');
    if (new Set(words.map(keyOf)).size !== words.length) return say('Hay palabras duplicadas. Bórralas con el teclado para poder guardar.', 'error');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
      say('¡Las palabras se guardaron correctamente!', 'ok');
    } catch (err) {
      say('No se pudo guardar: el navegador bloquea el almacenamiento local.', 'error');
    }
  });

  /* ---------- Eliminar todo ---------- */
  // Vacía la lista y guarda de inmediato, para que el juego pida registrar palabras nuevas
  ui.clear.addEventListener('click', () => {
    if (!ui.list.children.length && !localStorage.getItem(STORAGE_KEY)) return say('La lista ya está vacía.', 'error');
    if (!confirm('¿Eliminar todas las palabras? Esta acción no se puede deshacer.')) return;
    ui.list.innerHTML = '';
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      say('Se eliminaron todas las palabras. Agrega nuevas para poder jugar.', 'ok');
    } catch (err) {
      say('No se pudo guardar: el navegador bloquea el almacenamiento local.', 'error');
    }
    refresh(); ui.input.focus();
  });

  /* ---------- Carga inicial ---------- */
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach(w => addRow(String(w)));
  } catch (err) { /* lista vacía */ }
  refresh();
})();
