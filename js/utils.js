// ============================================================
// SHARED HELPERS
// ============================================================
const AAWUtils = (function () {
  const DEVICE_KEY = "aaw_device_id";

  // Gives each browser/phone a stable random ID, stored in
  // localStorage, so we can tell devices apart without accounts.
  function getDeviceId(forceNew) {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || forceNew) {
      id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  // Trims, length-limits, and strips anything that isn't a letter,
  // number, space, apostrophe, hyphen, or period. This is a first
  // line of defence; the stage display also escapes names again
  // before inserting them into the page (see escapeHTML), so even
  // if this function is bypassed, injected HTML/script cannot run.
  function sanitizeName(raw) {
    if (typeof raw !== "string") return "";
    const maxLen = (window.AAW_CONFIG && window.AAW_CONFIG.MAX_NAME_LENGTH) || 40;
    let name = raw.trim().slice(0, maxLen);
    name = name.replace(/[^\p{L}\p{N}\s'.-]/gu, "");
    name = name.replace(/\s+/g, " ").trim();
    return name;
  }

  // Converts a string to text-only content so it can never be
  // interpreted as HTML/JS when inserted into the page.
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function clampPercentage(value) {
    if (typeof value !== "number" || isNaN(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  return { getDeviceId, sanitizeName, escapeHTML, clampPercentage };
})();
