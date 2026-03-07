(() => {
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const SPRITE_FACES_RIGHT = true;
  const IDLE_SPRITE_FACES_RIGHT = false;
  const world = {
    width: 3200,
    floorY: 360,
    waterY: 398,
    gravity: 0.72,
    jumpVelocity: -13.6,
    moveSpeed: 4.2
  };
  const PLATFORM_COLLISION_INSET = 26;

  const player = {
    x: 90,
    y: 0,
    w: 62,
    h: 58,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    invincibleMs: 0
  };

  const state = {
    score: 0,
    lives: 3,
    bestScore: 0,
    level: 1,
    levelCompleteMs: 0,
    finishX: 0,
    gameOver: false,
    paused: false,
    win: false,
    drowning: null,
    runPhase: 0,
    cameraX: 0,
    keys: new Set(),
    pointerButtons: { left: false, right: false },
    controlRects: {
      pause: { x: 22, y: 16, w: 64, h: 64 },
      left: { x: 20, y: canvas.height - 112, w: 96, h: 96 },
      right: { x: 126, y: canvas.height - 112, w: 96, h: 96 },
      jump: { x: canvas.width - 116, y: canvas.height - 112, w: 96, h: 96 }
    },
    spawn: { x: 90, y: 0 },
    coinsTotal: 0,
    dust: []
  };

  const spriteDefs = {
    bgJungle: "assets/game/bg-jungle.png",
    bgJungle2: "assets/game/bg-jungle2.png",
    monkeyIdle: "assets/game/monkey-idle.png",
    monkeyJump: "assets/game/monkey-jump.png",
    monkeyRun1: "assets/game/monkey-run-1.png",
    monkeyRun2: "assets/game/monkey-run-2.png",
    monkeyRun3: "assets/game/monkey-run-3.png",
    monkeyRun4: "assets/game/monkey-run-4.png",
    monkeyFall1: "assets/game/monkey-fall-1.png",
    monkeyFall2: "assets/game/monkey-fall-2.png",
    monkeyFall3: "assets/game/monkey-fall-3.png",
    monkeySplash1: "assets/game/monkey-splash-1.png",
    monkeySplash2: "assets/game/monkey-splash-2.png",
    platform: "assets/game/platform.png",
    water: "assets/game/water.png",
    coin: "assets/game/coin.png",
    heart: "assets/game/heart.png",
    buttonLeft: "assets/game/button-left.png",
    buttonRight: "assets/game/button-right.png",
    buttonJump: "assets/game/button-jump.png",
    spike: "assets/game/spike.png",
    pause: "assets/game/pause.png"
  };

  const sprites = {};
  for (const [key, src] of Object.entries(spriteDefs)) {
    const img = new Image();
    img.src = src;
    sprites[key] = img;
  }

  function drawSprite(img, x, y, w, h) {
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, w, h);
      return true;
    }
    return false;
  }

  function loadedFrames(frameKeys) {
    return frameKeys
      .map((k) => sprites[k])
      .filter((img) => img && img.complete && img.naturalWidth > 0);
  }

  let platforms = [];
  let hazards = [];
  let coins = [];
  let lifePickups = [];

  function generateLevel(level) {
    const baseY = 350;
    const levelLen = 2900 + level * 220;
    world.width = Math.max(3100, levelLen);
    platforms = [];
    hazards = [];
    coins = [];
    lifePickups = [];

    let cursor = 0;
    for (let i = 0; i < 8 + level; i += 1) {
      const w = i === 0 ? 580 : Math.max(250, 470 - Math.min(150, level * 7) + Math.random() * 80);
      const y = baseY - (i % 3 === 2 ? 38 : 0);
      platforms.push({ x: cursor, y, w, h: y === baseY ? 58 : 42 });

      if (i > 0 && Math.random() > 0.45) {
        hazards.push({ x: cursor + Math.max(28, w * 0.46), y: y - 28, w: 72, h: 28 });
      }

      const coinRow = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < coinRow; c += 1) {
        coins.push({ x: cursor + 90 + c * 46, y: y - 56 - (c % 2) * 8, r: 12, taken: false });
      }

      if (i > 1 && Math.random() > 0.78) {
        lifePickups.push({ x: cursor + w * 0.52, y: y - 68, r: 14, taken: false });
      }

      const gap = 28 + Math.random() * Math.max(18, 42 - level * 2);
      cursor += w + gap;
    }

    const endPlatformW = 360;
    platforms.push({ x: world.width - endPlatformW - 120, y: baseY, w: endPlatformW, h: 58 });
    state.finishX = world.width - 140;
    state.coinsTotal = coins.length;
    state.spawn.x = platforms[0].x + 50;
    state.spawn.y = platforms[0].y - player.h;
  }

  generateLevel(state.level);
  resetPlayerToSpawn();

  function resetPlayerToSpawn() {
    player.x = state.spawn.x;
    player.y = state.spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.facing = SPRITE_FACES_RIGHT ? 1 : -1;
    player.invincibleMs = 1000;
  }

  function resetWorld() {
    state.score = 0;
    state.lives = 3;
    state.level = 1;
    state.levelCompleteMs = 0;
    state.gameOver = false;
    state.paused = false;
    state.drowning = null;
    state.runPhase = 0;
    state.dust = [];
    state.win = false;
    state.cameraX = 0;
    generateLevel(state.level);
    resetPlayerToSpawn();
  }

  function startNextLevel() {
    state.level += 1;
    state.levelCompleteMs = 0;
    state.paused = false;
    state.drowning = null;
    state.runPhase = 0;
    state.dust = [];
    state.cameraX = 0;
    generateLevel(state.level);
    resetPlayerToSpawn();
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function loseLife() {
    if (player.invincibleMs > 0 || state.gameOver || state.win) return;
    state.lives -= 1;
    if (state.lives <= 0) {
      state.lives = 0;
      state.gameOver = true;
      state.bestScore = Math.max(state.bestScore, state.score);
      return;
    }
    resetPlayerToSpawn();
  }

  function startDrowning() {
    if (state.drowning || state.gameOver || state.win) return;
    state.drowning = {
      x: player.x,
      y: world.waterY - 8,
      facing: player.facing,
      vx: player.vx * 0.45,
      timerMs: 0,
      splashBursts: []
    };
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
  }

  function updateDrowning() {
    if (!state.drowning) return;
    const d = state.drowning;
    d.timerMs += 16.6;

    if (d.timerMs < 190) {
      d.x += d.vx;
      d.y -= 0.35;
    } else if (d.timerMs < 420) {
      d.x += d.vx * 0.9;
      d.y += 1.9;
      if (Math.random() > 0.72) {
        d.splashBursts.push({
          x: d.x + (Math.random() - 0.5) * 20,
          y: world.waterY - 2,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -2.4 - Math.random() * 1.6,
          life: 20 + Math.random() * 12,
          size: 2 + Math.random() * 2
        });
      }
    } else {
      d.y += 0.85;
      if (Math.random() > 0.76) {
        d.splashBursts.push({
          x: d.x + (Math.random() - 0.5) * 24,
          y: world.waterY + 2,
          vx: (Math.random() - 0.5) * 1.8,
          vy: -1.8 - Math.random() * 1.2,
          life: 18 + Math.random() * 12,
          size: 2 + Math.random() * 2
        });
      }
    }

    d.splashBursts = d.splashBursts.filter((p) => p.life > 0);
    for (const p of d.splashBursts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.11;
      p.life -= 1;
    }

    if (d.timerMs >= 860) {
      state.drowning = null;
      player.invincibleMs = 0;
      loseLife();
    }
  }

  function jump() {
    if (state.gameOver || state.win) {
      resetWorld();
      return;
    }
    if (state.levelCompleteMs > 0) return;
    if (state.paused) {
      state.paused = false;
      return;
    }
    if (!player.onGround) return;
    player.vy = world.jumpVelocity;
    player.onGround = false;
  }

  function togglePause() {
    if (state.gameOver || state.win || state.levelCompleteMs > 0) return;
    state.paused = !state.paused;
  }

  function handleDownKey(code) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"].includes(code)) {
      state.keys.add(code);
    }
    if (["ArrowUp", "Space", "KeyW"].includes(code)) {
      jump();
    }
    if (code === "KeyR") {
      resetWorld();
    }
    if (code === "KeyP") {
      togglePause();
    }
  }

  function handleUpKey(code) {
    state.keys.delete(code);
  }

  function handlePointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * sx;
    const y = (event.clientY - rect.top) * sy;

    if (pointInRect(x, y, state.controlRects.pause)) {
      togglePause();
      return;
    }

    if (pointInRect(x, y, state.controlRects.left)) {
      state.pointerButtons.left = true;
      return;
    }
    if (pointInRect(x, y, state.controlRects.right)) {
      state.pointerButtons.right = true;
      return;
    }
    if (pointInRect(x, y, state.controlRects.jump)) {
      jump();
      return;
    }

    jump();
  }

  function handlePointerUp() {
    state.pointerButtons.left = false;
    state.pointerButtons.right = false;
  }

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyR"].includes(event.code)) {
      event.preventDefault();
    }
    handleDownKey(event.code);
  });

  window.addEventListener("keyup", (event) => {
    handleUpKey(event.code);
  });

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerUp);

  function updatePlayer() {
    if (state.paused) return;
    if (state.levelCompleteMs > 0) {
      state.levelCompleteMs -= 16.6;
      if (state.levelCompleteMs <= 0) {
        startNextLevel();
      }
      return;
    }
    if (state.drowning) {
      updateDrowning();
      return;
    }

    const moveLeft = state.keys.has("ArrowLeft") || state.keys.has("KeyA") || state.pointerButtons.left;
    const moveRight = state.keys.has("ArrowRight") || state.keys.has("KeyD") || state.pointerButtons.right;

    player.vx = 0;
    if (moveLeft && !moveRight) {
      player.vx = -world.moveSpeed;
      player.facing = SPRITE_FACES_RIGHT ? -1 : 1;
    } else if (moveRight && !moveLeft) {
      player.vx = world.moveSpeed;
      player.facing = SPRITE_FACES_RIGHT ? 1 : -1;
    }

    player.x += player.vx;
    player.x = Math.max(0, Math.min(world.width - player.w, player.x));

    player.vy += world.gravity;
    const prevY = player.y;
    player.y += player.vy;

    player.onGround = false;

    for (const p of platforms) {
      const platformRect = {
        x: p.x + PLATFORM_COLLISION_INSET,
        y: p.y,
        w: Math.max(24, p.w - PLATFORM_COLLISION_INSET * 2),
        h: p.h
      };
      const feetY = player.y + player.h;
      const prevFeetY = prevY + player.h;
      const landedFromAbove = player.vy >= 0 && prevFeetY <= platformRect.y + 6 && feetY >= platformRect.y;
      if (!landedFromAbove) continue;

      // Use feet probes instead of full-body overlap to avoid "invisible support" at edges.
      const leftFoot = player.x + 18;
      const rightFoot = player.x + player.w - 18;
      const leftOnPlatform = leftFoot >= platformRect.x && leftFoot <= platformRect.x + platformRect.w;
      const rightOnPlatform = rightFoot >= platformRect.x && rightFoot <= platformRect.x + platformRect.w;
      if (leftOnPlatform || rightOnPlatform) {
        player.y = platformRect.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }

    for (const trap of hazards) {
      const playerRect = { x: player.x + 16, y: player.y + 12, w: player.w - 32, h: player.h - 20 };
      const trapRect = { x: trap.x + 14, y: trap.y + 10, w: Math.max(10, trap.w - 28), h: Math.max(8, trap.h - 14) };
      if (rectsOverlap(playerRect, trapRect)) {
        loseLife();
      }
    }

    for (const coin of coins) {
      if (coin.taken) continue;
      const dx = player.x + player.w / 2 - coin.x;
      const dy = player.y + player.h / 2 - coin.y;
      if (dx * dx + dy * dy < (coin.r + 18) * (coin.r + 18)) {
        coin.taken = true;
        state.score += 1;
      }
    }

    for (const heart of lifePickups) {
      if (heart.taken) continue;
      const dx = player.x + player.w / 2 - heart.x;
      const dy = player.y + player.h / 2 - heart.y;
      if (dx * dx + dy * dy < (heart.r + 18) * (heart.r + 18)) {
        heart.taken = true;
        state.lives = Math.min(3, state.lives + 1);
      }
    }

    if (player.y + player.h >= world.waterY) {
      startDrowning();
      return;
    }

    const playerCenterX = player.x + player.w / 2;
    if (playerCenterX >= state.finishX) {
      state.levelCompleteMs = 1200;
      state.bestScore = Math.max(state.bestScore, state.score);
      return;
    }

    if (player.invincibleMs > 0) {
      player.invincibleMs = Math.max(0, player.invincibleMs - 16.6);
    }

    const isRunning = player.onGround && Math.abs(player.vx) > 0.1;
    if (isRunning) {
      state.runPhase += 0.48;
      if (Math.random() > 0.74) {
        state.dust.push({
          x: player.x + (player.facing > 0 ? 18 : player.w - 18),
          y: player.y + player.h - 3,
          vx: -player.vx * 0.22 + (Math.random() - 0.5) * 0.8,
          vy: -0.25 - Math.random() * 0.65,
          size: 2 + Math.random() * 3,
          life: 22 + Math.random() * 12
        });
      }
    }

    state.dust = state.dust.filter((d) => d.life > 0);
    for (const d of state.dust) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.04;
      d.life -= 1;
    }

    state.cameraX = Math.max(0, Math.min(world.width - canvas.width, playerCenterX - canvas.width * 0.45));
  }

  function drawParallax() {
    const bg = (sprites.bgJungle && sprites.bgJungle.complete && sprites.bgJungle.naturalWidth > 0)
      ? sprites.bgJungle
      : sprites.bgJungle2;
    if (bg.complete && bg.naturalWidth > 0) {
      const parallax = state.cameraX * 0.05;
      const srcW = Math.max(420, bg.naturalWidth - parallax);
      const srcX = Math.min(bg.naturalWidth - srcW, parallax);
      ctx.drawImage(bg, srcX, 0, srcW, bg.naturalHeight, 0, 0, canvas.width, canvas.height);
      // Calm the scene a bit so gameplay elements read better.
      ctx.fillStyle = "rgba(245, 255, 252, 0.14)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#aef9f3");
    g.addColorStop(0.42, "#78e0c5");
    g.addColorStop(1, "#2ec57b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlatform(p) {
    const x = p.x - state.cameraX;
    if (drawSprite(sprites.platform, x, p.y - 16, p.w, p.h + 20)) return;
    ctx.fillStyle = "#886032";
    ctx.fillRect(x, p.y, p.w, p.h);
  }

  function drawHazard(h) {
    const x = h.x - state.cameraX;
    if (drawSprite(sprites.spike, x - 4, h.y - 6, h.w + 8, h.h + 12)) return;
    ctx.fillStyle = "#a7afb8";
    ctx.fillRect(x, h.y, h.w, h.h);
  }

  function drawCoin(c, timeMs) {
    const x = c.x - state.cameraX;
    const bob = Math.sin((timeMs + c.x * 2) * 0.011) * 2.5;
    const y = c.y + bob;
    if (drawSprite(sprites.coin, x - 18, y - 18, 36, 36)) return;
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLifePickup(item, timeMs) {
    const x = item.x - state.cameraX;
    const y = item.y + Math.sin((timeMs + item.x) * 0.008) * 3;
    if (drawSprite(sprites.heart, x - 16, y - 12, 32, 32)) return;
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(x - 6, y - 6, 12, 12);
  }

  function drawMonkey() {
    if (state.drowning) return;
    if (player.invincibleMs > 0 && Math.floor(player.invincibleMs / 100) % 2 === 0) {
      return;
    }

    const x = player.x - state.cameraX;
    const y = player.y;
    const running = player.onGround && Math.abs(player.vx) > 0.1;
    const stride = Math.sin(state.runPhase);
    const bob = running ? Math.abs(stride) * 7 : 0;
    const squashX = running ? 1 + Math.sin(state.runPhase * 2) * 0.08 : 1;
    const squashY = running ? 1 - Math.sin(state.runPhase * 2) * 0.1 : 1;
    const forwardNudge = running ? stride * 3.2 : 0;

    if (player.onGround) {
      const shadowW = running ? 34 + Math.abs(stride) * 10 : 34;
      const shadowH = running ? 10 - Math.abs(stride) * 2 : 10;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(x + player.w / 2, y + player.h + 4, shadowW, shadowH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const runFrames = loadedFrames(["monkeyRun1", "monkeyRun2", "monkeyRun3", "monkeyRun4"]);
    const runFrameIndex = Math.floor(state.runPhase * 0.9);
    const monkeySprite = running && runFrames.length > 0
      ? runFrames[runFrameIndex % runFrames.length]
      : (player.onGround ? sprites.monkeyIdle : sprites.monkeyJump);
    const spriteFacesRight = monkeySprite === sprites.monkeyIdle ? IDLE_SPRITE_FACES_RIGHT : SPRITE_FACES_RIGHT;
    ctx.save();
    ctx.translate(x + player.w / 2 + forwardNudge, y + player.h / 2 + bob);
    ctx.scale(player.facing * (spriteFacesRight ? 1 : -1), 1);
    ctx.scale(squashX, squashY);
    const tilt = Math.max(-0.25, Math.min(0.25, player.vy * 0.03));
    const runTilt = running ? Math.sin(state.runPhase * 1.8) * 0.12 + 0.08 : 0;
    ctx.rotate(tilt + runTilt);
    if (!drawSprite(monkeySprite, -50, -62, 102, 108)) {
      ctx.fillStyle = "#f28a16";
      ctx.fillRect(-20, -20, 40, 40);
    }
    ctx.restore();
  }

  function drawDrowningMonkey() {
    if (!state.drowning) return;
    const d = state.drowning;
    const x = d.x - state.cameraX;
    const y = d.y;
    const fallFrames = loadedFrames(["monkeyFall1", "monkeyFall2", "monkeyFall3"]);
    const splashFrames = loadedFrames(["monkeySplash1", "monkeySplash2"]);

    let sprite = sprites.monkeyJump;
    let rot = 0;
    let w = 104;
    let h = 110;
    if (d.timerMs < 190) {
      sprite = fallFrames[0] || sprites.monkeyJump;
      rot = 0.28;
    } else if (d.timerMs < 420) {
      sprite = fallFrames[1] || fallFrames[0] || sprites.monkeyJump;
      rot = 0.62;
      w = 112;
      h = 112;
    } else {
      sprite = splashFrames.length > 0 ? splashFrames[Math.floor((d.timerMs - 420) / 120) % splashFrames.length] : (fallFrames[2] || sprites.monkeyJump);
      rot = 1.02;
      w = 116;
      h = 100;
    }

    ctx.save();
    ctx.translate(x + player.w / 2, y + player.h / 2);
    ctx.scale(d.facing, 1);
    ctx.rotate(rot);
    drawSprite(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();

    for (const p of d.splashBursts) {
      const alpha = Math.max(0, p.life / 30);
      ctx.fillStyle = `rgba(232, 248, 255, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x - state.cameraX, p.y, p.size * 1.2, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWater(timeMs) {
    const y = world.waterY;
    const waterGrad = ctx.createLinearGradient(0, y - 8, 0, canvas.height);
    waterGrad.addColorStop(0, "#62d9ff");
    waterGrad.addColorStop(0.45, "#2696d4");
    waterGrad.addColorStop(1, "#0e5e9b");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, y, canvas.width, canvas.height - y);

    if (sprites.water.complete && sprites.water.naturalWidth > 0) {
      const pattern = ctx.createPattern(sprites.water, "repeat");
      if (pattern) {
        ctx.save();
        ctx.translate(-((timeMs * 0.14) % sprites.water.naturalWidth), y - 14);
        ctx.globalAlpha = 0.52;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, canvas.width + sprites.water.naturalWidth, canvas.height - y + 32);
        ctx.restore();
      }
    }

    ctx.strokeStyle = "rgba(240, 252, 255, 0.78)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 3; row += 1) {
      const base = y + 6 + row * 11;
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 10) {
        const wave = Math.sin((x + timeMs * 0.2 + row * 45) * 0.07) * 2.2;
        if (x === 0) ctx.moveTo(x, base + wave);
        else ctx.lineTo(x, base + wave);
      }
      ctx.stroke();
    }
  }

  function drawFinishLine() {
    const fx = state.finishX - state.cameraX;
    if (fx < -80 || fx > canvas.width + 80) return;

    const groundY = world.floorY + 10;
    ctx.strokeStyle = "#2b1d0f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(fx, groundY);
    ctx.lineTo(fx, groundY - 165);
    ctx.stroke();

    const flagW = 70;
    const flagH = 48;
    const startX = fx + 4;
    const startY = groundY - 160;
    const cell = 8;
    for (let y = 0; y < flagH; y += cell) {
      for (let x = 0; x < flagW; x += cell) {
        const dark = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = dark ? "#1b1b1b" : "#f7f7f7";
        ctx.fillRect(startX + x, startY + y, cell, cell);
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(startX + flagW + 8, groundY - 140, 3, 122);
  }

  function drawHud() {
    const scoreX = canvas.width - 250;
    const scoreY = 14;
    ctx.fillStyle = "rgba(95, 56, 24, 0.85)";
    ctx.fillRect(scoreX, scoreY, 148, 50);
    ctx.fillStyle = "rgba(245, 214, 145, 0.34)";
    ctx.fillRect(scoreX + 4, scoreY + 4, 140, 42);
    drawSprite(sprites.coin, scoreX + 7, scoreY + 10, 26, 26);
    ctx.fillStyle = "#fffbe7";
    ctx.font = "bold 30px Trebuchet MS";
    ctx.fillText(String(state.score), scoreX + 45, scoreY + 36);

    for (let i = 0; i < 3; i += 1) {
      const hx = canvas.width - 90 + i * 26;
      const shown = i < state.lives;
      if (shown && sprites.heart.complete && sprites.heart.naturalWidth > 0) {
        drawSprite(sprites.heart, hx - 12, 22, 24, 24);
      } else {
        ctx.fillStyle = shown ? "#ef4444" : "rgba(70, 10, 10, 0.8)";
        ctx.fillRect(hx - 8, 24, 16, 14);
      }
    }

    ctx.fillStyle = "rgba(52, 33, 14, 0.78)";
    ctx.fillRect(18, 16, 124, 40);
    ctx.fillStyle = "#fef8d9";
    ctx.font = "bold 22px Trebuchet MS";
    ctx.fillText(`L${state.level}`, 58, 43);
  }

  function drawPauseButton() {
    const p = state.controlRects.pause;
    if (drawSprite(sprites.pause, p.x, p.y, p.w, p.h)) return;
    ctx.fillStyle = "#eab308";
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawControlButton(rect, type) {
    const imageByType = {
      left: sprites.buttonLeft,
      right: sprites.buttonRight,
      up: sprites.buttonJump
    };
    if (drawSprite(imageByType[type], rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4)) return;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOverlayMessage() {
    if (!state.gameOver && !state.win && !state.paused && state.levelCompleteMs <= 0) return;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px Trebuchet MS";
    const title = state.levelCompleteMs > 0 ? `Level ${state.level} Complete!` : (state.paused ? "Paused" : (state.win ? "You Win!" : "Game Over"));
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 18);
    ctx.font = "22px Trebuchet MS";
    const subtitle = state.levelCompleteMs > 0
      ? "Loading next level..."
      : (state.paused ? "Press P or tap pause to continue" : "Press Space or Tap to Restart");
    ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 18);
    ctx.textAlign = "start";
  }

  function render(timeMs) {
    drawParallax();
    drawWater(timeMs);

    for (const p of platforms) {
      const screenX = p.x - state.cameraX;
      if (screenX + p.w >= -10 && screenX <= canvas.width + 10) drawPlatform(p);
    }

    for (const h of hazards) {
      const screenX = h.x - state.cameraX;
      if (screenX + h.w >= -10 && screenX <= canvas.width + 10) drawHazard(h);
    }

    drawFinishLine();

    for (const c of coins) {
      if (c.taken) continue;
      const screenX = c.x - state.cameraX;
      if (screenX >= -30 && screenX <= canvas.width + 30) drawCoin(c, timeMs);
    }

    for (const life of lifePickups) {
      if (life.taken) continue;
      const screenX = life.x - state.cameraX;
      if (screenX >= -30 && screenX <= canvas.width + 30) drawLifePickup(life, timeMs);
    }

    for (const d of state.dust) {
      const alpha = Math.max(0, d.life / 34);
      ctx.fillStyle = `rgba(255, 244, 204, ${alpha * 0.7})`;
      ctx.beginPath();
      ctx.ellipse(d.x - state.cameraX, d.y, d.size, d.size * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawMonkey();
    drawDrowningMonkey();
    drawHud();
    drawPauseButton();
    drawControlButton(state.controlRects.left, "left");
    drawControlButton(state.controlRects.right, "right");
    drawControlButton(state.controlRects.jump, "up");
    drawOverlayMessage();
  }

  function loop(timeMs) {
    if (!state.gameOver && !state.win && !state.paused) {
      updatePlayer();
    }
    render(timeMs);
    requestAnimationFrame(loop);
  }

  window.__MONKEY_DEBUG__ = {
    getState() {
      const remainingCoins = coins.reduce((count, coin) => count + (coin.taken ? 0 : 1), 0);
      return {
        score: state.score,
        level: state.level,
        lives: state.lives,
        bestScore: state.bestScore,
        gameOver: state.gameOver,
        win: state.win,
        levelCompleteMs: state.levelCompleteMs,
        playerX: player.x,
        playerY: player.y,
        cameraX: state.cameraX,
        remainingCoins
      };
    },
    forceLoseLife() {
      player.invincibleMs = 0;
      loseLife();
      return { lives: state.lives, gameOver: state.gameOver };
    }
  };

  requestAnimationFrame(loop);
})();
