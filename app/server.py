"""Glücksrad v2 für Schulklassen – Webserver ohne externe Abhängigkeiten.

Persistenz: SQLite-Datenbank (Standard-SQL) unter DATA_DIR/gluecksrad.db.
Ein vorhandenes data.json aus v1 wird beim ersten Start automatisch übernommen.
"""
import base64
import hashlib
import hmac
import json
import os
import random
import re
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
DB_FILE = DATA_DIR / "gluecksrad.db"
STATIC_DIR = Path(__file__).parent / "static"
PORT = int(os.environ.get("PORT", "8080"))

REMOVE_AT = 70   # >= 70 %  -> ein Eintrag wird aus dem Rad entfernt
KEEP_AT = 50     # 50–69 %  -> bleibt; < 50 % -> zusätzlicher Eintrag an zufälliger Position

LOCK = threading.Lock()
RNG = random.SystemRandom()

SCHEMA = """
CREATE TABLE IF NOT EXISTS classes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
    id          TEXT PRIMARY KEY,
    class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pool_entries (
    class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (class_id, position)
);
CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    ts          INTEGER NOT NULL,
    type        TEXT NOT NULL,
    student_id  TEXT,
    name        TEXT,
    score       INTEGER,
    outcome     TEXT
);
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pw_hash     TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'teacher',
    created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
    id          TEXT PRIMARY KEY,
    class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subject_pool (
    subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (subject_id, position)
);
CREATE INDEX IF NOT EXISTS idx_subjects_class ON subjects(class_id);
CREATE TABLE IF NOT EXISTS class_members (
    class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at    INTEGER NOT NULL,
    PRIMARY KEY (class_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON class_members(user_id);
CREATE TABLE IF NOT EXISTS user_sounds (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    PRIMARY KEY (user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_history_class ON history(class_id, id);
"""


def connect():
    con = sqlite3.connect(DB_FILE)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def check_writable():
    """Prüft echte Schreibrechte (auch SELinux) und gibt statt eines Tracebacks eine klare Anleitung aus."""
    problems = []
    probe = DATA_DIR / ".schreibtest"
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        probe.write_text("ok")
        probe.unlink()
    except OSError as e:
        problems.append(f"Ordner {DATA_DIR}: {e.strerror}")
    for f in (DB_FILE, DB_FILE.with_name(DB_FILE.name + "-wal"), DB_FILE.with_name(DB_FILE.name + "-shm")):
        if f.exists():
            try:
                with open(f, "r+b"):
                    pass
            except OSError as e:
                problems.append(f"Datei {f}: {e.strerror}")
    if problems:
        print("=" * 70, flush=True)
        print("FEHLER: Der Container darf die Datenbank nicht beschreiben.", flush=True)
        for p in problems:
            print("  - " + p, flush=True)
        print(f"Container-Benutzer: uid={os.getuid()} gid={os.getgid()}", flush=True)
        print("Lösungen am Host (im Ordner mit docker-compose.yml):", flush=True)
        print(f"  1) sudo chown -R {os.getuid()}:{os.getgid()} data", flush=True)
        print("  2) Bei SELinux (Fedora/RHEL): in docker-compose.yml  ./data:/data:Z  verwenden", flush=True)
        print("     oder einmalig:  sudo chcon -R -t container_file_t data", flush=True)
        print("  danach: docker compose up -d --build", flush=True)
        print("=" * 70, flush=True)
        time.sleep(30)   # verhindert eine schnelle Neustart-Schleife
        raise SystemExit(1)


def init_db():
    check_writable()
    con = connect()
    try:
        with con:
            con.executescript(SCHEMA)
            cols = [r[1] for r in con.execute("PRAGMA table_info(classes)")]
            if "owner_id" not in cols:
                con.execute("ALTER TABLE classes ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL")
            ucols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
            if "settings" not in ucols:
                con.execute("ALTER TABLE users ADD COLUMN settings TEXT")
            hcols = [r[1] for r in con.execute("PRAGMA table_info(history)")]
            if "subject_id" not in hcols:
                con.execute("ALTER TABLE history ADD COLUMN subject_id TEXT")
            migrate_v1(con)
            migrate_subjects(con)
            con.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
            # optional: Admin per Umgebungsvariablen anlegen
            au, ap = os.environ.get("ADMIN_USER"), os.environ.get("ADMIN_PASSWORD")
            if au and ap and not con.execute("SELECT 1 FROM users").fetchone():
                create_user(con, au, ap, "admin")
                print(f"Admin '{au}' aus Umgebungsvariablen angelegt", flush=True)
    finally:
        con.close()


