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
      title: `🔥 LIVE: ${name} | Winner Takes All`,
      description: `⚔️ Watch the high-stakes showdown in ${name}! Real-time scores, legendary duels, and elite gaming. Join the stream now!`,
      openGraph: {
        title: `🏟️ ${name} is LIVE on Winner Takes All!`,
        description: `Don't miss a second of the action in ${name}. Click to watch the live spectator stream!`,
        images: [
          {
            url: "/og-image.png",
            width: 1200,
            height: 630,
            alt: `Live Stream: ${name}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: "summary_large_image",
        title: `🔥 LIVE: ${name}`,
        description: `Watch the high-stakes showdown in ${name} now!`,
        images: ["/og-image.png"],
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
