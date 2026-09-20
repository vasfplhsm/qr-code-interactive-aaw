// ============================================================
// QR CODE PAGE
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const CONFIG = window.AAW_CONFIG;

  const configuredUrl = (CONFIG.PARTICIPANT_URL || "").trim();
  const autoUrl = location.origin + location.pathname.replace(/qr\.html$/, "index.html");
  const target = configuredUrl || autoUrl;

  document.getElementById("qrUrlLabel").textContent = target;

  // eslint-disable-next-line no-undef
  new QRCode(document.getElementById("qrcode"), {
    text: target,
    width: 420,
    height: 420,
    colorDark: "#0A1628",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
});
