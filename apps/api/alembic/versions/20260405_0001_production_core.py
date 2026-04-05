from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260405_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("email", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "tournaments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("entry_fee_cents", sa.Integer(), nullable=False),
        sa.Column("prize_pool_cents", sa.Integer(), nullable=False),
        sa.Column("max_players", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("bracket_type", sa.String(length=40), nullable=False),
        sa.Column("bracket_state", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "wallets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("balance_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"], unique=False)

    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("provider_order_id", sa.String(length=120), nullable=True),
        sa.Column("provider_event_id", sa.String(length=120), nullable=True),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("provider_event_id"),
        sa.UniqueConstraint("provider_order_id"),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("token", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_sessions_kind", "sessions", ["kind"], unique=False)
    op.create_index("ix_sessions_token", "sessions", ["token"], unique=False)
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)

    op.create_table(
        "participants",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tournament_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tournament_id", "user_id", name="uq_participants_tournament_user"),
    )
    op.create_index("ix_participants_tournament_id", "participants", ["tournament_id"], unique=False)
    op.create_index("ix_participants_user_id", "participants", ["user_id"], unique=False)

    op.create_table(
        "matches",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("tournament_id", sa.String(length=64), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("match_order", sa.Integer(), nullable=False),
        sa.Column("player1_id", sa.String(length=64), nullable=True),
        sa.Column("player2_id", sa.String(length=64), nullable=True),
        sa.Column("winner_id", sa.String(length=64), nullable=True),
        sa.Column("room_code", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("result_meta", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["player1_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["player2_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("room_code"),
    )
    op.create_index("ix_matches_tournament_id", "matches", ["tournament_id"], unique=False)

    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("wallet_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("payment_id", sa.String(length=64), nullable=True),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("balance_after_cents", sa.Integer(), nullable=False),
        sa.Column("reference_type", sa.String(length=40), nullable=False),
        sa.Column("reference_id", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wallet_transactions_user_id", "wallet_transactions", ["user_id"], unique=False)
    op.create_index("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_wallet_transactions_wallet_id", table_name="wallet_transactions")
    op.drop_index("ix_wallet_transactions_user_id", table_name="wallet_transactions")
    op.drop_table("wallet_transactions")

    op.drop_index("ix_matches_tournament_id", table_name="matches")
    op.drop_table("matches")

    op.drop_index("ix_participants_user_id", table_name="participants")
    op.drop_index("ix_participants_tournament_id", table_name="participants")
    op.drop_table("participants")

    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_index("ix_sessions_token", table_name="sessions")
    op.drop_index("ix_sessions_kind", table_name="sessions")
    op.drop_table("sessions")

    op.drop_index("ix_payments_user_id", table_name="payments")
    op.drop_table("payments")

    op.drop_index("ix_wallets_user_id", table_name="wallets")
    op.drop_table("wallets")

    op.drop_table("tournaments")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
