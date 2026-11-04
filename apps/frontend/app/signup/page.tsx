import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

// What signing up gets you lives in AuthShell. It once promised "Rs 1,000
// welcome credit", which stopped being true when Phase 0 withdrew stakes and
// should never have been said: advertising a money credit for a service that
// runs games is the inducement the Online Gaming Act 2025 penalises
// separately from the games themselves.
export default function SignupPage() {
  return (
    <AuthShell
      kicker="FREE TO PLAY, ALWAYS"
      headline={<>Play the fight.<span className="auth-accent">Take the crown.</span></>}
      switchText="Already have an account?"
      switchHref="/login"
      switchLabel="Log in"
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
