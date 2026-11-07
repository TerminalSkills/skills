---
name: marimo
description: >-
  marimo is a reactive Python notebook that is stored as a plain .py file, so it diffs cleanly in git, runs as a script, and serves as a web app. Use when a user asks to "create a marimo notebook", "convert my Jupyter notebook to marimo", "turn this notebook into an app", "run a notebook from the command line with arguments", "export a notebook to HTML", or "query a dataframe with SQL in a notebook". Covers marimo edit, run, convert, export, check, mo.ui elements and SQL cells.
license: Apache-2.0
compatibility: "Python 3.10+; pip or uv. SQL cells need the marimo[sql] extra; export to .ipynb needs nbformat"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "marimo, notebook, python, reactive, data-exploration"
  repository: https://github.com/marimo-team/marimo
---
# marimo — reactive Python notebooks stored as plain .py files

## Overview

A marimo notebook is a Python file. Each cell is a function decorated with `@app.cell`; marimo reads which global names a cell defines and uses, builds a dependency graph, and re-runs dependent cells when something changes (a slider moves, a variable is edited). There is no hidden state: a name may be defined in only one cell, and deleting a cell removes its variables. Because the file is ordinary Python, it can be reviewed in a pull request, executed with `python notebook.py`, served read-only as an app, or exported to HTML, a flat script or `.ipynb`.

Tested against marimo 0.25.2. Use this skill for exploratory analysis that must be reproducible and reviewable, for sharing a result as an interactive app, and for migrating `.ipynb` files. For classic Jupyter work see the `jupyter` skill; for apps that are code-first dashboards see `streamlit`.

## Instructions

### Installation

```bash
python -m venv .venv
.venv/bin/pip install marimo
.venv/bin/pip install "marimo[sql]"        # adds duckdb + sqlglot for SQL cells
.venv/bin/pip install nbformat             # only needed for `marimo export ipynb`
.venv/bin/marimo --version
```

Other extras published by the package: `recommended`, `lsp`, `mcp`, `otel`, `sandbox`. In a uv project use `uv add marimo`.

### Create and edit notebooks

```bash
marimo edit analysis.py --headless --port 2718 --no-token
```

`marimo edit NAME` creates the file if it does not exist and starts the editor server on 127.0.0.1. `--headless` skips opening a browser; the server uses a random access token unless you pass `--no-token`, so keep the token on for anything reachable by other users. An agent usually does not need the editor: write the `.py` file directly (structure below) and validate it with `marimo check`.

Notebook structure:

```python
import marimo

__generated_with = "0.25.2"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _(mo):
    min_logins = mo.ui.slider(0, 100, value=40, label="Min logins per month")
    min_logins
    return (min_logins,)


@app.cell
def _(min_logins):
    print("threshold:", min_logins.value)
    return


if __name__ == "__main__":
    app.run()
```

Rules that matter: each cell lists the globals it reads as function parameters and returns the globals it defines; the last expression of a cell is its displayed output; one global name may be defined in only one cell (use a leading underscore, such as `_tmp`, for cell-local names). Hand-editing is fine, and `marimo check --fix` repairs formatting.

### Validate with marimo check

```bash
marimo check analysis.py            # lint: multiple definitions, cycles, formatting (exit 1 on errors)
marimo check --fix analysis.py      # rewrite fixable issues in place
marimo check --strict reports/      # warnings also give a non-zero exit code
```

### UI elements and reactivity

`mo.ui` provides `slider`, `dropdown`, `checkbox`, `text`, `number`, `date`, `file`, `table`, `form` and more. Assign the element to a global in one cell and read `.value` in another; the second cell re-runs when the user changes the element. Reading `.value` in the same cell that creates the element is an error.

### SQL cells

With `marimo[sql]` installed, `mo.sql(...)` runs DuckDB SQL against dataframes (pandas, polars) defined in other cells and returns a dataframe:

```python
@app.cell
def _(customers, mo):
    at_risk = mo.sql("SELECT customer, logins FROM customers WHERE logins < 15", output=False)
    return (at_risk,)
```

Without `sqlglot` installed the call fails with "packages required to execute sql: sqlglot", so install the `sql` extra.

### Run as an app

```bash
marimo run analysis.py --headless --host 127.0.0.1 --port 2718
marimo run analysis.py --headless -- --rows 5000    # arguments after -- go to the notebook
```

