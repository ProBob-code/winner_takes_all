import "./globals.css";
import { Inter, Outfit } from "next/font/google";
import { LayoutClient } from "@/components/layout-client";
import { Metadata } from "next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "W.T.A | Winner.Takes.All",
  description: "🏆 Join the elite. Compete in high-stakes multi-game tournaments. Professional grade gaming arena.",
  themeColor: "#FFD700",
  openGraph: {
    title: "W.T.A | Winner.Takes.All",
    description: "🔥 The arena is live! Join high-stakes tournaments, dominate the leaderboard, and claim your victory.",
    url: "https://winner-takes-all.pages.dev",
    siteName: "Winner Takes All",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "WTA Arena Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "W.T.A | Winner.Takes.All",
    description: "🏆 High-stakes multi-game tournaments. Join the arena now!",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M2 19L5 7L10 12L12 5L14 12L19 7L22 19H2Z' fill='%23FFD700'/></svg>" />
        <script src="https://checkout.razorpay.com/v1/checkout.js" async></script>
      </head>
      <body className={inter.className} style={{ background: "var(--bg-deep)", color: "var(--text-primary)" }}>
        <LayoutClient>
          {children}
        </LayoutClient>
      </body>
    </html>
  );
}
