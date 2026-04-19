import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationBell } from "@/components/notification-bell";
import { Inter, Outfit } from "next/font/google";
import { backendFetch } from "@/lib/backend";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const runtime = "edge";

export const metadata: Metadata = {
  title: "WTA | Premium Tournament Platform",
  description: "Compete in high-stakes multi-game tournaments. Professional grade.",
};

async function getUser() {
  try {
    const res = await backendFetch("/user/profile");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (err) {
    console.error("Layout getUser error:", err);
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className={inter.className}>
        <div className="app-container">
          <Sidebar user={user} />
          
          <div className="main-content">
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
                  <>
                    <NotificationBell />
                    <div className="user-initial">{user.name?.[0]?.toUpperCase() || "U"}</div>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="topbar-link">Login</Link>
                    <Link href="/signup" className="button button-sm">Sign Up</Link>
                  </>
                )}
              </nav>
            </header>
            
            {children}
          </div>

          <MobileNav user={user} />
        </div>
      </body>
    </html>
  );
}