def migrate_v1(con):
    legacy = DATA_DIR / "data.json"
    if not legacy.exists() or con.execute("SELECT COUNT(*) FROM classes").fetchone()[0]:
        return
    data = json.loads(legacy.read_text(encoding="utf-8"))
    for c in data.get("classes", []):
        con.execute("INSERT INTO classes (id, name, created_at) VALUES (?,?,?)", (c["id"], c["name"], int(time.time())))
        for i, s in enumerate(c.get("students", [])):
            con.execute("INSERT INTO students VALUES (?,?,?,?)", (s["id"], c["id"], s["name"], i))
        con.executemany("INSERT INTO pool_entries VALUES (?,?,?)",
                        [(c["id"], i, sid) for i, sid in enumerate(c.get("pool", []))])
        for h in reversed(c.get("history", [])):
            con.execute(
                "INSERT INTO history (class_id, ts, type, student_id, name, score, outcome) VALUES (?,?,?,?,?,?,?)",
                (c["id"], h.get("ts", 0), h.get("type", "rate"), h.get("studentId"), h.get("name"),
                 h.get("score"), h.get("outcome")))
    legacy.rename(legacy.with_suffix(".json.migrated"))
    print("data.json aus v1 in die Datenbank übernommen", flush=True)


def migrate_subjects(con):
    """Ab v2.2 gehört das Rad zu einem Fach. Klassen ohne Fach bekommen das Fach „Allgemein“."""
    for (cid,) in con.execute("SELECT id FROM classes WHERE id NOT IN (SELECT class_id FROM subjects)").fetchall():
        subj = new_id()
        con.execute("INSERT INTO subjects VALUES (?,?,?,?,?)", (subj, cid, "Allgemein", 0, int(time.time())))
        old = [r[0] for r in con.execute(
            "SELECT student_id FROM pool_entries WHERE class_id=? ORDER BY position", (cid,))]
        write_pool(con, subj, old)
        con.execute("UPDATE history SET subject_id=? WHERE class_id=? AND subject_id IS NULL", (subj, cid))
        con.execute("DELETE FROM pool_entries WHERE class_id=?", (cid,))


# ---------------------------------------------------------------- Helpers ---
def new_id():
    return secrets.token_hex(5)


def clean_name(n):
    return re.sub(r"\s+", " ", str(n or "")).strip()[:80]


def read_pool(con, subj):
    return [r[0] for r in con.execute(
        "SELECT student_id FROM subject_pool WHERE subject_id=? ORDER BY position", (subj,))]


def write_pool(con, subj, pool):
    con.execute("DELETE FROM subject_pool WHERE subject_id=?", (subj,))
    con.executemany("INSERT INTO subject_pool VALUES (?,?,?)",
                    [(subj, i, sid) for i, sid in enumerate(pool)])


def create_subject(con, cid, name):
    subj = new_id()
    sort = con.execute("SELECT COALESCE(MAX(sort),-1)+1 FROM subjects WHERE class_id=?", (cid,)).fetchone()[0]
    con.execute("INSERT INTO subjects VALUES (?,?,?,?,?)", (subj, cid, name, sort, int(time.time())))
    pool = [r[0] for r in con.execute("SELECT id FROM students WHERE class_id=?", (cid,))]
    RNG.shuffle(pool)
    write_pool(con, subj, pool)
    return subj


def insert_random(pool, sid):
    """Fügt sid an einer zufälligen Position ein – möglichst nicht direkt neben sich selbst."""
    n = len(pool)
    spots = list(range(n + 1))
    if n >= 3:
        good = [p for p in spots
                if pool[p - 1 if p > 0 else n - 1] != sid and pool[p % n] != sid]
        spots = good or spots
    pool.insert(RNG.choice(spots), sid)


