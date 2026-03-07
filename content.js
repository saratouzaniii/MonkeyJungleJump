let overlay;
let scriptLoaded = false;

function injectAssets() {
  if (scriptLoaded) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = chrome.runtime.getURL("game.css");
  document.documentElement.appendChild(style);

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("game.js");
  script.dataset.embed = "true";
  document.documentElement.appendChild(script);

  scriptLoaded = true;
}

function createOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "runner-loading-overlay";
  overlay.innerHTML = `
    <div class="mlo-panel">
      <div class="mlo-header">
        <strong>Chargement lent...</strong>
        <button id="mlo-close" type="button" aria-label="Fermer">×</button>
      </div>
      <div class="mlo-body">
        <canvas id="mlo-canvas" width="720" height="360"></canvas>
        <p>Controles: Gauche/Droite/Haut, ou Espace pour sauter</p>
        <p class="donate-row">
          <a class="donate-link" href="https://buymeacoffee.com/yourname" target="_blank" rel="noopener noreferrer">
            Buy me a coffee
          </a>
        </p>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  overlay.querySelector("#mlo-close")?.addEventListener("click", () => {
    hideOverlay();
  });

  return overlay;
}

function showOverlay() {
  injectAssets();
  const node = createOverlay();
  node.classList.add("visible");

  window.dispatchEvent(new CustomEvent("runner-game:mount", {
    detail: { canvasId: "mlo-canvas", compact: true }
  }));
}

function hideOverlay() {
  if (!overlay) return;
  overlay.classList.remove("visible");
  window.dispatchEvent(new Event("runner-game:pause"));
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "SHOW_RUNNER_OVERLAY") showOverlay();
  if (msg.type === "HIDE_RUNNER_OVERLAY") hideOverlay();
});
