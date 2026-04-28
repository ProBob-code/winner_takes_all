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
          <Link href="/profile" className="topbar-link">
             <div className="user-initial">{user.name ? user.name[0].toUpperCase() : 'U'}</div>
          </Link>
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
