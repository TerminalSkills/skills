---
name: sql-js
description: >-
  sql.js is SQLite compiled to WebAssembly, so a browser page or a Node.js script can create, load, query and export a real SQLite database with no server and no native module. Use when a user wants to "open a .sqlite file in the browser", "run SQL on the client", "query SQLite in Node without native bindings", "export a database to a file", or "add custom SQL functions in JavaScript". Covers initSqlJs, exec, prepared statements, export, and how persistence must be handled.
license: Apache-2.0
compatibility: "Node.js 18.3+ or a browser with WebAssembly; npm package sql.js 1.15.x"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "sqlite, wasm, javascript, browser, sql"
  repository: https://github.com/sql-js/sql.js
---

# sql.js — SQLite in WebAssembly for the browser and Node.js

## Overview

sql.js runs the SQLite engine (3.54 in the 1.15 package) as WebAssembly. A database lives entirely in memory: you create an empty one or hand it the bytes of an existing `.sqlite` file, run SQL against it, and call `db.export()` to get the bytes back. Nothing is written to disk or to browser storage by the library. Saving, loading and sharing the bytes is the application's job.

That makes it a good fit for: reading a user-supplied SQLite file without uploading it, shipping a small read-only dataset with a web page, unit-testing SQL in Node without native compilation, and quick in-memory scratch databases. It is a poor fit for large databases (everything is held in RAM) or for server code where a native binding such as `better-sqlite3` can work on files directly.

## Instructions

### Installation

```bash
npm install sql.js
ls node_modules/sql.js/dist
```

`dist/` holds the builds. The ones to know:

