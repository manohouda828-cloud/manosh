'use strict';
(() => {
  const api = window.manosh;
  const META = window.MANOSH_SPRITES;
  const FW = META.frameW, FH = META.frameH, COLS = META.cols;
  // Logical padding (in sprite pixels) around the frame so effects like Zzz / notes have room.
  const PADL = 14, PADR = 14, PADT = 16;
  const CW = FW + PADL + PADR, CH = FH + PADT;
  const BUBBLE_SPACE = 76; // DIP of window height reserved above the canvas for speech bubbles

  const canvas = document.getElementById('pet');
  const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('bubble');
  const sheet = new Image();

  let settings = { scale: 3, wander: true, chatty: true };
  let wa = { x: 0, y: 0, width: 1920, height: 1040 };
  let dpr = window.devicePixelRatio || 1;
  let S = 3;          // device pixels per sprite pixel (integer => crisp pixel art)
  let unit = 3;       // CSS/DIP pixels per sprite pixel
  let winW = 260, winH = 260;
  let winX = 0, winY = 0;
  let brain = null;
  let masks = [];
  let greetPending = true;

  // ---------------------------------------------------------------- layout
  function layout() {
    dpr = window.devicePixelRatio || 1;
    S = Math.max(1, Math.round(settings.scale * dpr));
    unit = S / dpr;
    const cssW = CW * unit, cssH = CH * unit;
    canvas.width = CW * S; canvas.height = CH * S;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    ctx.imageSmoothingEnabled = false;
    winW = Math.max(Math.ceil(cssW), 260);
    winH = Math.ceil(cssH) + BUBBLE_SPACE;
    bubble.style.bottom = Math.round(cssH - (PADT + 5) * unit + 8) + 'px';
    lastKey = '';
    forcePush = true;
  }
  function watchDpr() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { layout(); watchDpr(); }, { once: true });
  }

  // ---------------------------------------------------------------- sprites + hit masks
  function buildMasks() {
    const c = document.createElement('canvas'); c.width = sheet.naturalWidth; c.height = sheet.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(sheet, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const n = Object.keys(META.frames).length;
    masks = new Array(n);
    for (let i = 0; i < n; i++) {
      const m = new Uint8Array(FW * FH), sx = (i % COLS) * FW, sy = Math.floor(i / COLS) * FH;
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) m[y * FW + x] = data[((sy + y) * c.width + sx + x) * 4 + 3] > 0 ? 1 : 0;
      masks[i] = m;
    }
  }
  const SIDE = /^(walk|run|jump|sit|sleep|wake_0|wake_1)/;
  const flipped = () => brain.facing < 0 && SIDE.test(brain.frame);

  function hitTest(cx, cy) {
    if (!brain) return false;
    const r = canvas.getBoundingClientRect();
    let lx = (cx - r.left) / unit - PADL;
    const ly = (cy - r.top) / unit - PADT;
    if (flipped()) lx = FW - lx;
    const m = masks[META.frames[brain.frame]]; if (!m) return false;
    const ix = Math.floor(lx), iy = Math.floor(ly);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = ix + dx, y = iy + dy;
      if (x >= 0 && y >= 0 && x < FW && y < FH && m[y * FW + x]) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- particles (pixel glyph effects)
  const GLYPHS = {
    z: ['11111', '00010', '00100', '01000', '11111'],
    note: ['00111', '00101', '00101', '11100', '11100'],
    heart: ['01010', '11111', '11111', '01110', '00100'],
    exclaim: ['11', '11', '11', '00', '11'],
    question: ['01110', '10001', '00110', '00000', '00100'],
    sweat: ['010', '111', '111', '010'],
    steam: ['1', '1', '1'],
  };
  const COLORS = { z: '#ffffff', note: '#ffd23f', heart: '#ff5d8f', exclaim: '#ff4d4d', question: '#ffd23f', sweat: '#7fd4ff', steam: '#f2f2f8' };
  let parts = [];

  function anchor() {
    const f = brain.frame;
    let ax = 20, ay = 6;
    if (/^sleep|^wake_0/.test(f)) { ax = 8; ay = 33; }
    else if (/^sit/.test(f)) { ax = 17; ay = 12; }
    if (flipped()) ax = FW - ax;
    return { x: PADL + ax, y: PADT + ay };
  }
  function spawnFx(kind) {
    if (!brain || parts.length > 14) return;
    const a = anchor(); const rr = Math.random;
    const base = { kind, t: 0, x: a.x, y: a.y, vx: 0, vy: -8, life: 1.4, seed: rr() * 6 };
    switch (kind) {
      case 'z': base.x += 7 + (rr() * 2 | 0); base.y -= 4; base.vx = 3; base.vy = -6; base.life = 2.4; break;
      case 'note': base.x += (rr() < 0.5 ? -13 : 12) + rr() * 3; base.y += 4 + rr() * 6; base.vy = -9 - rr() * 4; base.life = 1.5; break;
      case 'heart': base.x += rr() * 12 - 6; base.y -= 2; base.vy = -12; base.life = 1.4; break;
      case 'exclaim': base.x += 0; base.y -= 12; base.vy = -2; base.life = 0.9; break;
      case 'question': base.x += 8; base.y -= 11; base.vy = -3; base.life = 1.3; break;
      case 'sweat': base.x += 10; base.y += 4; base.vy = 9; base.life = 0.9; break;
      case 'steam': base.x += flipped() ? -7 : 11; base.y += 8; base.vy = -7; base.life = 1.1; break;
      default: break;
    }
    parts.push(base);
  }
  function stepFx(dt) {
    for (const p of parts) {
      p.t += dt; p.y += p.vy * dt; p.x += p.vx * dt;
      if (p.kind === 'z' || p.kind === 'steam' || p.kind === 'note') p.x += Math.sin(p.t * 4 + p.seed) * 6 * dt;
    }
    parts = parts.filter((p) => p.t < p.life);
  }
  function drawGlyph(p) {
    const g = GLYPHS[p.kind]; if (!g) return;
    const fade = p.life - p.t < 0.45 ? Math.max(0, (p.life - p.t) / 0.45) : 1;
    ctx.globalAlpha = fade;
    const ox = Math.round(p.x), oy = Math.round(p.y);
    ctx.fillStyle = '#1d1526';
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] !== '1') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect((ox + x + dx) * S, (oy + y + dy) * S, S, S);
    }
    ctx.fillStyle = COLORS[p.kind] || '#fff';
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '1') ctx.fillRect((ox + x) * S, (oy + y) * S, S, S);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- drawing
  let lastKey = '';
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const idx = META.frames[brain.frame];
    if (idx === undefined) return;
    const sx = (idx % COLS) * FW, sy = Math.floor(idx / COLS) * FH;
    ctx.save();
    if (flipped()) { ctx.translate((2 * PADL + FW) * S, 0); ctx.scale(-1, 1); }
    ctx.drawImage(sheet, sx, sy, FW, FH, PADL * S, PADT * S, FW * S, FH * S);
    ctx.restore();
    for (const p of parts) drawGlyph(p);
  }

  // ---------------------------------------------------------------- speech bubble
  let bubbleTimer = 0;
  function showBubble(text, ms) {
    if (!settings.chatty) return;
    bubble.textContent = text; bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 2500);
  }

  // ---------------------------------------------------------------- window sync
  let lastB = { x: NaN, y: NaN, w: 0, h: 0 }, forcePush = true;
  function pushBounds() {
    const groundPad = (META.groundRows || 0) * unit;
    const x = Math.round(brain.x - winW / 2), y = Math.round(brain.y - winH + groundPad);
    winX = x; winY = y;
    if (forcePush || x !== lastB.x || y !== lastB.y || winW !== lastB.w || winH !== lastB.h) {
      lastB = { x, y, w: winW, h: winH }; forcePush = false;
      api.setBounds({ x, y, width: winW, height: winH });
    }
  }
  async function refreshWorkArea(x, y) {
    try { const a = await api.getWorkArea(x != null ? x : brain.x, y != null ? y : brain.y); if (a && a.width) wa = a; } catch { /* keep old */ }
  }

  // ---------------------------------------------------------------- input
  let ignoring = true, drag = null, mouse = { sx: -1, sy: -1, known: false };
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.setIgnore(v); } }
  function hover(cx, cy) {
    if (drag) return;
    const hit = hitTest(cx, cy);
    setIgnore(!hit);
    canvas.style.cursor = hit ? 'grab' : 'default';
  }
  // Used while he walks under a stationary mouse: derive client coords from the screen position.
  function updateHover() { if (mouse.known) hover(mouse.sx - winX, mouse.sy - winY); }
  document.addEventListener('mousemove', (e) => { mouse.sx = e.screenX; mouse.sy = e.screenY; mouse.known = true; hover(e.clientX, e.clientY); });
  document.addEventListener('mouseleave', () => { mouse.known = false; if (!drag) setIgnore(true); });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { sx: e.screenX, sy: e.screenY, x0: brain.x, y0: brain.y, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; canvas.classList.add('dragging'); brain.grab(drag.x0, drag.y0); }
    if (drag.moved) brain.dragTo(drag.x0 + dx, drag.y0 + dy);
  });
  const endDrag = async (e) => {
    if (!drag) return;
    const d = drag; drag = null; canvas.classList.remove('dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!d.moved) brain.poke();
    else { await refreshWorkArea(); brain.release(); }
    wake();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (hitTest(e.clientX, e.clientY)) api.showMenu({ asleep: brain.isAsleep() });
  });

  api.onAction(async (a) => {
    if (!brain) return;
    if (a.type === 'command') { brain.command(a.name); wake(); }
    else if (a.type === 'settings') { settings = a.settings; layout(); wake(); }
    else if (a.type === 'display') { await refreshWorkArea(); wake(); }
    else if (a.type === 'recenter') {
      const info = await api.getInfo(); wa = info.workArea;
      brain.teleport(wa.x + wa.width / 2); brain.command('wave'); wake();
    }
  });

  // ---------------------------------------------------------------- main loop
  let last = performance.now(), timer = 0, raf = 0;
  function wake() { clearTimeout(timer); cancelAnimationFrame(raf); last = performance.now(); loop(); }
  function loop() {
    const now = performance.now(); const dt = (now - last) / 1000; last = now;
    brain.update(dt);
    stepFx(dt);
    if (greetPending && brain.state === 'idle') { greetPending = false; brain.greet(); }
    pushBounds();
    const key = brain.frame + '|' + brain.facing;
    if (key !== lastKey || parts.length) { lastKey = key; draw(); }
    if (mouse.known && (brain.moving || brain.airborne)) updateHover();
    const active = brain.moving || brain.airborne || brain.state === 'carried' || parts.length > 0;
    if (active) raf = requestAnimationFrame(loop); else timer = setTimeout(loop, 50);
  }

  // ---------------------------------------------------------------- boot
  (async function boot() {
    await new Promise((r) => { sheet.onload = r; sheet.onerror = r; sheet.src = META.png; });
    const info = await api.getInfo();
    settings = info.settings; wa = info.workArea;
    buildMasks();
    layout(); watchDpr();
    const half = () => 16 * unit;
    brain = window.ManoshBrain.createBrain({
      rand: Math.random,
      unit: () => unit,
      bounds: () => ({ left: wa.x + half(), right: wa.x + wa.width - half(), floor: wa.y + wa.height }),
      hour: () => new Date().getHours(),
      settings: () => settings,
      say: (t, ms) => showBubble(t, ms),
      fx: (k) => spawnFx(k),
    });
    // Drop in from the top of the screen, at the last known x position if there is one.
    const sx = info.posX != null && info.posX > wa.x && info.posX < wa.x + wa.width ? info.posX : wa.x + wa.width * 0.7;
    brain.start(sx, wa.y + 30 * unit);
    pushBounds(); draw();
    api.ready();
    loop();
  })();
})();
