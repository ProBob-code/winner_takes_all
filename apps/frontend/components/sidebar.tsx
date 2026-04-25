"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarEffects } from "./sidebar-effects";

export function Sidebar({ user: initialUser }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    if (!user) {
        fetch("/api/user/profile")
          .then(res => res.json())
          .then(data => {
            if (data.user) setUser(data.user);
          })
          .catch(err => console.error("Sidebar user fetch error:", err));
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push((process.env.NEXT_PUBLIC_LANDING_URL as any) || "/");
      router.refresh();
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
    if (pathname === "/") {
      setIsCollapsed(!isCollapsed);
    }
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
        {pathname === "/" && (
          <button 
            onClick={toggleSidebar}
            className="sidebar-toggle-btn"
            style={{ 
                background: 'none', 
                border: 'none', 
                color: 'var(--text-secondary)', 
                cursor: 'pointer',
                fontSize: '1.4rem',
                marginLeft: isCollapsed ? '0' : 'auto',
                display: 'flex',
                padding: '4px',
                lineHeight: 1
            }}
          >
            ☰
          </button>
        )}
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
