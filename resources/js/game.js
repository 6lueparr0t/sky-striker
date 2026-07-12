// Sky Striker — a vertical scrolling shoot-'em-up.
// Arrow keys move, Z fires, X parries (reflects bullets), missile power-up auto-fires.
// 5 stages of escalating enemies + formations, mid-bosses, and a two-phase final boss.
// Pure canvas + vanilla JS + synthesized WebAudio; no external assets.

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 480
  const H = canvas.height;  // 720

  // ---- input ----------------------------------------------------------------
  const keys = {};
  const DOWN_ONCE = {};
  addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    initAudio();
    if (actx && actx.state === "suspended") actx.resume();
    // Alt+Enter (Windows) / Cmd+Enter (Mac) → toggle fullscreen (consume, not a normal Enter)
    if (e.code === "Enter" && (e.altKey || e.metaKey)) { e.preventDefault(); toggleFullscreen(); return; }
    if (!keys[e.code]) DOWN_ONCE[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  function pressed(code) { if (DOWN_ONCE[code]) { DOWN_ONCE[code] = false; return true; } return false; }

  // ---- audio (WebAudio, fully synthesized — no asset files) -----------------
  let actx = null, noiseBuf = null, bgmGain = null;
  const bgm = { on: false, step: 0, next: 0, stepDur: 0.16 };
  function initAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const len = Math.floor(actx.sampleRate * 0.5);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      bgmGain = actx.createGain(); bgmGain.gain.value = 0.5; bgmGain.connect(actx.destination);
      bgm.step = 0; bgm.next = actx.currentTime + 0.15; bgm.on = true;   // start the synthesized BGM loop
    } catch (e) { actx = null; }
  }
  function tone(freq, dur, type = "square", vol = 0.15, slideTo = null) {
    if (!actx) return;
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur);
  }
  function noise(dur, vol = 0.3, freq = 800) {
    if (!actx || !noiseBuf) return;
    const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf;
    f.type = "lowpass"; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur);
  }
  function sfx(name) {
    if (!actx) return;
    switch (name) {
      case "shoot": tone(880, 0.07, "square", 0.05, 320); break;
      case "missile": noise(0.28, 0.14, 1300); tone(340, 0.28, "sawtooth", 0.05, 950); break;
      case "explode": noise(0.32, 0.32, 900); break;
      case "bossexplode": noise(0.9, 0.5, 700); break;
      case "hit": tone(170, 0.3, "sawtooth", 0.2, 55); break;
      case "power": tone(523, 0.09, "square", 0.12); setTimeout(() => tone(784, 0.12, "square", 0.12), 90); break;
      case "reflect": tone(1200, 0.08, "square", 0.12, 2200); break;
      case "parry": tone(300, 0.28, "sine", 0.16, 950); break;
      case "missileget": tone(700, 0.1, "square", 0.12, 1100); break;
      case "life": tone(659, 0.1, "triangle", 0.14); setTimeout(() => tone(988, 0.15, "triangle", 0.14), 100); break;
      case "clear": [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, "square", 0.12), i * 120)); break;
      case "win": [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.14), i * 140)); break;
      case "over": [420, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, "sawtooth", 0.12), i * 160)); break;
    }
  }

  // ---- BGM (fully synthesized, no asset files — a looping chiptune) ----------
  function bgmNote(freq, dur, type, vol, t) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bgmGain); o.start(t); o.stop(t + dur);
  }
  // A-minor pentatonic: bass on the downbeats, a lead arpeggio each 1/16 step.
  const BGM_LEAD = [440, 523.25, 659.25, 880, 659.25, 523.25, 440, 523.25, 587.33, 523.25, 440, 392, 440, 329.63, 392, 440];
  const BGM_BASS = [110, 0, 0, 0, 146.83, 0, 0, 0, 130.81, 0, 0, 0, 164.81, 0, 0, 0];
  function scheduleBgmStep(step, t, tense) {
    const lead = BGM_LEAD[step];
    if (lead) bgmNote(lead, 0.13, "triangle", tense ? 0.06 : 0.045, t);
    const bass = BGM_BASS[step];
    if (bass) bgmNote(bass, 0.42, "sawtooth", tense ? 0.075 : 0.06, t);
    if (step % 2 === 1) bgmNote(1760, 0.03, "square", 0.012, t);   // soft off-beat tick
  }
  function updateBGM() {
    if (!actx || !bgm.on || !bgmGain) return;
    // BGM은 시작 화면(메뉴)과 스토리 진행 중에만 — 실제 게임 플레이 중엔 조용히.
    if (state !== STATE.MENU && state !== STATE.STORY) { bgm.next = actx.currentTime + 0.05; return; }
    const tense = !!boss || !!midboss;                 // speed up during boss fights
    bgm.stepDur = tense ? 0.135 : 0.16;
    if (bgm.next < actx.currentTime) bgm.next = actx.currentTime + 0.05;   // resync after a stall
    while (bgm.next < actx.currentTime + 0.12) {
      scheduleBgmStep(bgm.step, bgm.next, tense);
      bgm.step = (bgm.step + 1) % 16;
      bgm.next += bgm.stepDur;
    }
  }

  // ---- game state -----------------------------------------------------------
  const STATE = { MENU: "menu", PLAY: "play", CLEAR: "clear", OVER: "over", WIN: "win", STORY: "story", HIDDEN: "hidden", PAUSE: "pause" };
  let state = STATE.MENU;
  let prevState = STATE.PLAY, pauseSel = 0, menuSel = 0;   // menuSel: 0=시작, 1=무한 모드

  // Enemy archetypes: hp, speed, movement, and firing pattern per type.
  const ETYPE = {
    basic: { w: 30, h: 28, hp: 1, spd: 130, move: "straight", fire: "single", every: 1.15, color: "#ff7b5c" },
    zigzag: { w: 30, h: 28, hp: 1, spd: 130, move: "zigzag", fire: "single", every: 1.3, color: "#c77dff" },
    shooter: { w: 32, h: 30, hp: 3, spd: 95, move: "drift", fire: "spread", every: 0.9, color: "#ff5c8a" },
    fast: { w: 24, h: 24, hp: 1, spd: 330, move: "dive", fire: "none", every: 0, color: "#ffd35c" },
    tank: { w: 46, h: 42, hp: 10, spd: 70, move: "straight", fire: "burst", every: 1.55, color: "#8a9bff" },
  };

  const STAGES = [
    { quota: 110, spawn: 0.98, hpMul: 1, pool: ["basic", "zigzag"] },   // 1스테이지: 물량↓·간격↑로 완만하게
    { quota: 224, spawn: 0.52, hpMul: 1, pool: ["basic", "zigzag", "fast"], midboss: true },
    { quota: 256, spawn: 0.50, hpMul: 2, pool: ["zigzag", "shooter", "fast"] },
    { quota: 304, spawn: 0.44, hpMul: 2, pool: ["shooter", "fast", "tank"], midboss: true },
    { boss: true },
  ];

  // Enemies are 1.5x tougher across the board (keeps parry from trivialising them).
  const ENEMY_HP_MUL = 1.5;

  let player, bullets, enemies, eBullets, items, particles, missiles, boss, midboss;
  let stageIndex, spawnedThisStage, spawnTimer, score, highScore, clearTimer, shakeTime, starLayers;
  let midbossSpawned, midbossDone, stageItem, stageUfo, ufoUsedThisStage;

  const COMPANION_MAX = 3;        // at most 3 Chloe allies at once (permanent once recruited)
  // Fire power 1~5: 공격력(탄당 데미지)은 항상 1 고정 — 레벨이 오르면 공격 패턴과
  // 탄량이 늘어날 뿐, 한 발 한 발이 세지지는 않는다.
  const POWER_MAX = 5, MISSILE_MAX = 5;
  // C 게이지는 3단으로 차오른다: 100=1단(폭주), 200=2단(탄막소거), 300=3단(소거+전멸).
  const CHARGE_MAX = 300, CHARGE_STEP = 100;
  let cutscene, allies, rescuedCount, hiddenTotal, hiddenTime, clears, flashTime = 0;
  let disco = true, eggMsgTimer = 0, eggMsg = "", eggParticles = [];
  let bonus = null, bonusTimer = 20;
  let supplyCd = 0;   // 파워가 낮을 때 보급 적기를 내보내는 쿨다운
  let companions = [];   // ally wingmen — one added each time you shoot down a Chloe UFO
  let endless = false, loopCount = 0;   // endless mode: stages 1~5 repeat forever

  // In endless mode each completed loop makes everything tougher.
  function loopScale() { return 1 + loopCount * 0.35; }

  // Per-stage item budget: 1~2 power/missile drops, exactly 1 heart. Reset each stage.
  function resetStageItems() {
    stageItem = {
      power: 0, missile: 0, life: 0,
      powerMax: 1 + (Math.random() < 0.5 ? 1 : 0),
      missileMax: 1 + (Math.random() < 0.5 ? 1 : 0),
      lifeMax: 1,
    };
    stageUfo = Math.random() < 0.5;   // 50% chance a Chloe UFO shows up this stage
    ufoUsedThisStage = false;
  }

  // Persistence: localStorage isn't reliable across Neutralino webview sessions,
  // so mirror everything into Neutralino's on-disk storage (.storage/) too.
  function persistSet(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) { }
    if (window.Neutralino && Neutralino.storage) Neutralino.storage.setData(key, String(val)).catch(() => { });
  }
  function persistLoad() {
    // immediate (sync) value from localStorage, if any
    highScore = Number(localStorage.getItem("skystriker_high") || 0);
    clears = Number(localStorage.getItem("skystriker_clears") || 0);
    // then override from Neutralino's durable storage once the native layer is ready
    if (window.Neutralino && Neutralino.storage) {
      Neutralino.storage.getData("skystriker_high").then((v) => { const n = Number(v); if (!isNaN(n) && n > highScore) highScore = n; }).catch(() => { });
      Neutralino.storage.getData("skystriker_clears").then((v) => { const n = Number(v); if (!isNaN(n) && n > clears) clears = n; }).catch(() => { });
    }
  }
  persistLoad();
  if (window.Neutralino && Neutralino.events) Neutralino.events.on("ready", persistLoad);   // re-load once native layer is up

  function resetPlayer() {
    player = {
      x: W / 2, y: H - 80, w: 30, h: 34,
      speed: 300, power: 1, lives: 3,
      cooldown: 0, invuln: 0,
      parryActive: 0, parryCd: 0,
      missileLevel: 0, missileTimer: 0, missileQueue: 0, missileGap: 0,
      charge: 0, emp: 0, frenzy: 0,
    };
  }

  function startGame(isEndless) {
    endless = !!isEndless; loopCount = 0;
    resetPlayer();
    bullets = []; enemies = []; eBullets = []; items = []; particles = []; missiles = [];
    boss = null; midboss = null;
    stageIndex = 0; spawnedThisStage = 0; spawnTimer = 0; score = 0;
    clearTimer = 0; shakeTime = 0; flashTime = 0;
    midbossSpawned = false; midbossDone = false; resetStageItems();
    bonus = null; bonusTimer = 18 + Math.random() * 12; companions = []; supplyCd = 15;
    starLayers = [makeStars(40, 30), makeStars(30, 70), makeStars(18, 130)];
    // 1스테이지 시작 선물: 파워업과 미사일을 바로 떨어뜨려 초반 공백을 없앤다.
    items.push({ x: W / 2 - 40, y: -30, w: 20, h: 20, vy: 65, type: "power", t: 0 });
    items.push({ x: W / 2 + 40, y: -70, w: 20, h: 20, vy: 65, type: "missile", t: 0 });
    if (endless) { eggMsg = "🔁 무한 모드 · LOOP 1"; eggMsgTimer = 2.6; }
    state = STATE.PLAY;
  }

  // Endless mode: after the final boss, loop back to stage 1 (harder) — keep the
  // player's power/lives/allies. Started straight from the menu (skips the intro).
  function nextEndlessLoop() {
    loopCount++;
    saveHigh();
    bullets = []; enemies = []; eBullets = []; items = []; missiles = [];
    boss = null; midboss = null;
    stageIndex = 0; spawnedThisStage = 0; spawnTimer = 0;
    midbossSpawned = false; midbossDone = false; resetStageItems();
    eggMsg = `🔁 LOOP ${loopCount + 1} 시작!`; eggMsgTimer = 2.6;
    sfx("clear");
    state = STATE.PLAY;
  }

  function beginIntro() { playCutscene(INTRO_PAGES, () => startGame(false)); }

  function makeStars(n, speed) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ x: Math.random() * W, y: Math.random() * H, s: speed });
    return arr;
  }

  function driftStars(dt) {
    for (const layer of starLayers) for (const s of layer) { s.y += s.s * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
  }

  function movePlayer(dt) {
    let dx = 0, dy = 0;
    if (keys.ArrowLeft) dx -= 1;
    if (keys.ArrowRight) dx += 1;
    if (keys.ArrowUp) dy -= 1;
    if (keys.ArrowDown) dy += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    const spd = player.parryActive > 0 ? player.speed * 0.5 : player.speed;   // 패링 중엔 이동속도 절반
    player.x += dx * spd * dt;
    player.y += dy * spd * dt;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
    player.y = Math.max(player.h / 2, Math.min(H - player.h / 2, player.y));
  }

  // ---- spawning -------------------------------------------------------------
  function spawnEnemy(type, x = null, y = -30) {
    const b = ETYPE[type], cfg = STAGES[stageIndex];
    if (x == null) x = 40 + Math.random() * (W - 80);
    const raw = type === "tank" ? b.hp + (cfg.hpMul - 1) * 5 : b.hp * cfg.hpMul;
    // 1스테이지는 전역 1.5배 보정을 빼서 대부분 단발에 격추되도록 (초반 난이도 완화)
    const hpMulGlobal = stageIndex === 0 ? 1 : ENEMY_HP_MUL;
    const hp = Math.max(1, Math.ceil(raw * hpMulGlobal * loopScale()));
    const e = {
      type, x, baseX: x, y, w: b.w, h: b.h,
      hp, maxHp: hp, vy: b.spd, move: b.move, fire: b.fire, color: b.color,
      t: Math.random() * Math.PI * 2,
      fireTimer: 0.4 + Math.random() * 1.2,
      diveVx: 0, carrier: false,
    };
    enemies.push(e);
    spawnedThisStage++;
    return e;
  }

  // Spawns come in formations for readable patterns, not single random blips.
  function spawnWave() {
    const cfg = STAGES[stageIndex];
    const type = cfg.pool[(Math.random() * cfg.pool.length) | 0];
    const roll = Math.random();
    const wave = [];
    if (roll < 0.35) {                              // horizontal line
      const n = 4, gap = (W - 100) / (n - 1);
      for (let i = 0; i < n && spawnedThisStage < cfg.quota; i++) wave.push(spawnEnemy(type, 50 + i * gap));
    } else if (roll < 0.6) {                        // V wedge
      const cx = 90 + Math.random() * (W - 180);
      for (let i = -2; i <= 2 && spawnedThisStage < cfg.quota; i++) wave.push(spawnEnemy(type, cx + i * 34, -30 - Math.abs(i) * 22));
    } else if (roll < 0.8) {                        // column stream
      const cx = 40 + Math.random() * (W - 80);
      for (let i = 0; i < 3 && spawnedThisStage < cfg.quota; i++) wave.push(spawnEnemy(type, cx, -30 - i * 42));
    } else {                                        // lone straggler
      wave.push(spawnEnemy(type));
    }
    // ~half of waves carry an item; a carrier enemy glows and drops on death.
    // Prefer a non-'fast' carrier so it doesn't just dive off-screen with the loot.
    if (wave.length && Math.random() < (stageIndex === 0 ? 0.9 : 0.5)) {
      const pick = wave.filter((e) => e.type !== "fast");
      const c = (pick.length ? pick : wave)[(Math.random() * (pick.length || wave.length)) | 0];
      if (c) c.carrier = true;
    }
  }

  function spawnBoss() {
    const hp = Math.round(7680 * loopScale());
    boss = {
      x: W / 2, y: -90, w: 130, h: 90,
      hp, maxHp: hp, entering: true,
      dir: 1, patternTimer: 0, pattern: 0, angle: 0,
      laserState: "off", laserTimer: 0, laserXs: [], empWave: null, empBroken: false,
    };
  }

  function spawnMidboss() {
    // Two distinct mid-bosses: an Apollo-era cruiser (stage 2) and a huge space
    // station (stage 4). The station is bigger, tougher, and drawn differently.
    const station = stageIndex >= 3;
    const hp = Math.round((100 + stageIndex * 55) * (station ? 1.6 : 1) * 8 * loopScale());   // 체력 2배 (기존 ×4 → ×8)
    const w = station ? 176 : 92, h = station ? 128 : 68;
    midboss = {
      x: W / 2, y: -h, w, h, hp, maxHp: hp, entering: true, dir: 1,
      patternTimer: 1, pattern: -1, angle: 0, kind: station ? "station" : "apollo",
      gravityTimer: 0,
    };
  }

  function dropItem(x, y) {
    // Respect the per-stage budget. Heart is dropped first (guarantees the 1 heart),
    // then power/missile up to their 1~2 caps. Once all caps are hit, no more drops.
    let type = null;
    if (stageItem.life < stageItem.lifeMax) {
      type = "life";
    } else {
      const opts = [];
      if (stageItem.power < stageItem.powerMax) opts.push("power");
      if (stageItem.missile < stageItem.missileMax) opts.push("missile");
      if (!opts.length) return;
      type = opts[(Math.random() * opts.length) | 0];
    }
    stageItem[type]++;
    items.push({ x, y, w: 20, h: 20, vy: 70, type, t: 0 });
  }

  // Supply ship: sent in when the player's fire power drops low (1~2). Drifts in
  // glowing teal, and on death drops BOTH a power-up and a missile item (bypasses
  // the per-stage item budget — it's an emergency resupply).
  function spawnSupply() {
    const x = 60 + Math.random() * (W - 120);
    enemies.push({
      type: "shooter", x, baseX: x, y: -30, w: 34, h: 30,
      hp: 4, maxHp: 4, vy: 80, move: "drift", fire: "none", color: "#5cffd0",
      t: Math.random() * 6, fireTimer: 999, diveVx: 0, carrier: false, supply: true,
    });
  }

  // Easter egg #2: a little "Chloe UFO" drifts across mid-flight now and then.
  // Shoot it down for a big score pop + confetti — discoverable during normal play.
  function spawnBonus() {
    const fromLeft = Math.random() < 0.5;
    bonus = { x: fromLeft ? -20 : W + 20, y: 90 + Math.random() * 150, vx: (fromLeft ? 1 : -1) * (95 + Math.random() * 45), t: 0, w: 34, h: 20, hp: 3, maxHp: 3, hitFx: 0 };
    bonusTimer = 18 + Math.random() * 12;
  }

  // Shooting down the Chloe UFO recruits ANOTHER autonomous ally each time — they
  // stack. Each flies near the player, fires homing shots, and parries enemy fire.
  function hitBonus() {
    for (let i = 0; i < 60; i++) eggParticles.push({ x: bonus.x, y: bonus.y, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, life: 1.2 + Math.random(), color: `hsl(${Math.random() * 360},90%,62%)`, sz: 3 + Math.random() * 3 });
    boom(bonus.x, bonus.y, "#c77dff", 26);
    if (companions.length < COMPANION_MAX) {
      companions.push({ x: bonus.x, y: bonus.y, t: Math.random() * 6, fireTimer: 0.5, phase: companions.length * 1.7 });
      eggMsg = `🛸 클로이 합류!`; eggMsgTimer = 2.6; // 이 텍스트는 변경하지말고 유지해줘
    }
    sfx("life");
    bonus = null;
  }

  // ---- firing ---------------------------------------------------------------
  function playerFire() {
    const lvl = player.power;
    const y = player.y - player.h / 2;
    const frenzy = player.frenzy > 0;                   // 폭주 중엔 데미지 2배·연사 4배·자동발사
    const dmg = frenzy ? 2 : 1;   // 파워업으론 데미지가 안 오르지만 폭주는 예외
    const shot = (dx, ox = 0, dy = -520) => bullets.push({ x: player.x + ox, y, vx: dx, vy: dy, w: 5, h: 12, dmg });
    shot(0);                                            // Lv1: 정면 단발
    if (lvl >= 2) { shot(0, -8); shot(0, 8); }          // Lv2: 좌우 병렬탄 추가
    if (lvl >= 3) { shot(-120, -10); shot(120, 10); }   // Lv3: 확산탄 추가
    if (lvl >= 4) { shot(-260, -14); shot(260, 14); }   // Lv4: 넓은 확산탄 추가
    if (lvl >= 5) { shot(-460, -18, -360); shot(460, 18, -360); }  // Lv5: 측면 견제탄 추가 (신규 패턴)
    player.cooldown = frenzy ? 0.04 : 0.16;   // 폭주 중 연사 4배
    sfx("shoot");
  }

  // parry (Zelda-style): X opens a 0.4s block window on a 1.5s cooldown. Bullets
  // caught in the window become blazing-fast homing shots — a guaranteed counter.
  function activateParry() {
    if (player.frenzy > 0) return;   // 폭주 모드 중엔 패링 봉인 (공격에 집중)
    if (player.parryCd <= 0) {
      player.parryActive = 0.4;
      player.parryCd = 1.5;
      sfx("parry");
    }
  }

  function reflectBullet(eb) {
    // 일반 탄을 튕기면 6, 최종 보스의 유도탄을 튕겨내면 4배(24) 위력으로 되돌아간다.
    const dmg = eb.homing ? 24 : 6;
    bullets.push({ x: eb.x, y: eb.y, vx: 0, vy: -300, w: 10, h: 16, dmg, reflected: true, homing: true, target: null });
    player.charge = Math.min(CHARGE_MAX, player.charge + 5);   // 3단(300)까지 차오른다
    sfx("reflect");
  }

  // C skill: 채운 단계만큼 강력해진다. 눌러서 발동하면 게이지는 전부 소진된다.
  //   1단(100~): 폭주 모드   2단(200~): 탄막 전체 소거   3단(300): 소거 + 일반 적 전멸
  function bombSkill() {
    const stage = player.charge >= 300 ? 3 : player.charge >= 200 ? 2 : player.charge >= 100 ? 1 : 0;
    if (stage === 0) return;
    player.charge = 0;

    if (stage === 1) { activateFrenzy(); return; }

    // 2·3단 공통: 화면의 적 탄막을 전부 소거
    for (const eb of eBullets) boom(eb.x, eb.y, "#7fffe0", 2);
    eBullets = [];
    flashTime = 0.3;
    shakeTime = Math.max(shakeTime, 0.2);
    sfx("bossexplode");

    if (stage === 3) {
      // 3단 추가 효과: 일반 잡몹은 전멸, 미드보스·보스는 큰 데미지만 (보스는 EMP까지 고장)
      for (const e of [...enemies]) { if (e.hp > 0) killEnemy(e); }
      enemies = [];
      if (midboss && !midboss.entering) midboss.hp -= Math.round(midboss.maxHp * 0.25);
      if (boss && !boss.entering) {
        boss.hp -= Math.round(boss.maxHp * 0.2);
        boss.empBroken = true;   // 최종보스 EMP 공격 영구 고장
      }
      flashTime = 0.5;
      shakeTime = Math.max(shakeTime, 0.35);
    }
  }

  // 폭주 모드(1단): 3초간 데미지 2배·연사 4배·총알 자동발사, 미사일 40발 동시 발사. 대신 패링 봉인.
  function activateFrenzy() {
    player.frenzy = 3;
    player.parryActive = 0;      // 진행 중이던 패링 창은 즉시 닫는다
    // 미사일 40발을 한 번에 발사 — 좌우로 넓게 퍼뜨려 유도탄 벽을 만든다
    for (let i = 0; i < 40; i++) {
      const spread = (i - 19.5) / 19.5;   // -1 ~ 1
      missiles.push({ x: player.x + spread * 60, y: player.y - 12, vx: spread * 220, vy: -480, w: 9, h: 16, target: null, life: 4 });
    }
    player.missileQueue = 0;
    sfx("missile");
    flashTime = 0.3;
    shakeTime = Math.max(shakeTime, 0.25);
    sfx("clear");
  }

  function aim(x, y, sp) {
    const dx = player.x - x, dy = player.y - y, d = Math.hypot(dx, dy) || 1;
    return { vx: dx / d * sp, vy: dy / d * sp };
  }

  function mkeb(x, y, vx, vy) { return { x, y, vx, vy, w: 9, h: 9 }; }

  function enemyShoot(e) {
    const cx = e.x, cy = e.y + e.h / 2;
    if (e.fire === "single") {                        // now an aimed twin shot
      const a = aim(cx, cy, 300), base = Math.atan2(a.vy, a.vx);
      for (const k of [-0.12, 0.12]) {
        eBullets.push({ x: cx, y: cy, vx: Math.cos(base + k) * 300, vy: Math.sin(base + k) * 300, w: 8, h: 8 });
      }
    } else if (e.fire === "spread") {
      const a = aim(cx, cy, 300), base = Math.atan2(a.vy, a.vx);
      for (let k = -2; k <= 2; k++) {                 // 3 → 5 pellets
        const ang = base + k * 0.24;
        eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, w: 8, h: 8 });
      }
    } else if (e.fire === "burst") {
      const n = 18;                                   // 12 → 18 radial
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200, w: 8, h: 8 });
      }
    }
  }

  function acquireTarget() {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best && midboss && !midboss.entering && midboss.hp > 0) best = midboss;
    if (!best && boss && !boss.entering && boss.hp > 0) best = boss;
    return best;
  }

  function updateMissiles(dt) {
    for (const m of missiles) {
      if (!m.target || m.target.hp <= 0) m.target = acquireTarget();
      if (m.target) {
        const desired = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        const cur = Math.atan2(m.vy, m.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = 10 * dt;
        const na = cur + Math.max(-turn, Math.min(turn, diff));
        const sp = 810;                 // 540 → 1.5x faster
        m.vx = Math.cos(na) * sp; m.vy = Math.sin(na) * sp;
      } else {
        m.vy = -690;
      }
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.life -= dt;
      particles.push({ x: m.x, y: m.y + 8, vx: 0, vy: 60, life: 0.28, color: "#ffcf6b" });
    }
    for (const m of missiles) {
      if (m.life <= 0) continue;
      let struck = false;
      const mdmg = player.frenzy > 0 ? 2 : 1;   // 폭주 중 미사일 데미지 2배
      for (const e of enemies) {
        if (e.hp > 0 && hit(m, e)) {
          e.hp -= 3 * mdmg; struck = true;
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
      if (!struck) {
        for (const tgt of [midboss, boss]) {
          if (tgt && !tgt.entering && hit(m, tgt)) { tgt.hp -= 14 * mdmg; struck = true; break; }
        }
      }
      if (struck) { boom(m.x, m.y, "#ffcf6b", 18); sfx("explode"); m.life = 0; }
    }
    missiles = missiles.filter((m) => m.life > 0 && m.y > -30 && m.y < H + 30 && m.x > -30 && m.x < W + 30);
  }

  // Chloe ally: autonomous wingman. Roams the whole arena on its own wide, lazy
  // path (does NOT trail the player — that felt dizzying) and fires homing bolts
  // at the nearest enemy. (No parrying.)
  function updateChloe(c, dt) {
    c.t += dt;
    // autonomous drift: a slow, wide Lissajous path across the arena, independent
    // of the player. phase spreads multiple wingmen onto different orbits.
    const tx = W / 2 + Math.cos(c.t * 0.5 + c.phase) * (W * 0.4);
    const ty = H * 0.38 + Math.sin(c.t * 0.7 + c.phase * 1.3) * (H * 0.3);
    c.x += (tx - c.x) * Math.min(1, dt * 1.3);
    c.y += (ty - c.y) * Math.min(1, dt * 1.3);
    c.x = Math.max(16, Math.min(W - 16, c.x));
    c.y = Math.max(16, Math.min(H - 16, c.y));
    // offensive: lob a homing bolt at whatever the missiles would target
    c.fireTimer -= dt;
    if (c.fireTimer <= 0) {
      const tgt = acquireTarget();
      if (tgt) {
        bullets.push({ x: c.x, y: c.y, vx: 0, vy: -360, w: 7, h: 13, dmg: 2, homing: true, target: tgt, chloe: true });
        sfx("shoot");
      }
      c.fireTimer = 0.4;
    }
  }

  function killEnemy(e) {
    boom(e.x, e.y, "#ff9d5c", 14);
    sfx("explode");
    score += 100 * (stageIndex + 1);
    if (e.carrier) dropItem(e.x, e.y);
    if (e.supply) {   // 보급 적기: 파워 + 미사일 아이템을 동시에 떨군다
      items.push({ x: e.x - 14, y: e.y, w: 20, h: 20, vy: 70, type: "power", t: 0 });
      items.push({ x: e.x + 14, y: e.y, w: 20, h: 20, vy: 70, type: "missile", t: 0 });
      sfx("missileget");
    }
  }

  // ---- explosions -----------------------------------------------------------
  function boom(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color });
    }
  }

  // ---- collision ------------------------------------------------------------
  function hit(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  }

  function hurtPlayer() {
    if (player.invuln > 0) return;
    player.lives--;
    player.power = Math.max(1, player.power - 1);   // 피격 시 파워 한 단계 하락
    player.invuln = 1.6;
    boom(player.x, player.y, "#ff6b6b", 30);
    shakeTime = 0.35;
    sfx("hit");
    if (player.lives < 0) gameOver();
  }

  function gameOver() {
    saveHigh();
    state = STATE.OVER;
    shakeTime = 0; flashTime = 0;
    sfx("over");
  }
  function saveHigh() {
    if (score > highScore) { highScore = score; persistSet("skystriker_high", highScore); }
  }

  // ---- story / cutscenes ----------------------------------------------------
  // A cutscene is a list of pages { art, lines[] }; Enter advances, last page runs onDone.
  function playCutscene(pages, onDone) { cutscene = { pages, page: 0, onDone }; state = STATE.STORY; }
  function advanceCutscene() {
    if (!cutscene) return;
    cutscene.page++;
    if (cutscene.page >= cutscene.pages.length) { const cb = cutscene.onDone; cutscene = null; cb(); }
  }
  function cutsceneBack() { if (cutscene && cutscene.page > 0) cutscene.page--; }

  // ---- pause menu -----------------------------------------------------------
  function handlePause() {
    if (pressed("KeyP") || pressed("Escape")) { state = prevState; return; }
    if (pressed("ArrowUp")) pauseSel = (pauseSel + 2) % 3;
    if (pressed("ArrowDown")) pauseSel = (pauseSel + 1) % 3;
    if (pressed("Enter")) {
      if (pauseSel === 0) state = prevState;               // 재개하기
      else if (pauseSel === 1) state = STATE.MENU;          // 메뉴로
      else if (pauseSel === 2) Neutralino.app.exit();       // 종료하기
    }
  }

  const INTRO_PAGES = [
    { art: "earth", lines: ["서기 24XX년.", "정체불명의 함대가 지구를 향해 몰려온다."] },
    { art: "earth", lines: ["당신은 지구 최후의 요격기,", "SKY STRIKER의 파일럿.", "", "임무는 단 하나 — 침략자를 격퇴하라."] },
  ];

  const REVEAL_PAGES = [
    { art: "ships", lines: ["최후의 적함이 침묵했다.", "지구는... 지켜졌다.", "", "그런데, 끊긴 줄 알았던 통신이 잡힌다."] },
    { art: "reveal", lines: ["「...어째서... 같은 편을 쏜 거야...?」", "", "적의 함선에서 흘러나온 건", "인간의 목소리였다."] },
    { art: "reveal", lines: ["그들은 외계인이 아니었다.", "먼 과거, 지구를 떠난 인류였다."] },
    { art: "blackhole", lines: ["블랙홀을 지나며 뒤틀린 시간선.", "그들이 돌아왔을 때,", "당신의 시대는 아득한 미래가 되어 있었다."] },
    { art: "reveal", lines: ["서로를 알아보지 못한 두 인류.", "이 전쟁은 — 거대한 오해였다."] },
  ];

  function firstEndPages() {
    return [
      { art: "earth", lines: ["지구는 지켰다.", "그러나 마음은 한없이 무겁다.", "", `SCORE ${score}`, "", "다시 싸워, 진실의 끝에 닿아라..."] },
    ];
  }

  const RETURN_PAGES = [
    { art: "blackhole", lines: ["다시 이 순간에 선 당신.", "이번엔 방아쇠를 당기지 않는다."] },
    { art: "blackhole", lines: ["블랙홀 너머로 —", "뒤틀린 시간선을 되돌리러 간다.", "", "떠난 인류의 함선을 구출하라.", "(가까이 다가가면 구출된다 · 사격 없음)"] },
  ];

  function trueEndPages() {
    return [
      { art: "rescue", lines: ["마지막 함선을 품에 안았다."] },
      { art: "blackhole", lines: ["뒤틀린 시간선이 제자리를 찾아간다.", "과거와 미래가 하나의 하늘로 이어진다."] },
      { art: "hatch", lines: ["마지막 함선의 해치가 열린다."] },
      { art: "emerge", lines: ["새로운 시작의 모습이 눈 앞에 나타났다."] },
      { art: "heart", lines: ["별과 별 사이, 잊혀진 시간을 건너", "두 시대의 마침표를 찍었다."] },
      { art: "earth", lines: ["두 인류는, 마침내 같은 지구 아래 선다.", "", "TRUE END", "", `FINAL SCORE ${score}`, "함께해줘서 고마워 🌏"] },
    ];
  }

  function badEndPages() {
    return [
      { art: "blackhole", lines: ["블랙홀의 인력이 함선을 삼킨다.", "조종간이 말을 듣지 않는다..."] },
      { art: "blackhole", lines: ["시간선은 끝내 뒤틀린 채 남았다.", "", "BAD END", "", `구출: ${rescuedCount} / ${hiddenTotal}`, "다시 도전하라..."] },
    ];
  }

  // Called when the final boss (stage 5) is defeated.
  function bossDefeated() {
    saveHigh();
    clears++;
    persistSet("skystriker_clears", clears);
    sfx("win");
    const pages = REVEAL_PAGES.slice();
    if (clears >= 2) {
      playCutscene(pages.concat(RETURN_PAGES), () => startHidden());
    } else {
      playCutscene(pages.concat(firstEndPages()), () => { state = STATE.MENU; });
    }
  }

  // ---- hidden stage: rescue the drifting ships in the black hole -------------
  function startHidden() {
    resetPlayer();
    if (typeof score !== "number") score = 0;          // guard debug entry (7) before a run starts
    bullets = []; enemies = []; eBullets = []; items = []; particles = []; missiles = [];
    boss = null; midboss = null;
    rescuedCount = 0; hiddenTime = 0;
    allies = [];
    const bx = W / 2, by = H * 0.30 + 30;               // black-hole centre
    const farSpawn = () => {                            // everyone starts well clear of the hole
      let x, y, tries = 0;
      do { x = 34 + Math.random() * (W - 68); y = 90 + Math.random() * (H - 240); tries++; }
      while (Math.hypot(x - bx, y - by) < 200 && tries < 40);
      return { x, y };
    };
    for (let i = 0; i < 1; i++) { const p = farSpawn(); allies.push({ type: "ship", x: p.x, y: p.y, vx: (Math.random() - 0.5) * 22, vy: (Math.random() - 0.5) * 22, rescued: false, t: Math.random() * 6 }); }
    for (let i = 0; i < 9; i++) { const p = farSpawn(); allies.push({ type: "astro", x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, rescued: false, t: Math.random() * 6 }); }
    hiddenTotal = allies.length;                        // must save them ALL
    state = STATE.HIDDEN;
  }

  function updateHidden(dt) {
    driftStars(dt);
    hiddenTime += dt;
    if (player.invuln > 0) player.invuln -= dt;
    movePlayer(dt);

    // black-hole gravity: the closer you drift, the harder it pulls you in
    const bhX = W / 2, bhY = H * 0.30 + 30;
    const gx = bhX - player.x, gy = bhY - player.y, gd = Math.hypot(gx, gy) || 1;
    const pull = Math.min(480, 195000 / (gd * gd));   // 1.5x of the original — firm but escapable
    player.x += (gx / gd) * pull * dt;
    player.y += (gy / gd) * pull * dt;
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
    player.y = Math.max(player.h / 2, Math.min(H - player.h / 2, player.y));
    if (Math.random() < 0.6) {
      const ang = hiddenTime * 3 + Math.random() * 6, r = 55 + Math.random() * 60;
      particles.push({ x: bhX + Math.cos(ang) * r, y: bhY + Math.sin(ang) * r, vx: -Math.cos(ang) * 90, vy: -Math.sin(ang) * 90, life: 0.6, color: "#8a7aff" });
    }
    if (gd < 16) {   // swallowed by the singularity → bad ending
      boom(player.x, player.y, "#8a7aff", 40); sfx("hit");
      playCutscene(badEndPages(), () => { state = STATE.MENU; });
      return;
    }

    for (const a of allies) {
      if (a.rescued) continue;
      a.t += dt;
      if (a.type === "astro") {                          // astronauts drift toward the hole (gently)
        const ax = bhX - a.x, ay = bhY - a.y, ad = Math.hypot(ax, ay) || 1;
        a.vx += (ax / ad) * 27 * dt; a.vy += (ay / ad) * 27 * dt;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 60) { a.vx = a.vx / sp * 60; a.vy = a.vy / sp * 60; }   // 1.5x — needs urgency but catchable
        a.x += a.vx * dt; a.y += a.vy * dt;
      } else {                                           // ships drift and bounce off the edges
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < 30 || a.x > W - 30) a.vx *= -1;
        if (a.y < 80 || a.y > H - 150) a.vy *= -1;
        a.x = Math.max(30, Math.min(W - 30, a.x));
        a.y = Math.max(80, Math.min(H - 150, a.y));
      }
      if (Math.hypot(a.x - player.x, a.y - player.y) < 34) {   // rescued
        a.rescued = true; rescuedCount++;
        boom(a.x, a.y, "#7fffe0", 22); sfx("life");
        continue;
      }
      if (Math.hypot(a.x - bhX, a.y - bhY) < 16) {             // swallowed → you failed someone → bad end
        boom(a.x, a.y, "#8a7aff", 30); sfx("hit");
        playCutscene(badEndPages(), () => { state = STATE.MENU; });
        return;
      }
    }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    if (rescuedCount >= hiddenTotal) {
      saveHigh();
      playCutscene(trueEndPages(), () => { state = STATE.MENU; });
    }
  }

  // ---- update ---------------------------------------------------------------
  function update(dt) {
    driftStars(dt);

    if (state !== STATE.PLAY) {
      if (state === STATE.CLEAR) {
        clearTimer -= dt;
        if (clearTimer <= 0) {
          stageIndex++;
          spawnedThisStage = 0; spawnTimer = 0;
          midboss = null; midbossSpawned = false; midbossDone = false; resetStageItems();
          if (STAGES[stageIndex].boss) spawnBoss();
          state = STATE.PLAY;
        }
      }
      return;
    }

    if (shakeTime > 0) shakeTime -= dt;
    if (flashTime > 0) flashTime -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.parryActive > 0) player.parryActive -= dt;
    if (player.parryCd > 0) player.parryCd -= dt;
    if (player.cooldown > 0) player.cooldown -= dt;
    if (player.emp > 0) player.emp -= dt;   // EMP 마비 지속시간
    if (player.frenzy > 0) player.frenzy -= dt;   // 폭주 모드 남은 시간

    movePlayer(dt);
    if (disco) particles.push({ x: player.x, y: player.y + 10, vx: (Math.random() - 0.5) * 20, vy: 70, life: 0.5, color: `hsl(${(performance.now() / 5) % 360},90%,62%)` });

    // Z = fire, X = parry, C = bomb (when charged)
    // EMP에 맞으면 Z 공격과 C 폭탄이 멈춘다 — 실드(X)와 유도 미사일만 살아있다.
    // 패링(방어) 중에는 공격/폭탄을 쏠 수 없다 — 반사에 집중.
    if ((keys.KeyZ || player.frenzy > 0) && player.cooldown <= 0 && player.emp <= 0 && player.parryActive <= 0) playerFire();
    if (pressed("KeyX")) activateParry();
    if (pressed("KeyC") && player.charge >= 100 && player.emp <= 0 && player.parryActive <= 0) bombSkill();

    // auto homing missiles: fired ONE at a time, one per step in sequence.
    // 큐에 쌓인 미사일은 항상 순차 발사한다 — 폭주 20발은 미사일 미보유여도 나간다.
    if (player.missileGap > 0) player.missileGap -= dt;
    if (player.missileQueue > 0 && player.missileGap <= 0 && player.parryActive <= 0) {
      missiles.push({ x: player.x, y: player.y - 12, vx: 0, vy: -480, w: 9, h: 16, target: null, life: 4 });
      player.missileQueue--;
      player.missileGap = 0.14;
      sfx("missile");
    }
    // 리로드는 미사일을 보유(missileLevel 1~5)했을 때만. missileLevel = 한 번에 재장전할 발수.
    if (player.missileLevel > 0) {
      player.missileTimer -= dt;
      if (player.missileTimer <= 0 && player.missileQueue <= 0 && acquireTarget()) {
        player.missileQueue = player.missileLevel;
        player.missileTimer = 0.85;
      }
    }

    // player bullets (reflected ones home in)
    for (const b of bullets) {
      if (b.homing) {
        if (!b.target || b.target.hp <= 0) b.target = acquireTarget();
        if (b.target) {
          const bx = b.target.x - b.x, by = b.target.y - b.y, d = Math.hypot(bx, by) || 1;
          const sp = 1300; b.vx = bx / d * sp; b.vy = by / d * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    bullets = bullets.filter((b) => b.y > -30 && b.y < H + 30 && b.x > -30 && b.x < W + 30);

    const cfg = STAGES[stageIndex];

    // 파워가 1~2로 떨어지면 보급 적기를 보내 파워·미사일을 보충하게 한다 (동시에 1기만)
    if (supplyCd > 0) supplyCd -= dt;
    if (player.power <= 2 && supplyCd <= 0 && !enemies.some((e) => e.supply)) {
      spawnSupply(); supplyCd = 12;
    }

    // spawn / mid-boss / clear flow
    if (!cfg.boss) {
      if (spawnedThisStage < cfg.quota) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) { spawnWave(); spawnTimer = cfg.spawn; }
      } else if (enemies.length === 0 && !midboss) {
        if (cfg.midboss && !midbossSpawned) { spawnMidboss(); midbossSpawned = true; }
        else if (!cfg.midboss || midbossDone) {
          // safety net: if no carrier happened to drop the guaranteed heart, drop it now near the player
          if (stageItem.life < stageItem.lifeMax) { stageItem.life++; items.push({ x: player.x, y: player.y - 90, w: 20, h: 20, vy: 55, type: "life", t: 0 }); }
          state = STATE.CLEAR; clearTimer = 2.2; sfx("clear");
        }
      }
    }

    // enemies: movement + firing
    for (const e of enemies) {
      e.t += dt;
      if (e.move === "zigzag") { e.y += e.vy * dt; e.x = e.baseX + Math.sin(e.t * 3) * 70; }
      else if (e.move === "drift") { e.y += e.vy * dt; e.x += Math.cos(e.t * 1.5) * 50 * dt; }
      else if (e.move === "dive") {
        if (!e.diveVx && e.y > 40) e.diveVx = (Math.sign(player.x - e.x) || 1) * 150;
        e.y += e.vy * dt; e.x += (e.diveVx || 0) * dt;
      } else { e.y += e.vy * dt; }
      e.x = Math.max(e.w / 2, Math.min(W - e.w / 2, e.x));
      if (e.fire !== "none") {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y < H * 0.75) { enemyShoot(e); e.fireTimer = ETYPE[e.type].every * (0.8 + Math.random() * 0.5) * (stageIndex === 0 ? 1.9 : 1); }
      }
    }

    // player bullets vs enemies
    for (const b of bullets) {
      if (b.y < -900) continue;
      for (const e of enemies) {
        if (e.hp > 0 && hit(b, e)) {
          e.hp -= (b.dmg || 1); b.y = -999;
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
    }
    // player bullets vs mid-boss / boss
    for (const tgt of [midboss, boss]) {
      if (!tgt || tgt.entering) continue;
      for (const b of bullets) {
        if (b.y < -900) continue;
        if (hit(b, tgt)) { tgt.hp -= (b.dmg || 1); b.y = -999; boom(b.x, b.y, "#ffd35c", 3); score += 10; }
      }
    }

    enemies = enemies.filter((e) => e.hp > 0 && e.y < H + 50);
    bullets = bullets.filter((b) => b.y > -900);

    if (boss) updateBoss(dt);
    if (midboss) updateMidboss(dt);
    if (missiles.length) updateMissiles(dt);
    for (const c of companions) updateChloe(c, dt);

    // enemy bullets: homing steer + firework shells that burst into rings
    const spawnedEB = [];
    for (const eb of eBullets) {
      if (eb.homing) {
        // 유도탄은 수명 없이 주인공을 끝까지 추적하고, 시간이 갈수록 점점 빨라진다 —
        // 결국 이동속도로는 뿌리칠 수 없어 맞거나 패링(반사)해야만 한다.
        eb.sp = Math.min(780, eb.sp + 210 * dt);
        const hx = player.x - eb.x, hy = player.y - eb.y, hd = Math.hypot(hx, hy) || 1;
        const k = Math.min(1, dt * 3.4);
        eb.vx += (hx / hd * eb.sp - eb.vx) * k;
        eb.vy += (hy / hd * eb.sp - eb.vy) * k;
      }
      if (eb.fuse !== undefined && !eb.burst) {
        eb.fuse -= dt;
        if (eb.fuse <= 0) {
          const n = eb.burstN, sp = eb.burstSp, rot = eb.burstRot || 0;
          for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; spawnedEB.push(mkeb(eb.x, eb.y, Math.cos(a) * sp, Math.sin(a) * sp)); }
          boom(eb.x, eb.y, "#ffe066", 16); sfx("power");   // the "팡!" firework pop
          eb.burst = true;
        }
      }
      eb.x += eb.vx * dt; eb.y += eb.vy * dt;
    }
    eBullets = eBullets.filter((b) => !b.burst && b.y < H + 20 && b.y > -30 && b.x > -30 && b.x < W + 30);
    if (spawnedEB.length) eBullets.push(...spawnedEB);

    // bonus "Chloe UFO" — spawns periodically, shoot it for a reward
    if (!bonus) {
      // A Chloe UFO appears at most once per stage (only in the 50%-chance stages),
      // and never once we already have the max number of allies.
      if (stageUfo && !ufoUsedThisStage && companions.length < COMPANION_MAX) {
        bonusTimer -= dt;
        if (bonusTimer <= 0) { spawnBonus(); ufoUsedThisStage = true; }
      }
    }
    else {
      bonus.t += dt; bonus.x += bonus.vx * dt; bonus.y += Math.sin(bonus.t * 3) * 30 * dt;
      if (bonus.hitFx > 0) bonus.hitFx -= dt;
      for (const b of bullets) {
        if (b.y < -900) continue;
        if (hit(b, bonus)) {
          b.y = -999; bonus.hp -= (b.dmg || 1); bonus.hitFx = 0.12;
          boom(bonus.x, bonus.y, "#e0b0ff", 6); sfx("hit");
          if (bonus.hp <= 0) { hitBonus(); break; }
        }
      }
      if (bonus && (bonus.x < -40 || bonus.x > W + 40)) bonus = null;
    }

    // items
    for (const it of items) { it.y += it.vy * dt; it.t += dt; }
    for (const it of items) {
      if (hit(it, player)) {
        it.y = H + 999;
        score += 50;
        if (it.type === "power") { player.power = Math.min(POWER_MAX, player.power + 1); sfx("power"); }
        else if (it.type === "missile") { player.missileLevel = Math.min(MISSILE_MAX, player.missileLevel + 1); player.missileTimer = 0; sfx("missileget"); }
        else if (it.type === "life") { player.lives = Math.min(5, player.lives + 1); sfx("life"); }
      }
    }
    items = items.filter((it) => it.y < H + 30);

    // parry: during the active window, reflect enemy bullets within a small radius
    if (player.parryActive > 0) {
      const pr2 = 46 * 46;
      let blocked = false;
      for (const eb of eBullets) {
        if (eb.y > H + 100) continue;   // 이제 유도탄·불꽃탄 포함 모든 탄을 반사할 수 있다
        const ddx = eb.x - player.x, ddy = eb.y - player.y;
        if (ddx * ddx + ddy * ddy < pr2) { reflectBullet(eb); eb.y = H + 999; blocked = true; }
      }
      // blocking a shot freezes the parry window → keep blocking, keep parrying
      if (blocked) player.parryActive = 0.4;
    }

    // enemy things vs player — use a small "core" hitbox (much smaller than the
    // 30x34 sprite) so grazing enemy fire is far more forgiving.
    const pbody = { x: player.x, y: player.y, w: 12, h: 14 };
    for (const eb of eBullets) if (eb.y < H + 100 && hit(eb, pbody)) { eb.y = H + 999; hurtPlayer(); }
    for (const e of enemies) if (e.hp > 0 && hit(e, pbody)) { e.hp = 0; boom(e.x, e.y, "#ff9d5c", 14); hurtPlayer(); }
    eBullets = eBullets.filter((b) => b.y < H + 20);

    // particles
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
  }

  // Mid-boss = a satellite with a personality-driven move set. Both share a core
  // repertoire (aimed spread, spirals, summoned fighters) but each gets a SIGNATURE
  // move so its character reads clearly, and cycles a fixed order rather than firing
  // randomly. (Laser + homing bolts were dropped to avoid overlap with the final boss.)
  //   · Apollo cruiser → "솔라윙 크로스빔": twin sweeping beams off its solar panels.
  //   · Space station  → "중력장": a gravity well that drags you toward it + a ring.
  const MIDBOSS_ROUTINE = {
    apollo: ["spread", "spiral", "firework", "solarwing", "summon"],
    station: ["spread", "radial", "wall", "gravity", "summon"],
  };

  function updateMidboss(dt) {
    const m = midboss;
    if (m.entering) { m.y += 70 * dt; if (m.y >= 70) { m.y = 70; m.entering = false; } return; }
    m.x += m.dir * 120 * dt;
    if (m.x < m.w / 2) { m.x = m.w / 2; m.dir = 1; }
    if (m.x > W - m.w / 2) { m.x = W - m.w / 2; m.dir = -1; }

    const rage = 1 - m.hp / m.maxHp;                 // denser/faster as it takes damage
    const cx = m.x, cy = m.y + m.h / 2, fs = 1 + rage * 0.4;

    // 중력장(스테이션 시그니처): 발동 중엔 플레이어를 위성 쪽으로 끌어당긴다 — 반대로 이동하면 벗어남.
    if (m.gravityTimer > 0) {
      m.gravityTimer -= dt;
      const gx = m.x - player.x, gy = cy - player.y, gd = Math.hypot(gx, gy) || 1;
      player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x + (gx / gd) * 240 * dt));
      player.y = Math.max(player.h / 2, Math.min(H - player.h / 2, player.y + (gy / gd) * 240 * dt));
      if (Math.random() < 0.7) particles.push({ x: player.x + (Math.random() - 0.5) * 40, y: player.y + (Math.random() - 0.5) * 40, vx: (m.x - player.x) * 0.6, vy: (cy - player.y) * 0.6, life: 0.4, color: "#9a7bff" });
    }

    m.patternTimer -= dt;
    if (m.patternTimer <= 0) {
      const routine = MIDBOSS_ROUTINE[m.kind] || MIDBOSS_ROUTINE.apollo;
      m.pattern = (m.pattern + 1) % routine.length;
      m.patternTimer = 1.25 - rage * 0.45;
      switch (routine[m.pattern]) {
        case "spread": {                           // aimed spread — 9 pellets
          const a = aim(cx, cy, 1), base = Math.atan2(a.vy, a.vx);
          for (let k = -4; k <= 4; k++) { const ang = base + k * 0.16; eBullets.push(mkeb(cx, cy, Math.cos(ang) * 300 * fs, Math.sin(ang) * 300 * fs)); }
          break;
        }
        case "radial": {                           // dense downward radial — 24
          const n = 24;
          for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2; eBullets.push(mkeb(cx, cy, Math.cos(ang) * 200 * fs, Math.abs(Math.sin(ang)) * 200 * fs + 45)); }
          break;
        }
        case "spiral": {                           // rotating spiral
          m.angle += 0.5; const n = 16;
          for (let i = 0; i < n; i++) { const ang = m.angle + (i / n) * Math.PI * 2; eBullets.push(mkeb(cx, cy, Math.cos(ang) * 220 * fs, Math.abs(Math.sin(ang) * 220 * fs) + 50)); }
          break;
        }
        case "summon": {                           // launch fighter planes from the bays
          const pool = STAGES[stageIndex].pool || ["basic", "zigzag"];
          const n = 3 + Math.round(rage * 2);
          for (let i = 0; i < n; i++) spawnEnemy(pool[(Math.random() * pool.length) | 0], 45 + Math.random() * (W - 90), m.y + 24);
          sfx("power");
          break;
        }
        case "firework": {                         // lob shells that burst into rings ("팡!")
          const shells = 3 + Math.round(rage * 2);
          for (let i = 0; i < shells; i++) {
            const ang = Math.PI * (0.28 + 0.44 * (shells === 1 ? 0.5 : i / (shells - 1)));
            eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 165, vy: Math.sin(ang) * 165, w: 12, h: 12, fuse: 0.6, burstN: 12 + Math.round(rage * 8), burstSp: 190 + rage * 90, burstRot: m.angle, firework: true });
          }
          sfx("missile");
          break;
        }
        case "solarwing": {                        // APOLLO 시그니처: 태양광 패널에서 뻗어나오는 크로스 빔
          m.angle += 0.6;
          for (const s of [-1, 1]) {
            const px = cx + s * m.w * 0.42;         // fire from each solar-panel tip, sweeping inward
            for (let i = 0; i < 10; i++) {
              const ang = Math.PI / 2 - s * 0.5 + Math.sin(m.angle + i * 0.5) * 0.25;
              eBullets.push(mkeb(px, cy, Math.cos(ang) * 260 * fs, Math.sin(ang) * 260 * fs));
            }
          }
          sfx("reflect");
          break;
        }
        case "wall": {                             // STATION: 안전한 틈이 있는 탄막 벽
          const gap = 70 + Math.random() * (W - 140), gapW = 96 - rage * 32;
          for (let x = 16; x < W - 16; x += 15) { if (Math.abs(x - gap) < gapW / 2) continue; eBullets.push(mkeb(x, cy - 6, 0, 220 * fs)); }
          break;
        }
        case "gravity": {                          // STATION 시그니처: 강력한 중력장 발동 + 방사탄
          m.gravityTimer = 1.5;
          const n = 28;
          for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2; eBullets.push(mkeb(cx, cy, Math.cos(ang) * 150 * fs, Math.abs(Math.sin(ang)) * 150 * fs + 30)); }
          shakeTime = Math.max(shakeTime, 0.2);
          sfx("bossexplode");
          break;
        }
      }
    }
    if (m.hp <= 0) {
      boom(m.x, m.y, "#ffa64d", 45); boom(m.x, m.y, "#fff", 25);
      sfx("bossexplode");
      score += 1500; midboss = null; midbossDone = true;
    }
  }

  function updateBoss(dt) {
    if (boss.entering) {
      boss.y += 60 * dt;
      if (boss.y >= 90) { boss.y = 90; boss.entering = false; }
      return;
    }
    const phase2 = boss.hp < boss.maxHp * 0.5;
    boss.x += boss.dir * (phase2 ? 140 : 95) * dt;
    if (boss.x < boss.w / 2) { boss.x = boss.w / 2; boss.dir = 1; }
    if (boss.x > W - boss.w / 2) { boss.x = W - boss.w / 2; boss.dir = -1; }

    // rage rises from 0 → 1 as the boss loses HP: denser, faster, more lasers
    const rage = 1 - boss.hp / boss.maxHp;

    // charged laser sub-state takes over the boss while charging/firing
    if (boss.laserState === "charge") {
      boss.laserTimer -= dt;
      if (boss.laserXs.length === 1) boss.laserXs[0] += (player.x - boss.laserXs[0]) * Math.min(1, dt * 1.6);
      if (boss.laserTimer <= 0) { boss.laserState = "fire"; boss.laserTimer = 0.9; sfx("bossexplode"); }
    } else if (boss.laserState === "fire") {
      boss.laserTimer -= dt;
      for (const lx of boss.laserXs) if (player.y > boss.y && Math.abs(player.x - lx) < 26) { hurtPlayer(); break; }
      if (boss.laserTimer <= 0) { boss.laserState = "off"; boss.patternTimer = 1.0; }
    } else {
      boss.patternTimer -= dt;
      if (boss.patternTimer <= 0) {
        boss.pattern = (boss.pattern + 1) % 12;
        boss.patternTimer = 1.2 - rage * 0.8;                      // fires faster while enraged
        const cx = boss.x, cy = boss.y + boss.h / 2, P = boss.pattern;
        const fs = 1 + rage * 0.5;                                 // bullets speed up as it rages
        if (P === 0) {                                             // wide fan
          const n = Math.round(28 + rage * 30);
          for (let i = 0; i < n; i++) { const a = Math.PI * (0.05 + 0.9 * (i / (n - 1))); eBullets.push(mkeb(cx, cy, Math.cos(a) * 250 * fs, Math.sin(a) * 250 * fs)); }
        } else if (P === 1) {                                      // aimed spread
          const a = aim(cx, cy, 1), base = Math.atan2(a.vy, a.vx), k = Math.round(4 + rage * 5), sp = 340 * fs;
          for (let i = -k; i <= k; i++) { const ang = base + i * 0.1; eBullets.push(mkeb(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp)); }
        } else if (P === 2) {                                      // rotating spiral
          boss.angle += 0.4; const n = Math.round(18 + rage * 18);
          for (let i = 0; i < n; i++) { const a = boss.angle + (i / n) * Math.PI * 2; eBullets.push(mkeb(cx, cy, Math.cos(a) * 210 * fs, Math.abs(Math.sin(a) * 210 * fs) + 50)); }
        } else if (P === 3) {                                      // counter double spiral
          boss.angle += 0.35; const n = Math.round(14 + rage * 16);
          for (let i = 0; i < n; i++) {
            const a1 = boss.angle + (i / n) * Math.PI * 2, a2 = -boss.angle + (i / n) * Math.PI * 2;
            eBullets.push(mkeb(cx, cy, Math.cos(a1) * 200 * fs, Math.abs(Math.sin(a1) * 200 * fs) + 40));
            eBullets.push(mkeb(cx, cy, Math.cos(a2) * 200 * fs, Math.abs(Math.sin(a2) * 200 * fs) + 40));
          }
        } else if (P === 4) {                                      // random shotgun spray
          const n = Math.round(32 + rage * 36);
          for (let i = 0; i < n; i++) { const ang = Math.PI * (0.08 + 0.84 * Math.random()), sp = (180 + Math.random() * 200) * fs; eBullets.push(mkeb(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp)); }
        } else if (P === 5) {                                      // bullet wall with a gap
          const gap = 70 + Math.random() * (W - 140), gapW = 100 - rage * 40;
          for (let x = 16; x < W - 16; x += 14) { if (Math.abs(x - gap) < gapW / 2) continue; eBullets.push(mkeb(x, cy - 10, 0, 260 * fs)); }
        } else if (P === 6) {                                      // firework shells → burst into rings ("팡!")
          const shells = 4 + Math.round(rage * 4);
          for (let i = 0; i < shells; i++) {
            const ang = Math.PI * (0.24 + 0.52 * (shells === 1 ? 0.5 : i / (shells - 1)));
            eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * 170, vy: Math.sin(ang) * 170, w: 12, h: 12, fuse: 0.55, burstN: 16 + Math.round(rage * 14), burstSp: 210 + rage * 120, burstRot: Math.random() * 6, firework: true });
          }
          sfx("missile");
        } else if (P === 7) {                                      // fast aimed needles (fun to parry)
          const a = aim(cx, cy, 1), base = Math.atan2(a.vy, a.vx), sp = 520 + rage * 170;
          for (let i = -5; i <= 5; i++) { const ang = base + i * 0.04; eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 6, h: 16, needle: true }); }
        } else if (P === 8) {                                      // homing missile SWARM
          const n = 16 + Math.round(rage * 16);
          for (let i = 0; i < n; i++) {
            const spread = (i - (n - 1) / 2);
            eBullets.push({ x: cx + spread * 12, y: cy, vx: spread * 45, vy: 160, w: 12, h: 12, homing: true, sp: (300 + rage * 160) * 1.5 });
          }
          sfx("missile");
        } else if (P === 9) {                                      // ultra-fast rail shots — parryable, but only just
          const a = aim(cx, cy, 1), base = Math.atan2(a.vy, a.vx);
          const sp = 900 + rage * 240;
          const n = 1 + Math.round(rage * 2);                      // 1 → 3 shots as it rages
          for (let i = 0; i < n; i++) {
            const ang = base + (i - (n - 1) / 2) * 0.05;
            eBullets.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 7, h: 22, needle: true, fastshot: true });
          }
          sfx("reflect");                                          // sharp zip telegraph
        } else if (P === 10 && !boss.empBroken) {                  // EMP 파 — 맞으면 공격·C 정지 (실드·미사일만)
          boss.empWave = { r: 0, hit: false };
          shakeTime = Math.max(shakeTime, 0.25);
          sfx("hit");
        } else if (P === 10) {                                     // EMP 고장 — 3단 스킬에 맞아 발사 실패, 헛도는 스파크만
          for (let i = 0; i < 10; i++) particles.push({ x: cx + (Math.random() - 0.5) * 40, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.3, color: "#5cd0ff" });
          sfx("hit");
        } else {                                                   // charged laser(s) — always multi now
          const beams = rage < 0.35 ? 2 : rage < 0.7 ? 3 : 4;
          boss.laserXs = Array.from({ length: beams }, (_, i) => (W * (i + 1)) / (beams + 1));
          boss.laserState = "charge"; boss.laserTimer = 1.1 - rage * 0.5;
        }
      }
    }
    // EMP shockwave: an expanding ring; when it reaches the player it locks out
    // Z-fire and the C bomb for a while (shield + missiles keep working).
    if (boss.empWave) {
      boss.empWave.r += 520 * dt;
      const pd = Math.hypot(player.x - boss.x, player.y - (boss.y + boss.h / 2));
      if (!boss.empWave.hit && boss.empWave.r >= pd) {
        boss.empWave.hit = true; player.emp = 3.5;
        flashTime = Math.max(flashTime, 0.25); shakeTime = Math.max(shakeTime, 0.3);
        sfx("reflect");
      }
      if (boss.empWave.r > 1000) boss.empWave = null;
    }
    if (boss.hp <= 0) {
      boom(boss.x, boss.y, "#ff8ad1", 60);
      boom(boss.x - 30, boss.y + 10, "#ffd35c", 40);
      boom(boss.x + 30, boss.y - 10, "#5ad1ff", 40);
      sfx("bossexplode");
      score += 5000;
      boss = null;
      if (endless) nextEndlessLoop(); else bossDefeated();
    }
  }

  // ---- rendering ------------------------------------------------------------
  function drawStars() {
    for (let i = 0; i < starLayers.length; i++) {
      ctx.fillStyle = disco ? `hsl(${(performance.now() / 10 + i * 90) % 360},80%,66%)` : ["#2a3a66", "#48619e", "#9fb8ff"][i];
      const size = i + 1;
      for (const s of starLayers[i]) ctx.fillRect(s.x, s.y, size, size);
    }
  }

  function drawShip(x, y, blink) {
    if (blink && Math.floor(performance.now() / 80) % 2 === 0) return;
    ctx.save();
    ctx.translate(x, y);
    if (player.parryActive > 0) {
      ctx.strokeStyle = "rgba(180,240,255,0.95)";
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(120,255,224,0.5)";
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke();
    }
    // Futuristic interceptor: dark hull with glowing cyan edges + twin engines,
    // deliberately sleeker than the enemies' bulky rocket/satellite silhouettes.
    const f = 5 + Math.random() * 6;
    ctx.fillStyle = "#ffb14d";                        // twin engine flames (thrust up)
    ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(-5, 12 + f); ctx.lineTo(-2, 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 12); ctx.lineTo(5, 12 + f); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0e2c46";                        // hull
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(5, -6); ctx.lineTo(17, 15); ctx.lineTo(6, 11);
    ctx.lineTo(0, 6); ctx.lineTo(-6, 11); ctx.lineTo(-17, 15); ctx.lineTo(-5, -6); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#5ad1ff"; ctx.lineWidth = 2; ctx.stroke();   // glowing edge
    ctx.fillStyle = "#2b8fd0";                        // wing accents
    ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(17, 15); ctx.lineTo(7, 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(-17, 15); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#dff6ff";                        // cockpit canopy
    ctx.beginPath(); ctx.ellipse(0, -7, 3.2, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    // Enemies are drawn as HUMAN spacecraft (rockets / satellites / a station
    // module) — a visual hint that the "invaders" are people, not aliens.
    ctx.save(); ctx.translate(e.x, e.y);
    const w = e.w, h = e.h;
    if (e.type === "tank") {                         // space-station module
      ctx.fillStyle = "#2b60c0";
      ctx.fillRect(-w / 2, -h * 0.28, w * 0.26, h * 0.56);
      ctx.fillRect(w / 2 - w * 0.26, -h * 0.28, w * 0.26, h * 0.56);
      ctx.strokeStyle = "#12306a"; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { const gx = -w / 2 + (w * 0.26) * i / 3; ctx.beginPath(); ctx.moveTo(gx, -h * 0.28); ctx.lineTo(gx, h * 0.28); ctx.stroke(); }
      ctx.fillStyle = "#4a5680"; ctx.fillRect(-w * 0.2, -h / 2, w * 0.4, h);
      ctx.fillStyle = e.color; ctx.fillRect(-w * 0.2, -h / 2, w * 0.4, 6);
      ctx.fillStyle = "#ffd35c"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "zigzag" || e.type === "shooter") {  // satellite
      ctx.fillStyle = "#2b60c0";
      ctx.fillRect(-w / 2, -4, w * 0.3, 8);
      ctx.fillRect(w / 2 - w * 0.3, -4, w * 0.3, 8);
      ctx.strokeStyle = "#12306a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w * 0.35, -4); ctx.lineTo(-w * 0.35, 4); ctx.moveTo(w * 0.35, -4); ctx.lineTo(w * 0.35, 4); ctx.stroke();
      ctx.fillStyle = "#c9d4ff"; ctx.fillRect(-w * 0.16, -h / 2, w * 0.32, h);
      ctx.fillStyle = e.color; ctx.fillRect(-w * 0.16, h / 2 - 6, w * 0.32, 6);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -h * 0.16, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {                                          // rocket (basic / fast)
      ctx.fillStyle = "#e6ecff";
      ctx.fillRect(-w * 0.16, -h / 2, w * 0.32, h * 0.72);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(-w * 0.16, h * 0.22); ctx.lineTo(w * 0.16, h * 0.22); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#8aa0d0";
      ctx.beginPath(); ctx.moveTo(-w * 0.16, -h / 2); ctx.lineTo(-w / 2, -h * 0.28); ctx.lineTo(-w * 0.16, -h * 0.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.16, -h / 2); ctx.lineTo(w / 2, -h * 0.28); ctx.lineTo(w * 0.16, -h * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#3a6aff"; ctx.beginPath(); ctx.arc(0, -h * 0.1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffb14d"; const f = 3 + Math.random() * 4;
      ctx.beginPath(); ctx.moveTo(-4, -h / 2); ctx.lineTo(0, -h / 2 - f); ctx.lineTo(4, -h / 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (e.carrier) {
      const a = 0.5 + 0.4 * Math.sin(performance.now() / 120);
      ctx.strokeStyle = `rgba(255,214,102,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.w / 2 + 6, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.maxHp > 3) {
      ctx.fillStyle = "#400"; ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2 - 6, e.w, 3);
      ctx.fillStyle = "#6f6"; ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2 - 6, e.w * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  // Mid-boss #1 (stage 2): an Apollo-era cruiser — solar trusses, stacked modules,
  // a command capsule at the prow, and a comms dish.
  function drawMidbossApollo(m) {
    const mw = m.w, mh = m.h;
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.strokeStyle = "#8a97b8"; ctx.lineWidth = 3;             // trusses
    ctx.beginPath(); ctx.moveTo(-mw * 0.42, 0); ctx.lineTo(mw * 0.42, 0); ctx.stroke();
    ctx.fillStyle = "#1f4fae";                                 // solar panels
    ctx.fillRect(-mw / 2, -mh * 0.22, mw * 0.24, mh * 0.44);
    ctx.fillRect(mw / 2 - mw * 0.24, -mh * 0.22, mw * 0.24, mh * 0.44);
    ctx.strokeStyle = "#0f2f6a"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const gx = -mw / 2 + (mw * 0.24) * i / 4; ctx.beginPath(); ctx.moveTo(gx, -mh * 0.22); ctx.lineTo(gx, mh * 0.22); ctx.stroke(); }
    ctx.fillStyle = "#c2ccdf";                                 // central module stack
    ctx.fillRect(-mw * 0.14, -mh / 2, mw * 0.28, mh * 0.82);
    ctx.strokeStyle = "#8a97b8"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const gy = -mh / 2 + (mh * 0.82) * i / 4; ctx.beginPath(); ctx.moveTo(-mw * 0.14, gy); ctx.lineTo(mw * 0.14, gy); ctx.stroke(); }
    ctx.fillStyle = "#e6ecff";                                 // command capsule (prow, down)
    ctx.beginPath(); ctx.moveTo(-mw * 0.13, mh * 0.32); ctx.lineTo(mw * 0.13, mh * 0.32); ctx.lineTo(0, mh * 0.52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffd35c"; ctx.beginPath(); ctx.arc(0, -mh * 0.34, 7, 0, Math.PI * 2); ctx.fill();  // dish
    ctx.fillStyle = m.hp < m.maxHp * 0.5 ? "#ff5c5c" : "#fff2cc";
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();   // core weakpoint
    ctx.restore();
  }

  // Mid-boss #2 (stage 4): a HUGE space station — long solar wings on outrigger
  // trusses, a stack of ringed habitation drums, a slowly-rotating docking ring,
  // and twin comms dishes. Deliberately dwarfs the Apollo cruiser.
  function drawMidbossStation(m) {
    const mw = m.w, mh = m.h, t = performance.now() / 1000;
    ctx.save(); ctx.translate(m.x, m.y);
    // outrigger trusses + big solar wings
    ctx.strokeStyle = "#7f8db0"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-mw * 0.5, 0); ctx.lineTo(mw * 0.5, 0); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#173e8f";
      ctx.fillRect(s > 0 ? mw * 0.30 : -mw * 0.5, -mh * 0.30, mw * 0.20, mh * 0.60);
      ctx.strokeStyle = "#0c2456"; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const gx = (s > 0 ? mw * 0.30 : -mw * 0.5) + (mw * 0.20) * i / 4; ctx.beginPath(); ctx.moveTo(gx, -mh * 0.30); ctx.lineTo(gx, mh * 0.30); ctx.stroke(); }
      for (let i = 1; i < 4; i++) { const gy = -mh * 0.30 + (mh * 0.60) * i / 4; ctx.beginPath(); ctx.moveTo(s > 0 ? mw * 0.30 : -mw * 0.5, gy); ctx.lineTo(s > 0 ? mw * 0.5 : -mw * 0.30, gy); ctx.stroke(); }
    }
    // central spine
    ctx.fillStyle = "#39435f";
    ctx.fillRect(-mw * 0.05, -mh * 0.5, mw * 0.10, mh);
    // stack of ringed habitation drums
    for (let i = 0; i < 3; i++) {
      const dy = -mh * 0.30 + i * mh * 0.30, rw = mw * (0.20 - i * 0.02), rh = mh * 0.13;
      ctx.fillStyle = "#cdd6e8"; ctx.beginPath(); ctx.ellipse(0, dy, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8a97b8"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#7fb0ff"; for (let k = -2; k <= 2; k++) { ctx.fillRect(k * rw * 0.34 - 1.5, dy - 2, 3, 4); }  // portholes
    }
    // rotating docking ring at the prow
    ctx.save(); ctx.translate(0, mh * 0.42); ctx.rotate(t * 0.8);
    ctx.strokeStyle = "#e6ecff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, mw * 0.14, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#8a97b8"; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * mw * 0.14, Math.sin(a) * mw * 0.14); ctx.stroke(); }
    ctx.restore();
    // twin comms dishes up top
    for (const s of [-1, 1]) { ctx.fillStyle = "#ffd35c"; ctx.beginPath(); ctx.arc(s * mw * 0.10, -mh * 0.5, 8, 0, Math.PI * 2); ctx.fill(); }
    // glowing core weakpoint
    const pulse = 0.6 + 0.4 * Math.sin(t * 5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = m.hp < m.maxHp * 0.5 ? "#ff5c5c" : "#fff2cc";
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMidboss() {
    const m = midboss;
    if (m.kind === "station") drawMidbossStation(m); else drawMidbossApollo(m);
    // gravity well: concentric rings pulsing inward toward the station
    if (m.gravityTimer > 0) {
      const t = performance.now() / 1000, cyw = m.y + m.h / 2;
      ctx.strokeStyle = `rgba(154,123,255,${0.4 + 0.3 * Math.sin(t * 10)})`; ctx.lineWidth = 2;
      for (let i = 1; i <= 3; i++) { const r = 34 * i - (t * 46) % 34; ctx.beginPath(); ctx.arc(m.x, cyw, Math.max(6, r), 0, Math.PI * 2); ctx.stroke(); }
    }
    const label = m.kind === "station" ? "SPACE STATION" : "MID-BOSS";
    ctx.fillStyle = "#331"; ctx.fillRect(60, 52, W - 120, 7);
    ctx.fillStyle = "#ffa64d"; ctx.fillRect(60, 52, (W - 120) * Math.max(0, m.hp / m.maxHp), 7);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(60, 52, W - 120, 7);
    ctx.fillStyle = "#fff"; ctx.font = "12px 'Segoe UI'"; ctx.textAlign = "center"; ctx.fillText(label, W / 2, 50);
  }

  function drawBoss() {
    const b = boss;
    // Final boss — a scaled-up, cyberpunk sibling of the player's interceptor:
    // swept delta hull, neon edges (shifts hot-magenta in phase 2), quad engines,
    // wingtip weapon pods and antenna greebles "bolted on".
    const bw = b.w, bh = b.h, t = performance.now() / 1000;
    const neon = b.hp < b.maxHp * 0.5 ? "#ff3b9a" : "#5ad1ff";
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = "#ffb14d";                                    // quad engine flames (top)
    for (const ex of [-bw * 0.22, -bw * 0.08, bw * 0.08, bw * 0.22]) {
      const f = 6 + Math.random() * 9;
      ctx.beginPath(); ctx.moveTo(ex - 4, -bh * 0.5); ctx.lineTo(ex, -bh * 0.5 - f); ctx.lineTo(ex + 4, -bh * 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#12122a";                                    // main swept-delta hull
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.56);
    ctx.lineTo(bw * 0.16, bh * 0.18); ctx.lineTo(bw * 0.5, bh * 0.02);
    ctx.lineTo(bw * 0.28, -bh * 0.2); ctx.lineTo(bw * 0.2, -bh * 0.5);
    ctx.lineTo(bw * 0.06, -bh * 0.32); ctx.lineTo(-bw * 0.06, -bh * 0.32);
    ctx.lineTo(-bw * 0.2, -bh * 0.5); ctx.lineTo(-bw * 0.28, -bh * 0.2);
    ctx.lineTo(-bw * 0.5, bh * 0.02); ctx.lineTo(-bw * 0.16, bh * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = neon; ctx.lineWidth = 2.5; ctx.stroke();     // neon edge
    ctx.fillStyle = "#242448";                                    // inner plating
    ctx.beginPath(); ctx.moveTo(0, bh * 0.44); ctx.lineTo(bw * 0.12, -bh * 0.2); ctx.lineTo(-bw * 0.12, -bh * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = neon; ctx.lineWidth = 1.2;                  // neon spine stripes
    ctx.beginPath(); ctx.moveTo(-bw * 0.34, bh * 0.02); ctx.lineTo(-bw * 0.14, bh * 0.02); ctx.moveTo(bw * 0.34, bh * 0.02); ctx.lineTo(bw * 0.14, bh * 0.02); ctx.stroke();
    for (const s of [-1, 1]) {                                    // wingtip pods + antenna greebles
      ctx.fillStyle = "#2f3660"; ctx.fillRect(s * bw * 0.5 - 6, -bh * 0.02, 12, bh * 0.2);
      ctx.fillStyle = "#ff5c5c"; ctx.beginPath(); ctx.arc(s * bw * 0.5, bh * 0.2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8aa0d0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s * bw * 0.4, -bh * 0.16); ctx.lineTo(s * bw * 0.46, -bh * 0.34); ctx.stroke();
    }
    ctx.fillStyle = "#2f3660"; ctx.fillRect(-bw * 0.1, -bh * 0.12, bw * 0.2, 6); ctx.fillRect(-bw * 0.06, bh * 0.06, bw * 0.12, 5);
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);                    // glowing core weakpoint
    ctx.fillStyle = b.hp < b.maxHp * 0.5 ? "#ff3b3b" : "#ffe066";
    ctx.beginPath(); ctx.ellipse(0, bh * 0.05, 8, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = pulse; ctx.fillStyle = neon;
    ctx.beginPath(); ctx.ellipse(0, bh * 0.05, 5, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.restore();
    // charged laser(s): dashed telegraph while charging, solid beam(s) while firing
    for (const lx of b.laserXs) {
      if (b.laserState === "charge") {
        ctx.strokeStyle = `rgba(255,90,90,${0.3 + 0.45 * Math.abs(Math.sin(performance.now() / 60))})`;
        ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(lx, b.y + bh / 2); ctx.lineTo(lx, H); ctx.stroke();
        ctx.setLineDash([]);
      } else if (b.laserState === "fire") {
        const lg = ctx.createLinearGradient(lx - 26, 0, lx + 26, 0);
        lg.addColorStop(0, "rgba(255,60,60,0)"); lg.addColorStop(0.5, "rgba(255,120,120,0.85)"); lg.addColorStop(1, "rgba(255,60,60,0)");
        ctx.fillStyle = lg; ctx.fillRect(lx - 26, b.y + bh / 2, 52, H);
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(lx - 6, b.y + bh / 2, 12, H);
      }
    }
    // EMP shockwave — an expanding electric ring
    if (b.empWave) {
      const r = b.empWave.r, cyw = b.y + bh / 2, fade = Math.max(0, 1 - r / 1000);
      ctx.strokeStyle = `rgba(120,220,255,${0.85 * fade})`; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(b.x, cyw, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(180,120,255,${0.5 * fade})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, cyw, r + 9, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#331"; ctx.fillRect(40, 14, W - 80, 10);
    ctx.fillStyle = "#ff3b6b"; ctx.fillRect(40, 14, (W - 80) * Math.max(0, b.hp / b.maxHp), 10);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(40, 14, W - 80, 10);
    ctx.fillStyle = "#fff"; ctx.font = "13px 'Segoe UI'"; ctx.textAlign = "center"; ctx.fillText("BOSS", W / 2, 12);
  }

  function drawItem(it) {
    ctx.save(); ctx.translate(it.x, it.y);
    const pulse = 1 + 0.1 * Math.sin(it.t * 8);
    ctx.scale(pulse, pulse);
    const map = { power: ["#4da6ff", "P"], life: ["#ff5c8a", "♥"], missile: ["#ffcf6b", "M"] };
    const [col, label] = map[it.type] || ["#fff", "?"];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#04121f"; ctx.font = "bold 14px 'Segoe UI'"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  // Legibility: draw a translucent dark plate behind text (uses the current
  // ctx.font/textAlign; assumes alphabetic baseline unless midBaseline is true).
  function fontPx(f) { const m = f.match(/(\d+)px/); return m ? +m[1] : 16; }
  function textBg(text, x, y, midBaseline = false, pad = 5) {
    const w = ctx.measureText(text).width, h = fontPx(ctx.font);
    let bx = x;
    if (ctx.textAlign === "center") bx = x - w / 2; else if (ctx.textAlign === "right") bx = x - w;
    const by = midBaseline ? y - h / 2 : y - h * 0.82;
    const prev = ctx.fillStyle;
    ctx.fillStyle = "rgba(4,6,13,0.6)";
    ctx.fillRect(bx - pad, by - pad * 0.6, w + pad * 2, h + pad * 1.1);
    ctx.fillStyle = prev;
  }
  // draw text with a dark plate behind it (baseline alphabetic)
  function plated(text, x, y) { textBg(text, x, y); ctx.fillText(text, x, y); }

  function drawHUD() {
    ctx.textBaseline = "alphabetic";
    ctx.font = "16px 'Segoe UI'"; ctx.textAlign = "left"; ctx.fillStyle = "#dff6ff";
    plated(`SCORE ${score}`, 10, 24);
    plated(`HI ${highScore}`, 10, 42);
    ctx.textAlign = "center";
    plated(endless ? `∞ LOOP ${loopCount + 1} · ${stageIndex + 1}/5` : `STAGE ${Math.min(stageIndex + 1, 5)}/5`, W / 2, 24);   // centered
    ctx.textAlign = "right";
    let lx = W - 10;
    for (let i = 0; i < Math.max(0, player.lives); i++) { ctx.fillStyle = "#5ad1ff"; ctx.fillText("▲", lx, 42); lx -= 16; }
    ctx.textAlign = "left"; ctx.fillStyle = "#9fb8ff";
    plated(`PWR ${"◆".repeat(player.power)}${"◇".repeat(POWER_MAX - player.power)}`, 10, H - 12);
    // C charge meter: 3단 게이지 (1단 폭주 / 2단 소거 / 3단 소거+전멸)
    const cw = 120, cx0 = 10, cy0 = H - 44;
    const cStage = player.charge >= 300 ? 3 : player.charge >= 200 ? 2 : player.charge >= 100 ? 1 : 0;
    const cColors = ["#4a90c0", "#ffb454", "#7fffe0", "#ff6bd0"];
    ctx.fillStyle = "#1a2540"; ctx.fillRect(cx0, cy0, cw, 6);
    ctx.fillStyle = cColors[cStage];
    ctx.fillRect(cx0, cy0, cw * (player.charge / CHARGE_MAX), 6);
    ctx.fillStyle = "#0a1020";   // 단계 구분선
    ctx.fillRect(cx0 + cw / 3, cy0, 1, 6); ctx.fillRect(cx0 + cw * 2 / 3, cy0, 1, 6);
    ctx.font = "13px 'Segoe UI'"; ctx.fillStyle = cStage > 0 ? cColors[cStage] : "#5a6a7a";
    const cLabels = ["[C] CHARGE", "[C] 1단 폭주!", "[C] 2단 소거!", "[C] 3단 소거+전멸!"];
    plated(cLabels[cStage], cx0, cy0 - 4);
    ctx.textAlign = "right";
    const parryReady = player.parryCd <= 0;
    if (player.frenzy > 0) { ctx.fillStyle = "#5a6a7a"; plated("[X] 폭주중 봉인", W - 10, H - 30); }
    else {
      ctx.fillStyle = player.parryActive > 0 ? "#b4f0ff" : parryReady ? "#43e0c0" : "#5a6a7a";
      plated(parryReady ? "[X] PARRY READY" : `[X] PARRY ${player.parryCd.toFixed(1)}s`, W - 10, H - 30);
    }
    ctx.fillStyle = player.missileLevel > 0 ? "#ffcf6b" : "#5a6a7a";
    plated(`MISSILE Lv.${player.missileLevel}`, W - 10, H - 12);
    if (player.frenzy > 0) {   // 폭주 모드 배너
      ctx.textAlign = "center"; ctx.font = "bold 18px 'Segoe UI'";
      const msg = `🔥 폭주! ${player.frenzy.toFixed(1)}s`;
      textBg(msg, W / 2, H - 72, false, 8);
      ctx.fillStyle = `rgba(255,180,90,${0.7 + 0.3 * Math.sin(performance.now() / 60)})`;
      ctx.fillText(msg, W / 2, H - 72);
      ctx.textAlign = "left";
    }
    if (player.emp > 0) {   // EMP 마비 경고 — 공격/C 불가
      ctx.textAlign = "center"; ctx.font = "bold 18px 'Segoe UI'";
      textBg("⚡ EMP! 공격불가", W / 2, H - 72, false, 8);
      ctx.fillStyle = `rgba(150,220,255,${0.6 + 0.4 * Math.sin(performance.now() / 80)})`;
      ctx.fillText("⚡ EMP! 공격불가", W / 2, H - 72);
      ctx.textAlign = "left";
    }
  }

  function centerText(lines) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let y = H / 2 - (lines.length - 1) * 20;
    for (const l of lines) {
      ctx.fillStyle = l.color || "#fff";
      ctx.font = l.font || "20px 'Segoe UI'";
      if (l.text) { textBg(l.text, W / 2, y, true, 8); ctx.fillStyle = l.color || "#fff"; }
      ctx.fillText(l.text, W / 2, y);
      y += l.gap || 40;
    }
    ctx.textBaseline = "alphabetic";
  }

  // ---- story art (all drawn procedurally — no image files) ------------------
  function shipSil(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.lineTo(x, y + s / 4); ctx.lineTo(x - s / 2, y + s / 2);
    ctx.closePath(); ctx.fill();
  }

  function drawHeart(x, y, s) {
    ctx.beginPath();
    ctx.arc(x - s * 0.35, y - s * 0.2, s * 0.4, 0, Math.PI * 2);
    ctx.arc(x + s * 0.35, y - s * 0.2, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 0.72, y - s * 0.05); ctx.lineTo(x + s * 0.72, y - s * 0.05); ctx.lineTo(x, y + s * 0.8); ctx.closePath(); ctx.fill();
  }

  function drawArt(kind) {
    const cx = W / 2, cy = H * 0.30, t = performance.now() / 1000;
    ctx.save();
    if (kind === "earth") {
      const g = ctx.createRadialGradient(cx - 25, cy + 25, 10, cx, cy + 45, 120);
      g.addColorStop(0, "#6ab0ff"); g.addColorStop(0.6, "#2b5fb0"); g.addColorStop(1, "#0a1a3a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy + 45, 95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(90,220,150,0.45)";
      ctx.beginPath(); ctx.ellipse(cx - 28, cy + 25, 24, 15, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 22, cy + 62, 28, 18, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff6b5c";
      for (let i = 0; i < 5; i++) { const x = 70 + i * 75, y = 30 + ((t * 22 + i * 34) % 70); shipSil(x, y, 14, "#ff6b5c"); }
    } else if (kind === "ships") {
      for (let i = 0; i < 4; i++) shipSil(cx - 110 + i * 74, cy - 10 + (i % 2) * 42 + Math.sin(t + i) * 6, 32, "#4a5a86");
      shipSil(cx, cy + 74, 46, "#5a6aa0");
    } else if (kind === "reveal") {
      shipSil(cx - 66, cy + 24, 40, "#5ad1ff");
      ctx.save(); ctx.translate(cx + 66, cy + 24); ctx.rotate(Math.PI); shipSil(0, 0, 40, "#ffb14d"); ctx.restore();
      ctx.strokeStyle = `rgba(255,80,80,${0.5 + 0.3 * Math.sin(t * 4)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - 24);
      for (let y = -24; y <= 74; y += 12) ctx.lineTo(cx + (Math.random() - 0.5) * 14, cy + y);
      ctx.stroke();
    } else if (kind === "blackhole") {
      ctx.translate(cx, cy + 30);
      const rx = 58, ry = 25;                          // accretion disk (fixed orientation)
      for (let i = 5; i >= 1; i--) {                   // aligned glowing rings, brightest inner
        const f = i / 5;
        ctx.strokeStyle = `hsla(${30 + (1 - f) * 230},90%,${40 + f * 22}%,${0.2 + 0.14 * i})`;
        ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rx * f, ry * f, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (let k = 0; k < 12; k++) {                   // matter orbiting within the disk plane
        const ang = t * 3.4 + k * (Math.PI * 2 / 12), rr = 0.5 + 0.45 * ((k % 3) / 2);
        const mx = Math.cos(ang) * rx * rr, my = Math.sin(ang) * ry * rr;
        ctx.fillStyle = `hsla(${45 - (k % 3) * 12},100%,66%,0.9)`;
        ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2); ctx.fill();  // black core
      ctx.strokeStyle = "rgba(255,180,90,0.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 16, 13, 0, 0, Math.PI * 2); ctx.stroke();  // photon ring
    } else if (kind === "rescue") {
      ctx.fillStyle = "rgba(127,255,224,0.22)";
      ctx.beginPath(); ctx.moveTo(cx - 22, cy + 40); ctx.lineTo(cx + 22, cy + 40); ctx.lineTo(cx + 8, cy - 14); ctx.lineTo(cx - 8, cy - 14); ctx.closePath(); ctx.fill();
      shipSil(cx, cy - 24, 24, "#ffd35c");
      shipSil(cx, cy + 52, 44, "#5ad1ff");
    } else if (kind === "hatch") {
      // the last ship, its hatch opening with light spilling out (no people)
      ctx.fillStyle = "#3a4460"; ctx.beginPath(); ctx.ellipse(cx, cy + 46, 92, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#59668a"; ctx.beginPath(); ctx.ellipse(cx, cy + 34, 80, 30, 0, 0, Math.PI * 2); ctx.fill();
      const dy = cy + 20;
      const gg = ctx.createRadialGradient(cx, dy, 5, cx, dy, 66);
      gg.addColorStop(0, "rgba(255,242,205,0.95)"); gg.addColorStop(0.55, "rgba(255,214,150,0.45)"); gg.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, dy, 66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff6de"; ctx.beginPath(); ctx.moveTo(cx - 18, dy + 26); ctx.lineTo(cx - 13, dy - 22); ctx.lineTo(cx + 13, dy - 22); ctx.lineTo(cx + 18, dy + 26); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,235,180,0.3)"; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx, dy); ctx.lineTo(cx + i * 42, dy - 74); ctx.stroke(); }
    } else if (kind === "emerge") {
      // a radiant light — the shape of a new beginning (no figure)
      const dy = cy + 16;
      const gg = ctx.createRadialGradient(cx, dy, 6, cx, dy, 105);
      gg.addColorStop(0, "rgba(255,248,220,0.95)"); gg.addColorStop(0.5, "rgba(255,220,160,0.5)"); gg.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, dy, 105, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,240,200,0.22)"; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = t * 0.3 + i * (Math.PI * 2 / 12); ctx.beginPath(); ctx.moveTo(cx, dy); ctx.lineTo(cx + Math.cos(a) * 115, dy + Math.sin(a) * 115); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,244,0.9)"; ctx.beginPath(); ctx.arc(cx, dy, 10 + Math.sin(t * 3) * 2, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "heart") {
      const s = 1 + 0.2 * Math.sin(t * 4);
      ctx.save(); ctx.translate(cx, cy + 24); ctx.scale(s, s);
      const hg = ctx.createRadialGradient(0, 0, 4, 0, 0, 64);
      hg.addColorStop(0, "rgba(255,120,160,0.85)"); hg.addColorStop(1, "rgba(255,120,160,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 64, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff5c8a"; drawHeart(0, 0, 30);
      ctx.restore();
      for (let k = 0; k < 12; k++) {
        const a = t * 1.3 + k * 0.55, sx = cx + Math.cos(a) * 96, sy = cy + 24 + Math.sin(a * 1.3) * 62;
        ctx.fillStyle = `rgba(255,225,240,${0.35 + 0.35 * Math.sin(t * 3 + k)})`; ctx.fillRect(sx, sy, 2, 2);
      }
    }
    ctx.restore();
  }

  function drawCutscene() {
    const pg = cutscene.pages[cutscene.page];
    drawArt(pg.art);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "18px 'Segoe UI'";
    let y = H * 0.58;
    for (const line of pg.lines) {
      const hl = line === "TRUE END" || line === "BAD END" || line.startsWith("SCORE") || line.startsWith("FINAL");
      ctx.fillStyle = hl ? "#ffe066" : "#dff6ff";
      if (line) { textBg(line, W / 2, y, true, 8); ctx.fillStyle = hl ? "#ffe066" : "#dff6ff"; }
      ctx.fillText(line, W / 2, y); y += 28;
    }
    const n = cutscene.pages.length, dotW = 12, sx = W / 2 - (n - 1) * dotW / 2;
    for (let i = 0; i < n; i++) { ctx.fillStyle = i === cutscene.page ? "#7fffe0" : "#3a4a70"; ctx.beginPath(); ctx.arc(sx + i * dotW, H - 64, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#9fb8ff"; ctx.font = "15px 'Segoe UI'";
    ctx.fillText((cutscene.page > 0 ? "←/↑ 이전     " : "") + "Enter ▶ 다음", W / 2, H - 40);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  }

  function renderHidden() {
    drawArt("blackhole");
    for (const a of allies) {
      if (a.rescued) continue;
      const pulse = 0.6 + 0.4 * Math.sin(a.t * 4);
      ctx.save(); ctx.translate(a.x, a.y);
      if (a.type === "astro") {                          // astronaut — tumbling in space (spins)
        ctx.strokeStyle = "rgba(255,110,110,0.7)"; ctx.lineWidth = 1;   // distress ring (unrotated)
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.rotate(a.t * 3);                             // 빙글빙글
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#c9d4ff";
        ctx.fillRect(-3.5, 0, 7, 9);                     // torso
        ctx.fillRect(-8, 1, 4, 3); ctx.fillRect(4, 1, 4, 3);   // arms
        ctx.fillRect(-3.5, 9, 3, 4); ctx.fillRect(0.5, 9, 3, 4); // legs
        ctx.fillStyle = "#dff6ff"; ctx.beginPath(); ctx.arc(0, -5, 5, 0, Math.PI * 2); ctx.fill();  // helmet
        ctx.fillStyle = "#7fbfff"; ctx.beginPath(); ctx.arc(0, -5, 2.5, 0, Math.PI * 2); ctx.fill(); // visor
        ctx.globalAlpha = 1;
      } else {                                           // ally ship — small rescue shuttle
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#e6ecff";                       // hull
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(8, 4); ctx.lineTo(6, 12); ctx.lineTo(-6, 12); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#ffd35c";                       // wings
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-15, 11); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(15, 11); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#5ad1ff"; ctx.beginPath(); ctx.arc(0, -4, 3, 0, Math.PI * 2); ctx.fill();   // cockpit
        ctx.fillStyle = "#ffb14d"; ctx.fillRect(-4, 12, 8, 3);                                        // engine glow
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,214,102,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1; }
    drawShip(player.x, player.y, false);
    ctx.fillStyle = "#dff6ff"; ctx.font = "18px 'Segoe UI'"; ctx.textAlign = "center";
    plated(`RESCUED  ${rescuedCount} / ${hiddenTotal}`, W / 2, 30);
    ctx.font = "15px 'Segoe UI'"; ctx.fillStyle = "#7fffe0";
    plated("함선·우주인을 모두 구출하라 · 우주인은 빨려든다!", W / 2, 52);
    const gd = Math.hypot(W / 2 - player.x, (H * 0.30 + 30) - player.y);
    if (gd < 120 && Math.floor(performance.now() / 200) % 2 === 0) {
      ctx.fillStyle = "#ff6b6b"; ctx.font = "16px 'Segoe UI'";
      ctx.fillText("⚠ 블랙홀 인력 위험!", W / 2, H - 30);
    }
    ctx.textAlign = "left";
  }

  function drawPauseMenu() {
    ctx.fillStyle = "rgba(5,6,13,0.78)"; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.textAlign = "center";
    ctx.fillStyle = "#5ad1ff"; ctx.font = "bold 34px 'Segoe UI'"; ctx.fillText("일시정지", W / 2, H * 0.34);
    const opts = ["재개하기", "메뉴로", "종료하기"];
    ctx.font = "22px 'Segoe UI'";
    for (let i = 0; i < opts.length; i++) {
      const sel = i === pauseSel;
      ctx.fillStyle = sel ? "#ffe066" : "#9fb8ff";
      ctx.fillText((sel ? "▶  " : "    ") + opts[i], W / 2, H * 0.46 + i * 42);
    }
    ctx.fillStyle = "#5a6a7a"; ctx.font = "14px 'Segoe UI'";
    ctx.fillText("↑↓ 선택 · Enter 확인 · P/ESC 재개", W / 2, H * 0.46 + 3 * 42 + 20);
    ctx.textAlign = "left";
  }

  function drawWorld() {
    for (const b of bullets) { ctx.fillStyle = b.reflected ? "#7fffe0" : b.chloe ? "#c77dff" : "#eaffff"; ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
    for (const e of enemies) drawEnemy(e);
    if (midboss) drawMidboss();
    if (boss) drawBoss();
    for (const eb of eBullets) {
      if (eb.needle) {
        // ultra-fast rail shots get a longer, hot-red streak so they read as dangerous
        ctx.strokeStyle = eb.fastshot ? "#ff3b3b" : "#ffec8a"; ctx.lineWidth = eb.fastshot ? 4 : 3;
        const d = Math.hypot(eb.vx, eb.vy) || 1, tail = eb.fastshot ? 22 : 11;
        ctx.beginPath(); ctx.moveTo(eb.x, eb.y); ctx.lineTo(eb.x - eb.vx / d * tail, eb.y - eb.vy / d * tail); ctx.stroke();
        continue;
      }
      ctx.fillStyle = eb.firework ? "#ffe066" : eb.homing ? "#ff9d3c" : "#ff5c5c";
      ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.w / 2, 0, Math.PI * 2); ctx.fill();
      if (eb.firework) { ctx.strokeStyle = `rgba(255,224,102,${0.4 + 0.4 * Math.sin(performance.now() / 80)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.w / 2 + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (eb.homing) { ctx.strokeStyle = "rgba(255,157,60,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.w / 2 + 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const it of items) drawItem(it);
    if (bonus) {
      ctx.save(); ctx.translate(bonus.x, bonus.y);
      ctx.fillStyle = bonus.hitFx > 0 ? "#ffffff" : "#c77dff"; ctx.beginPath(); ctx.ellipse(0, 4, 17, 7, 0, 0, Math.PI * 2); ctx.fill();  // saucer
      ctx.fillStyle = "#dff6ff"; ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.fill();                 // dome
      ctx.fillStyle = "#ff5c8a"; ctx.font = "11px 'Segoe UI'"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("♥", 0, -4);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffe066"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 6, 8, 1.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      // tiny HP bar (shoot 3 times to recruit)
      ctx.fillStyle = "#401"; ctx.fillRect(bonus.x - 17, bonus.y - 16, 34, 3);
      ctx.fillStyle = "#ff8ad1"; ctx.fillRect(bonus.x - 17, bonus.y - 16, 34 * Math.max(0, bonus.hp / bonus.maxHp), 3);
    }
    for (const c of companions) {
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.strokeStyle = "rgba(199,125,255,0.5)"; ctx.lineWidth = 1;   // friendly aura
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#c77dff"; ctx.beginPath(); ctx.ellipse(0, 4, 17, 7, 0, 0, Math.PI * 2); ctx.fill();  // saucer
      ctx.fillStyle = "#dff6ff"; ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.fill();                // dome
      ctx.fillStyle = "#ff5c8a"; ctx.font = "11px 'Segoe UI'"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("♥", 0, -4);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffe066"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 6, 8, 1.5, 0, Math.PI * 2); ctx.fill(); }  // running lights
      ctx.restore();
    }
    for (const m of missiles) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
      ctx.fillStyle = "#ffcf6b";
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff5d6"; ctx.fillRect(-1.5, -6, 3, 6);
      ctx.restore();
    }
    for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); ctx.globalAlpha = 1; }
    drawShip(player.x, player.y, player.invuln > 0);
  }

  function render() {
    ctx.save();
    if (shakeTime > 0 && (state === STATE.PLAY || state === STATE.CLEAR || state === STATE.HIDDEN)) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    ctx.clearRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = "#05060d"; ctx.fillRect(-10, -10, W + 20, H + 20);
    drawStars();
    for (const p of eggParticles) { ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); ctx.globalAlpha = 1; }
    if (eggMsgTimer > 0) {
      ctx.textAlign = "center"; ctx.font = "bold 22px 'Segoe UI'";
      textBg(eggMsg, W / 2, 92, false, 9);
      ctx.fillStyle = `hsl(${(performance.now() / 8) % 360},90%,66%)`;
      ctx.fillText(eggMsg, W / 2, 92);
      ctx.textAlign = "left";
    }

    if (state === STATE.MENU) {
      const lines = [
        { text: "SKY STRIKER", color: "#5ad1ff", font: "bold 42px 'Segoe UI'", gap: 52 },
        { text: "5 STAGES · MID-BOSS · BOSS", color: "#9fb8ff", font: "16px 'Segoe UI'", gap: 54 },
        { text: "이동: 방향키   ·   발사: Z", color: "#dff6ff", font: "17px 'Segoe UI'", gap: 24 },
        { text: "패링(반사): X   ·   미사일: 아이템 먹으면 자동", color: "#7fffe0", font: "16px 'Segoe UI'", gap: 22 },
        { text: "패링 = 총알 튕겨 반사 · 0.4초 · 쿨 1.5초", color: "#9fb8ff", font: "14px 'Segoe UI'", gap: 24 },
        { text: "전체화면: Alt+Enter (Mac ⌘+Enter)   ·   창 크기 조절 가능", color: "#9fb8ff", font: "13px 'Segoe UI'", gap: 40 },
        { text: (menuSel === 0 ? "▶  " : "     ") + "게임 시작", color: menuSel === 0 ? "#ffe066" : "#7f8db8", font: "22px 'Segoe UI'", gap: 30 },
        { text: (menuSel === 1 ? "▶  " : "     ") + "무한 모드 (1~5 반복)", color: menuSel === 1 ? "#ffe066" : "#7f8db8", font: "22px 'Segoe UI'", gap: 30 },
        { text: (menuSel === 2 ? "▶  " : "     ") + "종료하기", color: menuSel === 2 ? "#ffe066" : "#7f8db8", font: "22px 'Segoe UI'", gap: 24 },
        { text: "↑↓ 선택 · Enter 확인", color: "#5a6a7a", font: "13px 'Segoe UI'", gap: 30 },
        { text: `HIGH SCORE ${highScore}`, color: "#9fb8ff", font: "15px 'Segoe UI'", gap: 22 },
      ];
      if (clears >= 1) lines.push({ text: clears >= 2 ? "★ 진실을 향한 길이 열렸다" : "★ 클리어! 다시 도전하면...?", color: "#ff8ad1", font: "15px 'Segoe UI'", gap: 20 });
      centerText(lines);
      ctx.restore();
      return;
    }
    if (state === STATE.STORY) { drawCutscene(); ctx.restore(); return; }
    if (state === STATE.HIDDEN) { renderHidden(); ctx.restore(); return; }
    if (state === STATE.PAUSE) {
      if (prevState === STATE.HIDDEN) renderHidden(); else drawWorld();
      drawPauseMenu();
      ctx.restore(); return;
    }

    drawWorld();

    drawHUD();

    if (flashTime > 0) { ctx.fillStyle = `rgba(200,255,255,${Math.min(0.7, flashTime * 2.3)})`; ctx.fillRect(-10, -10, W + 20, H + 20); }

    if (state === STATE.CLEAR) {
      centerText([
        { text: `STAGE ${stageIndex + 1} CLEAR`, color: "#ffe066", font: "bold 32px 'Segoe UI'", gap: 40 },
        { text: stageIndex + 1 >= 4 ? "다음: 최종 보스!" : "다음 스테이지...", color: "#9fb8ff", font: "17px 'Segoe UI'" },
      ]);
    } else if (state === STATE.OVER) {
      centerText([
        { text: "GAME OVER", color: "#ff5c5c", font: "bold 42px 'Segoe UI'", gap: 50 },
        { text: `SCORE ${score}`, color: "#dff6ff", font: "22px 'Segoe UI'", gap: 30 },
        { text: `HIGH ${highScore}`, color: "#9fb8ff", font: "16px 'Segoe UI'", gap: 50 },
        { text: "Enter 눌러 메뉴로", color: "#ffe066", font: "18px 'Segoe UI'" },
      ]);
    } else if (state === STATE.WIN) {
      centerText([
        { text: "YOU WIN!", color: "#43e0c0", font: "bold 46px 'Segoe UI'", gap: 52 },
        { text: "보스 격파 성공 🎉", color: "#dff6ff", font: "20px 'Segoe UI'", gap: 34 },
        { text: `FINAL SCORE ${score}`, color: "#ffe066", font: "22px 'Segoe UI'", gap: 50 },
        { text: "Enter 눌러 메뉴로", color: "#9fb8ff", font: "17px 'Segoe UI'" },
      ]);
    }
    ctx.restore();
  }

  // ---- main loop ------------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    updateBGM();   // keep the background music loop scheduled ahead

    // easter-egg confetti + banner run on every screen
    if (eggMsgTimer > 0) eggMsgTimer -= dt;
    for (const p of eggParticles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.life -= dt; }
    eggParticles = eggParticles.filter((p) => p.life > 0 && p.y < H + 20);

    // DEBUG / secret shortcuts: 9=jump to final boss, 8=ending cutscene, 7=hidden stage
    if (pressed("Digit9")) { startGame(); stageIndex = 4; spawnedThisStage = 0; enemies = []; midboss = null; boss = null; spawnBoss(); }
    if (pressed("Digit8")) { if (!player) resetPlayer(); if (typeof score !== "number") score = 0; bossDefeated(); }
    if (pressed("Digit7")) startHidden();

    // pause toggle (only from active gameplay)
    if ((state === STATE.PLAY || state === STATE.CLEAR || state === STATE.HIDDEN) && (pressed("KeyP") || pressed("Escape"))) {
      prevState = state; pauseSel = 0; state = STATE.PAUSE;
    }

    if (state === STATE.MENU) {
      driftStars(dt);
      if (pressed("ArrowDown")) menuSel = (menuSel + 1) % 3;
      if (pressed("ArrowUp")) menuSel = (menuSel + 2) % 3;
      if (pressed("Enter")) {
        if (menuSel === 0) beginIntro();
        else if (menuSel === 1) startGame(true);
        else Neutralino.app.exit();
      }
    } else if (state === STATE.STORY) {
      driftStars(dt);
      if (pressed("Enter")) advanceCutscene();
      if (pressed("ArrowLeft") || pressed("ArrowUp")) cutsceneBack();
    } else if (state === STATE.PAUSE) {
      driftStars(dt);
      handlePause();
    } else if (state === STATE.OVER || state === STATE.WIN) {
      driftStars(dt);
      if (pressed("Enter")) state = STATE.MENU;
    } else if (state === STATE.HIDDEN) {
      updateHidden(dt);
    } else {
      update(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---- display: scale the fixed-resolution canvas to fill the window ---------
  // The game logic stays at 480x720 internally; we only CSS-scale the element so
  // it grows/shrinks to fit any window size (and fullscreen) keeping 2:3 aspect.
  function fitCanvas() {
    const scale = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = Math.round(W * scale) + "px";
    canvas.style.height = Math.round(H * scale) + "px";
  }
  addEventListener("resize", fitCanvas);

  let fullscreen = false;
  function toggleFullscreen() {
    if (!(window.Neutralino && Neutralino.window)) return;
    fullscreen = !fullscreen;
    (fullscreen ? Neutralino.window.setFullScreen() : Neutralino.window.exitFullScreen())
      .then(() => setTimeout(fitCanvas, 60)).catch(() => { });
  }

  starLayers = [makeStars(40, 30), makeStars(30, 70), makeStars(18, 130)];
  resetPlayer();
  fitCanvas();
  requestAnimationFrame(loop);
})();
