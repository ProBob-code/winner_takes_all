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
          </div>

          <MobileNav user={null} />
        </div>
      </body>
    </html>
  );
}
