"use client";
import { useEffect, useState } from "react";
import HostTournamentForm from "@/components/host-form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";


export default function CreateTournamentPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      if (typeof window === "undefined") return;
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/user/profile`, { credentials: "include" });
        setIsAuthenticated(res.ok);
        if (!res.ok) window.location.href = "/login";
      } catch {
        setIsAuthenticated(false);
        window.location.href = "/login";
      }
    }
    check();
  }, []);

  if (isAuthenticated === null) return <div>Checking auth...</div>;
  if (!isAuthenticated) return null;

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
