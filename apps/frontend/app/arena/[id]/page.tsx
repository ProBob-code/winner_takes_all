import { Metadata, ResolvingMetadata } from 'next';
import { ArenaClient } from './ArenaClient';

type Props = {
  params: { id: string }
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const id = params.id;
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://winner-takes-all.pages.dev";
  
  try {
    // Attempt to fetch arena info for metadata
    const res = await fetch(`${baseUrl}/api/public-arenas/${id}`, { next: { revalidate: 60 } })
      .then((res) => res.json())
      .catch(() => null);
    
    const arena = res?.arena;
    const name = arena?.name || "Stadium Arena";

    return {
      title: `🏆 LIVE: ${name} | Winner Takes All Stadium`,
      description: `🔥 THE ARENA IS LIVE! Witness the high-stakes showdown in ${name}. Real-time score tracking, elite duels, and legendary tournament action. Join the spectator stream now!`,
      openGraph: {
        title: `🏟️ ${name} is LIVE on Winner Takes All!`,
        description: `⚔️ WITNESS THE LEGEND! Don't miss a second of the elite action in ${name}. Click to join the professional spectator stream and claim your place in the arena!`,
        url: `./${id}`,
        siteName: "Winner Takes All",
        images: [
          {
            url: "https://winner-takes-all.pages.dev/og-image.jpg",
            width: 1200,
            height: 630,
            alt: `Arena: ${name}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: "summary_large_image",
        title: `🏆 ARENA LIVE: ${name}`,
        description: `🔥 Watch the high-stakes showdown in ${name} now! Elite gaming live from the Winner Takes All stadium.`,
        images: ["https://winner-takes-all.pages.dev/og-image.jpg"],
      },
    };
  } catch (e) {
    return {
      title: "LIVE Arena | Winner Takes All",
      description: "Watch high-stakes gaming tournaments live.",
    };
  }
}

export default function Page({ params }: Props) {
  return <ArenaClient id={params.id} />;
}
