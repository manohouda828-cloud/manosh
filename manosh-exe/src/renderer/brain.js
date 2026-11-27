'use strict';
/**
 * manosh's brain: a small life simulation.
 * Pure logic (no DOM / no Electron) so it can be unit-simulated in Node.
 *
 * env = {
 *   rand(): number [0,1)           unit(): DIP per sprite pixel
 *   bounds(): {left,right,floor}   hour(): 0-23
 *   settings(): {wander,chatty}    say(text, ms)    fx(kind)
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ManoshBrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LINES = {
    code: ['Compiling\u2026', 'It works on my machine.', 'Why is this null?', 'git commit -m "fix"', 'Semicolon, found you!',
      'Tests passed!', 'Deploying on a Friday\u2026', 'Just one more bug\u2026', 'Have you tried turning it off and on?',
      'Segfault again?!', 'Refactoring\u2026 again.', 'Who wrote this? \u2026Oh. Me.', 'Merge conflict. Great.'],
    idle: ['Just vibing.', 'sudo make me coffee', 'It\u2019s not a bug, it\u2019s a feature.', 'Have you committed yet?', 'Is it coffee o\u2019clock yet?', 'Did you save that file?', 'I live here now.', 'Nice taskbar.',
      'Don\u2019t mind me.', 'Drink some water!', 'Sit up straight!', 'Ctrl+S, friend.', 'What\u2019s on the other monitor?',
      'Another day on the desktop.', 'Have you taken a break?', 'I wonder what\u2019s in Downloads\u2026', 'Typing sounds good today.',
      'Still here!', 'You\u2019re doing great.', 'Do I look busy?'],
    night: ['It\u2019s late\u2026 shouldn\u2019t you sleep?', 'Night owl, huh?', 'The screen glow is cozy.', 'Go to bed soon!'],
    poke: ['Hey!', 'Hi!', 'Boop!', 'That tickles!', 'Yes?', 'Oh! Hello!', 'You rang?', 'Hehe.'],
    annoyed: ['Okay okay, stop poking!', 'I\u2019m warning you\u2026', 'Hands off the human!', 'Seriously?', 'My face is not a button.'],
    grab: ['Whoa!', 'Put me down!', 'Wheee!', 'Careful!', 'Where are we going?', 'Hey hey hey!'],
    land: ['Ouch.', 'I\u2019m good!', 'Nailed it.', 'Nobody saw that.', 'New spot, who dis?', 'Landed.'],
    wake: ['Mornin\u2019\u2026', 'Was I out?', 'Five more minutes\u2026', '*yawn*', 'Good nap.'],
    grumpy: ['Hey! I was sleeping!', 'Rude.', 'Five more minutes\u2026', 'Mmh\u2026 what?'],
    coffee: ['Ahh. Perfect.', 'Coffee fixes everything.', 'Mmm, caffeine.', 'Now I can see colors.'],
    dance: ['Feel the beat!', 'Dance break!', 'Cha-cha-cha!', 'Nobody\u2019s watching\u2026 right?'],
    morning: ['Good morning!', 'Rise and shine!'], afternoon: ['Good afternoon!', 'Hello there!'],
    evening: ['Good evening!', 'Evening!'], late: ['Still up?', 'Hi, night owl.'],
  };

  const GROUNDED = new Set(['code', 'idle', 'walk', 'run', 'sit', 'sleep', 'wake', 'dance', 'look', 'react', 'coffee', 'stretch', 'land']);

  function createBrain(env) {
    const rnd = env.rand || Math.random;
    const R = (a, b) => a + (b - a) * rnd();
    const RI = (a, b) => Math.floor(R(a, b + 1));
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const unit = () => env.unit();

    const B = {
      x: 0, y: 0, vx: 0, vy: 0, facing: 1, state: 'idle', stateT: 0, time: 0,
      frame: 'idle_a', energy: 0.85, mood: 0.6, clicks: 0, history: [], moving: false, airborne: false,
      grabbed: false, lastSay: '', lastSayAt: -99, lastClickAt: -99, panting: 0,
    };
    let anim = null;               // {seq,loop,i,t,done}
    let ph = '';                   // sub-phase inside a state
    let phT = 0;
    let dur = 0;
    let stride = 0, speed = 0, targetSpeed = 0;
    let jumpV0 = 0, jumpThen = null;
    const life = { breath: 0, breathT: 1, blink: 0, blinkT: 2 };
    let glance = null;             // brief idle glance override
    let glanceT = 4;
    let zT = 0, fxT = 0;

    // ------------------------------------------------------------ helpers
    const bounds = () => env.bounds();
    const floor = () => bounds().floor;
    const play = (seq, loop) => { anim = { seq, loop: !!loop, i: 0, t: 0, done: false }; B.frame = seq[0][0]; };
    const tickAnim = (dt) => {
      if (!anim || anim.done) return;
      anim.t += dt * 1000;
      while (anim.t >= anim.seq[anim.i][1]) {
        anim.t -= anim.seq[anim.i][1];
        anim.i++;
        if (anim.i >= anim.seq.length) {
          if (anim.loop) anim.i = 0; else { anim.i = anim.seq.length - 1; anim.done = true; break; }
        }
      }
      B.frame = anim.seq[anim.i][0];
    };
    const lifeFrame = (prefix, dt, breathMin = 0.9, breathMax = 1.7) => {
      life.breathT -= dt;
      if (life.breathT <= 0) { life.breath ^= 1; life.breathT = B.panting > 0 ? R(0.28, 0.4) : R(breathMin, breathMax); }
      if (life.blink > 0) life.blink -= dt;
      else {
        life.blinkT -= dt;
        if (life.blinkT <= 0) { life.blink = 0.12; life.blinkT = rnd() < 0.2 ? 0.28 : R(1.8, 5.5); }
      }
      return prefix + (life.breath ? '_b' : '_a') + (life.blink > 0 ? '_blink' : '');
    };
    const say = (kind, force) => {
      const set = LINES[kind]; if (!set) return;
      if (!force && B.time - B.lastSayAt < 7) return;
      let t = pick(set); if (t === B.lastSay && set.length > 1) t = pick(set);
      B.lastSay = t; B.lastSayAt = B.time;
      env.say(t, 1800 + t.length * 55);
    };
    const hour = () => (env.hour ? env.hour() : 12);
    const isNight = () => { const h = hour(); return h >= 23 || h < 6; };
    const remember = (a) => { B.history.unshift(a); if (B.history.length > 4) B.history.pop(); };

    // ------------------------------------------------------------ state machine
    const S = {};
    function go(name, p) {
      B.state = name; B.stateT = 0; ph = ''; phT = 0; anim = null; glance = null; B.moving = false;
      if (GROUNDED.has(name)) { B.y = floor(); B.airborne = false; }
      if (S[name] && S[name].enter) S[name].enter(p || {});
    }

    S.idle = {
      enter(p) {
        dur = p.dur != null ? p.dur : R(2, 6.5);
        glanceT = R(1.5, 4);
        B.frame = 'idle_a';
        if (!p.quiet && rnd() < 0.16 && B.time - B.lastSayAt > 25) say(isNight() && rnd() < 0.5 ? 'night' : 'idle');
      },
      update(dt) {
        if (glance) {
          glance.t -= dt; B.frame = glance.f;
          if (glance.t <= 0) glance = null;
        } else {
          B.frame = lifeFrame('idle', dt);
          glanceT -= dt;
          if (glanceT <= 0 && B.stateT > 1.2) { glance = { f: rnd() < 0.5 ? 'look_l' : 'look_r', t: R(0.5, 1.1) }; glanceT = R(3, 8); }
        }
        if (B.stateT > dur) next();
      },
    };

    S.walk = {
      enter(p) {
        const b = bounds();
        let dir = p.dir || (rnd() < 0.7 ? B.facing : -B.facing);
        if (B.x < b.left + 60 * unit() / 3) dir = 1; else if (B.x > b.right - 60 * unit() / 3) dir = -1;
        B.facing = dir; targetSpeed = R(14, 24); speed = Math.max(speed * 0.3, 5);
        dur = R(3, 10); stride = RI(0, 7); B.moving = true;
      },
      update(dt) {
        speed += (targetSpeed - speed) * Math.min(1, dt * 4);
        if (rnd() < dt * 0.35) targetSpeed = clamp(targetSpeed + R(-4, 4), 11, 27);
        B.x += B.facing * speed * unit() * dt;
        stride += (speed * dt) / 20 * 8;
        B.frame = 'walk_' + (Math.floor(stride) % 8);
        const b = bounds();
        if (B.x <= b.left) { B.x = b.left; B.facing = 1; if (rnd() < 0.5) go('idle', { dur: R(0.8, 2.2), quiet: true }); return; }
        if (B.x >= b.right) { B.x = b.right; B.facing = -1; if (rnd() < 0.5) go('idle', { dur: R(0.8, 2.2), quiet: true }); return; }
        if (B.stateT > 1.5) {
          const r = rnd();
          if (r < dt * 0.07) return go('idle', { dur: R(1.2, 3), quiet: true });
          if (r < dt * 0.11) return go('jump', { vx: B.facing * speed * unit() });
          if (r < dt * 0.14 && B.energy > 0.45) return go('run');
        }
        if (B.stateT > dur) { remember('walk'); next(); }
      },
    };

    S.run = {
      enter() {
        targetSpeed = R(48, 68); speed = Math.max(speed, 20); dur = R(1.5, 4); stride = RI(0, 5); B.moving = true;
      },
      update(dt) {
        speed += (targetSpeed - speed) * Math.min(1, dt * 3);
        B.x += B.facing * speed * unit() * dt;
        stride += (speed * dt) / 28 * 6;
        B.frame = 'run_' + (Math.floor(stride) % 6);
        const b = bounds();
        if (B.x <= b.left) { B.x = b.left; B.facing = 1; }
        if (B.x >= b.right) { B.x = b.right; B.facing = -1; }
        if (B.stateT > dur) { B.panting = 2.6; speed = 8; go('idle', { dur: R(2, 4), quiet: true }); }
      },
    };

    S.jump = {
      enter(p) {
        ph = 'crouch'; phT = 0; B.frame = 'jump_crouch'; B.vx = p.vx != null ? p.vx : (rnd() < 0.4 ? B.facing * R(10, 25) * unit() : 0);
        jumpThen = p.then || null; B.energy = Math.max(0, B.energy - 0.02);
      },
      update(dt) {
        phT += dt;
        const g = 768 * unit();
        if (ph === 'crouch') {
          if (phT >= 0.17) {
            const h = R(16, 30) * unit();
            jumpV0 = Math.sqrt(2 * g * h); B.vy = -jumpV0; ph = 'air'; B.airborne = true;
          }
        } else if (ph === 'air') {
          B.vy += g * dt; B.y += B.vy * dt; B.x += B.vx * dt;
          const b = bounds(); B.x = clamp(B.x, b.left, b.right);
          B.frame = B.vy < -0.35 * jumpV0 ? 'jump_up' : (B.vy > 0.35 * jumpV0 ? 'jump_down' : 'jump_apex');
          if (B.y >= floor()) { B.y = floor(); B.vy = 0; B.vx = 0; B.airborne = false; ph = 'land'; phT = 0; B.frame = 'jump_land'; }
        } else if (ph === 'land') {
          if (phT >= 0.18) {
            if (jumpThen === 'walk') go('walk'); else go('idle', { dur: R(1, 3), quiet: true });
          }
        }
      },
    };

    S.fall = {
      enter() { B.airborne = true; B.vy = Math.max(B.vy, 0); },
      update(dt) {
        const g = 768 * unit() * 1.4;
        B.vy += g * dt; B.y += B.vy * dt; B.x += B.vx * dt; B.vx *= 0.98;
        const b = bounds(); B.x = clamp(B.x, b.left, b.right);
        B.frame = Math.floor(B.stateT * 8) % 2 ? 'carried_b' : 'carried_a';
        if (B.y >= floor()) {
          const hard = B.vy > 300 * unit() / 3;
          B.y = floor(); B.vy = 0; B.vx = 0; B.airborne = false;
          go('land', { hard });
        }
      },
    };

    S.land = {
      enter(p) { B.frame = 'react_land'; dur = p.hard ? 0.5 : 0.3; if (p.hard && rnd() < 0.6) say('land'); },
      update() { B.frame = 'react_land'; if (B.stateT > dur) go('idle', { dur: R(1, 2.5), quiet: true }); },
    };

    S.carried = {
      enter() { B.grabbed = true; B.airborne = true; B.vy = 0; B.vx = 0; B.frame = 'carried_a'; },
      update() { B.frame = Math.floor(B.stateT * 6) % 2 ? 'carried_b' : 'carried_a'; },
    };

    S.sit = {
      enter(p) {
        dur = R(8, 24); ph = p.skipDown ? 'sit' : 'down'; phT = 0; glanceT = R(4, 8);
        if (ph === 'down') play([['sit_down', 180]]);
        if (rnd() < 0.5) B.facing = -B.facing;
      },
      update(dt) {
        phT += dt;
        if (ph === 'down') { tickAnim(dt); if (phT >= 0.2) { ph = 'sit'; phT = 0; } return; }
        if (ph === 'yawn') { B.frame = 'sit_yawn'; if (phT > 1.4) { ph = 'sit'; phT = 0; } return; }
        if (ph === 'up') { B.frame = 'sit_down'; if (phT >= 0.18) go('idle', { dur: R(1, 3), quiet: true }); return; }
        B.frame = lifeFrame('sit', dt, 1.2, 2.2);
        glanceT -= dt;
        if (glanceT <= 0) { glanceT = R(5, 11); if (rnd() < 0.35 && B.energy < 0.8) { ph = 'yawn'; phT = 0; } }
        if (B.stateT > dur) {
          if (B.energy < 0.4 || (isNight() && rnd() < 0.6)) { remember('sleep'); go('sleep', { fromSit: true }); }
          else { remember('sit'); ph = 'up'; phT = 0; }
        }
      },
    };

    let typeT = 0, tog = 0, pauseT = 0, thinkFor = 0, codeSayT = 0;
    S.code = {
      enter() {
        dur = R(12, 32); ph = 'down'; phT = 0; play([['sit_down', 180]]);
        if (rnd() < 0.5) B.facing = -B.facing;
        typeT = 0.15; tog = 0; pauseT = R(2, 5); codeSayT = R(2, 4);
      },
      update(dt) {
        phT += dt;
        if (ph === 'down') { tickAnim(dt); if (phT >= 0.2) { ph = 'type'; phT = 0; } return; }
        if (ph === 'up') { B.frame = 'sit_down'; if (phT >= 0.18) go('idle', { dur: R(1, 3), quiet: true }); return; }
        B.energy = Math.max(0, B.energy - 0.001 * dt);
        codeSayT -= dt; if (codeSayT <= 0) { say('code'); codeSayT = R(9, 16); }
        if (ph === 'think') { B.frame = 'sit_code_think'; if (phT > thinkFor) { ph = 'type'; phT = 0; pauseT = R(3, 7); } }
        else {
          lifeFrame('sit', dt);
          typeT -= dt; if (typeT <= 0) { tog ^= 1; typeT = R(0.1, 0.22); }
          pauseT -= dt; if (pauseT <= 0) { ph = 'think'; phT = 0; thinkFor = R(1, 2.5); if (rnd() < 0.3) env.fx('question'); }
          B.frame = life.blink > 0 ? 'sit_code_blink' : (tog ? 'sit_code_b' : 'sit_code_a');
        }
        if (B.stateT > dur) { B.mood = clamp(B.mood + 0.03, 0, 1); remember('code'); ph = 'up'; phT = 0; }
      },
    };

    S.sleep = {
      enter(p) {
        dur = R(22, 70) * (1 + (1 - B.energy)); zT = 1.2;
        ph = p.fromSit ? 'nod' : 'down'; phT = 0;
        if (ph === 'down') play([['sit_down', 200]]);
        B.facing = B.facing || 1;
      },
      update(dt) {
        phT += dt; B.sleepT = (B.sleepT || 0) + dt;
        if (ph === 'down') { tickAnim(dt); if (phT >= 0.25) { ph = 'nod'; phT = 0; } return; }
        if (ph === 'nod') {
          B.frame = Math.floor(phT / 1.1) % 2 ? 'sit_sleepy_b' : 'sit_sleepy_a';
          if (phT > R(2.4, 3.4)) { ph = 'lie'; phT = 0; life.breath = 0; life.breathT = 1.8; B.frame = 'sleep_a'; B.sleepFor = 0; }
          return;
        }
        B.sleepFor += dt;
        life.breathT -= dt; if (life.breathT <= 0) { life.breath ^= 1; life.breathT = R(1.6, 2.2); }
        B.frame = life.breath ? 'sleep_b' : 'sleep_a';
        B.energy = Math.min(1, B.energy + 0.03 * dt);
        zT -= dt; if (zT <= 0) { env.fx('z'); zT = R(1.5, 2.3); }
        if (B.sleepFor > dur || (B.energy >= 1 && B.sleepFor > 15)) wakeUp(false);
      },
    };

    function wakeUp(grumpy) {
      go('wake', { grumpy });
    }
    S.wake = {
      enter(p) {
        play([['wake_0', 700], ['wake_1', 900], ['sit_yawn', 800], ['stretch_a', 800], ['stretch_b', 700], ['idle_a', 300]]);
        say(p.grumpy ? 'grumpy' : 'wake', true);
        B.mood = clamp(B.mood + (p.grumpy ? -0.1 : 0.1), 0, 1);
      },
      update(dt) { tickAnim(dt); if (anim.done) go('idle', { dur: R(2, 4), quiet: true }); },
    };

    S.dance = {
      enter() {
        dur = R(5, 11); B.dancefps = R(5.5, 7.5); stride = RI(0, 7); fxT = 0.3; say('dance');
      },
      update(dt) {
        stride += dt * B.dancefps; B.frame = 'dance_' + (Math.floor(stride) % 8);
        B.energy = Math.max(0, B.energy - 0.012 * dt);
        fxT -= dt; if (fxT <= 0) { env.fx('note'); fxT = R(0.5, 1.1); }
        if (B.stateT > dur) { B.mood = clamp(B.mood + 0.08, 0, 1); remember('dance'); play([['idle_smile', 1300]]); ph = 'end'; dur = Infinity; }
        if (ph === 'end') { tickAnim(dt); if (anim.done) go('idle', { dur: R(1.5, 3), quiet: true }); }
      },
    };

    S.look = {
      enter() {
        const seq = [['idle_a', R(300, 700)]];
        const n = RI(2, 4);
        for (let i = 0; i < n; i++) {
          const r = rnd();
          seq.push([r < 0.4 ? 'look_l' : r < 0.8 ? 'look_r' : 'look_up', R(600, 1300)]);
          if (rnd() < 0.5) seq.push(['idle_a', R(250, 600)]);
        }
        seq.push(['idle_a', 400]);
        if (seq.some((s) => s[0] === 'look_up') && rnd() < 0.6) env.fx('question');
        play(seq);
      },
      update(dt) { tickAnim(dt); if (anim.done) { remember('look'); go('idle', { dur: R(1.5, 4), quiet: true }); } },
    };

    S.stretch = {
      enter() { play([['stretch_a', 800], ['stretch_b', 800], ['stretch_a', 700], ['idle_a', 250]]); },
      update(dt) { tickAnim(dt); if (anim.done) { remember('stretch'); B.energy = Math.min(1, B.energy + 0.05); go('idle', { dur: R(1.5, 3.5), quiet: true }); } },
    };

    S.coffee = {
      enter() {
        play([['coffee_a', 600], ['coffee_b', 1000], ['coffee_c', 800], ['coffee_b', 1000], ['coffee_a', 600], ['coffee_c', 800]]);
        fxT = 0.2; B.energy = Math.min(1, B.energy + 0.3); B.mood = clamp(B.mood + 0.05, 0, 1);
      },
      update(dt) {
        tickAnim(dt);
        fxT -= dt; if (fxT <= 0) { env.fx('steam'); fxT = 0.9; }
        if (anim.done) { say('coffee', true); remember('coffee'); go('idle', { dur: R(1.5, 3), quiet: true }); }
      },
    };

    S.react = {
      enter(p) {
        const k = p.kind || 'surprise';
        const rep = (a, b, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[0], a[1]], [b[0], b[1]]); return o; };
        if (k === 'surprise') { env.fx('exclaim'); play([['react_surprise_a', 170], ['react_surprise_b', 130], ['react_land', 150], ['idle_a', 220]]); }
        else if (k === 'wave') play([...rep(['react_wave_a', 230], ['react_wave_b', 230], 3), ['idle_smile', 350]]);
        else if (k === 'laugh') { play(rep(['react_laugh_a', 170], ['react_laugh_b', 170], 4)); }
        else if (k === 'annoyed') { env.fx('sweat'); play([['react_annoyed', 1600]]); }
        else { env.fx('heart'); play([['react_surprise_b', 220], ['idle_smile', 1000]]); }
        if (k !== 'annoyed') say('poke'); else say('annoyed', true);
      },
      update(dt) { tickAnim(dt); if (anim.done) go('idle', { dur: R(1.5, 3.5), quiet: true }); },
    };

    // ------------------------------------------------------------ choosing what to do next
    function next() {
      const e = B.energy, st = env.settings(), night = isNight();
      const w = {
        stay: 2.2, look: 1.8, stretch: 0.5 + (1 - e) * 0.9, sit: 0.8 + (1 - e) * 2.4,
        sleep: (e < 0.55 ? (0.55 - e) * 10 : 0) + (night ? 1.3 : 0),
        dance: 0.3 + B.mood * 0.5 * e, coffee: 0.18 + (1 - e) * 0.6, jump: 0.7 * e, code: 0.7,
      };
      if (st.wander) { w.walk = 3.4 * (0.5 + e); w.run = e > 0.45 ? 0.9 * e : 0; }
      B.history.forEach((a, i) => { if (w[a] != null) w[a] *= i === 0 ? 0.08 : i === 1 ? 0.4 : 0.75; });
      let total = 0; for (const k in w) total += w[k];
      let r = rnd() * total, choice = 'stay';
      for (const k in w) { r -= w[k]; if (r <= 0) { choice = k; break; } }
      start(choice);
    }
    function start(a) {
      switch (a) {
        case 'walk': return go('walk');
        case 'run': return go('run');
        case 'jump': return go('jump');
        case 'sit': return go('sit');
        case 'code': return go('code');
        case 'sleep': remember('sleep'); return go('sleep');
        case 'look': return go('look');
        case 'dance': return go('dance');
        case 'stretch': return go('stretch');
        case 'coffee': return go('coffee');
        default: remember('stay'); return go('idle', { dur: R(2, 5) });
      }
    }

    // ------------------------------------------------------------ public API
    B.update = function (dtRaw) {
      const dt = Math.min(0.1, Math.max(0, dtRaw));
      B.time += dt; B.stateT += dt;
      if (B.panting > 0) B.panting -= dt;
      // passive energy changes
      const drain = { walk: 0.008, run: 0.022, idle: 0.0018, sit: 0.0006, look: 0.0018, dance: 0, sleep: 0 }[B.state] || 0.0015;
      B.energy = clamp(B.energy - drain * dt, 0, 1);
      const h = S[B.state]; if (h && h.update) h.update(dt);
      if (GROUNDED.has(B.state)) { B.y = floor(); const b = bounds(); B.x = clamp(B.x, b.left, b.right); }
      return B;
    };
    B.poke = function () {
      if (B.state === 'carried' || B.state === 'fall') return;
      B.clicks = (B.time - B.lastClickAt < 1.3) ? B.clicks + 1 : 1; B.lastClickAt = B.time;
      if (B.state === 'sleep') return wakeUp(true);
      if (B.state === 'wake') return;
      if (B.state === 'jump' && B.airborne) return;
      let kind;
      if (B.clicks >= 5) kind = 'annoyed';
      else { const r = rnd(); kind = r < 0.35 ? 'surprise' : r < 0.65 ? 'wave' : r < 0.85 ? 'laugh' : 'happy'; }
      go('react', { kind });
    };
    B.grab = function (x, y) {
      B.x = x; B.y = y; if (B.state === 'sleep') B.mood = clamp(B.mood - 0.05, 0, 1);
      go('carried'); say('grab');
    };
    B.dragTo = function (x, y) { B.x = x; B.y = y; };
    B.release = function () {
      B.grabbed = false;
      const b = bounds(); B.x = clamp(B.x, b.left, b.right);
      if (B.y < b.floor - 3 * unit()) { B.airborne = true; B.vy = 0; go('fall'); }
      else { B.y = b.floor; go('land', { hard: false }); }
    };
    B.command = function (name) {
      if (B.state === 'carried' || B.state === 'fall') return;
      switch (name) {
        case 'wake': if (B.state === 'sleep') wakeUp(false); return;
        case 'sleep': if (B.state === 'sleep') return wakeUp(false); return go('sleep');
        case 'wave': return go('react', { kind: 'wave' });
        case 'hello': return go('react', { kind: 'wave' });
        case 'jump': return go('jump', { vx: 0 });
        case 'sit': return go('sit');
        case 'code': return go('code');
        case 'walk': return go('walk');
        case 'run': return go('run');
        case 'dance': return go('dance');
        case 'look': return go('look');
        case 'coffee': return go('coffee');
        case 'stretch': return go('stretch');
        case 'talk': say(isNight() ? 'night' : 'idle', true); return;
        default: return;
      }
    };
    B.greet = function () {
      const h = hour();
      go('react', { kind: 'wave' });
      B.lastSayAt = -99;
      say(h < 5 ? 'late' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 23 ? 'evening' : 'late', true);
    };
    B.isAsleep = () => B.state === 'sleep';
    B.teleport = function (x) { B.x = x; B.y = floor(); go('idle', { dur: 1.5, quiet: true }); };
    B.start = function (x, y) {
      B.x = x; B.y = y; B.facing = rnd() < 0.5 ? -1 : 1;
      if (y < floor() - 3 * unit()) { B.airborne = true; go('fall'); } else { B.y = floor(); go('idle', { dur: 1, quiet: true }); }
    };
    return B;
  }

  return { createBrain, LINES };
});