`marimo run` is read-only: viewers get the UI but not the code unless you add `--include-code`. A static check runs before serving (`--no-check` disables it). The server answers `GET /health`. Behind a reverse proxy add `--base-url /churn`. For authentication use `--token-password-file` rather than putting a password on the command line.

### Run as a script, with arguments

```bash
python analysis.py                 # cells execute in dependency order, UI elements use defaults
python analysis.py -- --rows 5000  # read inside the notebook with mo.cli_args()
```

Read arguments with `mo.cli_args().get("rows")`; numbers are parsed (`--rows 5000` gives the int `5000`, `--rate 0.5` a float), other values are strings, and a bare flag gives an empty string `''`. Output of `print` appears on stdout, so this works in cron jobs and CI.

### Convert to and from other formats

```bash
marimo convert churn.ipynb -o churn.py     # outputs are stripped; markdown cells become mo.md
marimo convert script.py -o notebook.py    # py:percent scripts
marimo convert notes.md -o notebook.py     # ```{python} fences only

marimo export html analysis.py -o analysis.html -- --rows 5000   # runs the notebook, snapshots output
marimo export script analysis.py -o analysis.script.py           # flat script in topological order
marimo export ipynb analysis.py -o analysis.ipynb --include-outputs
marimo export md analysis.py -o analysis.md
```

`marimo convert` without `-o` prints to stdout, so redirect or pass `-o`. The converter renames a name that two cells both assign (`df` and `df_1`), so read the result: marimo does not track in-place mutation of an object from another cell (`df['x'] = 1`), and such cells can show stale values. Run `marimo check` after converting. `export html` accepts `--no-include-code`; `export script` does not forward notebook arguments.

## Examples

### Example 1: Convert a Jupyter exploration into a reviewable notebook

**Request:** "Our `01-exploration.ipynb` for the churn model is 4 MB of outputs and unreviewable. Move it to marimo and make sure it still runs."

```bash
marimo convert notebooks/01-exploration.ipynb -o notebooks/exploration.py
marimo check --fix notebooks/exploration.py
python notebooks/exploration.py
```

**Result:** `exploration.py` is a few KB of plain Python. the converter renames names assigned in two cells (the second `df` becomes `df_1`), `marimo check` exits 0 once no name is defined in more than one cell, and `python notebooks/exploration.py` exits with code 0. Review cells that modify a dataframe from another cell in place. Git diffs now show only code changes.

### Example 2: Share a threshold explorer as a read-only app

**Request:** "Customer success wants a page where they drag a login threshold and see which accounts fall below it. Serve it on port 2718."

```bash
marimo run notebooks/exploration.py --headless --host 127.0.0.1 --port 2718
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:2718/health
```

**Result:** the health check prints `200`; the page shows the `Min logins per month` slider, and moving it re-runs only the cells that depend on it. The source code is not sent to viewers.

### Example 3: Nightly report from the same notebook

**Request:** "Produce an HTML snapshot of the exploration for 5,000 customers every night."

```bash
marimo export html notebooks/exploration.py -o reports/exploration-2026-11-05.html -f -- --rows 5000
```

**Result:** a self-contained HTML file with the executed outputs (and the code, unless `--no-include-code` is given). When the job must fail loudly, run `python notebooks/exploration.py` first and check its exit code.

## Guidelines

- Do not document or rely on a state that survives between cells; derive everything from the dependency graph. Avoid mutating objects (lists, dataframes) created in another cell, since marimo does not track mutation.
- Keep UI elements and their `.value` reads in separate cells.
- Keep expensive loading in its own cell, optionally wrapped with `@mo.cache`, so a slider change does not reload data.
- `marimo run` and `python notebook.py` execute all code in the file. Treat a notebook from an unknown source like any script: read it first. `marimo edit` and `run` on a URL download and execute remote code; `--untrusted` runs it in Docker.
- `marimo edit` binds to 127.0.0.1 with a token by default. If you expose it with `--host 0.0.0.0`, put it behind authentication and TLS.
- `--sandbox` (uv or pixi) runs the notebook in an isolated environment from PEP 723 inline dependencies; it needs `uv` (or `pixi`) installed.
- Not the right tool when colleagues must open the file in plain Jupyter or Colab, or when a pipeline needs scheduling and retries; orchestrate those with a workflow tool and call the notebook as a script.
