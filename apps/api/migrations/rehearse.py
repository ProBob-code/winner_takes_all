"""
Rehearse the migrations against a stand-in for the live database.

The live database has users/tournaments and no engine tables at all, which is
the exact case that made starting a tournament fail. Applying the files here
first proves they run in that state, and that re-running them is safe.

Run it before applying anything to the real database:

    python apps/api/migrations/rehearse.py

It needs nothing installed: sqlite3 ships with Python.
"""
import io, os, sqlite3, sys

# The migrations live next to this file.
mig = os.path.dirname(os.path.abspath(__file__))


def read(name):
    return io.open(os.path.join(mig, name), encoding="utf-8").read()


def fresh_live_db():
    """A database shaped like production: core tables, no engine tables."""
    db = sqlite3.connect(":memory:")
    db.executescript("""
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tournaments (
          id TEXT PRIMARY KEY, name TEXT, entry_fee_cents INTEGER,
          prize_pool_cents INTEGER DEFAULT 0, max_players INTEGER,
          status TEXT, bracket_type TEXT, team_size INTEGER,
          host_id TEXT, tournament_type TEXT, password TEXT, sport TEXT,
          max_matches_per_team INTEGER DEFAULT 2,
          created_at TEXT, updated_at TEXT
        );
        CREATE TABLE participants (id TEXT PRIMARY KEY, tournament_id TEXT, user_id TEXT);
        CREATE TABLE matches (id TEXT PRIMARY KEY, tournament_id TEXT);
    """)
    return db


def columns(db, table):
    return [r[1] for r in db.execute(f"PRAGMA table_info({table})")]


def tables(db):
    return {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}


failures = []


def check(label, condition):
    print(("  PASS  " if condition else "  FAIL  ") + label)
    if not condition:
        failures.append(label)


print("1. production shape: no engine tables, then 0006 + 0007")
db = fresh_live_db()
db.executescript(read("0006_engine_tables.sql"))
db.executescript(read("0007_series.sql"))

t = tables(db)
check("engine_teams created", "engine_teams" in t)
check("engine_matches created", "engine_matches" in t)
check("engine_matchups created", "engine_matchups" in t)
check("series created", "series" in t)
check("series_members created", "series_members" in t)
check("engine_matches has fouls_a", "fouls_a" in columns(db, "engine_matches"))
check("engine_matches has fouls_b", "fouls_b" in columns(db, "engine_matches"))
check("engine_teams has user_id", "user_id" in columns(db, "engine_teams"))
check("tournaments has series_id", "series_id" in columns(db, "tournaments"))
check("tournaments has series_week", "series_week" in columns(db, "tournaments"))

print("2. 0006 is safe to run again")
try:
    db.executescript(read("0006_engine_tables.sql"))
    check("re-running 0006 does not raise", True)
except sqlite3.Error as e:
    check(f"re-running 0006 does not raise (got: {e})", False)

print("3. the rows the app writes actually insert")
try:
    db.execute("INSERT INTO users (id, name) VALUES ('u1', 'Shree')")
    db.execute(
        "INSERT INTO tournaments (id, name, host_id, status, max_matches_per_team, created_at, updated_at)"
        " VALUES ('t1', 'wta-T1', 'u1', 'open', 2, 'now', 'now')"
    )
    # What POST /engine/tournaments/:id/start does, the step that was failing.
    db.execute(
        "INSERT INTO engine_teams (id, tournament_id, name, user_id, created_at)"
        " VALUES ('et1', 't1', 'Shree', 'u1', 'now')"
    )
    db.execute(
        "INSERT INTO engine_matches (id, tournament_id, phase, team_a_id, team_b_id,"
        " status, sudden_death, duration, explanation, match_order, created_at)"
        " VALUES ('em1', 't1', 'GROUP', 'et1', 'et1', 'CREATED', 0, 600, '', 0, 'now')"
    )
    db.execute("UPDATE engine_matches SET fouls_a = 1, fouls_b = 0 WHERE id = 'em1'")
    # What POST /series/create and opening a week do.
    db.execute(
        "INSERT INTO series (id, name, host_id, sport, bracket_type, tournament_type,"
        " entry_fee_cents, max_players, team_size, roster_mode, cadence_days,"
        " next_event_at, weeks_created, status, password, created_at, updated_at)"
        " VALUES ('s1','League','u1','8BALL','single_elimination','online',"
        " 10000,8,1,'open',7,'2026-09-16T20:00:00Z',0,'active',NULL,'now','now')"
    )
    db.execute("INSERT INTO series_members (id, series_id, user_id, joined_at) VALUES ('sm1','s1','u1','now')")
    db.execute("UPDATE tournaments SET series_id = 's1', series_week = 1 WHERE id = 't1'")
    check("every insert the app makes succeeds", True)
except sqlite3.Error as e:
    check(f"every insert the app makes succeeds (got: {e})", False)

print("4. the season-standings query runs")
try:
    rows = list(db.execute(
        "SELECT et.tournament_id, t.series_week, et.user_id, et.name,"
        " et.matches_played, et.group_points, et.total_score"
        " FROM engine_teams et JOIN tournaments t ON t.id = et.tournament_id"
        " WHERE t.series_id = ?", ("s1",)
    ))
    check("season standings query returns the competitor", len(rows) == 1)
except sqlite3.Error as e:
    check(f"season standings query runs (got: {e})", False)

print("5. an older database that already had engine_matches needs 0008")
old = fresh_live_db()
old.executescript("""
    -- engine_matches as schema.sql defined it before the foul counters:
    -- everything the old indexes reference, but no fouls_a/fouls_b.
    CREATE TABLE engine_matches (
      id TEXT PRIMARY KEY, tournament_id TEXT, phase TEXT, team_a_id TEXT,
      team_b_id TEXT, status TEXT, sudden_death INTEGER, active_team_id TEXT,
      balls_potted_a INTEGER, balls_potted_b INTEGER,
      black_potted_a INTEGER, black_potted_b INTEGER,
      start_time INTEGER, duration INTEGER,
      score_team_a INTEGER, score_team_b INTEGER,
      winner_id TEXT, ended_by TEXT, explanation TEXT,
      match_order INTEGER, created_at TEXT
    );
""")
old.executescript(read("0006_engine_tables.sql"))
check("0006 leaves an existing engine_matches alone", "fouls_a" not in columns(old, "engine_matches"))
old.executescript(read("0008_engine_foul_columns.sql"))
check("0008 adds fouls_a", "fouls_a" in columns(old, "engine_matches"))
check("0008 adds fouls_b", "fouls_b" in columns(old, "engine_matches"))

print()
if failures:
    print(f"{len(failures)} FAILED:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("all migration rehearsals passed")
