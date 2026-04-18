export const runtime = "edge";
import { AuthForm } from "@/components/auth-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        maxWidth: "440px",
        width: "100%",
        padding: "0 1rem"
      }}>
        <section className="panel" style={{ padding: "2.5rem 2rem" }}>
          <AuthForm mode="login" />
        </section>
        
        <p style={{
          textAlign: "center",
          marginTop: "1.5rem",
          color: "var(--text-muted)",
          fontSize: "0.95rem"
        }}>
          Don't have an account?{" "}
          <Link href="/signup" style={{ color: "var(--cyan)", fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
