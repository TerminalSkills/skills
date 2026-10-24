---
name: jupyter
description: >-
  Assists with interactive data analysis, visualization, and reproducible research using
  Jupyter notebooks. Use when building notebooks that combine code with rich output,
  managing kernels, converting to reports, or parameterizing notebooks for batch execution.
  Trigger words: jupyter, notebook, jupyterlab, ipynb, nbconvert, papermill.
license: Apache-2.0
compatibility: "Requires Python 3.10+ (JupyterLab 4.6, Notebook 7.6, papermill 2.7); nbconvert 7.17 and jupytext 1.19 run on 3.9+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["jupyter", "notebook", "data-analysis", "visualization", "research"]
  repository: https://github.com/jupyterlab/jupyterlab
---

# Jupyter

## Overview

Jupyter is an interactive computing platform that combines code execution, rich output (tables, plots, widgets), and narrative text in notebook documents. It supports multiple kernels (Python, R, Julia), integrates with matplotlib, plotly, and ipywidgets for visualization, and enables reproducible research through nbconvert for report generation and papermill for parameterized batch execution.

## Instructions

- When installing, put JupyterLab in a virtual environment and start it with `jupyter lab`:

```bash
python -m venv .venv && .venv/bin/pip install jupyterlab   # or: uv pip install jupyterlab
.venv/bin/jupyter lab
```

The classic interface is `jupyter notebook` (Notebook 7 is built on the same JupyterLab 4 components). Run `jupyter kernelspec list` to see the registered kernels.
- When building notebooks, organize cells with a clear flow: imports, data loading, exploration, analysis, and conclusions, using Markdown cells for narrative context between code cells. In current IPython, inline plotting is the default for matplotlib, so `%matplotlib inline` is rarely needed.
- When sharing notebooks, restart the kernel and "Run All" to ensure cells execute in order. Convert with `jupyter nbconvert --to html --no-input report.ipynb` (hides code for non-technical readers); add `--execute` to run the notebook first and `--to slides` for a reveal.js deck. `--to pdf` needs a LaTeX install; `--to webpdf` needs `pip install "nbconvert[webpdf]"` and a Chromium: install one, or add `--allow-chromium-download` to let nbconvert fetch it.
- When managing environments, register a kernel from the environment with `python -m ipykernel install --user --name=sales-env` (the venv needs `ipykernel`), and pin dependencies with `%pip install pandas==2.3.3` in the first cell. Use `%pip`, not `!pip`, so the package lands in the kernel's environment.
- When developing iteratively, run `%load_ext autoreload` then `%autoreload 2` to reload imported modules on change, and move proven code into `.py` modules.
- When version controlling, pair notebooks with text using `jupytext --set-formats ipynb,py:percent report.ipynb` (then `jupytext --sync report.ipynb` after editing either file), or strip outputs at commit time with `nbstripout --install` inside the repository.
- When running in production, parameterize with papermill: tag one cell `parameters` (JupyterLab: open the property inspector in the right sidebar and add the tag) holding defaults, then run `papermill in.ipynb out.ipynb -p start_date 2026-10-19 -p region US`. Papermill injects a new cell after the tagged one. It needs the notebook to name a kernel; if the notebook has none (for example one made from a `.py` file), pass `-k sales-env` or create it with `jupytext --to ipynb --set-kernel sales-env weekly.py`, otherwise it fails with "No language found in notebook".

## Examples

### Example 1: Build an exploratory data analysis notebook

**User request:** "Create a Jupyter notebook for EDA on a customer dataset"

**Actions:** in the first cells of `customers_eda.ipynb`:

```python
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_parquet("data/customers.parquet")
df.info()
display(df.describe(include="all").T)
print(df.isna().mean().sort_values(ascending=False).head(10))  # share of missing values
df.plot.hist(column="lifetime_value", bins=40)
plt.show()
```

Then add Markdown cells with the findings between the analysis sections.

**Output:** A well-structured EDA notebook with statistics, visualizations, and narrative ready for sharing.

### Example 2: Automate weekly reports with papermill

**User request:** "Generate weekly sales reports from the same notebook with different date parameters"

**Actions:**
1. Create `weekly_sales.ipynb` with a cell tagged `parameters` that sets `start_date = "2026-01-05"` and `region = "EU"`
2. Run the notebook once per week and region, then convert it:

```bash
papermill weekly_sales.ipynb runs/2026-10-19-US.ipynb -p start_date 2026-10-19 -p region US
jupyter nbconvert --to html --no-input runs/2026-10-19-US.ipynb
```

3. Schedule the commands with cron or a CI pipeline

**Output:** `runs/2026-10-19-US.html` contains the executed report with the new parameters and no code cells (papermill prints "Executing: 100%" while it runs).

## Guidelines

- Restart kernel and "Run All" before sharing to ensure cells execute reliably in order.
- Use `jupytext` for Git since `.py` files diff cleanly while `.ipynb` outputs pollute version control.
- Pin environment dependencies in the first cell for reproducibility, and never commit notebooks that print secrets: read keys from environment variables (`os.environ["WAREHOUSE_PASSWORD"]`).
- Do not expose `jupyter lab` on a public interface; it executes arbitrary code. Keep the default localhost binding and token, and use SSH port forwarding for remote machines.
- Use `papermill` for batch execution with parameters instead of manual re-runs.
- Split exploration from production: explore in notebooks, extract proven code to Python modules.
- Keep notebooks under 200 cells; split large analyses into multiple focused notebooks.
