// ============================================================
// PARTICIPANT REGISTRATION PAGE
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("regForm");
  const nameInput = document.getElementById("nameInput");
  const submitBtn = document.getElementById("submitBtn");
  const formSection = document.getElementById("formSection");
  const waitingSection = document.getElementById("waitingSection");
  const successSection = document.getElementById("successSection");
  const successName = document.getElementById("successName");
  const errorMsg = document.getElementById("errorMsg");
  const registerAnotherBtn = document.getElementById("registerAnotherBtn");

  let deviceId = AAWUtils.getDeviceId();
  const ALREADY_KEY = "aaw_registered_name";
  const RESET_KEY = "aaw_last_reset_seen";
  let isEventStarted = false;

  // Listen to event status and reset timestamp in real-time
  db.ref("event").on("value", (snap) => {
    const eventData = snap.val() || {};
    isEventStarted = !!eventData.eventStarted;
    const serverReset = eventData.lastReset || 0;
    const localReset = parseInt(localStorage.getItem(RESET_KEY) || "0", 10);

    // If admin reset the event, or if event is currently not started:
    if (serverReset > localReset || !isEventStarted) {
      localStorage.removeItem(ALREADY_KEY);
      localStorage.setItem(RESET_KEY, String(serverReset));
      deviceId = AAWUtils.getDeviceId(true);
    }
    updateView();
  });

  if (registerAnotherBtn) {
    registerAnotherBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      localStorage.removeItem(ALREADY_KEY);
      deviceId = AAWUtils.getDeviceId(true);
      nameInput.value = "";
      errorMsg.textContent = "";
      submitBtn.disabled = false;
      submitBtn.textContent = "JOIN THE CAMPAIGN";
      successSection.classList.add("hidden");
      if (waitingSection) waitingSection.classList.add("hidden");
      formSection.classList.remove("hidden");
      setTimeout(() => {
        nameInput.focus();
      }, 50);
    });
  }

  function updateView() {
    const alreadyName = localStorage.getItem(ALREADY_KEY);
    if (alreadyName) {
      showSuccess(alreadyName);
      return;
    }

    if (!isEventStarted) {
      if (waitingSection) waitingSection.classList.remove("hidden");
      formSection.classList.add("hidden");
      successSection.classList.add("hidden");
    } else {
      if (waitingSection) waitingSection.classList.add("hidden");
      formSection.classList.remove("hidden");
      successSection.classList.add("hidden");
    }
  }

  // Play subtle keypress pop when typing name
  nameInput.addEventListener("input", () => {
    if (window.AAWSounds) window.AAWSounds.playKeyClick();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.textContent = "";

    if (!isEventStarted) {
      errorMsg.textContent = "The event has not started yet. Please wait for the announcement!";
      return;
    }

    const name = AAWUtils.sanitizeName(nameInput.value);
    if (!name) {
      errorMsg.textContent = "Please enter your name.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "JOINING...";
    try {
      // Push new participant record
      const participantRef = db.ref("participants").push();
      await participantRef.set({
        name,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: "active",
        deviceId
      });

      // Best-effort device registry write to record device registration
      try {
        await db.ref("deviceRegistry/" + deviceId).set(participantRef.key);
      } catch (deviceErr) {
        console.warn("Device registry note:", deviceErr.message);
      }

      localStorage.setItem(ALREADY_KEY, name);

      // Play joyful join chime right on participant's device
      if (window.AAWSounds) {
        window.AAWSounds.playJoinChime();
      }

      showSuccess(name);
    } catch (err) {
      console.error(err);
      errorMsg.textContent = "Something went wrong. Please check your connection and try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = "JOIN THE CAMPAIGN";
    }
  });

  function showSuccess(name) {
    if (waitingSection) waitingSection.classList.add("hidden");
    formSection.classList.add("hidden");
    successSection.classList.remove("hidden");
    successName.textContent = name;
  }
});
