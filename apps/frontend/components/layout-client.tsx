"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
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
          padding: "3rem 2rem",
          textAlign: "center",
          borderTop: "1px solid var(--glass-bg-hover)",
          marginTop: "auto",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          background: "rgba(0,0,0,0.4)"
        }}>
          <div style={{ maxWidth: "800px", margin: "0 auto 1.5rem", lineHeight: "1.6", opacity: 0.8 }}>
            <strong>Legal Disclaimer:</strong> WTA Arena does not facilitate betting or games of chance. 
            Tournament outcomes are determined solely by player skill and organizer-defined rules. 
            All competitions hosted on this platform are strictly for skill-based demonstration.
          </div>
          &copy; {new Date().getFullYear()} WTA Arena Platform. All rights reserved. <br/>
          <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Professional Tournament Infrastructure Software</span>
        </footer>
      </div>

      <MobileNav user={user} />
    </div>
  );
}
