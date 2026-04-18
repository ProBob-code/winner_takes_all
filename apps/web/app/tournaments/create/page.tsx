export const runtime = "edge";
import HostTournamentForm from "@/components/host-form";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getApiBaseUrl } from "@/lib/backend";

async function checkAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("wta_access_token")?.value;
  if (!token) return false;

  try {
    const res = await fetch(`${getApiBaseUrl()}/user/profile`, {
      headers: { Cookie: `wta_access_token=${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function CreateTournamentPage() {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    redirect("/login");
  }

  return (
    <main className="page" style={{ padding: "0 2rem" }}>
      <div className="shell">
        <div className="app-header slide-in" style={{ marginBottom: "2rem" }}>
          <div>
            <Link href="/tournaments" className="muted" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.2em" }}>←</span> Back to Tournaments
            </Link>
          </div>
        </div>
        
        <HostTournamentForm />
      </div>
    </main>
  );
}
