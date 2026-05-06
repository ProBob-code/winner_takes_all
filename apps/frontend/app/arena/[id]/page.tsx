import { Metadata, ResolvingMetadata } from 'next';
import { ArenaClient } from './ArenaClient';

type Props = {
  params: { id: string }
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = "Stadium Arena";
  const ogImageUrl = "https://winner-takes-all.pages.dev/og-image.jpg";

  return {
    title: `🏆 LIVE: ${name} | Winner Takes All`,
    description: `🔥 THE ARENA IS LIVE! Witness the high-stakes showdown in ${name}. Real-time score tracking and elite tournament action. Join now!`,
    openGraph: {
      title: `🏟️ ${name} is LIVE on Winner Takes All!`,
      description: `⚔️ WITNESS THE LEGEND! Don't miss a second of the elite action. Click to join the professional spectator stream!`,
      url: `https://winner-takes-all.pages.dev/arena/${params.id}`,
      siteName: "Winner Takes All",
      images: [
        {
          url: "https://winner-takes-all.pages.dev/stadium-og-elite.png?v=6",
          width: 1200,
          height: 630,
          alt: "Stadium Arena Live Preview",
          type: "image/png",
        },
      ],
      type: 'website',
    },
    twitter: {
      card: "summary_large_image",
      title: `🏆 ARENA LIVE: ${name}`,
      description: `🔥 Watch the high-stakes showdown now! Elite gaming live from the Winner Takes All stadium.`,
      images: ["https://winner-takes-all.pages.dev/stadium-og-elite.png?v=6"],
    },
  };
}

export default function Page({ params }: Props) {
  return <ArenaClient id={params.id} />;
}
