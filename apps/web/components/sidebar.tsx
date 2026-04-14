"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
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
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="logo-icon">👑</span>
        <span className="brand-text">Winner Takes All</span>
      </Link>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link 
              key={item.href} 
              href={item.href as any} 
              className={`sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      {/* Wallet Summary & Logout at bottom of sidebar for logged in users */}
      {user && (
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
