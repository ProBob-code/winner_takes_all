"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarEffects } from "./sidebar-effects";
import { getApiUrl } from "@/lib/api-config";
import { ConfirmModal } from "./confirm-modal";

export function Sidebar({ user: initialUser }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    if (!user) {
      const apiUrl = getApiUrl();
      fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (data.user) setUser(data.user);
        })
        .catch(err => console.error("Sidebar user fetch error:", err));
    }
  }, []);

  const handleLogout = async () => {
    if (typeof window === "undefined") return;
    setIsLoggingOut(true);
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(pathname === "/");

  // Auto-collapse on homepage when path changes
  useEffect(() => {
    if (pathname === "/") {
      setIsCollapsed(true);
    } else {
      setIsCollapsed(false);
    }
  }, [pathname]);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const navItems = user ? [
    { label: "Dashboard", href: "/dashboard", icon: "📊" },
    { label: "Games", href: "/games", icon: "🕹️" },
    { label: "Tournaments", href: "/tournaments", icon: "🎮" },
    { label: "Leaderboard", href: "/leaderboard", icon: "🏆" },
    { label: "Profile", href: "/profile", icon: "👤" },
    { label: "Wallet", href: "/wallet", icon: "💳" }
  ] : [
    { label: "Games", href: "/games", icon: "🕹️" },
    { label: "Tournaments", href: "/tournaments", icon: "🎮" },
    { label: "Leaderboard", href: "/leaderboard", icon: "🏆" }
  ];

  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1999,
            backdropFilter: 'blur(4px)'
          }}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`sidebar ${isCollapsed ? "collapsed" : ""} ${isOpen ? "mobile-open" : ""}`}
        style={{
          transform: isOpen ? 'translateX(0)' : undefined,
          zIndex: 2000
        }}
      >
        <SidebarEffects />

        <div className="sidebar-brand">
          <Link href={(process.env.NEXT_PUBLIC_LANDING_URL as any) || "/"} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}>
            {(!isCollapsed || isOpen) && (
              <>
                <span className="logo-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" fill="#FFD700"/>
                  </svg>
                </span>
                <span className="brand-text" style={{ letterSpacing: "2px", fontWeight: 900 }}>W.T.A</span>
              </>
            )}
          </Link>

          <button
            onClick={toggleSidebar}
            className="sidebar-toggle-btn desktop-only"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              width: '40px',
              height: '40px',
              marginLeft: isCollapsed ? '0' : '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0',
              borderRadius: '8px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              flexShrink: 0,
              zIndex: 10
            }}
          >
            <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
            <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
            <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
          </button>
        </div>

        <nav className="sidebar-nav" style={{ overflowY: "auto", maxHeight: "calc(100vh - 160px)" }}>
          {navItems.map((item) => {
            const isActive = pathname ? (pathname === item.href || pathname.startsWith(item.href + "/")) : false;
            return (
              <Link
                key={item.href}
                href={item.href as any}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                title={isCollapsed && !isOpen ? item.label : ""}
                onClick={() => setIsOpen(false)}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {(!isCollapsed || isOpen) && <span className="brand-text">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Toggle Button (Floating or Topbar) */}
      {!isOpen && (
        <button
          className="mobile-hamburger-btn"
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'var(--gradient-primary)',
            border: 'none',
            color: 'white',
            fontSize: '1.5rem',
            boxShadow: '0 8px 32px rgba(139, 92, 246, 0.4)',
            zIndex: 1900,
            display: 'none' // controlled by CSS media query
          }}
        >
          ☰
        </button>
      )}
    </>
  );
}
