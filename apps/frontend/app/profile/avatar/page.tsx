"use client";

/**
 * Build your avatar.
 *
 * A large live preview, a tab per layer, and every option drawn as it would
 * look on you. Parts above your level show what opens them and cannot be
 * picked; the API refuses them too (lib/avatar.ts), so the lock is real rather
 * than a greyed-out suggestion.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { Avatar } from "@/components/avatar";
import { LevelBadge } from "@/components/level-badge";
import {
  AVATAR_LAYERS,
  defaultAvatar,
  randomAvatar,
  resolveAvatar,
  type AvatarConfig,
} from "@/lib/avatar";
import type { LevelInfo } from "@/lib/progression";
import "@/components/progression.css";

/** Layers whose options are colours: shown as swatches, not faces. */
const COLOUR_LAYERS = new Set(["skin", "hairColour", "headwearColour", "outfitColour"]);

export default function AvatarEditorPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [tab, setTab] = useState(AVATAR_LAYERS[0].key);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await backendFetch("/user/profile", { cache: "no-store" });
        if (res.status === 401) return router.push("/login");
        const data: any = await res.json().catch(() => null);
        if (!data?.user) return router.push("/login");
        if (cancelled) return;
        setUserId(data.user.id);
        setLevel(data.user.level);
        setAvatar(resolveAvatar(data.user.avatar, data.user.id));
      } catch {
        if (!cancelled) setError("Could not load your profile. Check your connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const layer = useMemo(() => AVATAR_LAYERS.find((l) => l.key === tab)!, [tab]);
  const playerLevel = level?.level ?? 1;

  function pick(key: string, id: string) {
    setError(null);
    setAvatar((a) => (a ? { ...a, [key]: id } : a));
  }

  async function save() {
    if (!avatar) return;
    setSaving(true);
    setError(null);
    try {
      const res = await backendFetch("/progression/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message || "That did not save. Try again.");
        return;
      }
      router.push("/profile");
    } catch {
      setError("That did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!avatar || !userId) {
    return (
      <main className="page">
        <div className="shell">
          <p className={error ? "av-error" : "muted"}>{error ?? "Loading your avatar…"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="h-stack between" style={{ maxWidth: "64rem", margin: "0 auto var(--space-4)" }}>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 900, margin: 0 }}>Your avatar</h1>
          <Link href="/profile" className="muted" style={{ fontSize: "var(--text-sm)" }}>
            ← Back to profile
          </Link>
        </div>

        <div className="av-editor">
          <aside className="av-preview">
            <Avatar avatar={avatar} seed={userId} size={220} title="Your avatar" />
            {level && (
              <div className="h-stack tight" style={{ alignItems: "center" }}>
                <LevelBadge
                  level={level.level}
                  bandId={level.band.id}
                  bandName={level.band.name}
                  pip={level.pip}
                  pips={level.pips}
                  size={36}
                />
                <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  More parts open as you level up.
                </span>
              </div>
            )}
            <div className="pp-actions" style={{ justifyContent: "center" }}>
              <button type="button" className="button-secondary" onClick={() => setAvatar(randomAvatar(playerLevel))}>
                Shuffle
              </button>
              <button type="button" className="button-secondary" onClick={() => setAvatar(defaultAvatar(userId))}>
                Reset
              </button>
              <button type="button" className="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {error && (
              <p className="av-error" role="alert">
                {error}
              </p>
            )}
          </aside>

          <section>
            <div className="av-tabs" role="tablist" aria-label="Avatar parts">
              {AVATAR_LAYERS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="tab"
                  className="av-tab"
                  aria-selected={l.key === tab}
                  onClick={() => setTab(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="av-options" role="tabpanel" aria-label={layer.label}>
              {layer.parts.map((p) => {
                const locked = p.level > playerLevel;
                const chosen = avatar[layer.key] === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="av-option"
                    aria-pressed={chosen}
                    disabled={locked}
                    title={locked ? `Opens at level ${p.level}` : p.label}
                    onClick={() => pick(layer.key, p.id)}
                  >
                    {COLOUR_LAYERS.has(layer.key) && p.swatch ? (
                      <span className="av-swatch" style={{ background: p.swatch }} />
                    ) : (
                      <Avatar avatar={{ ...avatar, [layer.key]: p.id }} seed={userId} size={56} />
                    )}
                    <span>{p.label}</span>
                    {locked && <span className="av-lock">Lv {p.level}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
