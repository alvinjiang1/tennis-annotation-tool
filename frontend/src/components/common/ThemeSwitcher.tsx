import { useEffect, useState } from "react";

const themes = ["light", "dark", "forest", "synthwave", "dracula"];

const ThemeSwitcher = () => {
  const [theme, setTheme] = useState(() => {
    // Try to get the theme from localStorage or use "dark" as default
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    // Apply theme to the document
    document.documentElement.setAttribute("data-theme", theme);
    // Store in localStorage for persistence
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="flex gap-2">
      <label className="font-bold">Theme:</label>
      <select
        className="select select-bordered"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      >
        {themes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ThemeSwitcher;