"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { NetworkBadge } from "@/components/network-badge";
import Link from "next/link";
import { getApiUrl } from "@/lib/api-config";

/**
 * Routes that get no chrome at all.
 *
 * The big-screen display has to be full bleed to be readable from across a
 * room; staff mode is one screen of big buttons for someone trained for ninety
 * seconds; the join page is the first thing a walk-in ever sees and asking
 * them to parse a sidebar is how a walk-in becomes a non-entrant. A sidebar,
 * a footer of policy links and a mobile nav bar would each take space these
 * three cannot spare.
 */
const BARE_ROUTES = ["/display/", "/staff/", "/join/"];

function isBare(pathname: string | null): boolean {
  if (!pathname) return false;
  return BARE_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => console.error("Global user fetch error:", err));
  }, []);

  // Full bleed, and still with the connection badge: these are precisely the
  // screens being held when a bar's wifi drops.
  if (isBare(pathname)) {
    return (
      <>
        {children}
        <NetworkBadge />
      </>
    );
  }

  return (
    <div className="app-container">
      <Sidebar user={user} />
      
      <div className="main-content">
        <Topbar user={user} />
        
        <div className="page-content" style={{ flex: 1, position: "relative" }}>
          {children}
        </div>

        <footer style={{
          padding: "4rem 2rem",
          textAlign: "center",
          borderTop: "1px solid var(--glass-bg-hover)",
          marginTop: "auto",
          color: "#cbd5e1", 
          fontSize: "0.9rem",
          background: "rgba(0,0,0,0.5)"
        }}>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "1.5rem", marginBottom: "2.5rem", color: "var(--accent-secondary)" }}>
            <Link href="/about" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>About Us</Link>
            <Link href="/contact" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Contact Us</Link>
            <Link href="/terms" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Terms & Conditions</Link>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Privacy Policy</Link>
            <Link href="/refund" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Refund & Cancellation</Link>
            <Link href="/community-guidelines" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Community Guidelines</Link>
            <Link href="/skill-based-policy" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>No-Stakes Policy</Link>
            <Link href="/kyc-aml" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>KYC/AML</Link>
            <Link href="/responsible-gaming" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Responsible Gaming</Link>
          </div>
          <div style={{ maxWidth: "800px", margin: "0 auto 2rem", lineHeight: "1.7" }}>
            <p style={{ marginBottom: "1.5rem" }}>
              W.T.A is a professional tournament infrastructure platform designed for organizers, esports communities, gaming cafés, and competitive events. 
              The platform provides tools for tournament hosting, bracket management, scheduling, rankings, and event operations.
            </p>
            <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              W.T.A does not take entry fees, hold player funds, or pool prize money. Tournaments are free to enter; any prize is provided and awarded by the organising venue. No stake of any kind is accepted through this platform. WTA Coins are a record of play with no cash value: they cannot be bought, withdrawn, transferred or wagered.
            </p>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "2rem" }}>
            &copy; {new Date().getFullYear()} W.T.A Platform. All rights reserved. <br/>
            <span style={{ opacity: 0.6 }}>Professional Tournament Infrastructure Software</span>
            {/* Which build this page actually came from. A stale tab shows an
                old sha here, which is far quicker to spot than inferring it
                from the layout. */}
            <br/>
            <span style={{ opacity: 0.35, fontSize: "0.7rem", letterSpacing: "0.5px" }}>
              build {process.env.NEXT_PUBLIC_BUILD_SHA || "dev"}
            </span>
          </div>
        </footer>
      </div>

      <MobileNav user={user} />
      {/* Registers the offline helper and says, when it matters, that scores
          tapped on this device are safe. Silent when the network is fine. */}
      <NetworkBadge />
    </div>
  );
}
