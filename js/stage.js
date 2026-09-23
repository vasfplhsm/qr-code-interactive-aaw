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
  const nameFeed = document.getElementById("nameFeed");
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
  let hasCelebrated = false;
  let autoFillTimeoutHandle = null;
  let autoFillRAF = null;
  let animatingStartTime = null;

  const nameQueue = [];
  const knownParticipantIds = new Set();
  let namesInitialized = false;

  // Banner cycling: we show BANNER_BATCH names simultaneously,
  // alternating between left and right slots.
  const BANNER_BATCH = 6;            // names shown at once
  const BANNER_DURATION_MS = (CONFIG.NAME_DISPLAY_DURATION_SECONDS || 3) * 1000;
  const BANNER_STAGGER_MS = 400;    // delay between each banner popping in
  // Banner slots: each has a left and a right element pair
  // We'll re-use the existing left/right banners for slot 0,
  // and create additional floating divs for slots 1-5.
  const bannerSlots = [];   // [{left, right, timer}]
  let bannerProcessing = false;

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

  function applyPercent(percent) {
    setLiquidVisual(percent);
    if (percent >= 100 && !hasCelebrated) {
      hasCelebrated = true;
      startFireworks();
      celebrationEl.classList.add("show");
      setTimeout(() => {
        celebrationEl.classList.remove("show");
        stopFireworks();
      }, 8000);
    } else if (percent < 100 && hasCelebrated) {
      hasCelebrated = false;
      celebrationEl.classList.remove("show");
      stopFireworks();
    }
  }

  function paintRealtime() {
    if (autoFillRAF !== null) return;
    if (manualForced) { applyPercent(100); return; }
    applyPercent(actualPercentage());
  }

  // ---- Auto-fill animation ----
  function runAutoFillAnimation(fromPercent, startTimeMs, durationSeconds) {
    if (animatingStartTime === startTimeMs) return;
    animatingStartTime = startTimeMs;

    if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }

    const durationMs = Math.max(1, durationSeconds) * 1000;
    const alreadyElapsed = Date.now() - startTimeMs;

    if (alreadyElapsed >= durationMs) { paintRealtime(); return; }

    function step() {
      const t = Math.min(1, (Date.now() - startTimeMs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      applyPercent(fromPercent + (100 - fromPercent) * eased);
      if (t < 1) {
        autoFillRAF = requestAnimationFrame(step);
      } else {
        autoFillRAF = null;
        paintRealtime();
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
  // ================================================================
  function createBannerPair(index) {
    // Slot 0 reuses the existing HTML elements
    if (index === 0) {
      return {
        left: bannerLeft, right: bannerRight,
        nameLeft: bannerNameLeft, nameRight: bannerNameRight, timer: null
      };
    }
    // Extra slots: create new banner pairs dynamically
    const stageWrap = document.querySelector(".stage-wrap");

    const makeEl = (side, i) => {
      const wrap = document.createElement("div");
      wrap.className = `welcome-banner welcome-banner-${side} welcome-banner-extra`;
      // Offset vertically: slot 0 is at 20vh, each extra slot goes lower
      wrap.style.top = (20 + index * 11) + "vh";
      const row = document.createElement("div");
      row.className = "welcome-badge-row";
      const spark = document.createElement("span");
      spark.className = "welcome-sparkle";
      spark.textContent = "✨";
      const label = document.createElement("p");
      label.className = "welcome-label";
      label.textContent = "JUST JOINED";
      row.append(spark, label);
      const nameP = document.createElement("p");
      nameP.className = "welcome-name";
      wrap.append(row, nameP);
      stageWrap.appendChild(wrap);
      return { wrap, nameP };
    };

    const leftPair = makeEl("left", index);
    const rightPair = makeEl("right", index);
    return {
      left: leftPair.wrap, right: rightPair.wrap,
      nameLeft: leftPair.nameP, nameRight: rightPair.nameP,
      timer: null
    };
  }

  function initBannerSlots() {
    for (let i = 0; i < BANNER_BATCH; i++) {
      bannerSlots.push(createBannerPair(i));
    }
  }

  // Show one name in a specific banner slot (left = left side, right = right side)
  // Each slot alternates which side carries the name vs. stays hidden
  function showInSlot(slotIndex, name) {
    const slot = bannerSlots[slotIndex];
    if (!slot) return;
    // Clear any running hide timer
    if (slot.timer) clearTimeout(slot.timer);

    // Alternate: even slots use left+right both, but show name only on left;
    // odd slots show only on right. This gives visual variety.
    const useLeft = (slotIndex % 2 === 0);
    const useRight = (slotIndex % 2 === 1);

    if (useLeft) {
      slot.nameLeft.textContent = name;
      slot.nameRight.textContent = name;
      slot.left.classList.add("show");
      slot.right.classList.remove("show");
    } else {
      slot.nameLeft.textContent = name;
      slot.nameRight.textContent = name;
      slot.right.classList.add("show");
      slot.left.classList.remove("show");
    }

    slot.timer = setTimeout(() => {
      slot.left.classList.remove("show");
      slot.right.classList.remove("show");
    }, BANNER_DURATION_MS);
  }

  // ================================================================
  //  Syringe name tags – permanent pills on BOTH sides, up to 100
  // ================================================================
  function initNameTagSlots() {
    // Pre-create MAX_NAME_TAGS slot elements; they start invisible
    for (let i = 0; i < MAX_NAME_TAGS; i++) {
      const el = document.createElement("div");
      el.className = "syringe-name-tag";
      syringeNameTags.appendChild(el);
      tagSlots.push({ el, occupied: false, side: i % 2 === 0 ? "right" : "left" });
    }
    window.addEventListener("resize", repositionAllTags);
  }

  function positionTagSlot(index, el) {
    const svgEl = document.getElementById("syringeSvg");
    const zone = document.querySelector(".syringe-zone");
    const svgRect = svgEl ? svgEl.getBoundingClientRect() : null;
    const zoneRect = zone ? zone.getBoundingClientRect() : null;
    if (!svgRect || !zoneRect) return;

    const rightEdge = svgRect.right - zoneRect.left;
    const leftEdge = svgRect.left - zoneRect.left;
    const topEdge = svgRect.top - zoneRect.top;
    const syrHeight = svgRect.height;

    // Count how many tags are on each side up to this index
    const side = tagSlots[index].side;
    let sideIndex = 0;
    for (let i = 0; i < index; i++) {
      if (tagSlots[i].side === side) sideIndex++;
    }

    // Spread across 80% of syringe height (10% margin top+bottom)
    const spread = syrHeight * 0.80;
    const startY = topEdge + syrHeight * 0.10;
    const maxPerSide = Math.ceil(MAX_NAME_TAGS / 2);
    const step = maxPerSide > 1 ? spread / (maxPerSide - 1) : 0;
    const tagY = startY + sideIndex * step;

    if (side === "right") {
      el.style.left = (rightEdge + 14) + "px";
    } else {
      // Position to the LEFT of the syringe; we use right-side anchor but negative offset
      el.style.left = "";
      el.style.right = (zoneRect.width - leftEdge + 14) + "px";
    }
    el.style.top = tagY + "px";
  }

  function repositionAllTags() {
    tagSlots.forEach((slot, i) => positionTagSlot(i, slot.el));
  }

  function addNameTag(name) {
    // Find next unoccupied slot
    const freeSlot = tagSlots.find(s => !s.occupied);
    if (!freeSlot) return; // all 100 filled — ignore
    const index = tagSlots.indexOf(freeSlot);

    freeSlot.el.textContent = name;
    freeSlot.occupied = true;
    positionTagSlot(index, freeSlot.el);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => freeSlot.el.classList.add("visible"));
    });
  }

  // ================================================================
  //  Name queue – process BANNER_BATCH names simultaneously, fast
  // ================================================================
  function enqueueName(name) { nameQueue.push(name); processQueue(); }

  function processQueue() {
    if (bannerProcessing || nameQueue.length === 0) return;
    bannerProcessing = true;

    // Take up to BANNER_BATCH names at once
    const batch = nameQueue.splice(0, BANNER_BATCH);

    batch.forEach((name, i) => {
      setTimeout(() => {
        showInSlot(i, name);
        addNameTag(name);
        addToFeed(name);
      }, i * BANNER_STAGGER_MS);
    });

    // After the banner duration + stagger, release and process next batch
    const totalWait = BANNER_DURATION_MS + batch.length * BANNER_STAGGER_MS + 300;
    setTimeout(() => {
      bannerProcessing = false;
      processQueue();
    }, totalWait);
  }

  function addToFeed(name) {
    const chip = document.createElement("div");
    chip.className = "feed-chip";
    chip.textContent = name;
    nameFeed.prepend(chip);
    while (nameFeed.children.length > 20) nameFeed.removeChild(nameFeed.lastChild);
  }

  // ================================================================
  //  Fireworks (canvas-based)
  // ================================================================
  let fwCtx = null;
  let fwRAF = null;
  let fwParticles = [];

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
    "#FF6B6B", "#FFE66D", "#4ECDC4", "#A8E6CF",
    "#FF8B94", "#FFD700", "#29ABE2", "#4FC3F7",
    "#1FA37A", "#F7971E", "#FF4E50", "#C6EA8D",
    "#FFFFFF", "#B8D4FF"
  ];

  class FireworkParticle {
    constructor(x, y) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      this.x = x;
      this.y = y;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.decay = 0.012 + Math.random() * 0.018;
      this.radius = 2 + Math.random() * 3;
      this.color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
      this.gravity = 0.12;
      // trail
      this.trail = [];
      this.maxTrail = 8;
    }
    update() {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > this.maxTrail) this.trail.shift();
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.vx *= 0.98;
      this.alpha -= this.decay;
    }
    draw(ctx) {
      // Draw trail
      for (let i = 0; i < this.trail.length; i++) {
        const a = (i / this.trail.length) * this.alpha * 0.5;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Draw head
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    isDead() { return this.alpha <= 0; }
  }

  class FireworkShell {
    constructor() {
      this.x = 0.1 * window.innerWidth + Math.random() * 0.8 * window.innerWidth;
      this.y = window.innerHeight;
      this.vy = -(12 + Math.random() * 10);
      this.vx = (Math.random() - 0.5) * 3;
      this.targetY = 0.15 * window.innerHeight + Math.random() * 0.5 * window.innerHeight;
      this.exploded = false;
      this.color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    }
    update() {
      if (this.exploded) return true;
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.35; // gravity on shell
      if (this.vy >= -2 || this.y <= this.targetY) {
        this.explode();
        return true;
      }
      return false;
    }
    explode() {
      this.exploded = true;
      const count = 80 + Math.floor(Math.random() * 60);
      for (let i = 0; i < count; i++) {
        fwParticles.push(new FireworkParticle(this.x, this.y));
      }
    }
    draw(ctx) {
      if (this.exploded) return;
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  let fwShells = [];
  let fwLaunchInterval = null;

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

    // Launch a burst immediately, then every ~700ms
    launchShell(); launchShell(); launchShell();
    fwLaunchInterval = setInterval(() => {
      const burst = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < burst; i++) setTimeout(launchShell, i * 180);
    }, 700);

    if (fwRAF) cancelAnimationFrame(fwRAF);
    fwRAF = requestAnimationFrame(fwLoop);
  }

  function stopFireworks() {
    if (fwLaunchInterval) { clearInterval(fwLaunchInterval); fwLaunchInterval = null; }
    // Let existing particles finish naturally (RAF will clean up when empty)
    const stopLoop = () => {
      if (fwShells.length === 0 && fwParticles.length === 0) {
        cancelAnimationFrame(fwRAF);
        fwRAF = null;
        if (fwCtx) fwCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
        return;
      }
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
      knownParticipantIds.clear();
      namesInitialized = false;
      nameQueue.length = 0;
      bannerProcessing = false;
      if (nameFeed) nameFeed.innerHTML = "";
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
    const autoFillTriggered = !!data.autoFillTriggered;
    const dbStartTime = data.autoFillStartTime || null;
    const dbStartPct = typeof data.autoFillStartPercentage === "number"
      ? data.autoFillStartPercentage : 0;

    readyOverlay.classList.toggle("show", !eventStarted);

    if (!eventStarted) {
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