def class_obj(con, cid, subj=None):
    c = con.execute("SELECT * FROM classes WHERE id=?", (cid,)).fetchone()
    if not c:
        raise ApiError(404, "Klasse nicht gefunden")
    students = [{"id": r["id"], "name": r["name"]} for r in con.execute(
        "SELECT id, name FROM students WHERE class_id=? ORDER BY sort, name", (cid,))]
    subjects = [{"id": r["id"], "name": r["name"], "pool": r["pool"]} for r in con.execute("""
        SELECT s.id, s.name, (SELECT COUNT(*) FROM subject_pool p WHERE p.subject_id=s.id) AS pool
        FROM subjects s WHERE s.class_id=? ORDER BY s.sort, s.name""", (cid,))]
    if not subjects:
        create_subject(con, cid, "Allgemein")
        return class_obj(con, cid)
    if subj not in {x["id"] for x in subjects}:
        subj = subjects[0]["id"]
    history = [{"ts": r["ts"], "type": r["type"], "studentId": r["student_id"], "name": r["name"],
                "score": r["score"], "outcome": r["outcome"]}
               for r in con.execute("SELECT * FROM history WHERE subject_id=? ORDER BY id DESC LIMIT 1000", (subj,))]
    return {"id": c["id"], "name": c["name"], "students": students, "subjects": subjects,
            "subject": subj, "pool": read_pool(con, subj), "history": history}


def get_student(con, cid, sid):
    r = con.execute("SELECT id, name FROM students WHERE id=? AND class_id=?", (sid, cid)).fetchone()
    if not r:
        raise ApiError(404, "Schüler/in nicht gefunden")
    return r


def outcome_for(score):
    if score >= REMOVE_AT:
        return "removed"
    if score >= KEEP_AT:
        return "kept"
    return "added"


class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


# ------------------------------------------------------------ Benutzer ---
SOUND_KINDS = ("tick", "win")
TICK_PRESETS = ("ratchet", "wood", "show", "soft", "custom")
WIN_PRESETS = ("fanfare", "ding", "applause", "none", "custom")
MAX_SOUND = 2 * 1024 * 1024


class RawResponse:
    def __init__(self, data, ctype):
        self.data, self.ctype = data, ctype

SESSION_DAYS = 14
PBKDF2_ITER = 240_000
FAILED = {}  # ip -> (anzahl, zeitpunkt) für einfache Bremse bei Fehlversuchen


def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), PBKDF2_ITER).hex()
    return f"pbkdf2_sha256${PBKDF2_ITER}${salt}${h}"


def check_pw(pw, stored):
    try:
        _, it, salt, h = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), int(it)).hex()
        return hmac.compare_digest(calc, h)
    except ValueError:
        return False


def valid_username(u):
    u = str(u or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._@-]{3,40}", u):
        raise ApiError(400, "Benutzername: 3–40 Zeichen (Buchstaben, Ziffern, . _ - @)")
    return u


def valid_password(p):
    p = str(p or "")
    if len(p) < 8:
        raise ApiError(400, "Passwort muss mindestens 8 Zeichen haben")
    return p


def create_user(con, username, password, role="teacher"):
    username, password = valid_username(username), valid_password(password)
    if role not in ("admin", "teacher"):
        raise ApiError(400, "Ungültige Rolle")
    if con.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        raise ApiError(400, "Benutzername ist bereits vergeben")
    uid = new_id()
    con.execute("INSERT INTO users (id, username, pw_hash, role, created_at) VALUES (?,?,?,?,?)",
                (uid, username, hash_pw(password), role, int(time.time())))
    # Klassen ohne Besitzer (z. B. aus v1) übernimmt der erste Benutzer
    con.execute("UPDATE classes SET owner_id=? WHERE owner_id IS NULL", (uid,))
    return uid


def user_public(r):
    return {"id": r["id"], "username": r["username"], "role": r["role"]}


def new_session(con, uid):
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO sessions VALUES (?,?,?)", (token, uid, int(time.time()) + SESSION_DAYS * 86400))
    return token


def session_user(con, token):
    if not token:
        return None
    return con.execute("""SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                          WHERE s.token=? AND s.expires_at>?""", (token, int(time.time()))).fetchone()


def throttle(ip):
    n, t = FAILED.get(ip, (0, 0))
    if n >= 5 and time.time() - t < 60:
        raise ApiError(429, "Zu viele Fehlversuche – bitte 1 Minute warten")


