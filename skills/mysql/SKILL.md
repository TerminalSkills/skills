---
name: mysql
description: |
  MySQL is the world's most popular open-source relational database management system.
  Learn installation, SQL queries, indexing strategies, replication setup,
  and client integration with Node.js (mysql2) and Python (mysql-connector).
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - mysql
    - sql
    - relational-database
    - replication
    - nodejs
    - python
---

# MySQL

MySQL is a robust relational database used from small apps to large-scale web platforms. It supports ACID transactions, replication, and extensive SQL features.

## Installation

```bash
# Docker (recommended for development)
docker run -d --name mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=myapp \
  mysql:8

# Ubuntu/Debian
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

-- Full-text index for search
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
  password: process.env.DB_PASS || 'secret',
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
import mysql.connector
from mysql.connector import pooling

pool = pooling.MySQLConnectionPool(
    pool_name="myapp",
    pool_size=5,
    host="localhost",
    user="root",
    password="secret",
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
server-id = 1
log-bin = mysql-bin
binlog-format = ROW
gtid-mode = ON
enforce-gtid-consistency = ON
```

```sql
-- replication.sql: Configure replica to follow primary
-- On primary: create replication user
CREATE USER 'repl'@'%' IDENTIFIED BY 'repl_password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- On replica: start replication
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='primary-host',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='repl_password',
  SOURCE_AUTO_POSITION=1;
START REPLICA;
SHOW REPLICA STATUS\G
```

## Backup and Maintenance

```bash
# backup.sh: Automated backup with compression
mysqldump -u root -p --single-transaction --routines --triggers myapp | gzip > "backup_$(date +%Y%m%d).sql.gz"

# Restore from backup
gunzip < backup_20260219.sql.gz | mysql -u root -p myapp
```
