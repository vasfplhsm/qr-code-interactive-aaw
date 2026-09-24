// ============================================================
// ADMIN DASHBOARD
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const CONFIG = window.AAW_CONFIG;

  const loginSection = document.getElementById("loginSection");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");

  const statCount = document.getElementById("statCount");
  const statTarget = document.getElementById("statTarget");
  const statPercent = document.getElementById("statPercent");
  const targetInput = document.getElementById("targetInput");
  const saveTargetBtn = document.getElementById("saveTargetBtn");
  const participantList = document.getElementById("participantList");
  const eventStateLabel = document.getElementById("eventStateLabel");

  const startEventBtn = document.getElementById("startEventBtn");
  const restartTimerBtn = document.getElementById("restartTimerBtn");
  const forceFillBtn = document.getElementById("forceFillBtn");
  const revertFillBtn = document.getElementById("revertFillBtn");

  const add1Btn = document.getElementById("add1Btn");
  const add5Btn = document.getElementById("add5Btn");
  const add10Btn = document.getElementById("add10Btn");
  const simulate100Btn = document.getElementById("simulate100Btn");

  const resetBtn = document.getElementById("resetBtn");
  const resetConfirm = document.getElementById("resetConfirm");
  const confirmResetBtn = document.getElementById("confirmResetBtn");
  const cancelResetBtn = document.getElementById("cancelResetBtn");

  let participantsCache = {};
  let eventCache = {};
  let listenersAttached = false;

  // ---- Auth gate ----
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      loginSection.classList.add("hidden");
      dashboard.classList.remove("hidden");
      if (!listenersAttached) {
        attachDataListeners();
        listenersAttached = true;
      }
    } else {
      loginSection.classList.remove("hidden");
      dashboard.classList.add("hidden");
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    try {
      await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
      loginError.textContent = "Login failed. Check the email and password.";
    }
  });

  logoutBtn.addEventListener("click", () => firebase.auth().signOut());

  // ---- Data listeners ----
  function attachDataListeners() {
    db.ref("participants").on("value", (snap) => {
      participantsCache = snap.val() || {};
      renderParticipants();
      renderStats();
    });
    db.ref("event").on("value", (snap) => {
      eventCache = snap.val() || {};
      if (document.activeElement !== targetInput) {
        targetInput.value = eventCache.targetParticipants || CONFIG.TARGET_PARTICIPANTS;
      }
      renderStats();
      renderEventState();

      // Sync theme picker active state
      const activeTheme = eventCache.syringeTheme || "blue";
      const picker = document.getElementById("themePicker");
      if (picker) {
        picker.querySelectorAll(".theme-swatch").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.theme === activeTheme);
        });
      }
    });

    // Theme picker click handler
    const themePicker = document.getElementById("themePicker");
    if (themePicker) {
      themePicker.addEventListener("click", (e) => {
        const btn = e.target.closest(".theme-swatch");
        if (!btn) return;
        const theme = btn.dataset.theme;
        db.ref("event/syringeTheme").set(theme);
      });
    }
  }

  function activeParticipants() {
    return Object.entries(participantsCache).filter(([, p]) => p && p.status === "active");
  }

  function renderStats() {
    const active = activeParticipants();
    const target = eventCache.targetParticipants || CONFIG.TARGET_PARTICIPANTS;
    statCount.textContent = active.length;
    statTarget.textContent = target;
    const pct = target ? Math.min(100, Math.round((active.length / target) * 100)) : 0;
    statPercent.textContent = pct + "%";
  }

  function renderEventState() {
    if (eventCache.eventStarted) {
      eventStateLabel.textContent = "Event running";
      eventStateLabel.className = "state-badge state-running";
    } else {
      eventStateLabel.textContent = "Not started";
      eventStateLabel.className = "state-badge state-idle";
    }
  }

  function renderParticipants() {
    participantList.innerHTML = "";
    const entries = Object.entries(participantsCache)
      .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sub";
      empty.textContent = "No registrations yet.";
      participantList.appendChild(empty);
      return;
    }

    entries.forEach(([id, p]) => {
      const row = document.createElement("div");
      row.className = "participant-row" + (p.status !== "active" ? " removed" : "");

      const nameSpan = document.createElement("span");
      nameSpan.textContent = p.name || "(unnamed)";
      row.appendChild(nameSpan);

      if (p.status === "active") {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Remove";
        removeBtn.className = "btn-small btn-danger";
        removeBtn.addEventListener("click", () => {
          db.ref("participants/" + id).update({ status: "removed" });
        });
        row.appendChild(removeBtn);
      } else {
        const badge = document.createElement("span");
        badge.className = "badge-removed";
        badge.textContent = "removed";
        row.appendChild(badge);
      }
      participantList.appendChild(row);
    });
  }

  // ---- Controls ----
  saveTargetBtn.addEventListener("click", () => {
    const val = parseInt(targetInput.value, 10);
    if (!val || val < 1) return;
    db.ref("event/targetParticipants").set(val);
  });

  startEventBtn.addEventListener("click", () => {
    db.ref("event").update({
      eventStarted: true,
      eventStartTime: Date.now(),
      autoFillTriggered: false,
      autoFillStartTime: null,
      autoFillStartPercentage: null,
      manualOverride: null
    });
  });

  restartTimerBtn.addEventListener("click", () => {
    db.ref("event").update({
      eventStartTime: Date.now(),
      autoFillTriggered: false,
      autoFillStartTime: null,
      autoFillStartPercentage: null
    });
  });

  forceFillBtn.addEventListener("click", () => {
    db.ref("event/manualOverride").set("force100");
  });

  revertFillBtn.addEventListener("click", () => {
    db.ref("event").update({
      manualOverride: null,
      autoFillTriggered: false,
      autoFillStartTime: null,
      autoFillStartPercentage: null
    });
  });

  function simulateAdd(count) {
    const updates = {};
    for (let i = 0; i < count; i++) {
      const key = db.ref("participants").push().key;
      updates[key] = {
        name: "Test Participant " + Math.floor(Math.random() * 10000),
        timestamp: Date.now(),
        status: "active",
        deviceId: "test_" + key
      };
    }
    db.ref("participants").update(updates);
  }

  add1Btn.addEventListener("click", () => simulateAdd(1));
  add5Btn.addEventListener("click", () => simulateAdd(5));
  add10Btn.addEventListener("click", () => simulateAdd(10));
  simulate100Btn.addEventListener("click", () => db.ref("event/manualOverride").set("force100"));

  // ---- Reset ----
  resetBtn.addEventListener("click", () => resetConfirm.classList.remove("hidden"));
  cancelResetBtn.addEventListener("click", () => resetConfirm.classList.add("hidden"));

  confirmResetBtn.addEventListener("click", async () => {
    resetConfirm.classList.add("hidden");
    const keepTarget = eventCache.targetParticipants || CONFIG.TARGET_PARTICIPANTS;
    confirmResetBtn.disabled = true;
    try {
      const resetTime = Date.now();
      await db.ref("participants").remove();
      await db.ref("deviceRegistry").remove();
      await db.ref("event").set({
        targetParticipants: keepTarget,
        eventStarted: false,
        eventStartTime: null,
        autoFillTriggered: false,
        autoFillStartTime: null,
        autoFillStartPercentage: null,
        manualOverride: null,
        lastReset: resetTime
      });

      participantsCache = {};
      eventCache = {
        targetParticipants: keepTarget,
        eventStarted: false,
        eventStartTime: null,
        autoFillTriggered: false,
        autoFillStartTime: null,
        autoFillStartPercentage: null,
        manualOverride: null,
        lastReset: resetTime
      };
      renderParticipants();
      renderStats();
      renderEventState();
    } catch (err) {
      console.error("Error resetting event:", err);
      alert("Failed to reset event: " + (err.message || err));
    } finally {
      confirmResetBtn.disabled = false;
    }
  });
});