def auth_route(con, method, parts, body, ctx):
    user = ctx["user"]
    if parts == ["auth", "status"] and method == "GET":
        no_users = not con.execute("SELECT 1 FROM users").fetchone()
        return {"setup": no_users, "user": user_public(user) if user else None}

    if parts == ["auth", "setup"] and method == "POST":
        if con.execute("SELECT 1 FROM users").fetchone():
            raise ApiError(403, "Einrichtung bereits abgeschlossen")
        uid = create_user(con, body.get("username"), body.get("password"), "admin")
        ctx["set_cookie"] = new_session(con, uid)
        return {"user": user_public(con.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())}

    if parts == ["auth", "login"] and method == "POST":
        ip = ctx["ip"]
        throttle(ip)
        r = con.execute("SELECT * FROM users WHERE username=?", (str(body.get("username", "")).strip(),)).fetchone()
        if not r or not check_pw(str(body.get("password", "")), r["pw_hash"]):
            n, _ = FAILED.get(ip, (0, 0))
            FAILED[ip] = (n + 1, time.time())
            time.sleep(0.6)
            raise ApiError(401, "Benutzername oder Passwort falsch")
        FAILED.pop(ip, None)
        ctx["set_cookie"] = new_session(con, r["id"])
        return {"user": user_public(r)}

    if parts == ["auth", "logout"] and method == "POST":
        if ctx["token"]:
            con.execute("DELETE FROM sessions WHERE token=?", (ctx["token"],))
        ctx["set_cookie"] = ""
        return {"ok": True}

    if not user:
        raise ApiError(401, "Bitte anmelden")

    if parts == ["auth", "password"] and method == "POST":
        if not check_pw(str(body.get("old", "")), user["pw_hash"]):
            raise ApiError(400, "Aktuelles Passwort ist falsch")
        con.execute("UPDATE users SET pw_hash=? WHERE id=?", (hash_pw(valid_password(body.get("new"))), user["id"]))
        con.execute("DELETE FROM sessions WHERE user_id=? AND token<>?", (user["id"], ctx["token"]))
        return {"ok": True}

    if parts and parts[0] == "me":
        if parts == ["me", "settings"]:
            if method == "GET":
                st = json.loads(user["settings"] or "{}")
                kinds = {r[0] for r in con.execute("SELECT kind FROM user_sounds WHERE user_id=?", (user["id"],))}
                return {"settings": st, "sounds": {k: k in kinds for k in SOUND_KINDS}}
            if method == "PUT":
                st = {}
                if body.get("tick") in TICK_PRESETS: st["tick"] = body["tick"]
                if body.get("win") in WIN_PRESETS: st["win"] = body["win"]
                st["roll"] = bool(body.get("roll", True))
                try:
                    st["volume"] = max(0.0, min(1.0, float(body.get("volume", 0.6))))
                except (TypeError, ValueError):
                    st["volume"] = 0.6
                con.execute("UPDATE users SET settings=? WHERE id=?", (json.dumps(st), user["id"]))
                return {"settings": st}
        if len(parts) == 3 and parts[1] == "sounds" and parts[2] in SOUND_KINDS:
            kind = parts[2]
            if method == "GET":
                r = con.execute("SELECT mime, data FROM user_sounds WHERE user_id=? AND kind=?", (user["id"], kind)).fetchone()
                if not r:
                    raise ApiError(404, "Kein eigener Sound")
                return RawResponse(bytes(r["data"]), r["mime"])
            if method == "PUT":
                mime = str(body.get("mime") or "")
                if not mime.startswith("audio/"):
                    raise ApiError(400, "Bitte eine Audiodatei wählen (mp3, wav, ogg, m4a …)")
                try:
                    data = base64.b64decode(body.get("data") or "", validate=True)
                except (ValueError, TypeError):
                    raise ApiError(400, "Datei konnte nicht gelesen werden")
                if not data or len(data) > MAX_SOUND:
                    raise ApiError(400, "Datei zu groß (max. 2 MB)")
                con.execute("INSERT OR REPLACE INTO user_sounds VALUES (?,?,?,?)", (user["id"], kind, mime[:60], data))
                return {"ok": True}
            if method == "DELETE":
                con.execute("DELETE FROM user_sounds WHERE user_id=? AND kind=?", (user["id"], kind))
                return {"ok": True}
        raise ApiError(404, "Unbekannte Route")

    if parts and parts[0] == "users":
        if user["role"] != "admin":
            raise ApiError(403, "Nur für Administrator/innen")
        if parts == ["users"] and method == "GET":
            return [dict(user_public(r), created_at=r["created_at"],
                         classes=con.execute("SELECT COUNT(*) FROM classes WHERE owner_id=?", (r["id"],)).fetchone()[0],
                         shared=con.execute("SELECT COUNT(*) FROM class_members WHERE user_id=?", (r["id"],)).fetchone()[0])
                    for r in con.execute("SELECT * FROM users ORDER BY username COLLATE NOCASE")]
        if parts == ["users"] and method == "POST":
            create_user(con, body.get("username"), body.get("password"), body.get("role", "teacher"))
            return {"ok": True}
        if len(parts) == 2:
            r = con.execute("SELECT * FROM users WHERE id=?", (parts[1],)).fetchone()
            if not r:
                raise ApiError(404, "Benutzer nicht gefunden")
            admins = con.execute("SELECT COUNT(*) FROM users WHERE role='admin'").fetchone()[0]
            if method == "PUT":
                if body.get("password"):
                    con.execute("UPDATE users SET pw_hash=? WHERE id=?", (hash_pw(valid_password(body["password"])), r["id"]))
                    con.execute("DELETE FROM sessions WHERE user_id=?", (r["id"],))
                role = body.get("role")
                if role in ("admin", "teacher") and role != r["role"]:
                    if r["role"] == "admin" and admins <= 1:
                        raise ApiError(400, "Es muss mindestens eine/n Administrator/in geben")
                    con.execute("UPDATE users SET role=? WHERE id=?", (role, r["id"]))
                return {"ok": True}
            if method == "DELETE":
                if r["id"] == user["id"]:
                    raise ApiError(400, "Du kannst dich nicht selbst löschen")
                if r["role"] == "admin" and admins <= 1:
                    raise ApiError(400, "Es muss mindestens eine/n Administrator/in geben")
                # geteilte Klassen gehen an die erste Team-Lehrkraft über, der Rest wird gelöscht
                for (kid,) in con.execute("SELECT id FROM classes WHERE owner_id=?", (r["id"],)).fetchall():
                    heir = con.execute("""SELECT user_id FROM class_members WHERE class_id=? AND user_id<>?
                                          ORDER BY added_at LIMIT 1""", (kid, r["id"])).fetchone()
                    if heir:
                        con.execute("UPDATE classes SET owner_id=? WHERE id=?", (heir[0], kid))
                        con.execute("DELETE FROM class_members WHERE class_id=? AND user_id=?", (kid, heir[0]))
                    else:
                        con.execute("DELETE FROM classes WHERE id=?", (kid,))
                con.execute("DELETE FROM users WHERE id=?", (r["id"],))
                return {"ok": True}
    return None


