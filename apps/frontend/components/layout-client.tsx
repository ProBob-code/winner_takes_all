"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import Link from "next/link";
import { getApiUrl } from "@/lib/api-config";

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
      })
      .catch(err => console.error("Global user fetch error:", err));
  }, []);

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
            <Link href="/skill-based-policy" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Skill-Based Policy</Link>
            <Link href="/kyc-aml" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>KYC/AML</Link>
            <Link href="/responsible-gaming" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>Responsible Gaming</Link>
          </div>
          <div style={{ maxWidth: "800px", margin: "0 auto 2rem", lineHeight: "1.7" }}>
            <p style={{ marginBottom: "1.5rem" }}>
              W.T.A is a professional tournament infrastructure platform designed for organizers, esports communities, gaming cafés, and competitive events. 
              The platform provides tools for tournament hosting, bracket management, scheduling, rankings, and event operations.
            </p>
            <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              W.T.A does not facilitate betting, gambling, or games of chance. Tournament outcomes are determined solely by participant skill and organizer-defined competition rules.
            </p>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "2rem" }}>
            &copy; {new Date().getFullYear()} W.T.A Platform. All rights reserved. <br/>
            <span style={{ opacity: 0.6 }}>Professional Tournament Infrastructure Software</span>
          </div>
        </footer>
      </div>

      <MobileNav user={user} />
    </div>
  );
}
