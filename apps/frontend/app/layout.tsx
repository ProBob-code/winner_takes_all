import "./globals.css";
import { Suspense } from "react";
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
  title: "W.T.A | Professional Tournament Infrastructure",
  description: "🏆 The premier SaaS platform for esports organizers and community tournaments. Powering events with W.T.A Infrastructure.",
  openGraph: {
    title: "W.T.A | Tournament Infrastructure",
    description: "🔥 Powering the next generation of competitive events. Professional infrastructure for tournament organizers.",
    url: "https://winnertakesall.live",
    siteName: "W.T.A",
    images: [
      {
        url: "https://winnertakesall.live/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "WTA Arena Platform",
        type: "image/jpeg",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "W.T.A | Platform",
    description: "⚔️ Professional tournament infrastructure for communities and esports organizers.",
    images: ["https://winnertakesall.live/og-image.jpg"],
  },
  metadataBase: new URL("https://winnertakesall.live"),
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
        {/* LayoutClient reads the pathname, to drop the sidebar, footer and
            mobile nav on the three full-bleed routes (the big screen, staff
            mode and the join page). usePathname has to sit inside a Suspense
            boundary or prerendering trips Next's workUnitAsyncStorage
            invariant on every page in the app. */}
        <Suspense fallback={null}>
          <LayoutClient>
            {children}
          </LayoutClient>
        </Suspense>
      </body>
    </html>
  );
}