# ------------------------------------------------------------------ Routes ---
def handle_api(method, parts, body, ctx):
    with LOCK:
        con = connect()
        try:
            with con:
                ctx["user"] = session_user(con, ctx["token"])
                res = auth_route(con, method, parts, body, ctx)
                if res is not None:
                    return res
                res = route(con, method, parts, body, ctx["user"])
                if isinstance(res, dict) and "subjects" in res and "students" in res:
                    res.update(sharing_info(con, res["id"], ctx["user"]["id"]))
                return res
        finally:
            con.close()


def can_access(con, cid, uid):
    return con.execute("""SELECT 1 FROM classes WHERE id=? AND (owner_id=?
                          OR id IN (SELECT class_id FROM class_members WHERE user_id=?))""", (cid, uid, uid)).fetchone()


def sharing_info(con, cid, uid):
    o = con.execute("SELECT u.id, u.username FROM classes c JOIN users u ON u.id=c.owner_id WHERE c.id=?", (cid,)).fetchone()
    members = [{"id": r["id"], "username": r["username"]} for r in con.execute("""
        SELECT u.id, u.username FROM class_members m JOIN users u ON u.id=m.user_id
        WHERE m.class_id=? ORDER BY u.username COLLATE NOCASE""", (cid,))]
    return {"owner": {"id": o["id"], "username": o["username"]} if o else None,
            "members": members, "isOwner": bool(o and o["id"] == uid)}


