// ============================================================
// STAGE DISPLAY  –  v5
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
  let displayingName = false;
  const knownParticipantIds = new Set();
  let namesInitialized = false;

  // Syringe name-tag state: list of {el, slot} pairs
  const NAME_TAG_SLOTS = 6;      // max persistent tags beside syringe
  const TAG_LIFETIME_MS = 20000;  // how long a tag stays visible
  const tagSlots = [];     // array of {el, timeoutId} per slot index

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
  //  Dual banner popup (left + right simultaneously)
  // ================================================================
  function showBanners(name) {
    bannerNameLeft.textContent = name;
    bannerNameRight.textContent = name;
    bannerLeft.classList.add("show");
    bannerRight.classList.add("show");

    setTimeout(() => {
      bannerLeft.classList.remove("show");
      bannerRight.classList.remove("show");
    }, CONFIG.NAME_DISPLAY_DURATION_SECONDS * 1000);
  }

  // ================================================================
  //  Syringe name tags (persistent pills that stay beside the syringe)
  // ================================================================
  function initNameTagSlots() {
    for (let i = 0; i < NAME_TAG_SLOTS; i++) {
      const el = document.createElement("div");
      el.className = "syringe-name-tag";
      syringeNameTags.appendChild(el);
      tagSlots.push({ el, timeoutId: null, occupied: false });
      positionTagSlot(i, el);
    }
    // Reposition on resize
    window.addEventListener("resize", repositionAllTags);
  }

  function positionTagSlot(index, el) {
    // We pin tags on the RIGHT side of the syringe.
    // Vertical: spread them across the syringe barrel area.
    const svgEl = document.getElementById("syringeSvg");
    const zone = document.querySelector(".syringe-zone");
    const svgRect = svgEl ? svgEl.getBoundingClientRect() : null;
    const zoneRect = zone ? zone.getBoundingClientRect() : null;

    if (!svgRect || !zoneRect) return;

    const rightEdge = svgRect.right - zoneRect.left;
    const topEdge = svgRect.top - zoneRect.top;
    const syrHeight = svgRect.height;
    // Spread tags from ~15% to ~85% of syringe height
    const spread = syrHeight * 0.70;
    const startY = topEdge + syrHeight * 0.15;
    const step = NAME_TAG_SLOTS > 1 ? spread / (NAME_TAG_SLOTS - 1) : 0;

    el.style.left = (rightEdge + 16) + "px";
    el.style.top = (startY + index * step) + "px";
  }

  function repositionAllTags() {
    tagSlots.forEach((slot, i) => positionTagSlot(i, slot.el));
  }

  function addNameTag(name) {
    // Find the slot with the oldest entry (or an empty one)
    let targetIndex = 0;
    for (let i = 0; i < tagSlots.length; i++) {
      if (!tagSlots[i].occupied) { targetIndex = i; break; }
      // Recycle oldest: the first occupied one we find
      targetIndex = i;
    }

    const slot = tagSlots[targetIndex];

    // Clear any existing hide-timeout
    if (slot.timeoutId) clearTimeout(slot.timeoutId);

    slot.el.classList.remove("visible");
    slot.el.textContent = name;
    slot.occupied = true;

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => slot.el.classList.add("visible"));
    });

    // Auto-hide after TAG_LIFETIME_MS
    slot.timeoutId = setTimeout(() => {
      slot.el.classList.remove("visible");
      slot.occupied = false;
    }, TAG_LIFETIME_MS);
  }

  // ================================================================
  //  Name queue
  // ================================================================
  function enqueueName(name) { nameQueue.push(name); processQueue(); }

  function processQueue() {
    if (displayingName || nameQueue.length === 0) return;
    displayingName = true;
    const name = nameQueue.shift();

    // Show both side banners
    showBanners(name);

    // Add persistent tag beside the syringe
    addNameTag(name);

    // Add to scrolling feed at bottom
    addToFeed(name);

    // Allow next name after banner duration
    setTimeout(() => {
      displayingName = false;
      processQueue();
    }, CONFIG.NAME_DISPLAY_DURATION_SECONDS * 1000 + 400);
  }

  function addToFeed(name) {
    const chip = document.createElement("div");
    chip.className = "feed-chip";
    chip.textContent = name;
    nameFeed.prepend(chip);
    while (nameFeed.children.length > 8) nameFeed.removeChild(nameFeed.lastChild);
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
      if (nameFeed) nameFeed.innerHTML = "";
    } else if (!namesInitialized) {
      ids.forEach((id) => knownParticipantIds.add(id));
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
  initNameTagSlots();
  initFireworksCanvas();
});
