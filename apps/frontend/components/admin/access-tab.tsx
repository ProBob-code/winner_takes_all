"use client";

import { useState } from "react";
import { Empty, ErrorNote, Loading, Section, sendJson, timeAgo, useLoad } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  "admin.grant": "Gave admin to",
  "admin.revoke": "Took admin from",
  "adsense.settings": "Changed AdSense settings",
  "adsense.earnings": "Saved AdSense month",
  "adsense.earnings.delete": "Deleted AdSense month",
  "artifact.grant": "Gave an item to",
  "artifact.revoke": "Took an item from",
};

export function AccessTab({ me }: { me: any }) {
  const { data, error, loading, reload } = useLoad<any>("/admin/access");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");

  if (loading && !data) return <Loading label="Loading access" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  async function act(path: string, body: any, after?: () => void) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendJson(path, body);
      setMsg({ ok: true, text: r.message });
      after?.();
      reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "That did not work." });
    } finally {
      setBusy(false);
    }
  }

  const audit = (data.audit as any[]).filter(
    (a) => !filter || a.action.startsWith(filter)
  );

  return (
    <div className="adm-stack">
      <div className="adm-owner">
        <div className="adm-owner-badge" aria-hidden>👑</div>
        <div>
          <div className="adm-detail-label">Owner</div>
          <b>{data.owner?.name ?? "Not set up"}</b>
          <div className="muted admin-sub">
            {data.owner?.email ?? "Set ADMIN_OWNER_EMAIL on the Worker, then sign in with Google."}
          </div>
        </div>
        <div className="adm-owner-rules">
          <span>✓ Signs in with Google only</span>
          <span>✓ The only one who can give or take admin</span>
          <span>✓ Cannot be removed from the console</span>
        </div>
      </div>

      {msg && <div className={msg.ok ? "adm-ok" : "adm-error"}>{msg.text}</div>}

      <div className="adm-grid-2">
        <Section
          title={`Other admins (${data.grants.length})`}
          hint="Nobody but the owner, unless the owner lets them in. They must sign in with Google too."
        >
          {data.grants.length ? (
            <ul className="adm-feed">
              {data.grants.map((g: any) => (
                <li key={g.userId}>
                  <span className="adm-avatar">{(g.name || "?").slice(0, 1).toUpperCase()}</span>
                  <span className="adm-feed-main">
                    <b>{g.name}</b>
                    <small>
                      {g.email} · since {new Date(g.grantedAt).toLocaleDateString("en-IN")}
                      {g.note ? ` · ${g.note}` : ""} · last sign-in {timeAgo(g.lastLogin)}
                    </small>
                  </span>
                  {data.canManage && (
                    <button
                      className="adm-link adm-danger"
                      disabled={busy}
                      onClick={() => confirm(`Remove admin access from ${g.name}?`) && act("/admin/access/revoke", { userId: g.userId })}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Only you. Nobody else can open this console.</Empty>
          )}

          {data.lockedOut.length > 0 && (
            <div className="adm-warn">
              <b>Locked out by the new rules:</b> {data.lockedOut.map((u: any) => u.name || u.email).join(", ")}. Their old admin
              role no longer opens anything.
              {data.canManage && " Give them access below if they should keep it."}
            </div>
          )}
        </Section>

        <Section title="Give admin access" hint={data.canManage ? "They need a WTA account under that email first." : "Only the owner can give admin access."}>
          <form
            className="adm-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!confirm(`Give ${email} full admin access to the console?`)) return;
              act("/admin/access/grant", { email, note }, () => {
                setEmail("");
                setNote("");
              });
            }}
          >
            <fieldset disabled={!data.canManage || busy} className="adm-form">
              <label>
                <span>Their email (the Google account they sign in with)</span>
                <input className="premium-input-v2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
              </label>
              <label>
                <span>Why (optional, for your records)</span>
                <input className="premium-input-v2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. runs the Pune venues" />
              </label>
              <button className="button button-sm" disabled={!email}>Give admin access</button>
            </fieldset>
          </form>
          <p className="adm-hint">
            Signed in as {me.user?.email} with {me.via === "google" ? "Google" : me.via}.
          </p>
        </Section>
      </div>

      <Section
        title="Audit log"
        hint="Every change made from this console, newest first."
        actions={
          <select className="premium-input-v2" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter the audit log">
            <option value="">Everything</option>
            <option value="admin.">Admin access</option>
            <option value="artifact.">Items</option>
            <option value="adsense.">AdSense</option>
          </select>
        }
      >
        {audit.length ? (
          <div className="adm-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="muted admin-sub" title={new Date(a.at).toLocaleString()}>{timeAgo(a.at)}</td>
                    <td className="admin-sub">{a.actor}</td>
                    <td>{ACTION_LABEL[a.action] ?? a.action} <b>{a.target ?? ""}</b></td>
                    <td className="muted admin-sub">{a.detail ? summarise(a.detail) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing yet.</Empty>
        )}
      </Section>
    </div>
  );
}

function summarise(detail: any): string {
  if (typeof detail !== "object" || detail === null) return String(detail);
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}