def route(con, method, parts, body, user):
    uid = user["id"]
    if parts == ["teachers"] and method == "GET":
        # nur Namen – zum Auswählen beim Teilen
        return [{"id": r["id"], "username": r["username"]} for r in con.execute(
            "SELECT id, username FROM users WHERE id<>? ORDER BY username COLLATE NOCASE", (uid,))]

    if parts == ["classes"]:
        if method == "GET":
            return [dict(r) for r in con.execute("""
                SELECT c.id, c.name,
                  (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id) AS students,
                  (SELECT COUNT(*) FROM subjects f WHERE f.class_id=c.id) AS subjects,
                  (SELECT COUNT(*) FROM class_members m WHERE m.class_id=c.id) AS members,
                  c.owner_id = ? AS mine,
                  (SELECT username FROM users u WHERE u.id=c.owner_id) AS owner
                FROM classes c
                WHERE c.owner_id=? OR c.id IN (SELECT class_id FROM class_members WHERE user_id=?)
                ORDER BY c.name COLLATE NOCASE""", (uid, uid, uid))]
        if method == "POST":
            name = clean_name(body.get("name"))
            if not name:
                raise ApiError(400, "Name fehlt")
            cid = new_id()
            con.execute("INSERT INTO classes (id, name, created_at, owner_id) VALUES (?,?,?,?)",
                        (cid, name, int(time.time()), uid))
            subj = create_subject(con, cid, clean_name(body.get("subject")) or "Allgemein")
            return class_obj(con, cid, subj)

    if len(parts) < 2 or parts[0] != "classes":
        raise ApiError(404, "Unbekannte Route")

    cid, rest = parts[1], parts[2:]
    if not can_access(con, cid, uid):
        raise ApiError(404, "Klasse nicht gefunden")
    is_owner = bool(con.execute("SELECT 1 FROM classes WHERE id=? AND owner_id=?", (cid, uid)).fetchone())

    # ---- Teilen (Teamteaching)
    if parts[2:] == ["members"] and method == "POST":
        if not is_owner:
            raise ApiError(403, "Nur die Besitzerin / der Besitzer der Klasse kann sie teilen")
        other = con.execute("SELECT id, username FROM users WHERE id=? OR username=?",
                            (body.get("userId"), str(body.get("username") or ""))).fetchone()
        if not other:
            raise ApiError(404, "Lehrkraft nicht gefunden")
        if other["id"] == uid:
            raise ApiError(400, "Du bist bereits Besitzer/in dieser Klasse")
        con.execute("INSERT OR IGNORE INTO class_members VALUES (?,?,?)", (cid, other["id"], int(time.time())))
        return class_obj(con, cid, body.get("subject"))
    if len(parts) == 4 and parts[2] == "members" and method == "DELETE":
        target = parts[3]
        if not is_owner and target != uid:
            raise ApiError(403, "Nur die Besitzerin / der Besitzer kann andere entfernen")
        con.execute("DELETE FROM class_members WHERE class_id=? AND user_id=?", (cid, target))
        if target == uid:
            return {"ok": True, "left": True}
        return class_obj(con, cid, body.get("subject"))
    if parts[2:] == ["owner"] and method == "PUT":
        if not is_owner:
            raise ApiError(403, "Nur die Besitzerin / der Besitzer kann die Klasse übergeben")
        new_owner = body.get("userId")
        if not con.execute("SELECT 1 FROM class_members WHERE class_id=? AND user_id=?", (cid, new_owner)).fetchone():
            raise ApiError(400, "Die Klasse kann nur an eine Team-Lehrkraft übergeben werden")
        con.execute("UPDATE classes SET owner_id=? WHERE id=?", (new_owner, cid))
        con.execute("DELETE FROM class_members WHERE class_id=? AND user_id=?", (cid, new_owner))
        con.execute("INSERT OR IGNORE INTO class_members VALUES (?,?,?)", (cid, uid, int(time.time())))
        return class_obj(con, cid, body.get("subject"))

    def valid_subject(x):
        return x if x and con.execute("SELECT 1 FROM subjects WHERE id=? AND class_id=?", (x, cid)).fetchone() else None

    subj = None
    if len(rest) >= 2 and rest[0] == "subjects":
        subj = valid_subject(rest[1])
        if not subj:
            raise ApiError(404, "Fach nicht gefunden")
        rest = ["subject"] + rest[2:]
    else:
        subj = valid_subject(body.get("subject"))

    def need_subject():
        if not subj:
            raise ApiError(400, "Kein Fach gewählt")
        return subj

    def all_subjects():
        return [r[0] for r in con.execute("SELECT id FROM subjects WHERE class_id=?", (cid,))]

    # ---- Klasse
    if not rest:
        if method == "GET":
            return class_obj(con, cid, subj)
        if method == "PUT":
            name = clean_name(body.get("name"))
            if name:
                con.execute("UPDATE classes SET name=? WHERE id=?", (name, cid))
            return class_obj(con, cid, subj)
        if method == "DELETE":
            if not is_owner:
                raise ApiError(403, "Nur die Besitzerin / der Besitzer kann die Klasse löschen – du kannst sie verlassen")
            con.execute("DELETE FROM classes WHERE id=?", (cid,))
            return {"ok": True}

    # ---- Fächer
    if rest == ["subjects"] and method == "POST":
        name = clean_name(body.get("name"))
        if not name:
            raise ApiError(400, "Name des Fachs fehlt")
        if con.execute("SELECT 1 FROM subjects WHERE class_id=? AND name=? COLLATE NOCASE", (cid, name)).fetchone():
            raise ApiError(400, "Dieses Fach gibt es in der Klasse schon")
        return class_obj(con, cid, create_subject(con, cid, name))

    if rest == ["subject"]:
        if method == "GET":
            return class_obj(con, cid, subj)
        if method == "PUT":
            name = clean_name(body.get("name"))
            if name:
                con.execute("UPDATE subjects SET name=? WHERE id=?", (name, subj))
            return class_obj(con, cid, subj)
        if method == "DELETE":
            if len(all_subjects()) <= 1:
                raise ApiError(400, "Eine Klasse braucht mindestens ein Fach")
            con.execute("DELETE FROM history WHERE subject_id=?", (subj,))
            con.execute("DELETE FROM subjects WHERE id=?", (subj,))
            return class_obj(con, cid)

    # ---- Schüler/innen (gelten für alle Fächer der Klasse)
    if rest == ["students"] and method == "POST":
        names = body.get("names") or []
        if isinstance(names, str):
            names = names.splitlines()
        existing = {r[0].lower() for r in con.execute("SELECT name FROM students WHERE class_id=?", (cid,))}
        sort = con.execute("SELECT COALESCE(MAX(sort),-1)+1 FROM students WHERE class_id=?", (cid,)).fetchone()[0]
        pools = {f: read_pool(con, f) for f in all_subjects()}
        for n in names:
            n = clean_name(n)
            if n and n.lower() not in existing:
                sid = new_id()
                con.execute("INSERT INTO students VALUES (?,?,?,?)", (sid, cid, n, sort))
                sort += 1
                existing.add(n.lower())
                for pool in pools.values():
                    insert_random(pool, sid)          # neue Namen an zufälliger Position – in jedem Fach
        for f, pool in pools.items():
            write_pool(con, f, pool)
        return class_obj(con, cid, subj)

    if len(rest) == 2 and rest[0] == "students":
        s = get_student(con, cid, rest[1])
        if method == "PUT":
            name = clean_name(body.get("name"))
            if name:
                con.execute("UPDATE students SET name=? WHERE id=?", (name, s["id"]))
            return class_obj(con, cid, subj)
        if method == "DELETE":
            for f in all_subjects():
                write_pool(con, f, [p for p in read_pool(con, f) if p != s["id"]])
            con.execute("DELETE FROM students WHERE id=?", (s["id"],))
            return class_obj(con, cid, subj)

    # ---- Glücksrad eines Fachs
    if rest == ["subject", "pool"] and method == "POST":
        need_subject()
        s = get_student(con, cid, body.get("studentId"))
        pool = read_pool(con, subj)
        delta = int(body.get("delta", 0))
        if delta > 0:
            insert_random(pool, s["id"])
        elif delta < 0 and s["id"] in pool:
            idxs = [i for i, p in enumerate(pool) if p == s["id"]]
            pool.pop(RNG.choice(idxs))
        write_pool(con, subj, pool)
        return class_obj(con, cid, subj)

    if rest == ["subject", "shuffle"] and method == "POST":
        pool = read_pool(con, need_subject())
        RNG.shuffle(pool)
        for _ in range(50):   # gleiche Namen möglichst nicht nebeneinander
            clash = [i for i in range(len(pool)) if len(pool) > 2 and pool[i] == pool[i - 1]]
            if not clash:
                break
            i, j = clash[0], RNG.randrange(len(pool))
            pool[i], pool[j] = pool[j], pool[i]
        write_pool(con, subj, pool)
        return class_obj(con, cid, subj)

    if rest == ["subject", "reset"] and method == "POST":
        pool = [r[0] for r in con.execute("SELECT id FROM students WHERE class_id=?", (cid,))]
        RNG.shuffle(pool)
        write_pool(con, need_subject(), pool)
        con.execute("INSERT INTO history (class_id, subject_id, ts, type) VALUES (?,?,?,'reset')",
                    (cid, subj, int(time.time())))
        return class_obj(con, cid, subj)

    if rest == ["subject", "history"] and method == "DELETE":
        con.execute("DELETE FROM history WHERE subject_id=?", (need_subject(),))
        return class_obj(con, cid, subj)

    if rest == ["subject", "rate"] and method == "POST":
        need_subject()
        s = get_student(con, cid, body.get("studentId"))
        try:
            score = max(0, min(100, round(float(body.get("score")))))
        except (TypeError, ValueError):
            raise ApiError(400, "Ungültige Bewertung")
        outcome = outcome_for(score)
        pool = read_pool(con, subj)
        pos = body.get("position")
        if outcome == "removed" and s["id"] in pool:
            if isinstance(pos, int) and 0 <= pos < len(pool) and pool[pos] == s["id"]:
                pool.pop(pos)    # genau den gezogenen Eintrag entfernen
            else:
                pool.remove(s["id"])
        elif outcome == "added":
            insert_random(pool, s["id"])
        write_pool(con, subj, pool)
        con.execute(
            "INSERT INTO history (class_id, subject_id, ts, type, student_id, name, score, outcome) VALUES (?,?,?,?,?,?,?,?)",
            (cid, subj, int(time.time()), "rate", s["id"], s["name"], score, outcome))
        return class_obj(con, cid, subj)

    raise ApiError(404, "Unbekannte Route")


