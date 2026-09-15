"""
Rehearse the self-provisioning schema in src/lib/engine-schema.ts.

That module runs its DDL against the live database on the first engine or
series request, so the statements have to be right and have to survive being
run again. This applies them to an in-memory SQLite database shaped like
production and checks the result.

    python apps/api/migrations/rehearse_bootstrap.py

It needs the SQL, which lives in TypeScript, so it reads the statements out of
the module by parsing its template literals. sqlite3 ships with Python; nothing
else is required.
"""
import io, os, re, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE = os.path.join(HERE, "..", "src", "lib", "engine-schema.ts")


def statements():
    """Every SQL string in the module, in the order it is written."""
    src = io.open(MODULE, encoding="utf-8").read()

    def block(name):
        start = src.index(f"const {name} = [")
        depth, i = 0, start
        while True:
            if src[i] == "[":
                depth += 1
            elif src[i] == "]":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        return src[start:i]

    creates = re.findall(r"`([^`]+)`", block("CREATE_STATEMENTS"))
    alters = re.findall(r"`([^`]+)`", block("ADD_COLUMN_STATEMENTS"))
    after = re.findall(r"`([^`]+)`", block("INDEX_AFTER_COLUMNS"))
    return creates, alters, after


def production_shape():
    """users and tournaments exist; nothing the engine needs does."""
    db = sqlite3.connect(":memory:")
    db.executescript("""
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE tournaments (
          id TEXT PRIMARY KEY, name TEXT, entry_fee_cents INTEGER,
          prize_pool_cents INTEGER DEFAULT 0, max_players INTEGER,
          status TEXT, bracket_type TEXT, team_size INTEGER, host_id TEXT,
          tournament_type TEXT, password TEXT, sport TEXT,
          max_matches_per_team INTEGER DEFAULT 2,
          created_at TEXT, updated_at TEXT
        );
    """)
    return db


def already_applied(err):
    return re.search(r"duplicate column name|already exists", str(err), re.I) is not None


def ensure(db, creates, alters, after):
    """What ensureEngineSchema() does, statement for statement."""
    for sql in creates:
        db.execute(sql)
    for sql in list(alters) + list(after):
        try:
            db.execute(sql)
        except sqlite3.Error as e:
            if not already_applied(e):
                raise


failures = []


def check(label, ok):
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        failures.append(label)


creates, alters, after = statements()
print(f"read {len(creates)} creates, {len(alters)} alters, {len(after)} trailing indexes")

print("1. a database with no engine tables")
db = production_shape()
try:
    ensure(db, creates, alters, after)
    check("bootstrap runs without error", True)
except sqlite3.Error as e:
    check(f"bootstrap runs without error (got: {e})", False)

tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for t in ("engine_teams", "engine_matches", "engine_matchups", "series", "series_members"):
    check(f"{t} exists", t in tables)

cols = lambda t: [r[1] for r in db.execute(f"PRAGMA table_info({t})")]
check("engine_matches has fouls_a", "fouls_a" in cols("engine_matches"))
check("engine_teams has user_id", "user_id" in cols("engine_teams"))
check("tournaments has series_id", "series_id" in cols("tournaments"))
check("tournaments has series_week", "series_week" in cols("tournaments"))

print("2. running it again is harmless")
try:
    ensure(db, creates, alters, after)
    check("second run does not raise", True)
except sqlite3.Error as e:
    check(f"second run does not raise (got: {e})", False)

print("3. the writes that were failing now succeed")
try:
    db.execute("INSERT INTO users (id, name) VALUES ('u1','Shree')")
    db.execute(
        "INSERT INTO tournaments (id, name, host_id, status, max_matches_per_team, created_at, updated_at)"
        " VALUES ('t1','wta-T1','u1','open',2,'now','now')"
    )
    db.execute(
        "INSERT INTO engine_teams (id, tournament_id, name, user_id, created_at)"
        " VALUES ('et1','t1','Shree','u1','now')"
    )
    db.execute(
        "INSERT INTO engine_matches (id, tournament_id, phase, team_a_id, team_b_id, status,"
        " sudden_death, duration, explanation, match_order, created_at)"
        " VALUES ('em1','t1','GROUP','et1','et1','CREATED',0,600,'',0,'now')"
    )
    db.execute("UPDATE engine_matches SET fouls_a = 1 WHERE id = 'em1'")
    check("start-tournament writes succeed", True)
except sqlite3.Error as e:
    check(f"start-tournament writes succeed (got: {e})", False)

print("4. an older database that already has some of it")
old = production_shape()
old.executescript("""
    CREATE TABLE engine_teams (
      id TEXT PRIMARY KEY, tournament_id TEXT, name TEXT,
      matches_played INTEGER, group_points INTEGER, total_score INTEGER,
      bye_assigned INTEGER, created_at TEXT
    );
""")
try:
    ensure(old, creates, alters, after)
    check("bootstrap adapts to a partial database", True)
except sqlite3.Error as e:
    check(f"bootstrap adapts to a partial database (got: {e})", False)
check("user_id added to the existing engine_teams", "user_id" in [r[1] for r in old.execute("PRAGMA table_info(engine_teams)")])

print()
if failures:
    print(f"{len(failures)} FAILED:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("all bootstrap rehearsals passed")
