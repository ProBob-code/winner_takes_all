/**
 * Proof of Play, in the browser: the location helper and the words for each
 * tier. The rules themselves live on the server (apps/api/src/lib/proof.ts).
 */

export type ProofTier = "VERIFIED" | "PARTLY" | "PRACTICE";

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
}

const LOCATE_KEY = "wta.proof.locate";

/** Whether this person chose to share location for check-ins. Default on. */
export function wantsToLocate(): boolean {
  try {
    return localStorage.getItem(LOCATE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setWantsToLocate(on: boolean): void {
  try {
    localStorage.setItem(LOCATE_KEY, on ? "1" : "0");
  } catch {
    // A private window: the choice lasts for this visit only.
  }
}

/**
 * One reading of where this phone is, or null if it is off, refused, or slow.
 * Never throws: location only ever adds proof, it is never required.
 */
export function readFix(timeoutMs = 8000): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy || 0),
        });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}

export const TIER_LABEL: Record<ProofTier, string> = {
  VERIFIED: "Verified",
  PARTLY: "Partly verified",
  PRACTICE: "Practice",
};

export const TIER_MARK: Record<ProofTier, string> = {
  VERIFIED: "✅",
  PARTLY: "☑️",
  PRACTICE: "·",
};

/** Why a game came out the way it did, in a few words. */
export function reasonText(reason: string): string {
  switch (reason) {
    case "walk_in": return "against a walk-in with no account";
    case "not_checked_in": return "a player didn't type the game code";
    case "same_account": return "both sides on one account";
    case "too_fast": return "finished faster than a real game can";
    case "far_apart": return "the phones were far apart";
    case "near": return "both phones at the table";
    case "venue": return "played at a venue's night";
    case "no_location": return "no location shared";
    case "ruled_void": return "the host ruled it void";
    case "dispute_expired": return "disputed, and nobody ruled in time";
    default: return reason;
  }
}

/** "K7MQ2P" typed any which way, tidied for the input box. */
export function tidyCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
}
