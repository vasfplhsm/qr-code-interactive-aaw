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

  const REAL_NAMES = [
    "Ahmad Faizal bin Hassan", "Muhammad Amir", "Noraini binti Abdullah", "Nur Aisyah",
    "Mohd Azmi bin Ismail", "Ahmad Faris", "Siti Zubaidah binti Omar", "Siti Nurhaliza",
    "Abdul Rahman bin Yusof", "Danish Hakim", "Rohana binti Ahmad", "Nurin Sofea",
    "Khairul Anwar bin Rahim", "Muhammad Irfan", "Fauziah binti Mohamad", "Alya Syahirah",
    "Mohd Firdaus bin Zakaria", "Hakim Zulkifli", "Nor Haslina binti Hashim", "Puteri Amani",
    "Muhammad Hafiz bin Razak", "Syafiq Azman", "Nurul Aini binti Hassan", "Nur Izzati",
    "Azlan bin Ibrahim", "Amirul Hakim", "Roslina binti Yusof", "Aina Sofea",
    "Mohd Faiz bin Hamzah", "Faizal Rahman", "Siti Hajar binti Ahmad", "Nur Athirah",
    "Rizal bin Osman", "Muhammad Haziq", "Salmah binti Ismail", "Farah Nabilah",
    "Muhammad Azim bin Abdullah", "Adam Danish", "Nor Syafiqah binti Rahman", "Qistina Aulia",
    "Ahmad Syafiq bin Zainal", "Khairul Anwar", "Nur Aisyah binti Mohd Salleh", "Nur Shazwani",
    "Mohd Khairul Nizam bin Ali", "Hafiz Firdaus", "Farah Nabilah binti Hamid", "Amira Imani",
    "Muhammad Fikri bin Ahmad", "Muhammad Aqil", "Nurul Izzati binti Abdullah", "Zara Aqeela",
    "Hafizuddin bin Ismail", "Arif Hakimi", "Siti Noraini binti Zakaria", "Nur Alia",
    "Amirul Hakim bin Rahman", "Syazwan Hamdan", "Nur Athirah binti Zulkifli", "Balqis Humaira",
    "Muhammad Aiman bin Rosli", "Fikri Haziq", "Aina Sofea binti Mohd Noor", "Hannah Sofea",
    "Mohd Haziq bin Azman", "Muhammad Aiman", "Nur Fatin Syahirah binti Hassan", "Nur Syafiqah",
    "Syed Faris bin Syed Ahmad", "Rayyan Hakim", "Siti Nur Amirah binti Fauzi", "Aleesya Imani",
    "Ahmad Farhan bin Yusof", "Azim Danial", "Nabila Syazwani binti Karim", "Nur Damia",
    "Muhammad Arif bin Kamarudin", "Faiz Harith", "Nur Maisarah binti Hamzah", "Insyirah Amani",
    "Danish Hakim bin Mohd Azmi", "Muhammad Adam", "Alya Syahirah binti Rahim", "Ayra Qaisara",
    "Muhammad Aqil bin Faizal", "Izzat Hakimi", "Nurin Sofea binti Ahmad", "Nurin Alyssa",
    "Rayyan Hakim bin Zulkifli", "Danish Irsyad", "Amira Imani binti Azman", "Yasmin Sofea",
    "Adam Danish bin Hafiz", "Amir Hakim", "Qistina Aulia binti Razak", "Qaisara Humaira",
    "Luqman Hakim bin Abdullah", "Farhan Zikri", "Nur Balqis binti Mohd Salleh", "Nur Maisarah",
    "Muhammad Harith bin Ismail", "Muhammad Rayyan", "Zara Humaira binti Ahmad", "Aina Batrisyia",
    "Arif Hakimi bin Osman", "Luqman Hakim", "Nur Damia binti Khairul", "Adriana Imani",
    "Muhammad Zafran bin Rahman", "Syahmi Farhan", "Aleesya Imani binti Hamid", "Nur Amirah",
    "Syazwan Farhan bin Razak", "Arham Zafran", "Nur Irdina binti Faiz", "Alyssa Qaireen",
    "Fawwaz Hakim bin Yusof", "Iskandar Zulkarnain", "Hannah Sofea binti Karim", "Damia Sofea",
    "Muhammad Irsyad bin Ahmad", "Muhammad Harith", "Amani Qaireen binti Zainal", "Nur Aqilah",
    "Haikal Danish bin Ismail", "Zafran Hakimi", "Nur Aqeela binti Abdullah", "Zara Humaira",
    "Muhammad Fayyad bin Rahman", "Akmal Firdaus", "Iman Aleesya binti Mohd Noor", "Irdina Aisyah",
    "Akmal Firdaus bin Hassan", "Haikal Danish", "Nur Shazwani binti Hamzah", "Nur Khadijah",
    "Mohd Syafiq bin Zakaria", "Afiq Haziq", "Farah Izzati binti Ahmad", "Tasha Imani",
    "Ahmad Zikri bin Osman", "Muhammad Fayyad", "Siti Nur Haneesya binti Rahim", "Sofea Qistina",
    "Muhammad Rafiq bin Abdullah", "Irsyad Hakim", "Yasmin Sofea binti Ismail", "Nur Amani",
    "Izzat Hakimi bin Azman", "Adam Firash", "Nur Alia binti Mohamad", "Aleena Qaireen",
    "Muhammad Danish bin Faizal", "Syazwan Hakim", "Ayra Qaisara binti Zulkifli", "Maisarah Izzati",
    "Arham Zafran bin Ahmad", "Ariff Danish", "Insyirah Amani binti Rahman", "Nur Ezzati",
    "Mohd Firash bin Kamarudin", "Harith Zaim", "Nur Shahirah binti Hassan", "Aisyah Humaira",
    "Muhammad Taufiq bin Yusof", "Muhammad Ziyad", "Siti Nurul Huda binti Ismail", "Qaisara Alya",
    "Faiz Harith bin Zakaria", "Haziq Firdaus", "Amirah Sofea binti Hamid", "Nur Shahirah",
    "Muhammad Alif bin Razak", "Rayyan Zafrel", "Nur Qistina binti Ahmad", "Amirah Sofea",
    "Haziq Firdaus bin Rahman", "Faris Aiman", "Aisyah Humaira binti Mohd Ali", "Iman Aleesya",
    "Muhammad Rayyan bin Azmi", "Muhammad Danish", "Zara Amani binti Hafiz", "Nur Balqis",
    "Fikri Zaim bin Abdullah", "Zikri Hakim", "Nur Liyana binti Osman", "Ayra Sofea",
    "Harith Aiman bin Ismail", "Amirul Syafiq", "Alyssa Nadhirah binti Karim", "Nur Haneesya",
    "Muhammad Afiq bin Zainal", "Fawwaz Hakim", "Nur Amalia binti Yusof", "Aqeela Imani",
    "Amirul Syafiq bin Hassan", "Muhammad Afiq", "Nabila Syahirah binti Ahmad", "Nabila Syahirah"
  ];
  let _nameIndex = 0;

  function simulateAdd(count) {
    const updates = {};
    for (let i = 0; i < count; i++) {
      const key = db.ref("participants").push().key;
      const name = REAL_NAMES[_nameIndex % REAL_NAMES.length];
      _nameIndex++;
      updates[key] = {
        name,
        timestamp: Date.now() + i,
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
