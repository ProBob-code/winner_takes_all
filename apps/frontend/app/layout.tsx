export const dynamic = "force-dynamic";
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { NotificationBell } from "@/components/notification-bell";
import { Inter, Outfit } from "next/font/google";
import { backendFetch } from "@/lib/backend";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });


export const metadata: Metadata = {
  title: "WTA | Premium Tournament Platform",
  description: "Compete in high-stakes multi-game tournaments. Professional grade.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className={inter.className}>
        <div className="app-container">
          <Sidebar user={null} />
          
          <div className="main-content">
            <Topbar />
            
            {children}
            <footer style={{
              padding: "2rem",
              textAlign: "center",
              borderTop: "1px solid var(--glass-bg-hover)",
              marginTop: "auto",
              color: "var(--text-muted)",
              fontSize: "0.85rem"
            }}>
              &copy; {new Date().getFullYear()} Winner Takes All. All rights reserved. <br/>
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Premium Competitive Gaming Platform</span>
            </footer>
          </div>

          <MobileNav user={null} />
        </div>
      </body>
    </html>
  );
}
