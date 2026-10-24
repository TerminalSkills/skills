---
name: sqlite
description: >-
  SQLite is a serverless, zero-configuration embedded SQL database that keeps a whole database in one file. Use when creating or querying a .db file with the sqlite3 shell, importing CSV, using SQLite from Node.js (better-sqlite3) or Python (sqlite3), turning on WAL mode and foreign keys, adding FTS5 full-text search, or taking a safe backup.
license: Apache-2.0
compatibility: 'macOS, Linux, Windows; SQLite 3.45+ recommended; better-sqlite3 13 needs Node.js 22+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/sqlite/sqlite
  tags:
    - sqlite
    - sql
    - embedded-database
    - nodejs
    - python
---

# SQLite

## Overview

SQLite is an embedded relational database that stores everything in one file and needs no server process. It ships in Python's standard library and most operating systems. Checked against SQLite 3.54.1 (2026-10-16) and better-sqlite3 13.0.3; the schema, Node.js and Python code below were run (SQLite 3.45.1 with FTS5, Node 24, Python 3.12).

## Instructions

### Installation

```bash
# Debian/Ubuntu
sudo apt-get install sqlite3
# macOS ships a copy; Homebrew gives a newer one
brew install sqlite
# Node.js driver (version 13 requires Node.js 22 or newer)
npm install better-sqlite3
# Python: sqlite3 is in the standard library, nothing to install
```

### CLI basics

```bash
sqlite3 myapp.db                                   # open or create, interactive
sqlite3 myapp.db "SELECT count(*) FROM users;"     # one-off query
sqlite3 myapp.db ".schema"                         # show DDL
sqlite3 myapp.db ".dump" > backup.sql              # SQL text export
sqlite3 myapp.db < schema.sql                      # run a script
sqlite3 -header -column myapp.db "SELECT * FROM users LIMIT 5;"
```

CSV import: with an existing table, `--skip 1` drops the header row (without it the header is inserted as data):

```bash
sqlite3 myapp.db ".import --csv --skip 1 customers.csv users"
```

If the table does not exist, `.import --csv customers.csv users` creates it from the header row, with all columns as TEXT.

### Schema

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  published_at TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
```

`INTEGER PRIMARY KEY` is already an alias of the rowid and auto-assigns ids; `AUTOINCREMENT` is rarely needed and slower. `STRICT` (3.37+) enforces column types, which SQLite otherwise does not (any value can go in any column). There are no native date or boolean types: store ISO-8601 text, or integer Unix seconds (`unixepoch()`).

### Pragmas

```sql
PRAGMA journal_mode = WAL;     -- persists in the file
PRAGMA busy_timeout = 5000;    -- per connection: wait 5 s instead of failing with SQLITE_BUSY
PRAGMA synchronous = NORMAL;   -- per connection; safe with WAL
PRAGMA foreign_keys = ON;      -- per connection; OFF by default, so foreign keys are not enforced
```

Everything except `journal_mode` must be set on every new connection. WAL does not work over network filesystems, and it adds `-wal` and `-shm` files next to the database that must travel with it.

### Node.js with better-sqlite3

```javascript
// db.mjs
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'

const db = new Database('myapp.db')
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')
db.exec(readFileSync('schema.sql', 'utf8'))

const insertUser = db.prepare('INSERT INTO users (email, name) VALUES (@email, @name)')
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?')

// A transaction function: commits on return, rolls back if it throws
const insertMany = db.transaction((users) => {
  for (const user of users) insertUser.run(user)
})

insertMany([
  { email: 'maria@acme-bakery.test', name: 'Maria' },
  { email: 'li@acme-bakery.test', name: 'Li' },
])
console.log(getUserByEmail.get('maria@acme-bakery.test'))

process.on('exit', () => db.close())
```

The API is synchronous. Use `.get()` for one row, `.all()` for an array, `.run()` for writes (returns `changes` and `lastInsertRowid`). Node.js also ships an experimental built-in `node:sqlite` module (release candidate in Node 24) with a similar `DatabaseSync` API; prefer better-sqlite3 for production until it is stable.

### Python

```python
import sqlite3
from contextlib import closing

def get_connection(db_path="myapp.db"):
    conn = sqlite3.connect(db_path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

with closing(get_connection()) as conn:
    with conn:  # commits on success, rolls back on exception; does NOT close
        conn.execute("INSERT INTO users (email, name) VALUES (?, ?)",
                     ("maria@acme-bakery.test", "Maria"))
    for row in conn.execute("SELECT * FROM users LIMIT ?", (100,)):
        print(dict(row))
```

Always pass values as `?` parameters, never with f-strings. `with conn:` only manages the transaction; `closing(...)` closes the connection.

### Full-text search (FTS5)

An external-content index does not follow the base table by itself; keep it in sync with triggers (tested):

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(title, body, content='posts', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO posts_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- one-time load of rows that already exist
INSERT INTO posts_fts(posts_fts) VALUES ('rebuild');

SELECT p.title, rank
FROM posts_fts JOIN posts p ON p.id = posts_fts.rowid
WHERE posts_fts MATCH 'database OR sql'
ORDER BY rank;
```

### Backup and maintenance

```bash
sqlite3 myapp.db ".backup backup_2026-10-24.db"          # consistent online copy, safe with WAL
sqlite3 myapp.db "VACUUM INTO 'compact_2026-10-24.db';"  # compacted copy to a new file
sqlite3 myapp.db "PRAGMA integrity_check;"               # prints: ok
sqlite3 myapp.db "PRAGMA optimize;"                      # run before closing long-lived connections
```

Do not copy a live WAL database with `cp`; use `.backup` or `VACUUM INTO`.

## Examples

**"Load our customers.csv into a new database and find duplicates."**

```console
$ sqlite3 shop.db ".import --csv customers.csv customers"
$ sqlite3 -header -column shop.db "SELECT email, count(*) n FROM customers GROUP BY email HAVING n > 1;"
email                   n
----------------------  -
maria@acme-bakery.test  2
```

**"My Node service gets SQLITE_BUSY under load."** Open every connection with `busy_timeout = 5000` and `journal_mode = WAL`, keep write transactions short, and batch inserts in `db.transaction(...)`. Result: readers no longer block the writer, and concurrent writers wait instead of failing.

## Guidelines

- SQLite allows many readers but one writer at a time; it suits single-host apps, local tools and tests, not many app servers writing to one file.
- Foreign keys are off until `PRAGMA foreign_keys = ON` on each connection.
- Wrap bulk writes in one transaction; thousands of single-row autocommits are orders of magnitude slower.
- Do not put the database on NFS or SMB; WAL especially is unsafe there.
- Parameterize every query; never build SQL from user input.
- Back up with `.backup` or `VACUUM INTO`, not `cp`, and test restoring.
