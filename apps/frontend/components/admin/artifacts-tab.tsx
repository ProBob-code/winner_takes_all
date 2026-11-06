"use client";

import { useMemo, useState } from "react";
import { ItemArt } from "@/components/shop-art";
import { KIND_LABEL, RARITY_COLOUR } from "@/lib/shop";
import { BarList } from "./charts";
import { Empty, ErrorNote, Kpi, Loading, Section, Segmented, fmtCompact, fmtInt, getJson, sendJson, timeAgo, useLoad } from "./ui";

type Kind = "all" | "artifact" | "border" | "emote";
type SortKey = "owners" | "equipped" | "coinsSpent" | "price" | "name";

const RARITIES = ["common", "rare", "epic", "legendary"] as const;

export function ArtifactsTab() {
  const { data, error, loading, reload } = useLoad<any>("/admin/artifacts");
  const [kind, setKind] = useState<Kind>("artifact");
  const [sort, setSort] = useState<SortKey>("owners");
  const [picked, setPicked] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const items: any[] = data?.items ?? [];
  const shown = useMemo(() => {
    const rows = items.filter((i) => kind === "all" || i.kind === kind);
    return rows.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b[sort] - a[sort]));
  }, [items, kind, sort]);

  if (loading && !data) return <Loading label="Loading the catalogue" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const scope = items.filter((i) => kind === "all" || i.kind === kind);
  const owned = scope.reduce((s, i) => s + i.owners, 0);
  const spent = scope.reduce((s, i) => s + i.coinsSpent, 0);
  const granted = scope.reduce((s, i) => s + i.granted, 0);
  const byRarity = RARITIES.map((r) => ({
    key: r,
    label: r[0].toUpperCase() + r.slice(1),
    value: scope.filter((i) => i.rarity === r).reduce((s, i) => s + i.owners, 0),
  }));
  const item = picked ? items.find((i) => i.id === picked) : null;

  const done = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (ok) reload();
  };

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <Segmented<Kind>
          label="Kind of item"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPicked(null);
          }}
          options={[
            { value: "artifact", label: "Artifacts" },
            { value: "border", label: "Frames" },
            { value: "emote", label: "Emotes" },
            { value: "all", label: "Everything" },
          ]}
        />
        <label className="adm-inline">
          Sort by
          <select className="premium-input-v2" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="owners">Most owned</option>
            <option value="equipped">Most shown</option>
            <option value="coinsSpent">Coins spent</option>
            <option value="price">Price</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="adm-kpis">
        <Kpi label="Items in the catalogue" value={fmtInt(scope.length)} sub={kind === "all" ? "all kinds" : KIND_LABEL[kind]} />
        <Kpi label="Copies owned" value={fmtInt(owned)} sub={`${fmtInt(granted)} given by an admin`} />
        <Kpi label="Coins spent on them" value={fmtCompact(spent)} />
        <Kpi label="On show right now" value={fmtInt(scope.reduce((s, i) => s + i.equipped, 0))} sub="equipped on profiles" />
      </div>

      {msg && <div className={msg.ok ? "adm-ok" : "adm-error"}>{msg.text}</div>}

      <div className="adm-grid-side">
        <Section title={kind === "all" ? "Catalogue" : KIND_LABEL[kind]} hint="Tap an item to see its owners, give it to a player or take it back.">
          <div className="adm-items">
            {shown.map((i) => (
              <button
                key={i.id}
                type="button"
                className={`adm-item ${picked === i.id ? "is-active" : ""}`}
                onClick={() => setPicked(picked === i.id ? null : i.id)}
                style={{ ["--rarity" as any]: RARITY_COLOUR[i.rarity as keyof typeof RARITY_COLOUR] }}
              >
                <span className="adm-item-art"><ItemArt id={i.id} size={56} /></span>
                <span className="adm-item-name">{i.name}</span>
                <span className="adm-item-rarity">{i.rarity}{i.starter ? " · starter" : ""}</span>
                <span className="adm-item-stats">
                  <span title="Owners"><b>{fmtInt(i.owners)}</b> owned</span>
                  <span title="Equipped"><b>{fmtInt(i.equipped)}</b> shown</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <div className="adm-stack">
          {item ? (
            <ItemPanel item={item} onDone={done} />
          ) : (
            <>
              <Section title="Owned copies by rarity">
                <BarList rows={byRarity} format={fmtInt} />
              </Section>
              <PlayerLookup onDone={done} items={items} />
            </>
          )}
          <Section title="Latest unlocks">
            {data.recent.length ? (
              <ul className="adm-feed">
                {data.recent.slice(0, 12).map((r: any, idx: number) => (
                  <li key={idx}>
                    <span className="adm-feed-art"><ItemArt id={r.itemId} size={28} /></span>
                    <span className="adm-feed-main">
                      <b>{r.itemName}</b>
                      <small>{r.user?.name ?? "?"}</small>
                    </span>
                    <span className={`adm-chip s-${r.source}`}>{r.source === "shop" ? `${fmtCompact(r.price)} coins` : r.source}</span>
                    <span className="adm-feed-time">{timeAgo(r.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nobody has unlocked anything yet.</Empty>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function ItemPanel({ item, onDone }: { item: any; onDone: (ok: boolean, text: string) => void }) {
  const { data, loading, reload } = useLoad<any>(`/admin/artifacts/${encodeURIComponent(item.id)}/owners`, [item.owners]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(path: string, body: any) {
    setBusy(true);
    try {
      const r = await sendJson(path, body);
      onDone(true, r.message);
      setEmail("");
      reload();
    } catch (e: any) {
      onDone(false, e?.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={item.name} hint={`${item.rarity} ${item.kind}${item.forSale ? ` · ${fmtCompact(item.price)} coins in the shop` : ""}`}>
      <div className="adm-item-hero" style={{ ["--rarity" as any]: RARITY_COLOUR[item.rarity as keyof typeof RARITY_COLOUR] }}>
        <ItemArt id={item.id} size={96} />
        <dl className="adm-dl">
          <div><dt>Owned</dt><dd>{fmtInt(item.owners)}</dd></div>
          <div><dt>Bought</dt><dd>{fmtInt(item.bought)}</dd></div>
          <div><dt>Given by admin</dt><dd>{fmtInt(item.granted)}</dd></div>
          <div><dt>On show</dt><dd>{fmtInt(item.equipped)}</dd></div>
          <div><dt>Coins spent</dt><dd>{fmtCompact(item.coinsSpent)}</dd></div>
          <div><dt>Level XP</dt><dd>+{item.collectionPoints}</dd></div>
        </dl>
      </div>

      {!item.starter && (
        <form
          className="adm-form adm-form-inline"
          onSubmit={(e) => {
            e.preventDefault();
            act("/admin/artifacts/grant", { itemId: item.id, email });
          }}
        >
          <input className="premium-input-v2" type="email" required placeholder="player@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="button button-sm" disabled={busy || !email}>Give it</button>
        </form>
      )}

      <h4 className="adm-subhead">Owners</h4>
      {loading && !data ? (
        <Loading />
      ) : data?.owners?.length ? (
        <ul className="adm-feed">
          {data.owners.map((o: any) => (
            <li key={o.id}>
              <span className="adm-avatar">{(o.name || "?").slice(0, 1).toUpperCase()}</span>
              <span className="adm-feed-main">
                <b>{o.name}</b>
                <small>{o.email}</small>
              </span>
              <span className={`adm-chip s-${o.source}`}>{o.source}</span>
              <button
                className="adm-link adm-danger"
                disabled={busy}
                onClick={() => confirm(`Take ${item.name} back from ${o.name}?`) && act("/admin/artifacts/revoke", { itemId: item.id, userId: o.id })}
              >
                Take back
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{item.starter ? "Every player has this from the start." : "Nobody owns this yet."}</Empty>
      )}
    </Section>
  );
}

function PlayerLookup({ items, onDone }: { items: any[]; onDone: (ok: boolean, text: string) => void }) {
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [give, setGive] = useState("");

  async function look(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    try {
      setFound(await getJson(`/admin/artifacts/player?email=${encodeURIComponent(email.trim())}`));
    } catch (x: any) {
      setFound(null);
      setErr(x?.message);
    }
  }

  const owned = new Set<string>((found?.owned ?? []).map((o: any) => o.itemId));
  const name = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  return (
    <Section title="Look up a player's collection">
      <form className="adm-form adm-form-inline" onSubmit={look}>
        <input className="premium-input-v2" type="email" required placeholder="player@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="button-secondary button-sm">Look up</button>
      </form>
      {err && <div className="adm-error">{err}</div>}
      {found && (
        <div className="adm-collection">
          <div className="adm-detail-label">
            {found.user.name} owns {owned.size} item{owned.size === 1 ? "" : "s"}
          </div>
          <div className="adm-chips">
            {found.owned.map((o: any) => (
              <span key={o.itemId} className={`adm-chip ${found.loadout?.showcase?.includes(o.itemId) ? "is-on" : ""}`} title={o.source}>
                {name(o.itemId)}
              </span>
            ))}
          </div>
          <form
            className="adm-form adm-form-inline"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await sendJson("/admin/artifacts/grant", { itemId: give, userId: found.user.id });
                onDone(true, r.message);
                look();
              } catch (x: any) {
                onDone(false, x?.message || "That did not work.");
              }
            }}
          >
            <select className="premium-input-v2" value={give} onChange={(e) => setGive(e.target.value)} required>
              <option value="">Give an item…</option>
              {items
                .filter((i) => !i.starter && !owned.has(i.id))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.rarity} {i.kind})
                  </option>
                ))}
            </select>
            <button className="button button-sm" disabled={!give}>Give</button>
          </form>
        </div>
      )}
    </Section>
  );
}
