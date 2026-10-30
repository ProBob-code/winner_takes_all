"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl } from "@/lib/api-config";

/** Sends a signed-in visitor on to the dashboard once the profile check comes back. */
export function SignedInRedirect() {
  const router = useRouter();

  useEffect(() => {
    fetch(`${getApiUrl()}/api/user/profile`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data.user) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  return null;
}
