"use client";

import Link from "next/link";
import { CoinMark } from "@/components/coin-mark";
import { CrownLogo, WordmarkFull, WordmarkShort } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState, useEffect } from "react";
import { getApiUrl } from "@/lib/api-config";
import { ConfirmModal } from "@/components/confirm-modal";

export function Topbar({ user: initialUser }: { user?: any }) {
  const [user, setUser] = useState<any>(initialUser);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (initialUser) setUser(initialUser);
  }, [initialUser]);

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
      <Link href="/" className="topbar-brand">
        <span className="logo-icon">
          <CrownLogo size={28} />
        </span>
        <span className="brand-text" style={{ letterSpacing: "0.5px", fontWeight: 800 }}><WordmarkFull /></span>
        <span className="brand-text-mobile" style={{ fontWeight: 900 }}><WordmarkShort /></span>
      </Link>
      <div className="topbar-search"></div>
      <nav className="topbar-nav">
        <div className="desktop-only" style={{ display: "flex", gap: "1.5rem", marginRight: "1rem" }}>
          <Link href="/about" className="topbar-link">About</Link>
          <Link href="/contact" className="topbar-link">Contact</Link>
          <Link href="/terms" className="topbar-link">Terms</Link>
        </div>
        <ThemeToggle />
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {Number(user.walletBalance || 0) > 0 && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              background: "var(--gold-subtle)",
              padding: "0.25rem 0.5rem",
              borderRadius: "8px",
              border: "1px solid var(--glass-border-color-hover)",
              gap: "0.3rem",
              flexShrink: 0
            }}>
              {/* Shown only while there is still a balance to return. Stakes are
                  closed, so once the wind-down refunds land this disappears by
                  itself rather than advertising a wallet nobody can top up. */}
              <CoinMark size={14} />
              <span style={{ fontWeight: 800, color: "var(--gold)", fontSize: "0.8rem" }}>{Number(user.walletBalance || 0).toFixed(0)}</span>
            </div>
            )}
            <Link href="/dashboard" className="topbar-link desktop-only" style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>
               {user.name.split(' ')[0]}
            </Link>
            <button 
              onClick={() => setShowLogoutConfirm(true)}
              className="button button-sm" 
              // Tokens rather than a fixed pink: on a pearl ground the old
              // colour was close to invisible.
              style={{
                background: "var(--red-subtle)",
                color: "var(--red)",
                border: "1px solid var(--red)",
                padding: "0.4rem 0.8rem",
                height: "auto",
              }}
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