| File | Use |
|---|---|
| `sql-wasm.js` + `sql-wasm.wasm` | Default build. Node loads the `.wasm` next to the script automatically; browsers need it served and located. |
| `sql-wasm-browser.js` + `.wasm` | Browser-only build (selected by the package's browser export). |
| `sql-wasm-inline.js` | One file with the WebAssembly embedded: no `locateFile`, larger JS. |
| `worker.sql-wasm.js`, `worker.sql-wasm-inline.js` | Web Worker builds driven by `postMessage`. |
| `*-debug.js` | Development builds with assertions. |

### Start in Node.js

```javascript
const initSqlJs = require("sql.js");

async function main() {
  const SQL = await initSqlJs();       // loading is asynchronous
  const db = new SQL.Database();       // empty in-memory database
  db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, total REAL, placed TEXT)");
  db.run("INSERT INTO orders (customer, total, placed) VALUES (?, ?, ?)", ["Dana Ruiz", 129.5, "2026-10-01"]);
  console.log(db.exec("SELECT count(*) AS n FROM orders"));
}
main();
```

`require("sql.js")` returns the `initSqlJs` function itself. Version 0.x loaded synchronously; any snippet that does `new SQL.Database()` right after `require` is outdated.

### Start in the browser

Serve `sql-wasm.js` and `sql-wasm.wasm` from your own site (copy them out of `node_modules/sql.js/dist`), then point `locateFile` at the folder:

```html
<script src="/vendor/sql-wasm.js"></script>
<script>
  initSqlJs({ locateFile: (file) => `/vendor/${file}` }).then((SQL) => {
    const db = new SQL.Database();
    db.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
    console.log(db.exec("SELECT sqlite_version()")[0].values);
  });
</script>
```

If you would rather not host the `.wasm`, use `sql-wasm-inline.js` and call `initSqlJs()` with no arguments. With a bundler (Vite, webpack) import the package and make sure the `.wasm` file is emitted as an asset and reachable by `locateFile`; a 404 on `sql-wasm.wasm` is the most common failure.

### Run SQL

```javascript
// run: execute statements, returns the Database, no results
db.run("INSERT INTO orders (customer, total, placed) VALUES (?, ?, ?)", ["Omar Haddad", 42, "2026-10-02"]);
db.run("UPDATE orders SET total = total * 1.2 WHERE placed < '2026-10-02'");
console.log(db.getRowsModified());   // rows changed by the last statement

// exec: run one or more statements, returns [{columns, values}] per statement that returns rows
const res = db.exec("SELECT customer, SUM(total) AS spent FROM orders GROUP BY customer ORDER BY spent DESC");
// [{ columns: ["customer","spent"], values: [["Dana Ruiz", 155.4], ["Omar Haddad", 42]] }]
```

`exec` returns an empty array when nothing returns rows, so check `res.length` before reading `res[0]`. `exec` has no parameter binding in its simple form; never build SQL by string concatenation from user input. Use `run` with `?` parameters or a prepared statement.

### Prepared statements

```javascript
const stmt = db.prepare("SELECT * FROM orders WHERE customer = :who AND total > :min");
stmt.bind({ ":who": "Dana Ruiz", ":min": 100 });
while (stmt.step()) {
  console.log(stmt.getAsObject());   // { id: 1, customer: 'Dana Ruiz', total: 155.4, placed: '2026-10-01' }
}
stmt.free();                         // always free, or WebAssembly memory leaks
```

Related methods: `stmt.bind([...])` for positional parameters, `stmt.get()` for the current row as an array, `stmt.getColumnNames()`, `stmt.reset()` to restart the statement (it also clears all bindings, so bind again before the next `step()`), and `stmt.run(values)` for repeated inserts:

```javascript
const insert = db.prepare("INSERT INTO orders (customer, total, placed) VALUES ($c, $t, $p)");
for (const o of incoming) insert.run({ $c: o.customer, $t: o.total, $p: o.placed });
insert.free();
```

For a batch, wrap the loop in `db.run("BEGIN")` / `db.run("COMMIT")`.

### Save and load the database file

```javascript
const fs = require("fs");

// save
const bytes = db.export();                                // Uint8Array holding a complete .sqlite file
fs.writeFileSync("orders.sqlite", Buffer.from(bytes));

// load
const SQL = await initSqlJs();
const restored = new SQL.Database(new Uint8Array(fs.readFileSync("orders.sqlite")));
```

In a browser, read a user-chosen file with `FileReader.readAsArrayBuffer` (or `file.arrayBuffer()`), pass `new Uint8Array(buffer)` to `new SQL.Database(...)`, and offer downloads by wrapping `db.export()` in a `Blob`. Fetch a bundled database with `fetch(url).then(r => r.arrayBuffer())`.

Persistence across page reloads is not provided: store the exported bytes yourself (for example in IndexedDB or a file the user saves) and load them again at startup. Treat `export()` as the only save operation and run it after meaningful changes.

### Inspect an unknown database

```javascript
const tables = db.exec("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name");
const columns = db.exec("PRAGMA table_info('orders')");   // rows: cid, name, type, notnull, dflt_value, pk
```

### Custom SQL functions

```javascript
db.create_function("domain_of", (email) => String(email).split("@")[1] ?? null);
console.log(db.exec("SELECT domain_of('dana.ruiz@northwind-logistics.eu')")[0].values); // [["northwind-logistics.eu"]]

db.create_aggregate("median", {
  init: () => [],
  step: (state, value) => { state.push(value); return state; },
  finalize: (state) => { state.sort((a, b) => a - b); return state[Math.floor(state.length / 2)]; },
});
console.log(db.exec("SELECT median(total) FROM orders")[0].values);
```

Registered functions exist only for that `Database` object; register them again after loading a file.

### Errors, large integers and cleanup

SQL errors throw ordinary JavaScript exceptions (`no such table: nope`), so wrap untrusted SQL in `try/catch`. Integers beyond 2^53 lose precision by default; pass `{ useBigInt: true }` as the options argument to read them as `BigInt`: the third argument of `db.exec(sql, params, config)` (for example `db.exec(sql, null, { useBigInt: true })`), or the second argument of `stmt.get(params, config)` and `stmt.getAsObject(params, config)`. Call `db.close()` when finished to release the memory.

## Examples

### Example 1: Open a customer's SQLite backup in Node and report the largest tables

Request: "Support sent me `acme-backup.sqlite`. List each table with its row count."

```javascript
const fs = require("fs");
const initSqlJs = require("sql.js");

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(process.argv[2])));
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")[0]?.values ?? [];
  const counts = tables.map(([name]) => ({ name, rows: db.exec(`SELECT count(*) FROM "${name.replace(/"/g, '""')}"`)[0].values[0][0] }));
  counts.sort((a, b) => b.rows - a.rows);
  console.table(counts);
  db.close();
})();
```

Run `node tables.js acme-backup.sqlite`. The output is a table such as `shipments 18204`, `carriers 37`, `invoices 9`. The table name is quoted because it comes from the file, not from the user's own code.

### Example 2: A browser page that loads a dropped database and exports a filtered copy

Request: "A page where my teammate drops a .sqlite file, sees the orders over 100, and downloads a trimmed file."

```html
<input type="file" id="pick" accept=".sqlite,.db">
<script src="/vendor/sql-wasm.js"></script>
<script>
  const ready = initSqlJs({ locateFile: (f) => `/vendor/${f}` });
  document.getElementById("pick").onchange = async (e) => {
    const SQL = await ready;
    const db = new SQL.Database(new Uint8Array(await e.target.files[0].arrayBuffer()));
    db.run("DELETE FROM orders WHERE total <= 100");
    db.run("VACUUM");
    const blob = new Blob([db.export()], { type: "application/vnd.sqlite3" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "orders-over-100.sqlite" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
</script>
```

The file never leaves the browser; the page needs no backend. The downloaded file opens in any SQLite tool.

## Guidelines

- Whole database in memory: loading a 500 MB file needs at least that much RAM in the tab. For big or server-side data use a native SQLite binding.
- Changes are lost on reload unless the app saves `db.export()` somewhere. Do not promise users automatic persistence.
- Always `free()` prepared statements and `close()` databases you are done with.
- Parameterize every value that comes from users or from a loaded file; table and column names cannot be bound, so quote identifiers yourself.
- The default build is plain SQLite plus built-in JSON functions. FTS5 is not available (`CREATE VIRTUAL TABLE ... USING fts5` fails with `no such module`).
- Heavy queries block the page's main thread. Move large work into a Web Worker (`worker.sql-wasm.js`), which is driven by `postMessage` rather than the `SQL.Database` API.
- Do not use sql.js as a shared multi-user database; each page holds its own private copy.
