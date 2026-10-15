import { AuthForm } from "@/components/auth-form";
import Link from "next/link";

// What signing up actually gets you. The first line used to promise "Rs 1,000
// welcome credit", which stopped being true when Phase 0 withdrew stakes and
// should never have been said at all: advertising a money credit for a service
// that runs games is the inducement the Online Gaming Act 2025 penalises
// separately from the games themselves.
const highlights = [
  { icon: "🪙", label: "Earn WTA Coins", detail: "For every frame you play — no cash value" },
  { icon: "🏆", label: "Host or join instantly", detail: "8-ball and football tournaments" },
  { icon: "🎱", label: "Free to enter, always", detail: "No entry fees, no wallet, no top-ups" },
];

export default function SignupPage() {
  return (
    <main className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "grid",
          // The pitch sits beside the form on a wide screen and above it on a
          // phone, where getting to the fields quickly matters more.
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "2rem",
          width: "100%",
          maxWidth: "460px",
          padding: "0 1rem",
        }}
      >
        <section className="panel" style={{ padding: "2.25rem 2rem" }}>
          <AuthForm mode="signup" />
        </section>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
          }}
        >
          {highlights.map((item) => (
            <li
              key={item.label}
              style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}
            >
              <span style={{ fontSize: "1.1rem", lineHeight: 1.2 }}>{item.icon}</span>
              <span>
                <strong style={{ display: "block", fontSize: "0.9rem" }}>{item.label}</strong>
                <span className="muted" style={{ fontSize: "0.8rem" }}>{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.95rem",
            margin: 0,
          }}
        >
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--cyan)", fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
