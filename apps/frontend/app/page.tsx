"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { getApiUrl } from "@/lib/api-config";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setIsLoggedIn(true);
          router.replace("/dashboard");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  if (checking && !isLoggedIn) {
    // Brief loading while checking auth — show nothing to avoid flash
    return null;
  }

  if (isLoggedIn) {
    // Will redirect, show nothing
    return null;
  }

  return <LandingPage />;
}
