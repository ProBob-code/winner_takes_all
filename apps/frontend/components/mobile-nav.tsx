"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileNav({ user }: { user: any }) {
  const pathname = usePathname();

  const navItems = user ? [
    { label: "Home", href: "/dashboard", icon: "📊" },
    { label: "Games", href: "/games", icon: "🕹️" },
    { label: "Tourney", href: "/tournaments", icon: "🎮" },
    { label: "Leader", href: "/leaderboard", icon: "🏆" },
    { label: "Me", href: "/profile", icon: "👤" },
    { label: "Wallet", href: "/wallet", icon: "💳" }
  ] : [
    { label: "Games", href: "/games", icon: "🕹️" },
    { label: "Tourney", href: "/tournaments", icon: "🎮" },
    { label: "Leader", href: "/leaderboard", icon: "🏆" }
  ];

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => {
        const isActive = pathname ? (pathname === item.href || pathname.startsWith(item.href + "/")) : false;
        return (
          <Link 
            key={item.href} 
            href={item.href as any} 
            className={`mobile-nav-link ${isActive ? "active" : ""}`}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
