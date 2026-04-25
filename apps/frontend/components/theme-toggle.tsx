"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("wta-theme") as "dark" | "light" | null;
    
    // Check system preference if no saved theme
    if (!savedTheme && window.matchMedia("(prefers-color-scheme: light)").matches) {
       setTheme("light");
       document.documentElement.classList.add("light-mode");
       return;
    }

    if (savedTheme === "light") {
      setTheme("light");
      document.documentElement.classList.add("light-mode");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("wta-theme", newTheme);
    
    if (newTheme === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <div style={{ width: 40, height: 40 }} />;
  }

  return (
    <button 
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label="Toggle Theme"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
