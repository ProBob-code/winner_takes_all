"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState, useEffect } from "react";
import { getApiUrl } from "@/lib/api-config";

export function Topbar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => console.error("Topbar user fetch error:", err));
  }, []);

  return (
    <header className="topbar">
      <Link href="/dashboard" className="topbar-brand">
        <span className="logo-icon">👑</span>
        <span className="brand-text">Winner Takes All</span>
        <span className="brand-text-mobile">WTA</span>
      </Link>
      <div className="topbar-search"></div>
      <nav className="topbar-nav">
        <ThemeToggle />
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Link href="/dashboard" className="topbar-link" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
               {user.name}
            </Link>
            <button 
              onClick={async () => {
                try {
                  const apiUrl = getApiUrl();
                  await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
                  window.location.href = "/";
                } catch (err) {
                  console.error(err);
                }
              }}
              className="button button-sm" 
              style={{ background: "rgba(255, 77, 77, 0.1)", color: "#ff8080", border: "1px solid rgba(255, 77, 77, 0.2)" }}
            >
              Logout
            </button>
          </div>
        ) : (
          <>
            <Link href="/login" className="topbar-link">Login</Link>
            <Link href="/signup" className="button button-sm">Sign Up</Link>
          </>
        )}
      </nav>
    </header>
  );
}
