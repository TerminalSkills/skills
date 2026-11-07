---
title: Inspect SQLite Files in the Browser Without Uploading Them with sql.js
slug: inspect-sqlite-files-in-the-browser-without-uploading-with-sql-js
description: Build a static page where support staff open a customer's SQLite file, run read-only queries and download a redacted copy, with the data never leaving the browser.
skills:
  - sql-js
  - sqlite
category: development
tags:
  - sqlite
  - webassembly
  - privacy
  - client-side
  - support-tools
---

# Inspect SQLite Files in the Browser Without Uploading Them with sql.js

## The Problem

Priya Raman runs support engineering for a company that ships a desktop inventory app. The app keeps everything in one SQLite file, and when a customer reports "my stock counts are wrong" the standard request is "please email us your `inventory.db`". Those files contain customer names and prices, and the privacy policy forbids copying them to company laptops or a shared bucket. Today an engineer has to ask the customer for a screen share, or pull the file anyway and delete it afterwards. Each case takes about 40 minutes of back-and-forth, and last quarter two files ended up in a Downloads folder after a case was closed.

She wants a tool that opens the file where it already is, lets an engineer run queries, and lets the customer hand back a copy with personal columns blanked, without any server ever seeing the original.

## The Solution

A single static HTML page backed by sql.js, SQLite compiled to WebAssembly. The customer (or the engineer, on the customer's machine) opens the page and picks the file; the browser reads it into memory and sql.js queries it locally. A redaction button overwrites chosen columns and offers a download via `db.export()`. There is no backend, so there is nothing to log or breach. The agent uses the `sql-js` skill for the page logic and the `sqlite` skill to check the exported file with the real `sqlite3` command line tool.

## Step-by-Step Walkthrough

### Step 1: Put the sql.js build next to the page

Prompt: "Create `support-viewer/` with an `index.html` and a `vendor/` folder containing sql.js, served statically. No bundler."

```bash
mkdir -p support-viewer/vendor && cd support-viewer
npm init -y >/dev/null && npm install sql.js
cp node_modules/sql.js/dist/sql-wasm.js node_modules/sql.js/dist/sql-wasm.wasm vendor/
```

The page loads `/vendor/sql-wasm.js` and finds the `.wasm` through `locateFile`, so both files must sit in the same served folder.

### Step 2: Load the chosen file and list its tables

Prompt: "On file selection, load the database, show every table with its row count, and don't send anything over the network."

```html
<input type="file" id="pick" accept=".db,.sqlite,.sqlite3">
<pre id="out"></pre>
<script src="/vendor/sql-wasm.js"></script>
<script>
  const ready = initSqlJs({ locateFile: (f) => `/vendor/${f}` });
  let db;
  const quote = (name) => '"' + name.replace(/"/g, '""') + '"';

  document.getElementById("pick").onchange = async (e) => {
    const SQL = await ready;
    db = new SQL.Database(new Uint8Array(await e.target.files[0].arrayBuffer()));
    const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values ?? [];
    document.getElementById("out").textContent = names
      .map(([n]) => `${n}: ${db.exec(`SELECT count(*) FROM ${quote(n)}`)[0].values[0][0]} rows`)
      .join("\n");
  };
</script>
```

For a 12 MB `inventory.db` the page lists, for example, `items: 4821 rows`, `customers: 312 rows`, `stock_moves: 29117 rows`.

### Step 3: Add a read-only query box

Prompt: "Let the engineer type a SELECT and show the rows in a table. Refuse anything that is not a single SELECT."

```javascript
function runQuery(sql) {
  if (!/^\s*select\b/i.test(sql) || sql.includes(";")) throw new Error("Only a single SELECT is allowed");
  const res = db.exec(sql);
  return res.length ? res[0] : { columns: [], values: [] };
}
// example the engineer types:
// SELECT sku, SUM(delta) AS net FROM stock_moves GROUP BY sku HAVING net < 0 ORDER BY net LIMIT 20
```

Errors from SQLite (`no such column: skus`) arrive as exceptions and are shown to the engineer as text.

### Step 4: Redact and export a copy

Prompt: "Add a button that blanks `customers.name`, `customers.email` and `customers.phone`, vacuums, and downloads `inventory-redacted.db`."

```javascript
function downloadRedacted() {
  db.run("UPDATE customers SET name = 'REDACTED-' || id, email = NULL, phone = NULL");
  db.run("VACUUM");
  const blob = new Blob([db.export()], { type: "application/vnd.sqlite3" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "inventory-redacted.db",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
```

The `VACUUM` rewrites the file so the old values no longer sit in free pages of the downloaded copy.

### Step 5: Check the exported file with the real SQLite

Prompt: "Verify that the downloaded file has no personal data left."

```bash
sqlite3 ~/Downloads/inventory-redacted.db "PRAGMA integrity_check; SELECT count(*) FROM customers WHERE email IS NOT NULL OR phone IS NOT NULL;"
strings ~/Downloads/inventory-redacted.db | grep -c "@"
```

Both counts should print `0` after `ok`. If the `strings` count is not zero, the agent finds the table that still holds the text and adds it to the redaction step.

## Real-World Example

Two weeks after the page goes live on an internal static host, a customer in Gdansk reports negative stock for 14 SKUs. Instead of a screen share, Priya sends a link to the page. The customer picks `inventory.db`, which stays on their own laptop; an engineer on a call dictates the `GROUP BY sku HAVING net < 0` query and sees that every bad SKU has a `stock_moves` row with a duplicated `batch_id` from an import that ran twice. The customer clicks "Download redacted copy", sends the 11 MB file, and the engineer reproduces the import bug with it. The case takes 15 minutes instead of 40, and no original file is ever stored by the company. The page's limit is memory: a 2 GB database does not load in a browser tab, and those cases still go through a screen share.

## Related Skills

- [sql-js](/skills/sql-js) — loads the SQLite file in the browser, runs the queries and exports the redacted copy.
- [sqlite](/skills/sqlite) — verifies the exported file with the native `sqlite3` tool and covers the SQL used in the queries.
