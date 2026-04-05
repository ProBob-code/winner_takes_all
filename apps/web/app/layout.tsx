import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Winner Takes All",
  description: "Real-time multiplayer 8-ball tournament platform"
};

const links = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Login" },
  { href: "/signup", label: "Signup" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/wallet", label: "Wallet" },
  { href: "/admin", label: "Admin" }
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link className="brand" href="/">
              Winner Takes All
            </Link>
            <nav className="nav">
              {links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
