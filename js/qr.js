// ============================================================
// QR CODE PAGE
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const CONFIG = window.AAW_CONFIG;

  const configuredUrl = (CONFIG.PARTICIPANT_URL || "").trim();
  const autoUrl = location.origin + location.pathname.replace(/qr\.html$/, "index.html");
  const target = configuredUrl || autoUrl;

  document.getElementById("qrUrlLabel").textContent = target;

  // Responsive QR size: fill available width on mobile, capped at 380px on desktop
  const qrSize = Math.min(380, Math.floor(window.innerWidth * 0.72));

  // eslint-disable-next-line no-undef
  new QRCode(document.getElementById("qrcode"), {
    text: target,
    width: qrSize,
    height: qrSize,
    colorDark: "#0A1628",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
});
