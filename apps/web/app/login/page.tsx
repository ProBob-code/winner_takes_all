import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="page">
      <div className="shell page-grid">
        <section className="panel page-card">
          <h2>Login</h2>
          <p className="muted">
            Use the FastAPI-backed session flow to enter the platform with HTTP-only
            cookies and server-rendered protected routes.
          </p>
          <AuthForm mode="login" />
        </section>

        <aside className="panel page-card">
          <h2>Protected Routes</h2>
          <p className="muted">
            `/dashboard`, `/wallet`, `/match/:id`, and admin pages should require a
            validated session before rendering.
          </p>
        </aside>
      </div>
    </main>
  );
}
