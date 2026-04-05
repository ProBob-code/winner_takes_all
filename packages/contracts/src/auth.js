export const authContracts = {
    signup: {
        method: "POST",
        path: "/auth/signup",
        summary: "Create a new user and bootstrap wallet",
        auth: "public"
    },
    login: {
        method: "POST",
        path: "/auth/login",
        summary: "Issue access and refresh tokens",
        auth: "public"
    },
    refresh: {
        method: "POST",
        path: "/auth/refresh",
        summary: "Rotate refresh token and mint new access token",
        auth: "public"
    },
    profile: {
        method: "GET",
        path: "/user/profile",
        summary: "Fetch authenticated user profile",
        auth: "user"
    }
};
