import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <main className="page">
      <div className="shell page-grid">
        <section className="panel page-card">
          <h2>Create your account</h2>
          <p className="muted">
            New users receive a starter wallet balance in the FastAPI prototype so the
            full join flow can be exercised immediately.
          </p>
          <AuthForm mode="signup" />
        </section>

        <aside className="panel page-card">
          <h2>Trust Requirements</h2>
          <p className="muted">
            Identity, payment, and wallet history must stay auditable from day one, even
            while the platform is still in prototype mode.
          </p>
        </aside>
      </div>
    </main>
  );
}
