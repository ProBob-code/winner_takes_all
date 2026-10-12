/**
 * Subscription billing: what a venue pays for the software.
 *
 * WHY THIS IS NOT GATED BY `stakesEnabled`
 * A venue paying for a scoreboard and a player paying to enter a game are
 * different transactions in law and in substance. India's Promotion and
 * Regulation of Online Gaming Act 2025 prohibits the second — an online game
 * played for a stake — and says nothing about the first, which is an ordinary
 * business-to-business sale of software. Routing venue billing through
 * `stakesEnabled` would therefore switch off the one revenue line that is
 * lawful in order to protect against the one that is not.
 *
 * It has its own switch instead, `BILLING_ENABLED`, which is also default-off:
 * a deployment with no Razorpay keys should not offer a subscription it cannot
 * take, and a staging deployment should not take one by accident.
 *
 * Prices come from the CFO review in founder/cfo.md: at ₹1,500 per venue per
 * month, 17 venues reach the ₹25,000/month the founder asked for, against the
 * 1,122 tournaments a month the 7% rake needed.
 */

/** Rupees per month per venue, and what distinguishes each tier. */
export interface Plan {
  code: string;
  name: string;
  /** Rupees, per billing period, per site. */
  rupees: number;
  intervalMonths: number;
  /** Fewest sites this plan may be sold for. Chains only. */
  minSites: number;
  /** Whether this plan bills a chain rather than one venue. */
  chain: boolean;
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    code: "venue_monthly",
    name: "One venue, monthly",
    rupees: 1500,
    intervalMonths: 1,
    minSites: 1,
    chain: false,
    blurb: "A single room. Cancel whenever.",
    features: [
      "Unlimited league nights and tournaments",
      "Big-screen display and staff mode",
      "Offline scoring that survives the connection dropping",
      "Results and tables pushed to your WhatsApp group",
      "Join by QR — no account needed for players",
    ],
  },
  {
    code: "venue_annual",
    name: "One venue, yearly",
    // Ten months for twelve. A year up front is worth two months to us: it
    // removes eleven chances to churn and the card failures that go with them.
    rupees: 15000,
    intervalMonths: 12,
    minSites: 1,
    chain: false,
    blurb: "Two months free against the monthly price.",
    features: [
      "Everything in the monthly plan",
      "Two months free",
      "Priority support on league nights",
    ],
  },
  {
    code: "chain_monthly",
    name: "Chain, monthly",
    // Chain owners multiply any per-site price across their sites, so they
    // feel a per-unit figure more sharply than a single-venue owner despite
    // earning more. The discount is what makes the multiplication bearable.
    rupees: 1200,
    intervalMonths: 1,
    minSites: 3,
    chain: true,
    blurb: "Three sites or more. Per site, per month.",
    features: [
      "Everything in the monthly plan, at every site",
      "One league table spanning all your venues",
      "A single dashboard across the chain",
      "Per-site activity so you can see which rooms are actually running nights",
    ],
  },
];

export function findPlan(code: string): Plan | null {
  return PLANS.find((p) => p.code === code) ?? null;
}

/**
 * How long a new subscription runs free.
 *
 * One month, because the exit test for Phase 1 is three venues paying *after*
 * their free month. A trial shorter than a billing cycle of league nights
 * cannot answer the only question worth asking.
 */
export const TRIAL_DAYS = 30;

/**
 * Whether this deployment may sell a subscription.
 *
 * Needs the switch and the credentials. Default-off so a deployment without
 * Razorpay keys says so plainly rather than failing at checkout.
 */
export function billingEnabled(env: {
  BILLING_ENABLED?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
}): boolean {
  if ((env.BILLING_ENABLED ?? "").trim().toLowerCase() !== "true") return false;
  return Boolean((env.RAZORPAY_KEY_ID ?? "").trim() && (env.RAZORPAY_KEY_SECRET ?? "").trim());
}

/** What the price works out to, in paise, for a given number of sites. */
export function planAmountPaise(plan: Plan, sites: number): number {
  const billableSites = Math.max(plan.minSites, Math.floor(sites) || 1);
  return plan.rupees * 100 * (plan.chain ? billableSites : 1);
}

function authHeader(keyId: string, keySecret: string): string {
  return "Basic " + btoa(`${keyId}:${keySecret}`);
}

async function razorpay(
  keyId: string,
  keySecret: string,
  path: string,
  body?: unknown
): Promise<any> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: authHeader(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Razorpay ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Razorpay ${path} returned a malformed response`);
  }
}

/**
 * Create the Razorpay plan this subscription bills against.
 *
 * Razorpay wants a plan object before a subscription can reference it, and a
 * plan is immutable once created, so one is created per (plan code, amount)
 * pair rather than reused across prices. A chain of five sites and a chain of
 * six are different amounts and so different plans.
 */
export async function createRazorpayPlan(
  keyId: string,
  keySecret: string,
  plan: Plan,
  amountPaise: number
): Promise<{ id: string }> {
  return razorpay(keyId, keySecret, "/plans", {
    period: plan.intervalMonths === 12 ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: plan.name,
      amount: amountPaise,
      currency: "INR",
      description: plan.blurb,
    },
    notes: { plan_code: plan.code },
  });
}

/**
 * Create the subscription itself.
 *
 * `start_at` is set past the trial, which is how Razorpay expresses a free
 * period: the mandate is authorised now and the first charge falls due later.
 * `total_count` is the number of billing cycles Razorpay will attempt; 120
 * months is ten years, which is well past the point at which someone will have
 * either churned or renegotiated.
 */
export async function createRazorpaySubscription(
  keyId: string,
  keySecret: string,
  args: {
    planId: string;
    startAtUnix: number;
    totalCount: number;
    notes?: Record<string, string>;
  }
): Promise<any> {
  return razorpay(keyId, keySecret, "/subscriptions", {
    plan_id: args.planId,
    total_count: args.totalCount,
    quantity: 1,
    customer_notify: 1,
    start_at: args.startAtUnix,
    notes: args.notes ?? {},
  });
}

export async function cancelRazorpaySubscription(
  keyId: string,
  keySecret: string,
  subscriptionId: string,
  atCycleEnd = true
): Promise<any> {
  return razorpay(keyId, keySecret, `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
}

/**
 * How a Razorpay subscription status maps onto ours.
 *
 * Razorpay has more states than the app needs to distinguish. What matters is
 * whether the venue is entitled to use the software today, which is true for
 * an authorised mandate inside its trial as much as for an active one.
 */
export function mapProviderStatus(providerStatus: string): string {
  switch (providerStatus) {
    case "created":
      return "created";
    case "authenticated":
      return "authenticated";
    case "active":
      return "active";
    case "pending":
    case "halted":
      // Payment failed and is being retried. Still entitled: a card that
      // expired is not a reason to shut a league night down mid-frame.
      return "past_due";
    case "cancelled":
      return "cancelled";
    case "completed":
      return "completed";
    case "expired":
      return "expired";
    case "paused":
      return "paused";
    default:
      return providerStatus || "unknown";
  }
}

/** Whether a stored status means the venue may use the software now. */
export function statusEntitles(status: string): boolean {
  return status === "active" || status === "authenticated" || status === "trialing" ||
    status === "past_due";
}
