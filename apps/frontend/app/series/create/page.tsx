"use client";

import Link from "next/link";
import HostSeriesForm from "@/components/host-series-form";

export default function CreateSeriesPage() {
  return (
    <main className="page" style={{ padding: "0 2rem" }}>
      <div className="shell">
        <div className="app-header slide-in" style={{ marginBottom: "2rem" }}>
          <div>
            <Link
              href="/series"
              className="muted"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <span style={{ fontSize: "1.2em" }}>←</span> Back to Series
            </Link>
          </div>
        </div>

        <HostSeriesForm />
      </div>
    </main>
  );
}
