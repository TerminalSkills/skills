---
name: sqlite
description: |
  SQLite is a self-contained, serverless, zero-configuration embedded SQL database engine.
  Learn CLI usage, Node.js integration with better-sqlite3, Python's built-in sqlite3 module,
  and best practices for schema design, indexing, and WAL mode.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: databases
  tags:
    - sqlite
    - sql
    - embedded-database
    - nodejs
    - python
---

# SQLite

SQLite is an embedded relational database that stores everything in a single file. It requires no server process and is included in Python's standard library and most operating systems.

## Installation

```bash
# Install SQLite CLI on Ubuntu/Debian
sudo apt-get install sqlite3

# Install SQLite CLI on macOS (pre-installed, or update via Homebrew)
brew install sqlite

# Install Node.js driver
npm install better-sqlite3

# Python — sqlite3 is built-in, no install needed
```

## CLI Basics

```bash
# Create or open a database
sqlite3 myapp.db

# Import CSV data
sqlite3 myapp.db ".mode csv" ".import data.csv users"

# Run a query from command line
sqlite3 myapp.db "SELECT count(*) FROM users;"

# Dump schema
sqlite3 myapp.db ".schema"

# Export to SQL
sqlite3 myapp.db ".dump" > backup.sql
```

## Create Tables and Index

```sql
-- schema.sql: Define tables with proper types and constraints
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT,
  published_at TEXT
);

-- Create indexes for common queries
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published_at);
```

## Enable WAL Mode

```sql
-- wal-mode.sql: Enable Write-Ahead Logging for better concurrent read performance
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

## Node.js with better-sqlite3

```javascript
// db.js: SQLite wrapper using better-sqlite3 (synchronous API)
const Database = require('better-sqlite3');

const db = new Database('myapp.db', { verbose: console.log });

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Prepare statements for reuse
const insertUser = db.prepare(
  'INSERT INTO users (email, name) VALUES (@email, @name)'
);

const getUserByEmail = db.prepare(
  'SELECT * FROM users WHERE email = ?'
);

// Use transactions for bulk inserts
const insertMany = db.transaction((users) => {
  for (const user of users) {
    insertUser.run(user);
  }
});

insertMany([
  { email: 'alice@example.com', name: 'Alice' },
  { email: 'bob@example.com', name: 'Bob' },
]);

const user = getUserByEmail.get('alice@example.com');
console.log(user);

// Always close when done
process.on('exit', () => db.close());
```

## Python Usage

```python
# app.py: SQLite with Python's built-in sqlite3 module
import sqlite3
from contextlib import closing

def get_connection(db_path='myapp.db'):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Access columns by name
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn

def create_user(conn, email, name):
    conn.execute(
        'INSERT INTO users (email, name) VALUES (?, ?)',
        (email, name)
    )
    conn.commit()

def get_users(conn, limit=100):
    cursor = conn.execute('SELECT * FROM users LIMIT ?', (limit,))
    return cursor.fetchall()

# Usage
with closing(get_connection()) as conn:
    create_user(conn, 'alice@example.com', 'Alice')
    for row in get_users(conn):
        print(dict(row))
```

## Full-Text Search

```sql
-- fts.sql: Enable full-text search with FTS5
CREATE VIRTUAL TABLE posts_fts USING fts5(title, body, content=posts, content_rowid=id);

-- Populate the FTS index
INSERT INTO posts_fts(rowid, title, body)
  SELECT id, title, body FROM posts;

-- Search with ranking
SELECT p.*, rank
FROM posts_fts fts
JOIN posts p ON p.id = fts.rowid
WHERE posts_fts MATCH 'database OR sql'
ORDER BY rank;
```

## Backup and Maintenance

```bash
# backup.sh: Online backup using .backup command
sqlite3 myapp.db ".backup backup_$(date +%Y%m%d).db"

# Optimize database size
sqlite3 myapp.db "VACUUM;"

# Analyze for query planner
sqlite3 myapp.db "ANALYZE;"

# Check database integrity
sqlite3 myapp.db "PRAGMA integrity_check;"
```