# ----------------------------------------------------------------- Server ---
MIME = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png"}


class Handler(BaseHTTPRequestHandler):
    server_version = "Gluecksrad/2.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, status, payload, ctype="application/json; charset=utf-8", cookie=None):
        data = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        if cookie is not None:
            age = SESSION_DAYS * 86400 if cookie else 0
            https = os.environ.get("COOKIE_SECURE") == "1" or self.headers.get("X-Forwarded-Proto", "").lower() == "https"
            secure = "; Secure" if https else ""
            self.send_header("Set-Cookie", f"gr_session={cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{secure}")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _dispatch(self, method):
        path = self.path.split("?")[0]
        if path.startswith("/api/"):
            body = {}
            length = int(self.headers.get("Content-Length") or 0)
            if length > 4 * 1024 * 1024:
                return self._send(413, {"error": "Anfrage zu groß"})
            if length:
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                except json.JSONDecodeError:
                    return self._send(400, {"error": "Ungültiges JSON"})
            parts = [p for p in path[5:].split("/") if p]
            jar = SimpleCookie()
            try:
                jar.load(self.headers.get("Cookie") or "")
            except Exception:
                pass
            ctx = {"token": jar["gr_session"].value if "gr_session" in jar else None,
                   "ip": self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip(),
                   "set_cookie": None}
            if method != "GET" and self.headers.get("X-Requested-With") != "gluecksrad":
                return self._send(403, {"error": "Ungültige Anfrage"})  # CSRF-Schutz
            try:
                res = handle_api(method, parts, body, ctx)
                if isinstance(res, RawResponse):
                    return self._send(200, res.data, res.ctype)
                return self._send(200, res, cookie=ctx["set_cookie"])
            except ApiError as e:
                return self._send(e.status, {"error": e.msg}, cookie="" if e.status == 401 and ctx["token"] else None)
        if method != "GET":
            return self._send(405, {"error": "Nicht erlaubt"})
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = (STATIC_DIR / rel).resolve()
        if not str(f).startswith(str(STATIC_DIR.resolve())) or not f.is_file():
            return self._send(404, {"error": "Nicht gefunden"})
        self._send(200, f.read_bytes(), MIME.get(f.suffix, "application/octet-stream"))

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")


if __name__ == "__main__":
    init_db()
    print(f"Glücksrad v2 läuft auf http://0.0.0.0:{PORT}  (DB: {DB_FILE})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
