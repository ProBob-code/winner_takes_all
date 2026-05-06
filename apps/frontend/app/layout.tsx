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
  title: "Winner Takes All | The Ultimate Stadium Arena",
  description: "🏆 Step into the world's most elite multi-game tournament platform. High-stakes duels and legendary showdowns.",
  openGraph: {
    title: "🏆 Winner Takes All | Stadium Arena",
    description: "🔥 THE ARENA IS LIVE! Experience high-stakes tournaments and legendary duels in real-time.",
    url: "https://winner-takes-all.pages.dev",
    siteName: "Winner Takes All",
    images: [
      {
        url: "https://winner-takes-all.pages.dev/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Winner Takes All Stadium Arena",
        type: "image/jpeg",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "🏆 Winner Takes All | Stadium Arena",
    description: "⚔️ Join the elite tournament platform. High-stakes duels live now!",
    images: ["https://winner-takes-all.pages.dev/og-image.jpg"],
  },
  metadataBase: new URL("https://winner-takes-all.pages.dev"),
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
