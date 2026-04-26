export async function onRequestGet() {
  // Demo tournaments data as requested in the plan
  const tournaments = [
    {
      id: "1",
      name: "Beginner Arena",
      entryFee: { amount: "0", currency: "INR" },
      maxPlayers: 8,
      joinedPlayers: 3,
      status: "open",
      isPrivate: false,
    },
    {
      id: "2",
      name: "Pro Showdown",
      entryFee: { amount: "100", currency: "INR" },
      maxPlayers: 16,
      joinedPlayers: 12,
      status: "open",
      isPrivate: true,
    }
  ];

  return new Response(JSON.stringify({ ok: true, tournaments }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    }
  });
}
