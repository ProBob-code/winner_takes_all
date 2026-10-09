-- Phase 0 wind-down: clear the test balances from the staked model.
-- Funded in Razorpay test mode; no real money was taken, nothing to refund.

INSERT INTO
    wallet_transactions (
        id,
        wallet_id,
        user_id,
        type,
        amount_cents,
        balance_after_cents,
        reference_type,
        reference_id,
        is_test,
        description,
        created_at
    )
SELECT 'wallettxn_winddown_' || w.id, w.id, w.user_id, 'manual_adjustment', w.balance_cents, 0, 'wind_down', 'phase0_stakes_withdrawn', 1, 'Test balance cleared. Stakes withdrawn under the Online Gaming Act 2025.', datetime('now')
FROM wallets w
WHERE
    w.balance_cents > 0;

UPDATE wallets
SET
    balance_cents = 0,
    bonus_cents = 0,
    updated_at = datetime('now')
WHERE
    balance_cents > 0
    OR bonus_cents > 0;