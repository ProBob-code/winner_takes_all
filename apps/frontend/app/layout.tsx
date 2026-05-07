import "./globals.css";
import { Inter, Outfit } from "next/font/google";
import { LayoutClient } from "@/components/layout-client";
import { Metadata } from "next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FFD700",
};

export const metadata: Metadata = {
  title: "Stadium Arena | Esports Community Platform",
  description: "🏆 Step into the world's most elite multi-game tournament platform. Skill-based tournaments and social competition.",
  openGraph: {
    title: "🏆 Stadium Arena | Esports Platform",
    description: "🔥 THE ARENA IS LIVE! Experience skill-based tournaments and legendary duels in real-time.",
    url: "https://stadium-arena.pages.dev",
    siteName: "Stadium Arena",
    images: [
      {
        url: "https://stadium-arena.pages.dev/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Stadium Arena Platform",
        type: "image/jpeg",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "🏆 Stadium Arena | Esports Platform",
    description: "⚔️ Join the elite esports community platform. Skill-based duels live now!",
    images: ["https://stadium-arena.pages.dev/og-image.jpg"],
  },
  metadataBase: new URL("https://stadium-arena.pages.dev"),
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
      <body className={inter.className} style={{ background: "var(--bg-primary)", color: "var(--text-primary)", margin: 0, padding: 0 }}>
        <LayoutClient>
          {children}
        </LayoutClient>
      </body>
    </html>
  );
}
