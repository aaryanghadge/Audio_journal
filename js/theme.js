(() => {
  const KEY = "audioJournal.theme";
  let theme = "light";
  try {
    theme = localStorage.getItem(KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch {}

  const apply = t => {
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("theme");
    if (btn) btn.textContent = t === "dark" ? "Light mode" : "Dark mode";
  };
  apply(theme); // runs in <head>, so there's no flash of the wrong theme

  document.addEventListener("DOMContentLoaded", () => {
    apply(theme);
    const btn = document.getElementById("theme");
    if (!btn) return;
    btn.addEventListener("click", () => {
      theme = theme === "dark" ? "light" : "dark";
      apply(theme);
      try { localStorage.setItem(KEY, theme); } catch {}
    });
  });
})();
