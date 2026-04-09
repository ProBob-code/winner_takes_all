import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { NotificationBell } from "@/components/notification-bell";

export const metadata: Metadata = {
  title: "Winner Takes All — Tournament Platform",
  description: "Compete in 8-ball pool tournaments. Pay to play, winner takes the cash pool.",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>
        <header className="topbar">
          <Link href="/" className="topbar-brand">
            <span className="logo-icon">🏆</span>
            Winner Takes All
          </Link>
          <nav className="topbar-nav">
            <Link href="/tournaments" className="topbar-link">Tournaments</Link>
            <Link href="/leaderboard" className="topbar-link">Leaderboard</Link>
            {user ? (
              <>
                <Link href="/wallet" className="topbar-link">Wallet</Link>
                <Link href="/dashboard" className="topbar-link">Dashboard</Link>
                <NotificationBell />
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
      </body>
    </html>
  );
}
