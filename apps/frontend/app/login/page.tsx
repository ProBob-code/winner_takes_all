import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell
      kicker="WELCOME BACK"
      headline={<>Your table<span className="auth-accent">is waiting.</span></>}
      switchText="New to WTA?"
      switchHref="/signup"
      switchLabel="Create an account"
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
