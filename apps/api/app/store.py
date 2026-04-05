from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_hex
from typing import Iterator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_id(prefix: str) -> str:
    return f"{prefix}_{token_hex(8)}"


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


@dataclass
class SessionRecord:
    token: str
    user_id: str
    expires_at: datetime


@dataclass
class UserRecord:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    wallet_balance_cents: int
    created_at: datetime


@dataclass
class WalletEntryRecord:
    id: str
    user_id: str
    type: str
    amount_cents: int
    created_at: datetime
    reference_type: str
    reference_id: str


@dataclass
class TournamentRecord:
    id: str
    name: str
    entry_fee_cents: int
    prize_pool_cents: int
    max_players: int
    status: str
    bracket_type: str
    bracket_state: dict | None = None
    participants: list[str] = field(default_factory=list)


ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)
DEFAULT_DB_PATH = Path(
    os.getenv("WTA_SQLITE_PATH")
    or (Path(os.getenv("LOCALAPPDATA") or Path.home()) / "WTA" / "wta.sqlite3")
)


class SQLiteStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path or DEFAULT_DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, isolation_level=None, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = DELETE")
        return connection

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    wallet_balance_cents INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS wallet_entries (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    amount_cents INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    reference_type TEXT NOT NULL,
                    reference_id TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS tournaments (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    entry_fee_cents INTEGER NOT NULL,
                    prize_pool_cents INTEGER NOT NULL,
                    max_players INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    bracket_type TEXT NOT NULL,
                    bracket_state TEXT
                );

                CREATE TABLE IF NOT EXISTS participants (
                    tournament_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    joined_at TEXT NOT NULL,
                    PRIMARY KEY (tournament_id, user_id),
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_kind_token ON sessions(kind, token);
                CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_participants_tournament ON participants(tournament_id, joined_at ASC);
                """
            )

            tournament_count = connection.execute(
                "SELECT COUNT(*) AS count FROM tournaments"
            ).fetchone()["count"]
            if tournament_count == 0:
                self._seed_tournaments(connection)

    def _seed_tournaments(self, connection: sqlite3.Connection) -> None:
        friday_id = create_id("tournament")
        sunday_id = create_id("tournament")

        connection.executemany(
            """
            INSERT INTO tournaments (
                id, name, entry_fee_cents, prize_pool_cents, max_players, status, bracket_type, bracket_state
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    friday_id,
                    "Friday Knockout",
                    1000,
                    8000,
                    8,
                    "open",
                    "single_elimination",
                    json.dumps(
                        {
                            "rounds": [
                                {"name": "Quarterfinals", "matches": 4},
                                {"name": "Semifinals", "matches": 2},
                                {"name": "Final", "matches": 1},
                            ]
                        }
                    ),
                ),
                (
                    sunday_id,
                    "Sunday Finals Qualifier",
                    0,
                    2500,
                    16,
                    "open",
                    "single_elimination",
                    json.dumps(
                        {
                            "rounds": [
                                {"name": "Round of 16", "matches": 8},
                                {"name": "Quarterfinals", "matches": 4},
                                {"name": "Semifinals", "matches": 2},
                                {"name": "Final", "matches": 1},
                            ]
                        }
                    ),
                ),
            ],
        )

    def _row_to_user(self, row: sqlite3.Row | None) -> UserRecord | None:
        if row is None:
            return None
        return UserRecord(
            id=row["id"],
            name=row["name"],
            email=row["email"],
            password_hash=row["password_hash"],
            role=row["role"],
            wallet_balance_cents=row["wallet_balance_cents"],
            created_at=from_iso(row["created_at"]),
        )

    def _row_to_wallet_entry(self, row: sqlite3.Row) -> WalletEntryRecord:
        return WalletEntryRecord(
            id=row["id"],
            user_id=row["user_id"],
            type=row["type"],
            amount_cents=row["amount_cents"],
            created_at=from_iso(row["created_at"]),
            reference_type=row["reference_type"],
            reference_id=row["reference_id"],
        )

    def _row_to_tournament(
        self, row: sqlite3.Row | None, connection: sqlite3.Connection
    ) -> TournamentRecord | None:
        if row is None:
            return None

        participants = [
            participant["user_id"]
            for participant in connection.execute(
                "SELECT user_id FROM participants WHERE tournament_id = ? ORDER BY joined_at ASC",
                (row["id"],),
            ).fetchall()
        ]

        return TournamentRecord(
            id=row["id"],
            name=row["name"],
            entry_fee_cents=row["entry_fee_cents"],
            prize_pool_cents=row["prize_pool_cents"],
            max_players=row["max_players"],
            status=row["status"],
            bracket_type=row["bracket_type"],
            bracket_state=json.loads(row["bracket_state"]) if row["bracket_state"] else None,
            participants=participants,
        )

    def get_user_by_email(self, email: str) -> UserRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE email = ?",
                (email,),
            ).fetchone()
            return self._row_to_user(row)

    def get_user_by_id(self, user_id: str) -> UserRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            return self._row_to_user(row)

    def list_users(self) -> list[UserRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM users ORDER BY LOWER(name) ASC"
            ).fetchall()
            return [self._row_to_user(row) for row in rows if row is not None]

    def create_user_with_bonus(
        self, *, name: str, email: str, password_hash: str, bonus_cents: int
    ) -> UserRecord:
        user = UserRecord(
            id=create_id("user"),
            name=name,
            email=email,
            password_hash=password_hash,
            role="player",
            wallet_balance_cents=bonus_cents,
            created_at=utcnow(),
        )
        bonus_entry = WalletEntryRecord(
            id=create_id("wallet"),
            user_id=user.id,
            type="manual_adjustment",
            amount_cents=bonus_cents,
            created_at=utcnow(),
            reference_type="signup_bonus",
            reference_id=user.id,
        )

        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO users (id, name, email, password_hash, role, wallet_balance_cents, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user.id,
                    user.name,
                    user.email,
                    user.password_hash,
                    user.role,
                    user.wallet_balance_cents,
                    to_iso(user.created_at),
                ),
            )
            connection.execute(
                """
                INSERT INTO wallet_entries (
                    id, user_id, type, amount_cents, created_at, reference_type, reference_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    bonus_entry.id,
                    bonus_entry.user_id,
                    bonus_entry.type,
                    bonus_entry.amount_cents,
                    to_iso(bonus_entry.created_at),
                    bonus_entry.reference_type,
                    bonus_entry.reference_id,
                ),
            )

        return user

    def list_wallet_entries(self, user_id: str) -> list[WalletEntryRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM wallet_entries
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()
            return [self._row_to_wallet_entry(row) for row in rows]

    def create_session(self, *, token: str, user_id: str, kind: str, expires_at: datetime) -> None:
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO sessions (token, user_id, kind, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (token, user_id, kind, to_iso(expires_at)),
            )

    def get_session(self, token: str, kind: str) -> SessionRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT token, user_id, expires_at FROM sessions WHERE token = ? AND kind = ?",
                (token, kind),
            ).fetchone()
            if row is None:
                return None
            return SessionRecord(
                token=row["token"],
                user_id=row["user_id"],
                expires_at=from_iso(row["expires_at"]),
            )

    def delete_session(self, token: str, kind: str) -> None:
        with self.transaction() as connection:
            connection.execute(
                "DELETE FROM sessions WHERE token = ? AND kind = ?",
                (token, kind),
            )

    def list_tournaments(self) -> list[TournamentRecord]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM tournaments ORDER BY name ASC").fetchall()
            return [self._row_to_tournament(row, connection) for row in rows if row is not None]

    def get_tournament(self, tournament_id: str) -> TournamentRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM tournaments WHERE id = ?",
                (tournament_id,),
            ).fetchone()
            return self._row_to_tournament(row, connection)

    def deduct_wallet(
        self, *, user_id: str, amount_cents: int, reference_type: str, reference_id: str
    ) -> UserRecord:
        with self.transaction() as connection:
            user_row = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            user = self._row_to_user(user_row)
            if user is None:
                raise ValueError("User not found")
            if user.wallet_balance_cents < amount_cents:
                raise ValueError("Insufficient wallet balance")

            new_balance = user.wallet_balance_cents - amount_cents
            connection.execute(
                "UPDATE users SET wallet_balance_cents = ? WHERE id = ?",
                (new_balance, user_id),
            )
            connection.execute(
                """
                INSERT INTO wallet_entries (
                    id, user_id, type, amount_cents, created_at, reference_type, reference_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    create_id("wallet"),
                    user_id,
                    "entry_fee_debit",
                    amount_cents,
                    to_iso(utcnow()),
                    reference_type,
                    reference_id,
                ),
            )

        refreshed_user = self.get_user_by_id(user_id)
        if refreshed_user is None:
            raise RuntimeError("Updated user could not be reloaded")
        return refreshed_user

    def join_tournament(self, *, user_id: str, tournament_id: str) -> tuple[UserRecord, TournamentRecord]:
        with self.transaction() as connection:
            user_row = connection.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            tournament_row = connection.execute(
                "SELECT * FROM tournaments WHERE id = ?",
                (tournament_id,),
            ).fetchone()

            user = self._row_to_user(user_row)
            tournament = self._row_to_tournament(tournament_row, connection)

            if user is None:
                raise ValueError("User not found")
            if tournament is None:
                raise LookupError("Tournament not found")
            if user.id in tournament.participants:
                raise RuntimeError("User already joined this tournament")
            if tournament.status != "open":
                raise RuntimeError("Tournament is not open for new entries")
            if len(tournament.participants) >= tournament.max_players:
                connection.execute(
                    "UPDATE tournaments SET status = ? WHERE id = ?",
                    ("full", tournament.id),
                )
                raise RuntimeError("Tournament is already full")

            if tournament.entry_fee_cents > 0:
                if user.wallet_balance_cents < tournament.entry_fee_cents:
                    raise ArithmeticError("Insufficient wallet balance for tournament entry")
                new_balance = user.wallet_balance_cents - tournament.entry_fee_cents
                connection.execute(
                    "UPDATE users SET wallet_balance_cents = ? WHERE id = ?",
                    (new_balance, user.id),
                )
                connection.execute(
                    """
                    INSERT INTO wallet_entries (
                        id, user_id, type, amount_cents, created_at, reference_type, reference_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        create_id("wallet"),
                        user.id,
                        "entry_fee_debit",
                        tournament.entry_fee_cents,
                        to_iso(utcnow()),
                        "tournament_entry",
                        tournament.id,
                    ),
                )

            connection.execute(
                """
                INSERT INTO participants (tournament_id, user_id, joined_at)
                VALUES (?, ?, ?)
                """,
                (tournament.id, user.id, to_iso(utcnow())),
            )

            participant_count = connection.execute(
                "SELECT COUNT(*) AS count FROM participants WHERE tournament_id = ?",
                (tournament.id,),
            ).fetchone()["count"]
            if participant_count >= tournament.max_players:
                connection.execute(
                    "UPDATE tournaments SET status = ? WHERE id = ?",
                    ("full", tournament.id),
                )

        refreshed_user = self.get_user_by_id(user_id)
        refreshed_tournament = self.get_tournament(tournament_id)
        if refreshed_user is None or refreshed_tournament is None:
            raise RuntimeError("Join completed but refreshed records were unavailable")
        return refreshed_user, refreshed_tournament

    def list_tournament_users(self, tournament_id: str) -> list[UserRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT users.*
                FROM participants
                JOIN users ON users.id = participants.user_id
                WHERE participants.tournament_id = ?
                ORDER BY participants.joined_at ASC
                """,
                (tournament_id,),
            ).fetchall()
            return [self._row_to_user(row) for row in rows if row is not None]
