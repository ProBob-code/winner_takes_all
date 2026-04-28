"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { Inter, Outfit } from "next/font/google";
import { getApiUrl } from "@/lib/api-config";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <title>WTA | Premium Tournament Platform</title>
        <meta name="description" content="Compete in high-stakes multi-game tournaments. Professional grade." />
        <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
      </head>
      <body className={inter.className} style={{ background: "var(--bg-deep)", color: "var(--text-primary)" }}>
        <div className="app-container">
          <Sidebar user={user} />
          
          <div className="main-content">
            <Topbar user={user} />
            
            <div className="page-content" style={{ flex: 1, position: "relative" }}>
              {children}
            </div>

            <footer style={{
              padding: "2rem",
              textAlign: "center",
              borderTop: "1px solid var(--glass-bg-hover)",
              marginTop: "auto",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              background: "rgba(0,0,0,0.2)"
            }}>
              &copy; {new Date().getFullYear()} Winner Takes All. All rights reserved. <br/>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Premium Competitive Gaming Platform</span>
            </footer>
          </div>

          <MobileNav user={user} />
        </div>
      </body>
    </html>
  );
}
