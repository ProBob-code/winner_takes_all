import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar } from "@/components/sidebar";
import { Inter, Outfit } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "WTA | Premium Tournament Platform",
  description: "Compete in high-stakes multi-game tournaments. Professional grade.",
};

async function getUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("wta_access_token")?.value;
    if (!token) return null;

    const apiUrl = process.env.WTA_API_URL || "http://127.0.0.1:4000";
    const res = await fetch(`${apiUrl}/user/profile`, {
      headers: { Cookie: `wta_access_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
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
      <body>
        <div className="app-container">
          <Sidebar user={user} />
          
          <div className="main-content">
            {/* Mobile-Only Header */}
            <header className="mobile-header">
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.75rem", textDecoration: "none" }}>
                <span style={{ fontSize: "1.5rem" }}>👑</span>
                <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.5px", color: "white" }}>WTA</span>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <ThemeToggle />
                {user ? (
                  <div className="user-initial" style={{ width: "32px", height: "32px", fontSize: "0.8rem" }}>
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                ) : (
                  <Link href="/login" style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>LOGIN</Link>
                )}
              </div>
            </header>

            <header className="topbar">
              <div className="topbar-search">
                {/* Search input could go here later */}
              </div>
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
        </div>
      </body>
    </html>
  );
}
