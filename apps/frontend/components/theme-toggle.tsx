"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("wta-theme") as "dark" | "light" | null;
    
    // Default to dark mode for the premium "Liquid Midnight" feel
    if (!savedTheme || savedTheme === "dark") {
       setTheme("dark");
       document.documentElement.setAttribute('data-theme', 'dark');
       document.documentElement.classList.remove("light-mode");
    } else {
      setTheme("light");
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.add("light-mode");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("wta-theme", newTheme);
    
    document.documentElement.setAttribute('data-theme', newTheme);
    if (newTheme === "light") {
      document.documentElement.classList.add("light-mode");
    } else {
      document.documentElement.classList.remove("light-mode");
    }
  };

  if (!mounted) {
    return <div className="theme-toggle-placeholder" />;
  }

  return (
    <button 
      onClick={toggleTheme}
      className={`theme-toggle-v2 ${theme}`}
      aria-label="Toggle Theme"
    >
      <div className="toggle-track">
        <div className="toggle-thumb">
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.76" y2="19.76"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.76" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.76" y2="4.22"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </div>
      </div>
      <style jsx>{`
        .theme-toggle-v2 {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border-color);
          padding: 4px;
          border-radius: 30px;
          cursor: pointer;
          width: 64px;
          height: 32px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          display: flex;
          align-items: center;
          box-shadow: var(--shadow-sm);
        }
        .theme-toggle-v2:hover {
          border-color: var(--accent);
          box-shadow: 0 0 15px var(--accent-subtle);
          transform: scale(1.05);
        }
        .toggle-track {
          width: 100%;
          height: 100%;
          position: relative;
        }
        .toggle-thumb {
          position: absolute;
          top: 0;
          left: ${theme === 'dark' ? '32px' : '0'};
          width: 24px;
          height: 24px;
          background: var(--gradient-primary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .toggle-thumb svg {
          width: 14px;
          height: 14px;
        }
        .theme-toggle-placeholder {
          width: 64px;
          height: 32px;
          opacity: 0;
        }
      `}</style>
    </button>
  );
}
