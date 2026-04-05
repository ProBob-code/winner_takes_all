export const leaderboardContracts = {
    global: {
        method: "GET",
        path: "/leaderboard/global",
        summary: "Fetch the global leaderboard",
        auth: "public"
    },
    tournament: {
        method: "GET",
        path: "/leaderboard/tournaments/:id",
        summary: "Fetch leaderboard data for a tournament",
        auth: "public"
    }
};
