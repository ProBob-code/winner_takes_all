"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });

    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      className="button-secondary form-button"
      disabled={isPending}
      onClick={handleLogout}
      type="button"
    >
      {isPending ? "Logging out..." : "Log out"}
    </button>
  );
}
