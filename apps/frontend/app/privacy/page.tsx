"use client";
import React from "react";

export default function PrivacyPage() {
  return (
    <main className="page" style={{ padding: "80px 6%" }}>
      <div className="shell" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 900, marginBottom: "1rem" }}>Privacy Policy</h1>
        <p className="muted" style={{ marginBottom: "3rem" }}>Last updated: May 11, 2026</p>

        <div className="stack" style={{ gap: "2.5rem", lineHeight: 1.8 }}>
          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>1. Information We Collect</h2>
            <p className="muted">
              We collect information to provide better services to our users. This includes:
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li>Personal identifiers (Name, Email, Username)</li>
                <li>Financial information for participation fees and rewards</li>
                <li>Device and usage data for security and anti-cheat purposes</li>
              </ul>
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>2. How We Use Information</h2>
            <p className="muted">
              We use your data to:
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li>Manage your account and facilitate tournament entry</li>
                <li>Process rewards and participation fees securely</li>
                <li>Ensure platform integrity via anti-cheat verification</li>
                <li>Communicate critical updates and support responses</li>
              </ul>
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>3. Data Sharing & Disclosure</h2>
            <p className="muted">
              We do not sell your personal information. We may share data with:
              <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                <li>Payment processors (e.g., Razorpay) to handle transactions</li>
                <li>Tournament organizers to facilitate event participation</li>
                <li>Law enforcement when required by valid legal process</li>
              </ul>
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>4. Security Measures</h2>
            <p className="muted">
              We implement industry-standard encryption and security protocols to protect your data. 
              However, no method of transmission over the internet is 100% secure, and we cannot 
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>5. Your Rights</h2>
            <p className="muted">
              You have the right to access, correct, or delete your personal data. You may also 
              withdraw consent for data processing, though this may limit your ability to use 
              the Platform.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
