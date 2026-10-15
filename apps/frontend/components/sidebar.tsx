"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor } from "@/lib/nav";
import { SidebarEffects } from "./sidebar-effects";
import { getApiUrl } from "@/lib/api-config";
import { ConfirmModal } from "./confirm-modal";
import { CrownLogo, WordmarkShort } from "./brand-mark";

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

  // One list for the sidebar and the bottom bar, so a destination added in
  // one cannot go missing from the other. See lib/nav.ts.
  const navItems = navFor(!!user);

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
      >
        <SidebarEffects />

        <div className="sidebar-brand">
          <Link href={(process.env.NEXT_PUBLIC_LANDING_URL as any) || "/"} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}>
            {(!isCollapsed || isOpen) && (
              <>
                <span className="logo-icon">
                  <CrownLogo size={24} />
                </span>
                <span className="brand-text" style={{ letterSpacing: "2px", fontWeight: 900 }}><WordmarkShort /></span>
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

    </>
  );
}
