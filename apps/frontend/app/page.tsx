import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";
import { SignedInRedirect } from "@/components/signed-in-redirect";
import { SITE_URL } from "@/lib/page-metadata";
import { HOME_FAQ } from "@/lib/home-faq";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Winner Takes All",
      alternateName: "W.T.A",
      url: SITE_URL,
    },
    {
      "@type": "SoftwareApplication",
      name: "Winner Takes All",
      url: SITE_URL,
      description:
        "Brackets, scoring and a live table for 8-ball and football tournament nights at pool rooms, clubs, bars and gaming cafés.",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      image: `${SITE_URL}/og-image.jpg`,
      publisher: { "@id": `${SITE_URL}/#org` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
};

// The landing page renders on the server, so search engines and link previews see it;
// a signed-in visitor is sent on to the dashboard from the browser.
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <SignedInRedirect />
      <LandingPage />
    </>
  );
}
