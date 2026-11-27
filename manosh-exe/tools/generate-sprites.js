'use strict';
/**
 * manosh.exe sprite generator.
 * Draws every animation frame of the pixel-art character procedurally and writes:
 *   assets/sprites/manosh.png   sprite sheet (frames in a grid)
 *   assets/sprites/manosh.js    frame-name -> index map + metadata
 *   build/icon.png / icon.ico   installer + exe icon
 *   assets/tray.png             system tray icon
 * No dependencies. Run: npm run sprites
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const FW = 40, FH = 46, OY = 2, COLS = 8;

// ---------------------------------------------------------------- palette
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = Object.fromEntries(Object.entries({
  outline: '#1d1526', skin: '#eab083', skinS: '#c98a62', hair: '#2b1c16', hairH: '#4b352b', beard: '#4a3228',
  shirt: '#3a3f5a', shirtS: '#292d42', shirtH: '#5a6088', pants: '#4a6fa5', pantsS: '#37557f',
  shoe: '#f4f4f8', sole: '#8b8ba3', white: '#ffffff', eye: '#1d1526', mouth: '#5c2432', cord: '#e8e8f0',
  blanket: '#d8545f', blanketS: '#a23a4a', pillow: '#f1ecdf', pillowS: '#cfc7b4',
  glasses: '#20202c', glint: '#dff4ff', cyan: '#5ef0ff', hp: '#e8505b', hpBand: '#15151f', laptop: '#b9bdd0', laptopS: '#8a8fa8',
  mug: '#f7f7f7', mugS: '#bdbdc8', coffee: '#6b4426',
}).map(([k, v]) => [k, hex(v)]));

// ---------------------------------------------------------------- raster
class Img {
  constructor(w = FW, h = FH, oy = OY) { this.w = w; this.h = h; this.oy = oy; this.d = new Uint8Array(w * h * 4); }
  setRaw(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  }
  set(x, y, c) { this.setRaw(Math.round(x), Math.round(y) + this.oy, c); }
  alpha(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
}
function thickLine(im, x0, y0, x1, y1, c, b) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const lo = -Math.floor((b - 1) / 2);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    im.rect(x0 + lo, y0 + lo, b, b, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
const poly = (im, pts, c, b) => { for (let i = 0; i < pts.length - 1; i++) thickLine(im, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, b); };
const rows = (im, ox, oy, list, c) => { for (const [y, x0, x1] of list) im.rect(x0 + ox, y + oy, x1 - x0 + 1, 1, c); };

function outline(im) {
  const { w, h, d } = im; const mark = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3]) continue;
    if (im.alpha(x - 1, y) || im.alpha(x + 1, y) || im.alpha(x, y - 1) || im.alpha(x, y + 1)) mark.push([x, y]);
  }
  for (const [x, y] of mark) im.setRaw(x, y, C.outline);
}

// ---------------------------------------------------------------- heads
function headSide(im, ox, oy, o) {
  const R = (x, y, w, h, c) => im.rect(x + ox, y + oy, w, h, c);
  const P = (x, y, c) => im.set(x + ox, y + oy, c);
  rows(im, ox, oy, [[6, 16, 23], [7, 15, 24], [8, 15, 24], [9, 15, 24], [10, 15, 24], [11, 15, 24], [12, 15, 24], [13, 15, 24], [14, 15, 24], [15, 15, 24], [16, 16, 23]], C.skin);
  R(18, 17, 3, 2, C.skinS);                                   // neck
  rows(im, ox, oy, [[13, 17, 18], [14, 17, 20], [15, 17, 23], [16, 17, 23]], C.beard); // jaw beard
  R(22, 13, 3, 1, C.beard);                                   // moustache
  P(25, 12, C.skin); P(25, 13, C.skinS);                      // nose
  R(18, 11, 1, 2, C.skinS);                                   // ear
  rows(im, ox, oy, [[4, 16, 22], [5, 15, 23], [6, 14, 24], [7, 14, 24], [8, 14, 24], [9, 14, 17], [10, 14, 17], [11, 14, 17], [12, 14, 17], [13, 15, 16]], C.hair);
  R(17, 5, 4, 1, C.hairH);
  switch (o.eyes) {
    case 'closed': R(21, 12, 2, 1, C.eye); break;
    case 'half': R(22, 12, 1, 1, C.eye); P(22, 11, C.skinS); break;
    case 'wide': R(21, 10, 3, 3, C.white); P(22, 11, C.eye); break;
    case 'happy': P(21, 12, C.eye); P(22, 11, C.eye); P(23, 12, C.eye); break;
    default: R(22, 11, 1, 2, C.eye);
  }
  if (o.eyes === 'wide') R(21, 8, 3, 1, C.hair);
  else if (o.brow < 0) { R(21, 9, 2, 1, C.hair); P(23, 10, C.hair); }
  else if (o.brow === 0) R(21, 9, 3, 1, C.hair);
  // raised brow (brow > 0) hides under the fringe
  R(20, 10, 5, 1, C.glasses); R(20, 13, 5, 1, C.glasses); R(20, 11, 1, 2, C.glasses); R(24, 11, 1, 2, C.glasses);
  R(18, 11, 2, 1, C.glasses); P(21, 11, C.glint);               // lens frame + temple arm
  switch (o.mouth) {
    case 'smile': R(22, 14, 3, 1, C.mouth); break;
    case 'open': R(23, 14, 2, 2, C.mouth); break;
    case 'o': R(24, 14, 1, 2, C.mouth); break;
    default: R(23, 14, 2, 1, C.mouth);
  }
}

function headFront(im, ox, oy, o) {
  const R = (x, y, w, h, c) => im.rect(x + ox, y + oy, w, h, c);
  const P = (x, y, c) => im.set(x + ox, y + oy, c);
  const t = o.t || 0;
  rows(im, ox, oy, [[6, 16, 23], [7, 15, 24], [8, 15, 24], [9, 15, 24], [10, 15, 24], [11, 15, 24], [12, 15, 24], [13, 15, 24], [14, 15, 24], [15, 15, 24], [16, 16, 23]], C.skin);
  R(19, 17, 2, 2, C.skinS);
  R(14, 11, 1, 2, C.skinS); R(25, 11, 1, 2, C.skinS);
  rows(im, ox, oy, [[14, 18, 21], [15, 16, 17], [15, 22, 23], [16, 17, 22]], C.beard);
  R(19, 13, 2, 1, C.skinS);                                   // nose
  switch (o.eyes) {
    case 'closed': R(16 + t, 12, 2, 1, C.eye); R(22 + t, 12, 2, 1, C.eye); break;
    case 'half': R(17 + t, 12, 1, 1, C.eye); R(22 + t, 12, 1, 1, C.eye); P(17 + t, 11, C.skinS); P(22 + t, 11, C.skinS); break;
    case 'wide':
      R(16 + t, 10, 3, 3, C.white); R(21 + t, 10, 3, 3, C.white); P(17 + t, 11, C.eye); P(22 + t, 11, C.eye); break;
    case 'happy':
      P(16 + t, 12, C.eye); P(17 + t, 11, C.eye); P(18 + t, 12, C.eye);
      P(21 + t, 12, C.eye); P(22 + t, 11, C.eye); P(23 + t, 12, C.eye); break;
    default: R(17 + t, 11, 1, 2, C.eye); R(22 + t, 11, 1, 2, C.eye);
  }
  const by = o.brow > 0 ? 9 : 10;
  if (o.eyes === 'wide') { R(16 + t, 9, 3, 1, C.hair); R(21 + t, 9, 3, 1, C.hair); }
  else if (o.brow < 0) { P(16 + t, 9, C.hair); P(17 + t, 10, C.hair); P(18 + t, 10, C.hair); P(21 + t, 10, C.hair); P(22 + t, 10, C.hair); P(23 + t, 9, C.hair); }
  else { R(16 + t, by, 3, 1, C.hair); R(21 + t, by, 3, 1, C.hair); }
  for (const cx of [17 + t, 22 + t]) {                         // round-ish engineer glasses
    R(cx - 2, 10, 5, 1, C.glasses); R(cx - 2, 13, 5, 1, C.glasses);
    R(cx - 2, 11, 1, 2, C.glasses); R(cx + 2, 11, 1, 2, C.glasses); P(cx - 1, 11, C.glint);
  }
  switch (o.mouth) {
    case 'smile': R(18 + t, 15, 4, 1, C.white); break;
    case 'open': R(18 + t, 15, 4, 1, C.white); R(19 + t, 16, 2, 1, C.mouth); break;
    case 'o': R(19 + t, 15, 2, 2, C.mouth); break;
    default: R(19 + t, 15, 2, 1, C.mouth);
  }
  rows(im, ox, oy, [[4, 16, 23], [5, 15, 24], [6, 14, 25], [7, 14, 25], [8, 15, 19]], C.hair);
  P(15, 9, C.hair); P(15, 10, C.hair); P(15, 11, C.hair); P(24, 8, C.hair); P(24, 9, C.hair); P(24, 10, C.hair); P(24, 11, C.hair);
  R(17, 5, 4, 1, C.hairH); P(22, 6, C.hairH);
}

// ---------------------------------------------------------------- limbs
function legSide(im, hip, ax, sy, kx, far) {
  const c = far ? C.pantsS : C.pants;
  const ay = sy - 1;
  const mid = [(hip[0] + ax) / 2 + kx, (hip[1] + ay) / 2];
  poly(im, [hip, mid, [ax, ay]], c, 4);
  im.rect(ax - 2, sy, 6, 3, C.shoe); im.rect(ax - 2, sy + 2, 6, 1, C.sole);
}
function armPoly(im, sh, h, b, c, hand) {
  const el = [sh[0] + h[0] / 2 + b[0], sh[1] + h[1] / 2 + b[1]];
  const hp = [sh[0] + h[0], sh[1] + h[1]];
  poly(im, [sh, el, hp], c, 3);
  if (hand) im.rect(Math.round(hp[0]) - 1, Math.round(hp[1]) - 1, 3, 3, C.skin);
  return hp;
}
function torsoSide(im, top, bot, xcBot, lean) {
  for (let y = top; y <= bot; y++) {
    const t = bot === top ? 0 : (bot - y) / (bot - top);
    const x0 = Math.round(xcBot + lean * t) - 3;
    let xa = x0, xb = x0 + 7;
    if (y === top) { xa++; xb--; }
    im.rect(xa, y, xb - xa + 1, 1, y >= bot - 1 ? C.shirtS : C.shirt);
    if (y > top + 2 && y < bot - 1) im.set(xa, y, C.shirtS);
    if (y > top + 1 && y < bot - 4) im.set(xb, y, C.shirtH);
  }
  const xt = Math.round(xcBot + lean) - 3;
  im.rect(xt - 1, top, 2, 3, C.shirtS);
  return { xcTop: Math.round(xcBot + lean), xcAt: (y) => Math.round(xcBot + lean * (bot - y) / Math.max(1, bot - top)) };
}

// ---------------------------------------------------------------- side figure (walk / run / jump)
function sideFigure(im, o = {}) {
  o = Object.assign({ by: 0, bx: 0, lean: 0, br: 0, hdx: 0, hdy: 0, eyes: 'open', mouth: 'flat', brow: 0,
    legs: [{ ax: 19, sy: 39, kx: 0 }, { ax: 19, sy: 39, kx: 0 }], arms: [{ h: [0, 8], b: [0, 0] }, { h: [0, 8], b: [0, 0] }] }, o);
  const top = 19 + o.by - o.br, bot = 30 + o.by;
  const hip = [19 + o.bx, 31 + o.by];
  const [lf, ln] = o.legs;
  legSide(im, hip, lf.ax, lf.sy, lf.kx || 0, true);
  legSide(im, hip, ln.ax, ln.sy, ln.kx || 0, false);
  const af = o.arms[0], an = o.arms[1];
  const tmpInfo = { xcAt: (y) => Math.round(19 + o.bx + o.lean * (bot - y) / (bot - top)) };
  const shy = top + 2, shx = tmpInfo.xcAt(shy);
  armPoly(im, [shx, shy], af.h, af.b || [0, 0], C.shirtS, true);
  const ti = torsoSide(im, top, bot, 19 + o.bx, o.lean);
  im.rect(ti.xcTop - 3, top, 3, 3, C.hp); im.rect(ti.xcTop - 3, top - 1, 2, 1, C.hpBand);
  headSide(im, ti.xcTop - 19 + o.hdx, top - 19 + o.hdy, o);
  armPoly(im, [shx, shy], an.h, an.b || [0, 0], C.shirt, true);
}

// ---------------------------------------------------------------- front figure (idle / dance / react)
function legFront(im, hipx, hipy, ax, sy, kx) {
  const ay = sy - 1;
  const mid = [(hipx + ax) / 2 + kx, (hipy + ay) / 2];
  poly(im, [[hipx, hipy], mid, [ax, ay]], C.pants, 4);
  im.rect(ax - 2, sy, 5, 3, C.shoe); im.rect(ax - 2, sy + 2, 5, 1, C.sole);
}
function frontFigure(im, o = {}) {
  o = Object.assign({ by: 0, bx: 0, br: 0, hdx: 0, hdy: 0, t: 0, eyes: 'open', mouth: 'flat', brow: 0, mug: false,
    legs: [{ ax: 16, sy: 39, kx: 0 }, { ax: 23, sy: 39, kx: 0 }],
    arms: [{ h: [0, 8], b: [0, 0] }, { h: [0, 8], b: [0, 0] }] }, o);
  const br = o.br, by = o.by, bx = o.bx;
  const [L, Rr] = o.legs;
  legFront(im, 16 + bx, 31 + by, L.ax, L.sy, L.kx || 0);
  legFront(im, 22 + bx, 31 + by, Rr.ax, Rr.sy, Rr.kx || 0);
  // torso (hoodie)
  for (let y = 19 - br; y <= 30; y++) {
    const first = y === 19 - br;
    const x0 = (first ? 15 : 14) + bx, x1 = (first ? 24 : 25) + bx;
    im.rect(x0, y + by, x1 - x0 + 1, 1, y >= 29 ? C.shirtS : C.shirt);
    if (!first && y > 20 && y < 29) im.set(x1, y + by, C.shirtS);
  }
  im.rect(16 + bx, 18 - br + by, 8, 1, C.shirtS);
  im.set(15 + bx, 20 + by - br, C.shirtH); im.set(16 + bx, 20 + by - br, C.shirtH); im.set(15 + bx, 21 + by - br, C.shirtH);
  im.rect(16 + bx, 25 + by, 8, 1, C.shirtS); im.rect(16 + bx, 26 + by, 1, 3, C.shirtS); im.rect(23 + bx, 26 + by, 1, 3, C.shirtS);
  for (const [lx, ly] of [[16, 22], [17, 23], [16, 24], [19, 24], [20, 24], [21, 24]]) im.set(lx + bx, ly + by - br, C.cyan);
  im.rect(16 + bx, 19 - br + by, 8, 1, C.hpBand);               // headphones around neck
  im.rect(15 + bx, 18 - br + by, 2, 3, C.hp); im.rect(23 + bx, 18 - br + by, 2, 3, C.hp);
  headFront(im, bx + o.hdx, by - br + o.hdy, o);
  // arms
  const shy = 21 + by - br;
  armPoly(im, [12 + bx, shy], o.arms[0].h, o.arms[0].b || [0, 0], C.shirt, true);
  const hp = armPoly(im, [27 + bx, shy], o.arms[1].h, o.arms[1].b || [0, 0], C.shirt, true);
  if (o.mug) {
    const mx = Math.round(hp[0]) - 1, my = Math.round(hp[1]) - 3;
    im.rect(mx, my, 4, 4, C.mug); im.rect(mx, my, 4, 1, C.coffee); im.set(mx + 4, my + 1, C.mugS); im.set(mx + 4, my + 2, C.mugS);
    im.rect(Math.round(hp[0]) - 1, Math.round(hp[1]), 3, 2, C.skin);
  }
}

// ---------------------------------------------------------------- sitting (side)
function sitFigure(im, o = {}) {
  o = Object.assign({ br: 0, drop: 0, eyes: 'open', mouth: 'flat', brow: 0, hdx: 0, hdy: 0, armUp: false }, o);
  const dp = o.drop;
  legSide(im, [17, 37 - dp], 25, 39, -1, true);               // far leg (knee up)
  im.rect(13, 36 - dp, 7, 6 + dp, C.pants);                   // seat
  const ankle = [27, 38], knee = [25, 33 - dp];
  poly(im, [[17, 37 - dp], knee, ankle], C.pants, 4);
  im.rect(25, 39, 6, 3, C.shoe); im.rect(25, 41, 6, 1, C.sole);
  if (o.laptop) {                                             // laptop open on his knees, screen facing him
    im.rect(21, 29, 9, 2, C.laptop); im.rect(21, 31, 9, 1, C.laptopS);
    im.rect(29, 18, 2, 11, C.laptop); im.rect(29, 18, 2, 1, C.laptopS); im.set(30, 23, C.white);
  }
  const top = 26 - dp - o.br, bot = 37 - dp;
  const ti = torsoSide(im, top, bot, 17, -1);
  im.rect(ti.xcTop - 3, top, 3, 3, C.hp); im.rect(ti.xcTop - 3, top - 1, 2, 1, C.hpBand);
  headSide(im, ti.xcTop - 19 + o.hdx, top - 19 + o.hdy, o);
  const sh = [16, top + 2];
  if (o.laptop) armPoly(im, sh, [o.typeK ? 9 : 8, o.typeK ? 0 : 1], [0, 3], C.shirt, true);
  else if (o.armUp) armPoly(im, sh, [6, -10], [1, 0], C.shirt, true);
  else armPoly(im, sh, [9, 33 - dp - sh[1] - 2], [0, 1], C.shirt, true);
}

// ---------------------------------------------------------------- lying (sleep)
function lying(im, o = {}) {
  const tmp = new Img(FW, FH, OY);
  sideFigure(tmp, { eyes: o.eyes || 'closed', mouth: 'flat', brow: o.brow || 0, legs: [{ ax: 19, sy: 39 }, { ax: 19, sy: 39 }], arms: [{ h: [0, 8] }, { h: [0, 8] }] });
  const rot = new Img(FH, FW, 0);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!tmp.alpha(x, y)) continue; const i = (y * FW + x) * 4;
    rot.setRaw(y, FW - 1 - x, [tmp.d[i], tmp.d[i + 1], tmp.d[i + 2]]);
  }
  let minx = 999, maxx = -1, miny = 999, maxy = -1;
  for (let y = 0; y < rot.h; y++) for (let x = 0; x < rot.w; x++) if (rot.alpha(x, y)) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  // mat + pillow
  for (let x = 0; x < FW; x++) { im.setRaw(x, 42, C.pillowS); im.setRaw(x, 43, C.blanketS); }
  for (let y = 39; y <= 41; y++) for (let x = 1; x <= 13; x++) im.setRaw(x, y, y === 41 ? C.pillowS : C.pillow);
  const bottom = 41;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    if (!rot.alpha(x, y)) continue; const i = (y * rot.w + x) * 4;
    im.setRaw(1 + x - minx, bottom - (maxy - y), [rot.d[i], rot.d[i + 1], rot.d[i + 2]]);
  }
  const br = o.br || 0;
  if (o.blanket === 'full' || o.blanket === 'low') {
    const x0 = o.blanket === 'full' ? 15 : 27, x1 = 35;
    const topAt = (x) => (x <= 24 ? 32 : x <= 27 ? 34 : 36) - (x <= 27 ? br : 0);
    for (let x = x0; x <= x1; x++) {
      const t = o.blanket === 'low' ? Math.max(topAt(x), 35) : topAt(x);
      for (let y = t; y <= 41; y++) {
        if ((x === x0 || x === x1) && y === t) continue;
        let c = C.blanket;
        if ((x - x0) % 6 === 4) c = C.blanketS;
        if (y === 41) c = C.blanketS;
        im.setRaw(x, y, c);
      }
    }
  }
}

// ---------------------------------------------------------------- frame table
const frames = {};
const add = (name, fn) => { const im = new Img(); fn(im); outline(im); frames[name] = im; };

const breathOf = (suffix) => (suffix === 'b' ? 1 : 0);

// IDLE (front)
for (const s of ['a', 'b']) {
  add(`idle_${s}`, (im) => frontFigure(im, { br: breathOf(s), mouth: 'flat' }));
  add(`idle_${s}_blink`, (im) => frontFigure(im, { br: breathOf(s), eyes: 'closed', mouth: 'flat' }));
}
add('idle_smile', (im) => frontFigure(im, { mouth: 'smile', eyes: 'open' }));

// LOOK AROUND (front)
add('look_l', (im) => frontFigure(im, { t: -1, hdx: -1, eyes: 'open', mouth: 'flat' }));
add('look_r', (im) => frontFigure(im, { t: 1, hdx: 1, eyes: 'open', mouth: 'flat' }));
add('look_up', (im) => frontFigure(im, { hdy: -1, brow: 1, eyes: 'wide', mouth: 'o', arms: [{ h: [0, 8] }, { h: [-3, -6], b: [2, 1] }] }));

// WALK (side, 8 frames)
for (let i = 0; i < 8; i++) {
  const p = (i / 8) * Math.PI * 2;
  const leg = (ph, far) => {
    const x = Math.round(19 + 5 * Math.sin(ph)), lift = Math.round(Math.max(0, Math.cos(ph)) * 3);
    return { ax: x, sy: 39 - lift, kx: lift > 0 ? 2 : 0 };
  };
  add(`walk_${i}`, (im) => sideFigure(im, {
    by: -Math.round((1 + Math.cos(2 * p)) / 2), lean: 1, mouth: 'flat',
    legs: [leg(p + Math.PI), leg(p)],
    arms: [{ h: [Math.round(4 * Math.sin(p)), 8 - Math.round(Math.abs(Math.sin(p)))], b: [1, 0] },
      { h: [-Math.round(4 * Math.sin(p)), 8 - Math.round(Math.abs(Math.sin(p)))], b: [1, 0] }],
  }));
}
// RUN (side, 6 frames)
for (let i = 0; i < 6; i++) {
  const p = (i / 6) * Math.PI * 2;
  const leg = (ph) => {
    const x = Math.round(19 + 7 * Math.sin(ph)), lift = Math.round(Math.max(0, Math.cos(ph)) * 5);
    return { ax: x, sy: 39 - lift, kx: lift > 2 ? 3 : 0 };
  };
  add(`run_${i}`, (im) => sideFigure(im, {
    by: -Math.round(1.5 + 1.5 * Math.cos(2 * p)), lean: 3, hdx: 1, mouth: 'open', brow: 0,
    legs: [leg(p + Math.PI), leg(p)],
    arms: [{ h: [Math.round(5 * Math.sin(p)) + 2, 3], b: [0, -3] }, { h: [-Math.round(5 * Math.sin(p)) + 2, 3], b: [0, -3] }],
  }));
}

// JUMP (side)
add('jump_crouch', (im) => sideFigure(im, { by: 4, lean: 2, hdy: 0, eyes: 'open', mouth: 'flat',
  legs: [{ ax: 18, sy: 39, kx: 5 }, { ax: 22, sy: 39, kx: 5 }], arms: [{ h: [-4, 3], b: [-1, 1] }, { h: [-5, 3], b: [-1, 1] }] }));
add('jump_up', (im) => sideFigure(im, { by: -2, lean: 0, eyes: 'open', mouth: 'open', brow: 1,
  legs: [{ ax: 17, sy: 38, kx: 0 }, { ax: 19, sy: 39, kx: 1 }], arms: [{ h: [-8, -7], b: [0, -1] }, { h: [-6, -9], b: [0, -1] }] }));
add('jump_apex', (im) => sideFigure(im, { by: -3, lean: 0, eyes: 'happy', mouth: 'open',
  legs: [{ ax: 17, sy: 33, kx: 4 }, { ax: 21, sy: 32, kx: 5 }], arms: [{ h: [-8, -6], b: [0, -1] }, { h: [-5, -9], b: [0, -1] }] }));
add('jump_down', (im) => sideFigure(im, { by: -2, lean: 0, eyes: 'open', mouth: 'o', brow: 1,
  legs: [{ ax: 17, sy: 38, kx: 1 }, { ax: 21, sy: 37, kx: 2 }], arms: [{ h: [-7, -5], b: [0, -1] }, { h: [-4, -8], b: [0, -1] }] }));
add('jump_land', (im) => sideFigure(im, { by: 3, lean: 2, eyes: 'closed', mouth: 'flat',
  legs: [{ ax: 17, sy: 39, kx: 5 }, { ax: 22, sy: 39, kx: 5 }], arms: [{ h: [5, 3], b: [0, 2] }, { h: [6, 3], b: [0, 2] }] }));

// SIT (side)
for (const s of ['a', 'b']) {
  add(`sit_${s}`, (im) => sitFigure(im, { br: breathOf(s) }));
  add(`sit_${s}_blink`, (im) => sitFigure(im, { br: breathOf(s), eyes: 'closed' }));
}
add('sit_code_a', (im) => sitFigure(im, { laptop: true, typeK: 0, hdy: 1 }));
add('sit_code_b', (im) => sitFigure(im, { laptop: true, typeK: 1, hdy: 1 }));
add('sit_code_blink', (im) => sitFigure(im, { laptop: true, typeK: 0, hdy: 1, eyes: 'closed' }));
add('sit_code_think', (im) => sitFigure(im, { laptop: true, typeK: 0, hdy: 0, hdx: 1, brow: 1, mouth: 'o' }));
add('sit_down', (im) => sideFigure(im, { by: 5, lean: 2, eyes: 'open', mouth: 'flat',
  legs: [{ ax: 17, sy: 39, kx: 6 }, { ax: 22, sy: 39, kx: 6 }], arms: [{ h: [6, 5], b: [0, 1] }, { h: [7, 5], b: [0, 1] }] }));
add('sit_sleepy_a', (im) => sitFigure(im, { eyes: 'half', hdy: 1, br: 0 }));
add('sit_sleepy_b', (im) => sitFigure(im, { eyes: 'closed', hdy: 2, hdx: 1, br: 0 }));
add('sit_yawn', (im) => sitFigure(im, { eyes: 'closed', mouth: 'open', armUp: true }));

// SLEEP / WAKE
add('sleep_a', (im) => lying(im, { eyes: 'closed', blanket: 'full', br: 0 }));
add('sleep_b', (im) => lying(im, { eyes: 'closed', blanket: 'full', br: 1 }));
add('wake_0', (im) => lying(im, { eyes: 'half', blanket: 'low', brow: 1 }));
add('wake_1', (im) => sitFigure(im, { eyes: 'closed', mouth: 'open', armUp: true }));
add('stretch_a', (im) => frontFigure(im, { by: -1, eyes: 'closed', mouth: 'open', brow: 1,
  legs: [{ ax: 16, sy: 38, kx: 0 }, { ax: 23, sy: 38, kx: 0 }], arms: [{ h: [-2, -17], b: [-3, 0] }, { h: [2, -17], b: [3, 0] }] }));
add('stretch_b', (im) => frontFigure(im, { by: -1, bx: 0, eyes: 'closed', mouth: 'open', brow: 1,
  legs: [{ ax: 16, sy: 38, kx: 0 }, { ax: 23, sy: 38, kx: 0 }], arms: [{ h: [-6, -15], b: [-2, 1] }, { h: [6, -15], b: [2, 1] }] }));

// DANCE (front, 8 beats)
const dance = [
  { eyes: 'happy', mouth: 'smile', arms: [{ h: [-1, 8], b: [-6, -3] }, { h: [4, -15], b: [3, 0] }], legs: [{ ax: 15, sy: 39, kx: -1 }, { ax: 24, sy: 39, kx: 1 }] },
  { by: -2, eyes: 'happy', mouth: 'open', arms: [{ h: [-3, -13], b: [-3, 0] }, { h: [3, -13], b: [3, 0] }], legs: [{ ax: 15, sy: 38, kx: -1 }, { ax: 24, sy: 38, kx: 1 }] },
  { eyes: 'happy', mouth: 'smile', arms: [{ h: [-4, -15], b: [-3, 0] }, { h: [1, 8], b: [6, -3] }], legs: [{ ax: 15, sy: 39, kx: -1 }, { ax: 24, sy: 39, kx: 1 }] },
  { by: -2, eyes: 'open', mouth: 'open', arms: [{ h: [-3, -13], b: [-3, 0] }, { h: [3, -13], b: [3, 0] }], legs: [{ ax: 15, sy: 38, kx: -1 }, { ax: 24, sy: 38, kx: 1 }] },
  { bx: 1, hdx: 1, eyes: 'happy', mouth: 'smile', arms: [{ h: [-9, 1], b: [0, -2] }, { h: [9, 1], b: [0, -2] }], legs: [{ ax: 16, sy: 39, kx: 0 }, { ax: 24, sy: 36, kx: 2 }] },
  { bx: -1, hdx: -1, eyes: 'happy', mouth: 'open', arms: [{ h: [-2, 3], b: [-5, -1] }, { h: [2, 3], b: [5, -1] }], legs: [{ ax: 15, sy: 36, kx: -2 }, { ax: 23, sy: 39, kx: 0 }] },
  { bx: -2, hdx: -1, by: 1, eyes: 'closed', mouth: 'smile', arms: [{ h: [-6, 6], b: [-3, 0] }, { h: [6, -2], b: [3, -2] }], legs: [{ ax: 14, sy: 39, kx: -2 }, { ax: 22, sy: 39, kx: 2 }] },
  { bx: 2, hdx: 1, by: 1, eyes: 'closed', mouth: 'smile', arms: [{ h: [-6, -2], b: [-3, -2] }, { h: [6, 6], b: [3, 0] }], legs: [{ ax: 17, sy: 39, kx: -2 }, { ax: 25, sy: 39, kx: 2 }] },
];
dance.forEach((d, i) => add(`dance_${i}`, (im) => frontFigure(im, d)));

// REACTIONS (front)
add('react_surprise_a', (im) => frontFigure(im, { by: -4, eyes: 'wide', mouth: 'o', brow: 1,
  legs: [{ ax: 15, sy: 36, kx: -2 }, { ax: 24, sy: 36, kx: 2 }], arms: [{ h: [-6, -8], b: [-2, 1] }, { h: [6, -8], b: [2, 1] }] }));
add('react_surprise_b', (im) => frontFigure(im, { by: -1, eyes: 'wide', mouth: 'o', brow: 1,
  legs: [{ ax: 15, sy: 39, kx: -1 }, { ax: 24, sy: 39, kx: 1 }], arms: [{ h: [-6, -3], b: [-3, 1] }, { h: [6, -3], b: [3, 1] }] }));
add('react_land', (im) => frontFigure(im, { by: 2, eyes: 'closed', mouth: 'flat',
  legs: [{ ax: 14, sy: 39, kx: -3 }, { ax: 25, sy: 39, kx: 3 }], arms: [{ h: [-3, 6], b: [-2, 0] }, { h: [3, 6], b: [2, 0] }] }));
add('react_wave_a', (im) => frontFigure(im, { eyes: 'open', mouth: 'smile', arms: [{ h: [0, 8] }, { h: [3, -10], b: [4, 0] }] }));
add('react_wave_b', (im) => frontFigure(im, { eyes: 'open', mouth: 'smile', arms: [{ h: [0, 8] }, { h: [7, -9], b: [2, 0] }] }));
add('react_laugh_a', (im) => frontFigure(im, { by: -1, eyes: 'happy', mouth: 'open',
  arms: [{ h: [4, 6], b: [-5, 0] }, { h: [-4, 6], b: [5, 0] }] }));
add('react_laugh_b', (im) => frontFigure(im, { by: 0, hdy: 1, eyes: 'happy', mouth: 'open',
  arms: [{ h: [4, 6], b: [-5, 0] }, { h: [-4, 6], b: [5, 0] }] }));
add('react_annoyed', (im) => frontFigure(im, { eyes: 'half', brow: -1, mouth: 'flat',
  arms: [{ h: [2, 8], b: [-7, -2] }, { h: [-2, 8], b: [7, -2] }] }));
add('carried_a', (im) => frontFigure(im, { by: -2, eyes: 'wide', mouth: 'o', brow: 1,
  legs: [{ ax: 14, sy: 40, kx: -1 }, { ax: 25, sy: 38, kx: 1 }], arms: [{ h: [-7, -9], b: [-1, 1] }, { h: [7, -9], b: [1, 1] }] }));
add('carried_b', (im) => frontFigure(im, { by: -2, eyes: 'wide', mouth: 'o', brow: 1,
  legs: [{ ax: 16, sy: 38, kx: -1 }, { ax: 24, sy: 40, kx: 1 }], arms: [{ h: [-8, -7], b: [-1, 1] }, { h: [8, -8], b: [1, 1] }] }));

// COFFEE (front, with mug)
add('coffee_a', (im) => frontFigure(im, { mug: true, eyes: 'open', mouth: 'smile', arms: [{ h: [0, 8] }, { h: [2, -2], b: [4, 2] }] }));
add('coffee_b', (im) => frontFigure(im, { mug: true, eyes: 'closed', mouth: 'flat', arms: [{ h: [0, 8] }, { h: [-4, -4], b: [5, 0] }] }));
add('coffee_c', (im) => frontFigure(im, { mug: true, eyes: 'happy', mouth: 'smile', arms: [{ h: [0, 8] }, { h: [2, -2], b: [4, 2] }] }));

// ---------------------------------------------------------------- PNG / ICO output
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function scaled(im, sx, sy, sw, sh, k, outW, outH) {
  const out = new Uint8Array(outW * outH * 4);
  const offX = Math.floor((outW - sw * k) / 2), offY = Math.floor((outH - sh * k) / 2);
  for (let y = 0; y < sh * k; y++) for (let x = 0; x < sw * k; x++) {
    const si = ((sy + Math.floor(y / k)) * im.w + sx + Math.floor(x / k)) * 4;
    const di = ((offY + y) * outW + offX + x) * 4;
    out[di] = im.d[si]; out[di + 1] = im.d[si + 1]; out[di + 2] = im.d[si + 2]; out[di + 3] = im.d[si + 3];
  }
  return out;
}

function main() {
  const names = Object.keys(frames);
  const rowsN = Math.ceil(names.length / COLS);
  const SW = COLS * FW, SH = rowsN * FH;
  const sheet = new Uint8Array(SW * SH * 4);
  const map = {};
  names.forEach((n, idx) => {
    map[n] = idx;
    const cx = (idx % COLS) * FW, cy = Math.floor(idx / COLS) * FH, im = frames[n];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const si = (y * FW + x) * 4, di = ((cy + y) * SW + cx + x) * 4;
      sheet[di] = im.d[si]; sheet[di + 1] = im.d[si + 1]; sheet[di + 2] = im.d[si + 2]; sheet[di + 3] = im.d[si + 3];
    }
  });
  fs.mkdirSync(path.join(ROOT, 'assets/sprites'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets/sprites/manosh.png'), encodePNG(SW, SH, sheet));
  const meta = { frameW: FW, frameH: FH, cols: COLS, groundRows: 1, headX: 20, headY: 6, frames: map };
  // The sheet is embedded as a data URI so the canvas is never tainted (file:// images block pixel reads).
  const png = fs.readFileSync(path.join(ROOT, 'assets/sprites/manosh.png')).toString('base64');
  fs.writeFileSync(path.join(ROOT, 'assets/sprites/manosh.js'), `window.MANOSH_SPRITES = ${JSON.stringify({ ...meta, png: 'data:image/png;base64,' + png })};\n`);
  fs.writeFileSync(path.join(ROOT, 'assets/sprites/manosh.json'), JSON.stringify(meta, null, 1));

  // icons
  const idle = frames.idle_a;
  fs.writeFileSync(path.join(ROOT, 'build/icon.png'), encodePNG(256, 256, scaled(idle, 4, 2, 32, 44, 5, 256, 256)));
  const png256 = fs.readFileSync(path.join(ROOT, 'build/icon.png'));
  const hdr = Buffer.alloc(22); hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
  hdr[6] = 0; hdr[7] = 0; hdr[8] = 0; hdr[9] = 0; hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
  hdr.writeUInt32LE(png256.length, 14); hdr.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(ROOT, 'build/icon.ico'), Buffer.concat([hdr, png256]));
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets/tray.png'), encodePNG(32, 32, scaled(idle, 12, 4, 16, 16, 2, 32, 32)));
  console.log(`Generated ${names.length} frames -> ${SW}x${SH} sheet`);
}
main();
