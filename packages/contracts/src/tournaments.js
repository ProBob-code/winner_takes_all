export const tournamentContracts = {
    create: {
        method: "POST",
        path: "/tournaments",
        summary: "Create a tournament",
        auth: "admin"
    },
    list: {
        method: "GET",
        path: "/tournaments",
        summary: "List tournaments",
        auth: "public"
    },
    detail: {
        method: "GET",
        path: "/tournaments/:id",
        summary: "Get tournament details",
        auth: "public"
    },
    join: {
        method: "POST",
        path: "/tournaments/:id/join",
        summary: "Join a tournament with wallet or payment-backed entry",
        auth: "user"
    }
};
