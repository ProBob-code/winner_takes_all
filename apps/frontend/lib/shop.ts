/**
 * The shop's items, for drawing them. Prices, ownership and the rules live in
 * the API (apps/api/src/lib/shop.ts) and arrive from /api/shop; this holds
 * only what the screen needs offline. The shop-mirror test in the API suite
 * fails if an item is added on one side only.
 */

export type ItemKind = "artifact" | "border" | "emote";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ShopItemArt {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  starter?: boolean;
}

export const ITEMS: ShopItemArt[] = [
  { id: "artifact.chalk-cube", kind: "artifact", name: "Chalk Cube", rarity: "common" },
  { id: "artifact.cue-tip", kind: "artifact", name: "Fresh Cue Tip", rarity: "common" },
  { id: "artifact.bridge", kind: "artifact", name: "Bridge Rest", rarity: "common" },
  { id: "artifact.rack", kind: "artifact", name: "Wooden Rack", rarity: "common" },
  { id: "artifact.pocket-net", kind: "artifact", name: "Pocket Net", rarity: "rare" },
  { id: "artifact.scoreboard", kind: "artifact", name: "Bead Scoreboard", rarity: "rare" },
  { id: "artifact.cue-case", kind: "artifact", name: "Leather Cue Case", rarity: "rare" },
  { id: "artifact.neon-sign", kind: "artifact", name: "Neon Sign", rarity: "epic" },
  { id: "artifact.diamond-cue", kind: "artifact", name: "Diamond Inlay Cue", rarity: "epic" },
  { id: "artifact.golden-eight", kind: "artifact", name: "Golden Eight", rarity: "legendary" },
  { id: "artifact.crown-rack", kind: "artifact", name: "Crown Rack", rarity: "legendary" },
  { id: "border.felt", kind: "border", name: "Felt Ring", rarity: "common" },
  { id: "border.oak", kind: "border", name: "Oak Rail", rarity: "common" },
  { id: "border.chalk", kind: "border", name: "Chalk Dust", rarity: "rare" },
  { id: "border.neon", kind: "border", name: "Neon Glow", rarity: "rare" },
  { id: "border.brass", kind: "border", name: "Brass Studs", rarity: "epic" },
  { id: "border.velvet", kind: "border", name: "Velvet Rope", rarity: "epic" },
  { id: "border.gold", kind: "border", name: "Champion Gold", rarity: "legendary" },
  { id: "emote.gg", kind: "emote", name: "GG", rarity: "common", starter: true },
  { id: "emote.shot", kind: "emote", name: "Shot!", rarity: "common", starter: true },
  { id: "emote.unlucky", kind: "emote", name: "Unlucky", rarity: "common", starter: true },
  { id: "emote.rack-em", kind: "emote", name: "Rack 'em", rarity: "common", starter: true },
  { id: "emote.respect", kind: "emote", name: "Respect", rarity: "common", starter: true },
  { id: "emote.oops", kind: "emote", name: "Oops", rarity: "common", starter: true },
  { id: "emote.nice-break", kind: "emote", name: "Nice break", rarity: "common" },
  { id: "emote.too-easy", kind: "emote", name: "Too easy", rarity: "rare" },
  { id: "emote.kiss", kind: "emote", name: "Kiss shot", rarity: "rare" },
  { id: "emote.clutch", kind: "emote", name: "Clutch", rarity: "epic" },
  { id: "emote.on-fire", kind: "emote", name: "On fire", rarity: "epic" },
  { id: "emote.crown", kind: "emote", name: "Bow down", rarity: "legendary" },
];

export function itemArt(id: string): ShopItemArt | undefined {
  return ITEMS.find((item) => item.id === id);
}

/** The colour each rarity wears on cards and labels. */
export const RARITY_COLOUR: Record<Rarity, string> = {
  common: "#8a9099",
  rare: "#2f6fb5",
  epic: "#7a3fb0",
  legendary: "#d4a017",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  artifact: "Artifacts",
  border: "Avatar frames",
  emote: "Emotes",
};
