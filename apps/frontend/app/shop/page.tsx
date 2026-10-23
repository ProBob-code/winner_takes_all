"use client";

/**
 * The shop: spend WTA Coins on things to show off.
 *
 * Artifacts (three on show on your profile), avatar frames (one worn around
 * your avatar) and emotes (a deck of eight). Fixed prices, nothing random,
 * yours for good; every rule is the API's (lib/shop.ts there). Buying raises
 * your Collection Level.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backendFetch } from "@/lib/backend";
import { formatCoins } from "@/lib/format";
import { CoinMark } from "@/components/coin-mark";
import { ItemArt } from "@/components/shop-art";
import { KIND_LABEL, RARITY_COLOUR, type ItemKind, type Rarity } from "@/lib/shop";
import "@/components/progression.css";

interface Item {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  price: number;
  forSale: boolean;
  owned: boolean;
  starter?: boolean;
}

interface Loadout {
  borderId: string | null;
  showcase: string[];
  emoteDeck: string[];
}

interface ShopData {
  open: boolean;
  signedIn: boolean;
  balance: number | null;
  picks: string[];
  items: Item[];
  loadout: Loadout | null;
  showcaseSize: number;
  emoteDeckSize: number;
}

const KINDS: ItemKind[] = ["artifact", "border", "emote"];

export default function ShopPage() {
  const [data, setData] = useState<ShopData | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<ItemKind>("artifact");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await backendFetch("/shop", { cache: "no-store" });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return setFailed(true);
      setData(json);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const loadout: Loadout = data?.loadout ?? { borderId: null, showcase: [], emoteDeck: [] };

  async function buy(item: Item) {
    setBusy(item.id);
    setNote(null);
    try {
      const res = await backendFetch("/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote({ tone: "error", text: json?.message || "That did not go through. Try again." });
        return;
      }
      setNote({
        tone: "ok",
        text: `${item.name} is yours.${json.level ? ` Collection Level ${json.level.level}.` : ""}`,
      });
      await load();
    } catch {
      setNote({ tone: "error", text: "Could not reach the server. Nothing was spent." });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  async function saveLoadout(next: Loadout, done: string) {
    setNote(null);
    try {
      const res = await backendFetch("/progression/loadout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNote({ tone: "error", text: json?.message || "That did not save." });
        return;
      }
      setData((d) => (d ? { ...d, loadout: json.loadout } : d));
      setNote({ tone: "ok", text: done });
    } catch {
      setNote({ tone: "error", text: "Could not reach the server." });
    }
  }

  function toggleShow(item: Item) {
    if (!data) return;
    if (item.kind === "border") {
      const wearing = loadout.borderId === item.id;
      void saveLoadout({ ...loadout, borderId: wearing ? null : item.id }, wearing ? `Took off ${item.name}.` : `Wearing ${item.name}.`);
      return;
    }
    const key = item.kind === "artifact" ? "showcase" : "emoteDeck";
    const max = item.kind === "artifact" ? data.showcaseSize : data.emoteDeckSize;
    const list = loadout[key];
    if (list.includes(item.id)) {
      void saveLoadout({ ...loadout, [key]: list.filter((x) => x !== item.id) }, `${item.name} put away.`);
    } else if (list.length >= max) {
      setNote({
        tone: "error",
        text: item.kind === "artifact" ? `Only ${max} artifacts fit on show. Put one away first.` : `Your deck holds ${max} emotes. Take one out first.`,
      });
    } else {
      void saveLoadout({ ...loadout, [key]: [...list, item.id] }, item.kind === "artifact" ? `${item.name} is on show.` : `${item.name} is in your deck.`);
    }
  }

  const shown = (item: Item) =>
    item.kind === "border"
      ? loadout.borderId === item.id
      : item.kind === "artifact"
        ? loadout.showcase.includes(item.id)
        : loadout.emoteDeck.includes(item.id);

  const showLabel = (item: Item, on: boolean) =>
    item.kind === "border" ? (on ? "Wearing" : "Wear") : item.kind === "artifact" ? (on ? "On show" : "Show") : on ? "In deck" : "Add to deck";

  const card = (item: Item) => {
    const on = shown(item);
    const affordable = data?.balance !== null && data?.balance !== undefined && data.balance >= item.price;
    return (
      <article key={item.id} className={`shop-card${item.owned ? " owned" : ""}`} style={{ ["--rarity" as string]: RARITY_COLOUR[item.rarity] }}>
        <div className="shop-art">
          <ItemArt id={item.id} size={72} />
        </div>
        <strong className="shop-name">{item.name}</strong>
        <span className="shop-rarity">{item.starter ? "starter" : item.rarity}</span>
        {item.owned ? (
          data?.signedIn ? (
            <button type="button" className={on ? "button" : "button-secondary"} onClick={() => toggleShow(item)}>
              {showLabel(item, on)}
            </button>
          ) : null
        ) : confirming === item.id ? (
          <div className="shop-confirm">
            <span>
              Buy for <strong>{formatCoins(item.price)}</strong>?
            </span>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button type="button" className="button" disabled={busy === item.id} onClick={() => void buy(item)}>
                {busy === item.id ? "…" : "Buy"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setConfirming(null)}>
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="shop-price"
            disabled={!data?.open || !data?.signedIn || !affordable}
            title={!affordable ? "Not enough coins yet" : undefined}
            onClick={() => setConfirming(item.id)}
          >
            <CoinMark size={16} /> {formatCoins(item.price)}
          </button>
        )}
      </article>
    );
  };

  return (
    <main className="page">
      <div className="shell pp">
        <header className="shop-head">
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--text-3xl)", fontWeight: 900 }}>Shop</h1>
            <p className="muted" style={{ margin: "0.3rem 0 0" }}>
              Spend your WTA Coins on things to show off. Every item raises your Collection Level.
            </p>
          </div>
          {data?.signedIn && data.balance !== null && (
            <div className="shop-balance">
              <CoinMark size={28} />
              <strong>{formatCoins(data.balance)}</strong>
            </div>
          )}
        </header>

        {failed && <p className="muted">Could not load the shop. Try again in a moment.</p>}
        {data && !data.open && (
          <p className="pp-card">The shop is closed on this deployment.</p>
        )}
        {data && !data.signedIn && (
          <p className="pp-card">
            <Link href="/login">Sign in</Link> to buy. Coins come from playing: every frame at a night pays,
            win or lose.
          </p>
        )}
        {note && (
          <p role="status" className={`shop-note ${note.tone}`}>
            {note.text}
          </p>
        )}

        {data && (
          <>
            <section className="pp-card">
              <h2>Today's picks</h2>
              <div className="shop-grid">{data.picks.map((id) => byId.get(id)).filter(Boolean).map((i) => card(i!))}</div>
            </section>

            <section className="pp-card">
              <div className="av-tabs" role="tablist" aria-label="Kinds">
                {KINDS.map((k) => (
                  <button key={k} type="button" role="tab" className="av-tab" aria-selected={k === kind} onClick={() => setKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "0.75rem 0" }}>
                {kind === "artifact"
                  ? `Show up to ${data.showcaseSize} on your profile.`
                  : kind === "border"
                    ? "Worn around your avatar, wherever your name shows."
                    : `Your deck holds ${data.emoteDeckSize}. Everyone starts with six.`}
              </p>
              <div className="shop-grid">{data.items.filter((i) => i.kind === kind).map(card)}</div>
            </section>

            <p className="muted" style={{ fontSize: "var(--text-xs)", lineHeight: 1.7 }}>
              Prices are fixed and nothing is random: you always see exactly what you buy. Items are yours
              for good and cannot be sold, traded or given away. WTA Coins have no cash value and cannot
              be bought with money.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
