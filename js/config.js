// ============================================================
// CENTRAL CONFIGURATION
// This is the ONLY file you should need to edit for a new event.
// Every page (participant page, stage display, admin page, QR
// page) reads its settings from here.
// ============================================================
window.AAW_CONFIG = {
  // Shown as the event name on the stage screen and participant page.
  EVENT_NAME: "Antibiotic Awareness Week",

  // How many registrations count as "100% participation".
  TARGET_PARTICIPANTS: 100,

  // Seconds after the organizer starts the event timer before the
  // stage syringe automatically finishes filling to 100%, IF the
  // real target has not been reached yet.
  AUTO_FILL_DELAY_SECONDS: 60,

  // How many seconds the automatic fill animation takes to travel
  // from the current percentage up to 100%.
  AUTO_FILL_DURATION_SECONDS: 20,

  // How long (in seconds) each participant's name stays on the
  // "Welcome" banner before the next name appears.
  NAME_DISPLAY_DURATION_SECONDS: 4,

  // Longest name (in characters) accepted from the registration form.
  MAX_NAME_LENGTH: 40,

  // Colours used on the stage display. Change these to re-theme
  // the whole ceremony screen without touching any CSS file.
  EVENT_COLORS: {
    stageBackground: "#0A1628",
    stageBackgroundAlt: "#0F2138",
    liquidTop: "#4FC3F7",
    liquidBottom: "#0B75C2",
    accent: "#1FA37A",
    glow: "#29ABE2",
    textLight: "#F4F7FA"
  },

  // Text shown on the stage screen before the organizer starts the event.
  EVENT_START_MESSAGE: "GET READY",

  // Text shown on the stage screen's 100% celebration animation.
  EVENT_COMPLETION_MESSAGE: "100% PARTICIPATION!",

  // How many seconds the 100% celebration and fireworks animation
  // continues running on stage after reaching 100% participation (at least 60s).
  CELEBRATION_DURATION_SECONDS: 60,

  // Optional: the full URL of the participant registration page
  // (index.html), used to generate the QR code on qr.html.
  // Leave this as an empty string to auto-detect the URL from
  // whatever domain qr.html is opened on.
  PARTICIPANT_URL: ""
};
