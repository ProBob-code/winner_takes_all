"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { backendFetch } from "@/lib/backend";
import { SPORTS } from "@/lib/sports";

/**
 * The host's edit for a night they created.
 *
 * Before it starts, everything that shapes the draw can change; once the
 * fixtures exist only the name can, and the API holds the same line, so the
 * fields that are locked say why instead of quietly failing.
 */

const FORMATS = [
  { id: "single_elimination", label: "Single elimination" },
  { id: "double_elimination", label: "Double elimination" },
  { id: "round_robin", label: "Round robin" },
  { id: "group_knockout", label: "Group + knockout" },
];

export interface EditableTournament {
  id: string;
  name: string;
  maxPlayers: number;
  joinedPlayers: number;
  sport: string;
  bracketType: string;
  tournamentType: string;
  isPrivate: boolean;
  status: string;
}

export function EditTournamentDialog({ tournament, onSaved }: { tournament: EditableTournament; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(tournament.name);
  const [maxPlayers, setMaxPlayers] = useState(tournament.maxPlayers);
  const [sport, setSport] = useState(tournament.sport);
  const [bracketType, setBracketType] = useState(tournament.bracketType);
  const [tournamentType, setTournamentType] = useState(tournament.tournamentType);
  // Blank keeps the current password; "Make it public" clears it.
  const [password, setPassword] = useState("");
  const [makePublic, setMakePublic] = useState(false);

  const notStarted = tournament.status === "open";

  useEffect(() => setMounted(true), []);

  const reset = () => {
    setName(tournament.name);
    setMaxPlayers(tournament.maxPlayers);
    setSport(tournament.sport);
    setBracketType(tournament.bracketType);
    setTournamentType(tournament.tournamentType);
    setPassword("");
    setMakePublic(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (name.trim() !== tournament.name) body.name = name.trim();
    if (notStarted) {
      if (maxPlayers !== tournament.maxPlayers) body.maxPlayers = maxPlayers;
      if (sport !== tournament.sport) body.sport = sport;
      if (bracketType !== tournament.bracketType) body.bracketType = bracketType;
      if (tournamentType !== tournament.tournamentType) body.tournamentType = tournamentType;
      if (makePublic) body.password = null;
      else if (password.trim()) body.password = password.trim();
    }
    if (Object.keys(body).length === 0) {
      setOpen(false);
      setSaving(false);
      return;
    }
    try {
      const res = await backendFetch(`/tournaments/${tournament.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.message || `Could not save (${res.status})`);
      setOpen(false);
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field: React.CSSProperties = { width: "100%" };
  const label: React.CSSProperties = { display: "block", fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.5px", marginBottom: 6 };

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit night"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999, padding: "1rem",
        background: "var(--bg-inset)", backdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        className="panel"
        style={{
          width: "100%", maxWidth: 460, maxHeight: "calc(100dvh - 2rem)", overflowY: "auto",
          padding: "1.75rem 1.5rem", borderRadius: 20, background: "var(--bg-card)",
          display: "flex", flexDirection: "column", gap: "1rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 900 }}>Edit night</h2>

        <div>
          <label style={label} htmlFor="edit-name">Name</label>
          <input id="edit-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={field} />
        </div>

        {notStarted ? (
          <>
            <div>
              <label style={label} htmlFor="edit-sport">Sport</label>
              <select id="edit-sport" value={sport} onChange={(e) => setSport(e.target.value)} style={field}>
                {SPORTS.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="edit-format">Format</label>
              <select id="edit-format" value={bracketType} onChange={(e) => setBracketType(e.target.value)} style={field}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <label style={label} htmlFor="edit-max">Max players</label>
                <input
                  id="edit-max" type="number" inputMode="numeric"
                  min={Math.max(2, tournament.joinedPlayers)} max={128}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  style={field}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={label} htmlFor="edit-where">Played</label>
                <select id="edit-where" value={tournamentType} onChange={(e) => setTournamentType(e.target.value)} style={field}>
                  <option value="offline">📍 Offline</option>
                  <option value="online">💻 Online</option>
                </select>
              </div>
            </div>
            <div>
              <label style={label} htmlFor="edit-password">
                {tournament.isPrivate ? "New join password" : "Join password (makes it private)"}
              </label>
              <input
                id="edit-password" type="text" autoComplete="off" maxLength={64}
                placeholder={tournament.isPrivate ? "Leave blank to keep the current one" : "Leave blank to keep it public"}
                value={password}
                disabled={makePublic}
                onChange={(e) => setPassword(e.target.value)}
                style={field}
              />
              {tournament.isPrivate && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={makePublic} onChange={(e) => setMakePublic(e.target.checked)} style={{ width: "auto" }} />
                  Remove the password and make it public
                </label>
              )}
            </div>
          </>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
            The night has started, so the fixtures are drawn: only the name can change now.
          </p>
        )}

        {error && (
          <div role="alert" style={{ padding: "0.7rem 0.9rem", borderRadius: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--red-light)", fontSize: "0.88rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem" }}>
          <button type="button" className="button button-secondary" style={{ flex: 1 }} disabled={saving} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button" className="button button-gold" style={{ flex: 1 }}
            disabled={saving || name.trim().length < 2}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="button button-secondary"
        style={{ fontWeight: 800, fontSize: "0.85rem", padding: "0.6rem 1.2rem", borderRadius: 12 }}
        onClick={() => { reset(); setOpen(true); }}
      >
        ✏️ Edit night
      </button>
      {open && mounted && createPortal(dialog, document.body)}
    </>
  );
}
