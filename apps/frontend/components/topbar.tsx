"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState, useEffect } from "react";
import { getApiUrl } from "@/lib/api-config";
import { ConfirmModal } from "@/components/confirm-modal";

export function Topbar() {
  const [user, setUser] = useState<any>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => console.error("Topbar user fetch error:", err));
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      setIsLoggingOut(false);
    }
  };

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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              background: "rgba(255, 183, 0, 0.1)", 
              padding: "0.3rem 0.6rem", 
              borderRadius: "8px", 
              border: "1px solid rgba(255, 183, 0, 0.2)",
              gap: "0.4rem",
              minWidth: "80px",
              justifyContent: "center"
            }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--gold-light)", opacity: 0.8 }}>₹</span>
              <span style={{ fontWeight: 800, color: "var(--gold-light)", fontSize: "0.85rem" }}>{Number(user.walletBalance || 0).toFixed(2)}</span>
            </div>
            <Link href="/dashboard" className="topbar-link desktop-only" style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem", minWidth: "60px", textAlign: "right" }}>
               {user.name.split(' ')[0]}
            </Link>
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="button button-sm" 
              style={{ background: "rgba(255, 77, 77, 0.1)", color: "#ff8080", border: "1px solid rgba(255, 77, 77, 0.2)", padding: "0.4rem 0.8rem", height: "auto" }}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "..." : "Logout"}
            </button>

            <ConfirmModal
              isOpen={showLogoutConfirm}
              title="Confirm Logout"
              message="Are you sure you want to exit your session? You will need to login again to access your wallet and tournaments."
              confirmText="Yes, Logout"
              cancelText="Stay"
              isDanger={true}
              onConfirm={handleLogout}
              onCancel={() => setShowLogoutConfirm(false)}
            />
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
