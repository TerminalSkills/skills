---
name: mysql
description: |
  MySQL is an open-source relational database server. Use when you need to install MySQL,
  design tables, add indexes, write queries, set up replication, take backups, or connect
  from Node.js (mysql2) or Python (mysql-connector-python).
license: Apache-2.0
compatibility: 'MySQL 8.4 LTS or 9.7 LTS; macOS, Linux, Windows; Node.js mysql2 3.x, Python 3.10+ mysql-connector-python'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/mysql/mysql-server
  category: data-ai
  tags: "mysql, sql, relational-database, replication, nodejs"
---

# MySQL

## Overview

MySQL is a relational database used from small apps to large web platforms, with ACID transactions (InnoDB), replication and full-text search. Current releases are the 8.4 and 9.7 LTS lines and the 26.x innovation line. MySQL 8.0 reached end of life in April 2026, so new installs should use 8.4 or 9.7. The snippets below were run on 9.7.4.

## Instructions

Install the server, create a schema with `utf8mb4` and InnoDB, index the columns your queries filter on, and connect with a pooled driver using parameterised queries.

## Installation

```bash
# Docker (recommended for development)
# tags: mysql:9.7 (LTS), mysql:8.4 (LTS), mysql:lts; mysql:8 now points at 8.4
docker run -d --name mysql -p 127.0.0.1:3306:3306 \
  -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
  -e MYSQL_DATABASE=myapp \
  mysql:9.7

# Ubuntu/Debian (installs the version Ubuntu ships, check it is 8.4 or newer)
sudo apt-get install mysql-server
sudo mysql_secure_installation

# macOS
brew install mysql && brew services start mysql

# Node.js driver
npm install mysql2

# Python driver
pip install mysql-connector-python
```

## CLI Basics

```bash
# Connect to MySQL
mysql -u root -p

# Connect to specific database
mysql -u root -p myapp

# Execute query from command line
mysql -u root -p -e "SHOW DATABASES;"

# Import SQL file
mysql -u root -p myapp < schema.sql

# Export database
mysqldump -u root -p myapp > backup.sql
```

## Schema Design

```sql
-- schema.sql: Create tables with proper types, indexes, and constraints
CREATE DATABASE IF NOT EXISTS myapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE myapp;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  total_cents INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','paid','shipped','completed','cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB;
```

## Indexing Strategies

```sql
-- indexing.sql: Common indexing patterns for performance
-- Composite index for multi-column queries (leftmost prefix rule)
CREATE INDEX idx_orders_status_date ON orders(status, created_at);

-- Covering index — query answered entirely from index
CREATE INDEX idx_users_email_name ON users(email, name);

-- Full-text index for search (assumes a products table with name and description)
ALTER TABLE products ADD FULLTEXT INDEX ft_search (name, description);
SELECT * FROM products WHERE MATCH(name, description) AGAINST('laptop' IN BOOLEAN MODE);

-- Check query execution plan
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42 AND status = 'paid';
```

## Node.js with mysql2

```javascript
// db.js: MySQL connection pool with mysql2 and promise API
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS,
  database: 'myapp',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

async function getUser(id) {
  const [rows] = await pool.execute(
    'SELECT id, email, name FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function createOrder(userId, totalCents) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO orders (user_id, total_cents) VALUES (?, ?)',
      [userId, totalCents]
    );
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, getUser, createOrder };
```

## Python Client

```python
# db.py: MySQL connection with mysql-connector-python
import os
import mysql.connector
from mysql.connector import pooling

pool = pooling.MySQLConnectionPool(
    pool_name="myapp",
    pool_size=5,
    host="localhost",
    user="root",
    password=os.environ["DB_PASS"],
    database="myapp",
    charset="utf8mb4",
)

def get_user(user_id):
    conn = pool.get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, email, name FROM users WHERE id = %s", (user_id,))
        return cursor.fetchone()
    finally:
        conn.close()

def insert_users(users):
    conn = pool.get_connection()
    try:
        cursor = conn.cursor()
        cursor.executemany(
            "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s)",
            users,
        )
        conn.commit()
    finally:
        conn.close()
```

## Replication Setup

```ini
# my.cnf (primary): Enable binary logging for replication
[mysqld]
server-id = 1          # unique per server
log-bin = mysql-bin   # the binary log is already on in 9.7 by default; the line makes it explicit
gtid-mode = ON
enforce-gtid-consistency = ON
```

```bash
# Generate the replication password once and keep it in your secret store
REPL_PASSWORD="$(openssl rand -base64 24)"

# On the primary: a replication user limited to the replica's network
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -h primary-host <<SQL
CREATE USER 'repl'@'10.0.0.%' IDENTIFIED BY '${REPL_PASSWORD}';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.0.0.%';
SQL

# On the replica: follow the primary with GTID auto-positioning
mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='primary-host', SOURCE_USER='repl',
  SOURCE_PASSWORD='${REPL_PASSWORD}', SOURCE_AUTO_POSITION=1,
  SOURCE_SSL=1;   # caching_sha2_password (the default) needs TLS or the source's public key
START REPLICA;
SHOW REPLICA STATUS\G
SQL
```

## Backup and Maintenance

```bash
# backup.sh: Automated backup with compression
mysqldump -u root -p --single-transaction --routines --triggers myapp | gzip > "backup_$(date +%Y%m%d).sql.gz"

# Restore from backup
gunzip < backup_20261024.sql.gz | mysql -u root -p myapp
```

## Examples

**"Give me a local MySQL for my app and show the five newest orders per user."**

```bash
docker run -d --name mysql -p 127.0.0.1:3306:3306 -e MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" -e MYSQL_DATABASE=myapp mysql:9.7
docker exec -i mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" myapp < schema.sql
docker exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" myapp -e "
  SELECT user_id, id, total_cents FROM (
    SELECT o.*, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn FROM orders o
  ) t WHERE rn <= 5"
```

The result is a table of `user_id`, `id`, `total_cents` rows, at most five per user.

**"Why is this orders query slow?"** Run `EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42 AND status = 'paid';`. With `idx_user_status` the plan reads `Index lookup on orders using idx_user_status`; a `Table scan` means the index is missing or the column order does not match the filter.

## Guidelines

- Use `mysql:8.4` or `mysql:9.7`; 8.0 no longer receives fixes. The `mysql_native_password` plugin is no longer available in 9.x, so create users with the default `caching_sha2_password` and use current drivers (mysql2 3.x and mysql-connector-python 26.x support it).
- Always pass values as `?` / `%s` parameters, never by string concatenation.
- Keep passwords in environment variables or a secrets manager; bind the server to 127.0.0.1 unless remote access is required.
- Use `utf8mb4` everywhere; the server default collation is `utf8mb4_0900_ai_ci`.
- Take a backup with `--single-transaction` for InnoDB, and restore it into a scratch database before relying on it.
- Replication needs `server-id` unique per server and a replica user with only the replication privilege.
