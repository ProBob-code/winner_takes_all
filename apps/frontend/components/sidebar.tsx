"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarEffects } from "./sidebar-effects";
import { getApiUrl } from "@/lib/api-config";

export function Sidebar({ user: initialUser }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
      window.location.href = (process.env.NEXT_PUBLIC_LANDING_URL as any) || "/";
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

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <SidebarEffects />
      
      <div className="sidebar-brand">
        <Link href={(process.env.NEXT_PUBLIC_LANDING_URL as any) || "/"} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}>
          <span className="logo-icon">👑</span>
          {!isCollapsed && <span className="brand-text">Winner Takes All</span>}
        </Link>
        <button 
          onClick={toggleSidebar}
          className="sidebar-toggle-btn"
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
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
          <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
          <div style={{ width: '20px', height: '2px', background: 'currentColor', borderRadius: '2px' }}></div>
        </button>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname ? (pathname === item.href || pathname.startsWith(item.href + "/")) : false;
          return (
            <Link 
              key={item.href} 
              href={item.href as any} 
              className={`sidebar-link ${isActive ? "active" : ""}`}
              title={isCollapsed ? item.label : ""}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {!isCollapsed && <span className="brand-text">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      
      {/* Wallet Summary & Logout at bottom of sidebar for logged in users */}
      {user && !isCollapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-wallet">
            <span className="wallet-label">Balance</span>
            <span className="wallet-amount">₹{user.walletBalance}</span>
          </div>
          <button 
            className="sidebar-logout-btn" 
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <span className="sidebar-icon">🚪</span>
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      )}
    </aside>
  );
}
