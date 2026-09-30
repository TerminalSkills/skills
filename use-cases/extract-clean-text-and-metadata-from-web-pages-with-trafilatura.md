---
title: Extract Clean Text and Metadata from Web Pages with Trafilatura
slug: extract-clean-text-and-metadata-from-web-pages-with-trafilatura
description: Turn a whole blog section into a dated, queryable text corpus and LLM-ready Markdown, for researchers and engineers who review many articles.
skills:
  - trafilatura
  - duckdb
category: data-ai
tags:
  - trafilatura
  - text-extraction
  - corpus-building
  - web-scraping
  - duckdb
---

## The Problem

Ilse Brandt leads platform engineering at Calder Pay, a 30-person payments company. Before a database migration she wants to review how a large engineering organisation handled the same problems, and the best public source is the infrastructure section of the GitHub engineering blog: 47 long posts written over thirteen years.

Reading them in a browser is slow and leaves nothing to search. Saving pages by hand gives her HTML full of navigation, related-post teasers and footers. Copying the text out takes about five minutes per post, four hours in total, and drops the publication dates she needs to tell current practice from history. She wants the article text alone, each post tagged with its date and author, in a form she can query and hand to the team's assistant.

## The Solution

Use **trafilatura** to discover the post URLs, download them politely and extract text plus metadata, and **duckdb** to query the resulting JSON files without loading them into a server.

```bash
npx terminal-skills install trafilatura duckdb
```

## Step-by-Step Walkthrough

### 1. Install and test one article

```text
Install Trafilatura and show me what it extracts from one infrastructure post.
```

```bash
python -m venv .venv
source .venv/bin/activate
pip install trafilatura duckdb
trafilatura -u "https://github.blog/engineering/infrastructure/upgrading-github-com-to-mysql-8-0/" --markdown --with-metadata | head -n 12
```

The output starts with a metadata header (`title`, `author`, `url`, `hostname`, `date`) followed by the post as Markdown. Menus, teasers and the footer are gone.

### 2. Find every post in the section

```text
List all posts under /engineering/infrastructure/ on that blog.
```

The agent reads the site's sitemaps and prints the URLs without downloading the pages:

```bash
trafilatura --sitemap "https://github.blog/" --list > sitemap-urls.txt
wc -l sitemap-urls.txt
grep -E "^https://github.blog/engineering/infrastructure/[^/]+/$" sitemap-urls.txt > urls.txt
wc -l urls.txt
```

```text
9552 sitemap-urls.txt
47 urls.txt
```

Discovery takes about two and a half minutes. The filtering is done with `grep` because Trafilatura's `--url-filter` only selects seed URLs; it does not filter the links a sitemap returns. The pattern also drops the section's index page, which is a list of teasers and not an article.

### 3. Download and extract the posts

```text
Extract all 47 posts to JSON with metadata. Skip the comments and keep the raw HTML.
```

```bash
trafilatura -i urls.txt -o corpus --json --with-metadata --no-comments --backup-dir raw-html
ls corpus | wc -l
```

```text
47
```

The run takes about four and a half minutes. Trafilatura waits five seconds between requests to the same host, which is the right pace for someone else's server. `corpus/` holds one JSON file per post, named by content hash, and `raw-html/` holds a compressed copy of every download.

### 4. Query the corpus

```text
Load the posts into DuckDB. How many are there, what period do they cover, and which ones mention MySQL?
```

`corpus_report.py`:

```python
import duckdb

con = duckdb.connect("corpus.duckdb")
con.execute(
    """CREATE OR REPLACE TABLE posts AS
       SELECT title, author, date, source AS url, text
       FROM read_json_auto('corpus/*.json')"""
)

print(con.sql(
    """SELECT count(*) AS posts, min(date) AS first, max(date) AS last,
              sum(length(text)) AS chars,
              count(*) FILTER (WHERE author IS NULL OR author = '') AS no_author
       FROM posts"""
))
print(con.sql(
    """SELECT year(date) AS year, count(*) AS posts, round(avg(length(text))) AS avg_chars
       FROM posts GROUP BY year ORDER BY year"""
))
print(con.sql(
    """SELECT date, left(title, 60) AS title
       FROM posts WHERE text ILIKE '%mysql%' ORDER BY date DESC LIMIT 5"""
))
con.execute("COPY posts TO 'posts.parquet' (FORMAT PARQUET)")
con.close()
```

```bash
python corpus_report.py
```

```text
┌───────┬────────────┬────────────┬────────┬───────────┐
│ posts │   first    │    last    │ chars  │ no_author │
│ int64 │    date    │    date    │ int128 │   int64   │
├───────┼────────────┼────────────┼────────┼───────────┤
│    47 │ 2013-02-22 │ 2026-04-16 │ 605506 │         0 │
└───────┴────────────┴────────────┴────────┴───────────┘
```

The second table counts posts per year and the third lists the five most recent posts that mention MySQL. DuckDB reads the JSON files in place and infers `date` as a real date column, so sorting and grouping by year need no conversion. `posts.parquet` is a 320 KB file Ilse can share with the team.

### 5. Produce Markdown for the assistant

```text
I also need each post as a Markdown file with its metadata, for our internal assistant. Do not download anything again.
```

`to_markdown.py` re-extracts from the saved HTML, so the site is not contacted a second time:

```python
import gzip
from pathlib import Path

from trafilatura import extract

out = Path("markdown")
out.mkdir(exist_ok=True)
written = 0
for path in sorted(Path("raw-html").glob("*.html.gz")):
    html = gzip.open(path, "rt", encoding="utf-8").read()
    text = extract(html, output_format="markdown", with_metadata=True, include_comments=False)
    if text:
        (out / path.name.replace(".html.gz", ".md")).write_text(text, encoding="utf-8")
        written += 1
print(f"{written} Markdown files written")
```

```bash
python to_markdown.py
```

```text
47 Markdown files written
```

This step runs in about a second. `extract()` returns `None` when it finds no usable content, so the `if text` check keeps empty files out of the folder.

## Real-World Example

Ilse ran the five steps between two meetings. Discovery and download took seven minutes of machine time and none of hers; the manual route would have cost about four hours. She ended up with 47 posts, 605,506 characters of article text, every post dated and attributed, in three forms: JSON for archiving, a DuckDB table for questions, and Markdown for the assistant.

The per-year table showed that most of the section was written between 2016 and 2022, so she sorted her reading list newest first and treated the 2013 posts as background. The MySQL query cut the list to the posts relevant to her migration, and she read those in full. When a colleague asked a month later whether any post covered feature flags, the answer was one `ILIKE` query against `corpus.duckdb`.

She keeps the corpus internal. The posts belong to their publisher, and the team uses the extracted text for reading and search only.

## Related Skills

- [trafilatura](/skills/trafilatura) — lists the section's URLs from the sitemap, downloads each post with a delay, and extracts text and metadata as JSON and Markdown
- [duckdb](/skills/duckdb) — queries the JSON files in place, builds the `posts` table and exports it to Parquet
