// ============================================================
// STAGE DISPLAY  –  v6
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const CONFIG = window.AAW_CONFIG;

  const percentEl = document.getElementById("percentDisplay");
  const liquidRect = document.getElementById("liquidRect");
  const readyOverlay = document.getElementById("readyOverlay");
  const readyText = document.getElementById("readyText");
  const eventTitleEl = document.getElementById("eventTitle");
  const bannerLeft = document.getElementById("welcomeBannerLeft");
  const bannerNameLeft = document.getElementById("welcomeNameLeft");
  const bannerRight = document.getElementById("welcomeBannerRight");
  const bannerNameRight = document.getElementById("welcomeNameRight");
  const celebrationEl = document.getElementById("celebration");
  const celebrationText = document.getElementById("celebrationText");
  const fireworksCanvas = document.getElementById("fireworksCanvas");
  const syringeNameTags = document.getElementById("syringeNameTags");

  eventTitleEl.textContent = CONFIG.EVENT_NAME;
  readyText.textContent = CONFIG.EVENT_START_MESSAGE;
  celebrationText.textContent = CONFIG.EVENT_COMPLETION_MESSAGE;

  // ---- Apply custom colours ----
  const rootStyle = document.documentElement.style;
  const colors = CONFIG.EVENT_COLORS || {};
  const colorVarMap = {
    stageBackground: "--stage-bg",
    stageBackgroundAlt: "--stage-bg-alt",
    liquidTop: "--liquid-top",
    liquidBottom: "--liquid-bottom",
    accent: "--accent",
    glow: "--glow",
    textLight: "--text-light"
  };
  Object.keys(colorVarMap).forEach((key) => {
    if (colors[key]) rootStyle.setProperty(colorVarMap[key], colors[key]);
  });

  // ---- State ----
  let activeCount = 0;
  let targetParticipants = CONFIG.TARGET_PARTICIPANTS;
  let eventStarted = false;
  let eventStartTime = null;
  let manualForced = false;
  let autoFillTriggered = false;
  let hasCelebrated = false;
  let autoFillTimeoutHandle = null;
  let autoFillRAF = null;
  let animatingStartTime = null;

  const nameQueue = [];
  const knownParticipantIds = new Set();
  let namesInitialized = false;

  // Banner cycling: we show BANNER_BATCH names simultaneously,
  // 5 slots on left, 5 slots on right
  const BANNER_BATCH = 10;           // names shown at once
  const BANNER_DURATION_MS = (CONFIG.NAME_DISPLAY_DURATION_SECONDS || 3) * 1000;
  const BANNER_STAGGER_MS = 400;    // delay between each banner popping in
  const bannerSlots = [];

  // Syringe name-tag state – permanent pills on BOTH sides, up to 100
  const MAX_NAME_TAGS = 100;
  const tagSlots = [];     // array of {el}

  const TOP_Y = 38;
  const BOTTOM_Y = 482;
  const FULL_HEIGHT = BOTTOM_Y - TOP_Y;

  // ---- Core rendering ----
  function setLiquidVisual(percent) {
    const p = AAWUtils.clampPercentage(percent);
    liquidRect.setAttribute("y", (BOTTOM_Y - (p / 100) * FULL_HEIGHT).toFixed(1));
    liquidRect.setAttribute("height", ((p / 100) * FULL_HEIGHT).toFixed(1));
    percentEl.textContent = Math.round(p) + "%";
  }

  function actualPercentage() {
    if (!targetParticipants) return 0;
    return AAWUtils.clampPercentage((activeCount / targetParticipants) * 100);
  }

  const CELEBRATION_DURATION_MS = Math.max(60000, (CONFIG.CELEBRATION_DURATION_SECONDS || 60) * 1000); // At least 1 minute
  let celebrationTimeoutHandle = null;

  function applyPercent(percent) {
    setLiquidVisual(percent);
    if (percent >= 100 && !hasCelebrated) {
      hasCelebrated = true;
      startFireworks();
      celebrationEl.classList.add("show");
      if (celebrationTimeoutHandle) clearTimeout(celebrationTimeoutHandle);
      celebrationTimeoutHandle = setTimeout(() => {
        celebrationEl.classList.remove("show");
        stopFireworks();
      }, CELEBRATION_DURATION_MS);
    } else if (percent < 100 && hasCelebrated && !autoFillTriggered && !manualForced) {
      hasCelebrated = false;
      if (celebrationTimeoutHandle) {
        clearTimeout(celebrationTimeoutHandle);
        celebrationTimeoutHandle = null;
      }
      celebrationEl.classList.remove("show");
      stopFireworks();
    }
  }

  function paintRealtime() {
    if (autoFillRAF !== null) return;
    if (manualForced || autoFillTriggered) { applyPercent(100); return; }
    applyPercent(actualPercentage());
  }

  // ---- Auto-fill animation ----
  function runAutoFillAnimation(fromPercent, startTimeMs, durationSeconds) {
    if (animatingStartTime === startTimeMs) return;
    animatingStartTime = startTimeMs;

    if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }

    const durationMs = Math.max(1, durationSeconds) * 1000;
    const alreadyElapsed = Date.now() - startTimeMs;

    if (alreadyElapsed >= durationMs) { applyPercent(100); return; }

    function step() {
      const t = Math.min(1, (Date.now() - startTimeMs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      applyPercent(fromPercent + (100 - fromPercent) * eased);
      if (t < 1) {
        autoFillRAF = requestAnimationFrame(step);
      } else {
        autoFillRAF = null;
        applyPercent(100);
      }
    }
    autoFillRAF = requestAnimationFrame(step);
  }

  // ---- Auto-fill trigger scheduling ----
  function scheduleAutoFillCheck() {
    if (autoFillTimeoutHandle) { clearTimeout(autoFillTimeoutHandle); autoFillTimeoutHandle = null; }
    if (!eventStarted || !eventStartTime) return;

    const delayMs = CONFIG.AUTO_FILL_DELAY_SECONDS * 1000;
    const remaining = delayMs - (Date.now() - eventStartTime);

    const fire = () => {
      if (actualPercentage() >= 100) return;
      db.ref("event/autoFillTriggered").transaction((cur) => {
        if (cur) return;
        return true;
      }).then((res) => {
        if (res.committed) {
          db.ref("event").update({
            autoFillStartTime: Date.now(),
            autoFillStartPercentage: actualPercentage()
          });
        }
      });
    };

    if (remaining <= 0) fire();
    else autoFillTimeoutHandle = setTimeout(fire, remaining);
  }

  // ================================================================
  //  Multi-banner system: BANNER_BATCH names shown simultaneously
  //  5 slots on LEFT (indices 0, 2, 4, 6, 8)
  //  5 slots on RIGHT (indices 1, 3, 5, 7, 9)
  // ================================================================
  function createBannerSlot(index) {
    const side = (index % 2 === 0) ? "left" : "right";
    const row = Math.floor(index / 2); // 0 .. 4
    // Left starts at 12vh, Right starts at 14vh; step 16vh down (max row 4 is at 76vh / 78vh)
    const topVh = (side === "left" ? 12 : 14) + row * 16;

    if (index === 0) {
      bannerLeft.style.top = topVh + "vh";
      return {
        side, left: bannerLeft, right: null,
        nameLeft: bannerNameLeft, nameRight: null,
        timer: null
      };
    }
    if (index === 1) {
      bannerRight.style.top = topVh + "vh";
      return {
        side, left: null, right: bannerRight,
        nameLeft: null, nameRight: bannerNameRight,
        timer: null
      };
    }

    const stageWrap = document.querySelector(".stage-wrap");
    const wrap = document.createElement("div");
    wrap.className = `welcome-banner welcome-banner-${side} welcome-banner-extra`;
    wrap.style.top = topVh + "vh";

    const rowEl = document.createElement("div");
    rowEl.className = "welcome-badge-row";
    const spark = document.createElement("span");
    spark.className = "welcome-sparkle";
    spark.textContent = "✨";
    const label = document.createElement("p");
    label.className = "welcome-label";
    label.textContent = "JUST JOINED";
    rowEl.append(spark, label);

    const nameP = document.createElement("p");
    nameP.className = "welcome-name";
    wrap.append(rowEl, nameP);
    stageWrap.appendChild(wrap);

    return {
      side,
      left: (side === "left" ? wrap : null),
      right: (side === "right" ? wrap : null),
      nameLeft: (side === "left" ? nameP : null),
      nameRight: (side === "right" ? nameP : null),
      timer: null
    };
  }

  function initBannerSlots() {
    for (let i = 0; i < BANNER_BATCH; i++) {
      bannerSlots.push(createBannerSlot(i));
    }
  }

  // Show one name in a specific banner slot
  function showInSlot(slotIndex, name) {
    const slot = bannerSlots[slotIndex];
    if (!slot) return;
    // Clear any running hide timer (slot claimed by processQueue via sentinel -1)
    if (slot.timer && slot.timer !== -1) clearTimeout(slot.timer);

    const bannerEl = slot.side === "left" ? slot.left : slot.right;
    const nameEl = slot.side === "left" ? slot.nameLeft : slot.nameRight;

    if (nameEl) nameEl.textContent = name;
    if (bannerEl) bannerEl.classList.add("show");

    slot.timer = setTimeout(() => {
      if (bannerEl) bannerEl.classList.remove("show");
      slot.timer = null;   // slot is now free
      processQueue();      // immediately pick up any waiting names
    }, BANNER_DURATION_MS);
  }

  // ================================================================
  //  Syringe name tags – permanent pills on BOTH sides (50 right, 50 left)
  //  Alternates filling: even slots -> right, odd slots -> left
  //  Scattered across 3 columns × 17 rows per side, strictly beside barrel
  // ================================================================
  function initNameTagSlots() {
    const COLS = 3;
    const MAX_ROWS = 17;

    for (let i = 0; i < MAX_NAME_TAGS; i++) {
      const el = document.createElement("div");
      el.className = "syringe-name-tag";
      syringeNameTags.appendChild(el);

      // Alternate right and left sides
      const zone = (i % 2 === 0) ? "right" : "left";
      const k = Math.floor(i / 2); // 0 .. 49 per side

      // Dispersed row & col using coprime strides (guaranteed 100% collision-free)
      let row, col;
      if (zone === "right") {
        row = (k * 7) % MAX_ROWS;
        col = (k * 2) % COLS;
      } else {
        row = (k * 7 + 9) % MAX_ROWS;
        col = (k * 2 + 1) % COLS;
      }

      // Two deterministic jitter axes (-1 … +1) for organic scattering
      const jitter  = (((i * 7  + 3) % 20) - 10) / 10;
      const jitter2 = (((i * 11 + 5) % 20) - 10) / 10;

      tagSlots.push({ slotIndex: i, el, occupied: false, zone, row, col, jitter, jitter2 });
    }
    window.addEventListener("resize", repositionAllTags);
  }

  function positionTagSlot(index, el) {
    const svgEl   = document.getElementById("syringeSvg");
    const zoneEl  = document.querySelector(".syringe-zone");
    const svgRect  = svgEl  ? svgEl.getBoundingClientRect()  : null;
    const zoneRect = zoneEl ? zoneEl.getBoundingClientRect() : null;
    if (!svgRect || !zoneRect) return;

    // Accurate barrel coordinates within the SVG viewBox (0 0 260 590):
    // Barrel is x=60 to x=200 out of width 260
    const barrelLeftPx  = (svgRect.left - zoneRect.left) + (60 / 260) * svgRect.width;
    const barrelRightPx = (svgRect.left - zoneRect.left) + (200 / 260) * svgRect.width;
    const topEdge       = svgRect.top - zoneRect.top;
    const syrHeight     = svgRect.height;

    const info    = tagSlots[index];
    const tagZone = info.zone;
    const row     = info.row;
    const col     = info.col;
    const jitter  = info.jitter;   // Y scatter axis (-1 … +1)
    const jitter2 = info.jitter2;  // X scatter axis (-1 … +1)

    const COLS     = 3;
    const MAX_ROWS = 17;

    // Vertical: spread across 74% of syringe height, beside barrel (never covering % below)
    const vSpread  = syrHeight * 0.74;
    const startY   = topEdge + syrHeight * 0.08;
    const rowStep  = MAX_ROWS > 1 ? vSpread / (MAX_ROWS - 1) : vSpread;

    // Subtle column stagger so adjacent columns interleave like bricks
    const colYShift = col * (rowStep / COLS);
    const tagY = startY + row * rowStep + colYShift + jitter * (rowStep * 0.12);

    // Horizontal: columns step outwards from the syringe barrel neatly
    const COL_STEP = 75;  // px between column centres
    const BASE_X   = 12;  // px gap from syringe barrel to first column
    const tagX = BASE_X + col * COL_STEP + jitter2 * 6;

    if (tagZone === "right") {
      el.style.left  = (barrelRightPx + tagX) + "px";
      el.style.right = "";
    } else {
      el.style.left  = "";
      el.style.right = (zoneRect.width - barrelLeftPx + tagX) + "px";
    }
    el.style.top = tagY + "px";
  }

  function repositionAllTags() {
    tagSlots.forEach((slot, i) => {
      if (slot.occupied) positionTagSlot(i, slot.el);
    });
  }

  function addNameTag(name) {
    const freeSlot = tagSlots.find(s => !s.occupied);
    if (!freeSlot) return; // all 100 filled — ignore

    freeSlot.el.textContent = name;
    freeSlot.occupied = true;

    positionTagSlot(freeSlot.slotIndex, freeSlot.el);

    // Animate new tag in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => freeSlot.el.classList.add("visible"));
    });
  }

  // ================================================================
  //  Name queue – slot-based: names appear immediately in free slots
  // ================================================================
  function enqueueName(name) { nameQueue.push(name); processQueue(); }

  function processQueue() {
    if (nameQueue.length === 0) return;

    // Claim all currently free slots in one synchronous pass
    // (sentinel -1 prevents double-claiming in the same tick)
    const pending = [];
    for (let si = 0; si < bannerSlots.length; si++) {
      if (nameQueue.length === 0) break;
      const slot = bannerSlots[si];
      if (slot.timer !== null) continue;   // busy or already claimed
      slot.timer = -1;                     // sentinel: claimed, not yet showing
      pending.push({ si, name: nameQueue.shift() });
    }

    // Show each claimed name with a small stagger so they don't all fire at once
    pending.forEach(({ si, name }, i) => {
      setTimeout(() => {
        showInSlot(si, name);
        addNameTag(name);
      }, i * BANNER_STAGGER_MS);
    });
  }

  // ================================================================
  //  Enhanced Fireworks (canvas-based, multi-burst & glittering trails)
  // ================================================================
  let fwCtx = null;
  let fwRAF = null;
  let fwParticles = [];
  let fwShells = [];
  let fwLaunchInterval = null;

  function initFireworksCanvas() {
    fireworksCanvas.width = window.innerWidth;
    fireworksCanvas.height = window.innerHeight;
    fwCtx = fireworksCanvas.getContext("2d");
    window.addEventListener("resize", () => {
      fireworksCanvas.width = window.innerWidth;
      fireworksCanvas.height = window.innerHeight;
    });
  }

  const FW_COLORS = [
    "#FF2A6D", "#FF6B6B", "#FFD700", "#FFE66D",
    "#00F5D4", "#05D9E8", "#01BEFE", "#7B2CBF",
    "#9D4EDD", "#FF007F", "#00F0FF", "#38B000",
    "#70E000", "#FFFFFF", "#FFB703", "#FB8500"
  ];

  class FireworkParticle {
    constructor(x, y, color, options = {}) {
      const angle = options.angle !== undefined ? options.angle : Math.random() * Math.PI * 2;
      const speed = options.speed !== undefined ? options.speed : (2.5 + Math.random() * 8.5);
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.decay = options.decay || (0.008 + Math.random() * 0.015);
      this.radius = options.radius || (2 + Math.random() * 2.8);
      this.color = color || FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      this.gravity = options.gravity !== undefined ? options.gravity : 0.095;
      this.friction = options.friction || 0.98;
      this.sparkle = options.sparkle || (Math.random() < 0.4);
      this.trail = [];
      this.maxTrail = options.maxTrail || 7;
    }

    update() {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > this.maxTrail) this.trail.shift();
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.alpha -= this.decay;
    }

    draw(ctx) {
      if (this.alpha <= 0) return;
      let drawAlpha = this.alpha;
      if (this.sparkle && this.alpha < 0.65 && Math.random() < 0.3) {
        drawAlpha = this.alpha * 0.25;
      }

      // Trail
      const tLen = this.trail.length;
      for (let i = 0; i < tLen; i++) {
        const factor = (i + 1) / tLen;
        ctx.globalAlpha = factor * drawAlpha * 0.45;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * factor * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core particle
      ctx.globalAlpha = drawAlpha;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    isDead() { return this.alpha <= 0; }
  }

  class FireworkShell {
    constructor(startX, startY, targetY, burstType) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.x = startX !== undefined ? startX : (0.06 * w + Math.random() * 0.88 * w);
      this.y = startY !== undefined ? startY : h;
      this.vy = -(14 + Math.random() * 9);
      this.vx = (Math.random() - 0.5) * 3.5;
      this.targetY = targetY !== undefined ? targetY : (0.10 * h + Math.random() * 0.45 * h);
      this.exploded = false;
      this.color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      this.secondaryColor = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      this.burstType = burstType || (Math.random() < 0.28 ? "ring" : Math.random() < 0.52 ? "willow" : "chrysanthemum");
      this.trail = [];
    }

    update() {
      if (this.exploded) return true;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();

      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.32;

      if (this.vy >= -1.5 || this.y <= this.targetY) {
        this.explode();
        return true;
      }
      return false;
    }

    explode() {
      this.exploded = true;
      if (this.burstType === "ring") {
        const count = 55 + Math.floor(Math.random() * 25);
        const speed = 4.5 + Math.random() * 3.5;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          fwParticles.push(new FireworkParticle(this.x, this.y, this.color, {
            angle,
            speed: speed + (Math.random() - 0.5) * 0.5,
            decay: 0.011 + Math.random() * 0.009
          }));
        }
        for (let i = 0; i < 22; i++) {
          fwParticles.push(new FireworkParticle(this.x, this.y, "#FFFFFF", {
            speed: 1.5 + Math.random() * 2.5,
            decay: 0.02 + Math.random() * 0.02,
            sparkle: true
          }));
        }
      } else if (this.burstType === "willow") {
        const count = 95 + Math.floor(Math.random() * 50);
        const willowColor = Math.random() < 0.5 ? "#FFD700" : "#00F5D4";
        for (let i = 0; i < count; i++) {
          fwParticles.push(new FireworkParticle(this.x, this.y, willowColor, {
            speed: 2 + Math.random() * 7,
            decay: 0.007 + Math.random() * 0.008,
            gravity: 0.12,
            maxTrail: 10,
            sparkle: true
          }));
        }
      } else {
        const count = 120 + Math.floor(Math.random() * 60);
        for (let i = 0; i < count; i++) {
          const c = (i % 2 === 0) ? this.color : this.secondaryColor;
          fwParticles.push(new FireworkParticle(this.x, this.y, c, {
            speed: 2.2 + Math.random() * 8.5,
            decay: 0.009 + Math.random() * 0.014,
            sparkle: Math.random() < 0.4
          }));
        }
      }
    }

    draw(ctx) {
      if (this.exploded) return;
      for (let i = 0; i < this.trail.length; i++) {
        ctx.globalAlpha = ((i + 1) / this.trail.length) * 0.6;
        ctx.fillStyle = "#FFE66D";
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function launchShell() {
    fwShells.push(new FireworkShell());
  }

  function fwLoop() {
    if (!fwCtx) return;
    fwCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);

    // Update & draw shells
    fwShells = fwShells.filter((s) => {
      const done = s.update();
      s.draw(fwCtx);
      return !done;
    });

    // Update & draw particles
    fwParticles = fwParticles.filter((p) => {
      p.update();
      p.draw(fwCtx);
      return !p.isDead();
    });

    fwRAF = requestAnimationFrame(fwLoop);
  }

  function startFireworks() {
    if (!fwCtx) initFireworksCanvas();
    fwShells = [];
    fwParticles = [];
    fireworksCanvas.width = window.innerWidth;
    fireworksCanvas.height = window.innerHeight;

    // Launch a spectacular opening salvo of 7 shells
    for (let i = 0; i < 7; i++) {
      setTimeout(launchShell, i * 110);
    }

    // Ongoing high-energy fireworks every 360ms
    let tickCount = 0;
    if (fwLaunchInterval) clearInterval(fwLaunchInterval);
    fwLaunchInterval = setInterval(() => {
      tickCount++;
      // Every ~10 ticks (~3.6s), trigger a salvo burst of 4 shells
      const burstSize = (tickCount % 10 === 0)
        ? (3 + Math.floor(Math.random() * 2))
        : (1 + Math.floor(Math.random() * 3));

      for (let i = 0; i < burstSize; i++) {
        setTimeout(launchShell, i * 90);
      }
    }, 360);

    if (fwRAF) cancelAnimationFrame(fwRAF);
    fwRAF = requestAnimationFrame(fwLoop);
  }

  function stopFireworks() {
    if (fwLaunchInterval) { clearInterval(fwLaunchInterval); fwLaunchInterval = null; }
    // Let active particles fade out naturally
    const stopLoop = () => {
      if (fwShells.length === 0 && fwParticles.length === 0) {
        cancelAnimationFrame(fwRAF);
        fwRAF = null;
        if (fwCtx) fwCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
        return;
      }
      if (!fwCtx) return;
      fwCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
      fwShells = fwShells.filter(s => { const d = s.update(); s.draw(fwCtx); return !d; });
      fwParticles = fwParticles.filter(p => { p.update(); p.draw(fwCtx); return !p.isDead(); });
      fwRAF = requestAnimationFrame(stopLoop);
    };
    if (fwRAF) { cancelAnimationFrame(fwRAF); fwRAF = null; }
    fwRAF = requestAnimationFrame(stopLoop);
  }

  // ---- Firebase: participants ----
  db.ref("participants").orderByChild("status").equalTo("active").on("value", (snapshot) => {
    const data = snapshot.val() || {};
    const ids = Object.keys(data);
    activeCount = ids.length;

    if (ids.length === 0) {
      autoFillTriggered = false;
      if (celebrationTimeoutHandle) {
        clearTimeout(celebrationTimeoutHandle);
        celebrationTimeoutHandle = null;
      }
      hasCelebrated = false;
      celebrationEl.classList.remove("show");
      stopFireworks();

      knownParticipantIds.clear();
      namesInitialized = false;
      nameQueue.length = 0;
      // Clear all banner slots
      bannerSlots.forEach(s => {
        if (s.timer && s.timer !== -1) clearTimeout(s.timer);
        s.timer = null;
        if (s.left)  s.left.classList.remove("show");
        if (s.right) s.right.classList.remove("show");
      });
      // Clear all name tags
      tagSlots.forEach(s => {
        s.el.classList.remove("visible");
        s.occupied = false;
      });
    } else if (!namesInitialized) {
      // ---- FIX: enqueue ALL existing participants on first load ----
      const sorted = ids.slice().sort((a, b) => (data[a].timestamp || 0) - (data[b].timestamp || 0));
      sorted.forEach((id) => {
        knownParticipantIds.add(id);
        if (data[id] && data[id].name) enqueueName(AAWUtils.escapeHTML(data[id].name));
      });
      namesInitialized = true;
    } else {
      const newIds = ids
        .filter((id) => !knownParticipantIds.has(id))
        .sort((a, b) => (data[a].timestamp || 0) - (data[b].timestamp || 0));
      newIds.forEach((id) => {
        knownParticipantIds.add(id);
        if (data[id] && data[id].name) enqueueName(AAWUtils.escapeHTML(data[id].name));
      });
    }

    paintRealtime();
  });

  // ---- Firebase: event ----
  db.ref("event").on("value", (snapshot) => {
    const data = snapshot.val() || {};
    targetParticipants = data.targetParticipants || CONFIG.TARGET_PARTICIPANTS;
    eventStarted = !!data.eventStarted;
    eventStartTime = data.eventStartTime || null;
    manualForced = data.manualOverride === "force100";
    autoFillTriggered = !!data.autoFillTriggered;
    const dbStartTime = data.autoFillStartTime || null;
    const dbStartPct = typeof data.autoFillStartPercentage === "number"
      ? data.autoFillStartPercentage : 0;

    readyOverlay.classList.toggle("show", !eventStarted);

    if (!eventStarted) {
      autoFillTriggered = false;
      if (autoFillTimeoutHandle) { clearTimeout(autoFillTimeoutHandle); autoFillTimeoutHandle = null; }
      if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }
      animatingStartTime = null;
      hasCelebrated = false;
      celebrationEl.classList.remove("show");
      stopFireworks();
      paintRealtime();
      return;
    }

    if (manualForced) {
      if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }
      applyPercent(100);
      return;
    }

    if (autoFillTriggered && dbStartTime != null) {
      runAutoFillAnimation(dbStartPct, dbStartTime, CONFIG.AUTO_FILL_DURATION_SECONDS);
    } else {
      scheduleAutoFillCheck();
    }

    paintRealtime();
  });

  // ---- Init ----
  setLiquidVisual(0);
  initBannerSlots();
  initNameTagSlots();
  // Reposition tags after layout is ready
  requestAnimationFrame(() => requestAnimationFrame(repositionAllTags));
  initFireworksCanvas();
});
