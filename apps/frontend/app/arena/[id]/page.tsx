import { Metadata, ResolvingMetadata } from 'next';
import { ArenaClient } from './ArenaClient';

type Props = {
  params: Promise<{ id: string }>
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const name = "Stadium Arena";
  const ogImageUrl = "https://winner-takes-all.pages.dev/og-image.jpg";

  return {
    title: `🏆 LIVE: ${name} | Stadium Arena`,
    description: `🔥 THE ARENA IS LIVE! Witness the skill-based showdown in ${name}. Real-time score tracking and elite tournament action. Join now!`,
    openGraph: {
      title: `🏟️ ${name} is LIVE on Stadium Arena!`,
      description: `⚔️ WITNESS THE LEGEND! Don't miss a second of the elite action. Click to join the professional spectator stream!`,
      url: `https://winner-takes-all.pages.dev/arena/${id}`,
      siteName: "Stadium Arena",
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
      description: `🔥 Watch the skill-based showdown now! Elite gaming live from the Stadium Arena.`,
      images: ["https://winner-takes-all.pages.dev/stadium-og-elite.png?v=6"],
    },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ArenaClient id={id} />;
}
