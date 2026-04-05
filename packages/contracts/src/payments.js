export const paymentContracts = {
    createOrder: {
        method: "POST",
        path: "/payments/create-order",
        summary: "Create a provider payment order",
        auth: "user"
    },
    webhook: {
        method: "POST",
        path: "/payments/webhook",
        summary: "Verify payment provider events and settle balances",
        auth: "public"
    }
};
