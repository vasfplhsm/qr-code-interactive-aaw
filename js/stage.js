// ============================================================
// STAGE DISPLAY
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const CONFIG = window.AAW_CONFIG;

  const percentEl = document.getElementById("percentDisplay");
  const liquidRect = document.getElementById("liquidRect");
  const readyOverlay = document.getElementById("readyOverlay");
  const readyText = document.getElementById("readyText");
  const eventTitleEl = document.getElementById("eventTitle");
  const countLabel = document.getElementById("countLabel");
  const nameFeed = document.getElementById("nameFeed");
  const bannerEl = document.getElementById("welcomeBanner");
  const bannerNameEl = document.getElementById("welcomeName");
  const celebrationEl = document.getElementById("celebration");
  const celebrationText = document.getElementById("celebrationText");
  const confettiField = document.getElementById("confettiField");

  eventTitleEl.textContent = CONFIG.EVENT_NAME;
  readyText.textContent = CONFIG.EVENT_START_MESSAGE;
  celebrationText.textContent = CONFIG.EVENT_COMPLETION_MESSAGE;

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
  // The startTime key from DB that we are currently animating (or have finished)
  let animatingStartTime = null;

  const nameQueue = [];
  let displayingName = false;
  const knownParticipantIds = new Set();
  let namesInitialized = false;

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
      spawnConfetti();
      celebrationEl.classList.add("show");
      setTimeout(() => celebrationEl.classList.remove("show"), 6000);
    } else if (percent < 100 && hasCelebrated) {
      hasCelebrated = false;
      celebrationEl.classList.remove("show");
    }
  }

  // ---- The ONE place we paint the real-time percentage ----
  // Call this whenever activeCount, targetParticipants, or manualForced changes.
  // Only skips update if the auto-fill animation is currently mid-flight.
  function paintRealtime() {
    countLabel.textContent = activeCount + " / " + targetParticipants + " registered";
    if (autoFillRAF !== null) return; // animation is running, let it finish
    if (manualForced) { applyPercent(100); return; }
    applyPercent(actualPercentage());
  }

  // ---- Auto-fill animation ----
  // Animates from fromPercent → 100% over durationSeconds, starting at startTimeMs.
  // Once done, snaps to real-time percentage and STOPS — never restarts for the same startTime.
  function runAutoFillAnimation(fromPercent, startTimeMs, durationSeconds) {
    // Already handling this exact animation run — don't restart it
    if (animatingStartTime === startTimeMs) return;
    animatingStartTime = startTimeMs;

    if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }

    const durationMs = Math.max(1, durationSeconds) * 1000;
    const alreadyElapsed = Date.now() - startTimeMs;

    // Animation window already passed — just show live % immediately
    if (alreadyElapsed >= durationMs) {
      paintRealtime();
      return;
    }

    function step() {
      const t = Math.min(1, (Date.now() - startTimeMs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      applyPercent(fromPercent + (100 - fromPercent) * eased);
      if (t < 1) {
        autoFillRAF = requestAnimationFrame(step);
      } else {
        // Done — clear RAF handle so paintRealtime() can take over
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
        if (cur) return; // another instance beat us
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

  // ---- Name queue ----
  function enqueueName(name) { nameQueue.push(name); processQueue(); }

  function processQueue() {
    if (displayingName || nameQueue.length === 0) return;
    displayingName = true;
    const name = nameQueue.shift();
    bannerNameEl.textContent = name;
    bannerEl.classList.add("show");
    addToFeed(name);
    setTimeout(() => {
      bannerEl.classList.remove("show");
      setTimeout(() => { displayingName = false; processQueue(); }, 400);
    }, CONFIG.NAME_DISPLAY_DURATION_SECONDS * 1000);
  }

  function addToFeed(name) {
    const chip = document.createElement("div");
    chip.className = "feed-chip";
    chip.textContent = name;
    nameFeed.prepend(chip);
    while (nameFeed.children.length > 8) nameFeed.removeChild(nameFeed.lastChild);
  }

  function spawnConfetti() {
    confettiField.innerHTML = "";
    const palette = ["#29ABE2", "#1FA37A", "#4FC3F7", "#F4F7FA"];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = palette[Math.floor(Math.random() * palette.length)];
      piece.style.animationDuration = (2.2 + Math.random() * 1.8) + "s";
      piece.style.animationDelay = (Math.random() * 0.6) + "s";
      confettiField.appendChild(piece);
    }
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

    // Paint the new percentage immediately
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
    const dbStartPct = typeof data.autoFillStartPercentage === "number" ? data.autoFillStartPercentage : 0;

    readyOverlay.classList.toggle("show", !eventStarted);

    if (!eventStarted) {
      // Reset on event stop
      if (autoFillTimeoutHandle) { clearTimeout(autoFillTimeoutHandle); autoFillTimeoutHandle = null; }
      if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }
      animatingStartTime = null;
      hasCelebrated = false;
      celebrationEl.classList.remove("show");
      paintRealtime();
      return;
    }

    if (manualForced) {
      if (autoFillRAF) { cancelAnimationFrame(autoFillRAF); autoFillRAF = null; }
      applyPercent(100);
      countLabel.textContent = activeCount + " / " + targetParticipants + " registered";
      return;
    }

    if (autoFillTriggered && dbStartTime != null) {
      runAutoFillAnimation(dbStartPct, dbStartTime, CONFIG.AUTO_FILL_DURATION_SECONDS);
    } else {
      scheduleAutoFillCheck();
    }

    paintRealtime();
  });

  setLiquidVisual(0);
});
