---
name: pandas-ai
description: >-
  PandasAI lets you ask questions about pandas DataFrames and CSV files in plain
  English, using an LLM that writes and runs the analysis code. Use when a user
  wants to chat with a DataFrame, query several tables together, generate charts
  from a prompt, or run PandasAI 3 with OpenAI or a local Ollama model.
license: Apache-2.0
compatibility: 'Python 3.8-3.11 (pandasai 3.0.0 does not install on 3.12+), any OS, an LLM API key or a local Ollama model'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/sinaptik-ai/pandas-ai
  tags:
    - pandas-ai
    - pandas
    - llm
    - natural-language
    - data-analysis
---

# PandasAI

## Overview

PandasAI adds a `chat()` method to DataFrames. It sends your question and the column layout (plus a few sample rows) to an LLM, which returns Python or SQL; PandasAI runs it and gives back a string, number, DataFrame or chart. The current release is 3.0.0 (October 2025). Version 3 changed the API: the old `SmartDataframe(df, config={...})` and `from pandasai.llm import OpenAI` style still appears in tutorials, but `SmartDataframe` is deprecated and the `pandasai.llm` module only exposes the base `LLM` class. The model comes from the separate `pandasai-litellm` package. Checked against the package source and docs.pandas-ai.com/v3.

## Instructions

### Step 1: Install (Python 3.11 or older)

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install pandasai pandasai-litellm
```

`pandasai` 3.0.0 declares `python <3.12`, so on 3.12 or 3.13 pip refuses to install it; use a 3.11 environment. There are no `pandasai[openai]` or `[langchain]` extras in v3.

### Step 2: Configure an LLM once, globally

```python
import os
import pandasai as pai
from pandasai_litellm.litellm import LiteLLM

llm = LiteLLM(model="gpt-4.1-mini", api_key=os.environ["OPENAI_API_KEY"])
pai.config.set({"llm": llm, "verbose": False, "max_retries": 3})
```

LiteLLM model strings select the provider (for example `gpt-4.1-mini` or `ollama/llama3.1`; see the LiteLLM provider list). Config keys in v3 are `llm`, `save_logs`, `verbose`, `max_retries` and `file_manager`; old keys such as `enable_cache`, `conversational`, `save_charts` and `custom_whitelisted_dependencies` are gone.

### Step 3: Load data and chat

```python
df = pai.read_csv("data/companies.csv")          # or pai.DataFrame({...}), pai.read_excel(...)
response = df.chat("What is the average revenue by region?")
print(response)
print(response.last_code_executed)               # the code the LLM generated
df.follow_up("And only for 2025?")               # continues the same conversation
```

### Step 4: Several DataFrames, charts, local models

```python
employees = pai.read_csv("data/employees.csv")
departments = pai.read_csv("data/departments.csv")
pai.chat("Average salary per department name?", employees, departments)   # joins across frames

chart = df.chat("Plot a bar chart of revenue by region")
chart.save("exports/revenue_by_region.png")      # chart answers are ChartResponse objects

local = LiteLLM(model="ollama/llama3.1", api_base="http://localhost:11434")
pai.config.set({"llm": local})
```

## Examples

**Example 1: "Which country has the highest GDP in my CSV?"**

```python
import pandasai as pai
countries = pai.DataFrame({
    "country": ["USA", "UK", "France", "Germany", "Japan"],
    "gdp_billion": [25460, 3070, 2780, 4070, 4230],
})
print(countries.chat("Which country has the highest GDP?"))
```

Result: prints `USA`, and `response.last_code_executed` shows the pandas expression behind it.

**Example 2: "Compare orders against customers and chart it"**

```python
orders = pai.read_csv("data/orders.csv")
customers = pai.read_csv("data/customers.csv")
answer = pai.chat("Show total order value per customer country as a bar chart", orders, customers)
answer.save("exports/order_value_by_country.png")
```

Result: a PNG of order value per country; check the generated code before trusting the join.

## Guidelines

- The LLM sees column names and sample rows, so do not point it at tables with personal or secret data unless that provider is acceptable; use a local Ollama model when data must stay on the machine.
- By default the generated code is executed in your own Python process. Treat prompts and data as untrusted input, and pass a `Sandbox` implementation via `sandbox=` for anything exposed to other users.
- Answers can be wrong. Print `last_code_executed`, spot-check numbers against plain pandas, and do not use it where exactness matters without review.
- `df.chat()` returns analysis results, not a promise to edit the DataFrame in place; do cleaning in plain pandas when you need a reproducible pipeline.
- Keep API keys in environment variables, never in source. Small local models often fail on multi-table questions.
- For production reporting, ask the model once, then freeze the generated code as normal pandas.
