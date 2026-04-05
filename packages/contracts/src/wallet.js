export const walletContracts = {
    getWallet: {
        method: "GET",
        path: "/wallet",
        summary: "Return wallet balance and transaction history",
        auth: "user"
    },
    deduct: {
        method: "POST",
        path: "/wallet/deduct",
        summary: "Deduct funds for an authorized operation",
        auth: "user"
    }
};
