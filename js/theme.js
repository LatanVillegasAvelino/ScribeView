export function initThemeToggle(buttonEl) {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.dataset.theme = saved;
  } else {
    // default: dark (puedes cambiarlo)
    document.documentElement.dataset.theme = "dark";
  }

  const applyIcon = () => {
    const t = document.documentElement.dataset.theme;
    buttonEl.textContent = (t === "dark") ? "🌙" : "☀️";
    buttonEl.title = (t === "dark") ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  };
  applyIcon();

  buttonEl.addEventListener("click", () => {
    const t = document.documentElement.dataset.theme;
    const next = (t === "dark") ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    applyIcon();
  });
}
