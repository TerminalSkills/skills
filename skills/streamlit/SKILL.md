---
name: streamlit
description: >-
  Streamlit is a Python framework that turns a script into an interactive web app. Use it to build data dashboards, ML model demos, chat interfaces and internal tools in pure Python, with no frontend code. Triggers: "build a Streamlit app", "dashboard in Python", "st.cache_data", "streamlit run", "deploy a Streamlit app".
license: Apache-2.0
compatibility: "Python 3.11+ (Streamlit 1.66), pip"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/streamlit/streamlit
  category: data-ai
  tags:
  - dashboards
  - python
  - data-apps
  - visualization
  - prototyping
---

# Streamlit — Python Data Apps


## Overview


Streamlit reruns your Python script top to bottom on every widget interaction and renders the elements it calls (`st.title`, `st.dataframe`, `st.plotly_chart`, ...). State that must survive a rerun lives in `st.session_state`; expensive work is cached with `st.cache_data` and `st.cache_resource`. Current release: 1.66.x (Python 3.11 or newer).


## Instructions

Install and run (use a virtual environment):

```bash
python3 -m venv .venv && .venv/bin/pip install streamlit pandas plotly pyarrow
.venv/bin/streamlit run app.py        # serves on http://localhost:8501
```

### Basic App Structure

```python
# app.py: sales dashboard over data/sales.parquet
import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(page_title="Sales Dashboard", page_icon="📊", layout="wide")  # first st call
st.title("Sales Dashboard")

with st.sidebar:
    start = st.date_input("From", value=pd.Timestamp("2026-01-01"))
    end = st.date_input("To", value=pd.Timestamp("2026-03-31"))
    regions = st.multiselect(
        "Regions",
        ["North America", "Europe", "Asia Pacific", "Latin America"],
        default=["North America", "Europe"],
    )
    min_revenue = st.slider("Minimum revenue", 0, 10000, 0, step=100)

@st.cache_data(ttl=600)                    # cache for 10 minutes
def load_data() -> pd.DataFrame:
    return pd.read_parquet("data/sales.parquet")

df = load_data()
filtered = df[
    df["date"].between(pd.Timestamp(start), pd.Timestamp(end))   # date_input returns date, not Timestamp
    & df["region"].isin(regions)
    & (df["revenue"] >= min_revenue)
]

c1, c2, c3 = st.columns(3)
c1.metric("Total revenue", f"${filtered['revenue'].sum():,.0f}")
c2.metric("Orders", f"{len(filtered):,}")
c3.metric("Unique customers", f"{filtered['customer_id'].nunique():,}")

trends, data = st.tabs(["Trends", "Data"])
with trends:
    monthly = (
        filtered.groupby(filtered["date"].dt.to_period("M").dt.to_timestamp())["revenue"]
        .sum().reset_index()
    )
    st.plotly_chart(px.line(monthly, x="date", y="revenue"), width="stretch")
with data:
    st.dataframe(
        filtered.head(100),
        width="stretch",
        column_config={
            "revenue": st.column_config.NumberColumn("Revenue", format="$%.2f"),
            "date": st.column_config.DateColumn("Date"),
        },
    )
```

`width="stretch"` replaces the old `use_container_width=True`, which is deprecated and will be removed (use `width="content"` for the opposite).

### Forms and User Input

Widgets outside a form rerun the script on every change; `st.form` batches them until the submit button is pressed.

```python
# pages/feedback.py
import streamlit as st

st.title("Customer Feedback")

with st.form("feedback_form", clear_on_submit=True):
    name = st.text_input("Your name")
    email = st.text_input("Email")
    category = st.selectbox("Category", ["Bug", "Feature request", "General"])
    rating = st.slider("Satisfaction (1-10)", 1, 10, 5)
    feedback = st.text_area("Your feedback", height=150)
    screenshot = st.file_uploader("Screenshot", type=["png", "jpg"])
    submitted = st.form_submit_button("Submit")

if submitted:
    if not name or not email:
        st.error("Name and email are required.")
    else:
        save_feedback(name, email, category, rating, feedback, screenshot)  # your own function
        st.success("Thank you for your feedback!")
```

### Caching and Session State

```python
import joblib
import pandas as pd
import streamlit as st
from sqlalchemy import create_engine

@st.cache_data(ttl=3600)                   # return values are pickled; each caller gets a copy
def load_large_dataset(path: str) -> pd.DataFrame:
    df = pd.read_parquet(path)
    df["month"] = df["date"].dt.to_period("M")
    return df

@st.cache_resource                         # one shared object for all sessions, not copied
def get_engine():
    return create_engine(st.secrets["database"]["url"])

@st.cache_resource
def load_model():
    return joblib.load("models/classifier.joblib")   # only load files you produced yourself

if "cart" not in st.session_state:         # per-user, per-browser-tab state
    st.session_state.cart = []
```

Pass hash-unfriendly arguments (connections, clients) with a leading underscore (`_engine`) so `st.cache_data` skips hashing them.

### Chat Interface

```python
# pages/chat.py: any model provider works; answer_stream yields text chunks
import streamlit as st

st.title("Support assistant")

if "messages" not in st.session_state:
    st.session_state.messages = []

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if prompt := st.chat_input("Ask about your order"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)
    with st.chat_message("assistant"):
        reply = st.write_stream(answer_stream(st.session_state.messages))  # generator of str
    st.session_state.messages.append({"role": "assistant", "content": reply})
```

`st.write_stream` accepts a generator, or an OpenAI/LangChain stream object, and returns the full text. Read API keys from `st.secrets` (`.streamlit/secrets.toml`, never committed) and pick the model name from the provider's current model list.

### Multi-page apps

Either put files in a `pages/` directory next to the entry script, or define navigation explicitly:

```python
# app.py
import streamlit as st

pg = st.navigation([
    st.Page("dashboard.py", title="Dashboard", icon="📊"),
    st.Page("chat.py", title="Assistant", icon="💬"),
])
pg.run()
```

### Testing without a browser

```python
from streamlit.testing.v1 import AppTest

at = AppTest.from_file("app.py", default_timeout=30).run()
assert not at.exception
at.slider[0].set_value(500).run()
print([m.value for m in at.metric])
```

### Deployment

```bash
streamlit run app.py --server.port 8501     # local
```

Streamlit Community Cloud: push the repo to GitHub, then connect it at share.streamlit.io and pick the entry file. Docker:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

Binding to `0.0.0.0` is needed inside a container; publish the port to the outside only behind an authenticating reverse proxy, because Streamlit has no built-in login for self-hosted apps (`st.login` exists for OIDC providers).

```toml
# .streamlit/config.toml
[theme]
primaryColor = "#6366f1"
backgroundColor = "#0e1117"
secondaryBackgroundColor = "#1e1e2e"
textColor = "#ffffff"

[server]
maxUploadSize = 200    # MB, default 200
```

Leave `server.enableXsrfProtection` and `server.enableCORS` at their defaults (both true).

## Examples

### Example 1: Dashboard from a CSV

**User request:**

```
I have orders.csv with date, region and revenue columns. Make a Streamlit dashboard with region filters and a monthly revenue chart.
```

The agent creates `app.py` as above with `pd.read_csv("orders.csv", parse_dates=["date"])` inside a `@st.cache_data` loader, a sidebar multiselect for regions, three `st.metric` tiles and a Plotly line chart, then runs `streamlit run app.py`. Result: the app opens at http://localhost:8501, and changing a filter updates the tiles and chart without a page reload.

### Example 2: Chatbot with kept history

**User request:**

```
Add a chat page to my app that streams answers from our model and remembers the conversation.
```

The agent adds `pages/chat.py` using `st.chat_input`, `st.chat_message`, `st.write_stream` and `st.session_state.messages`, with the provider key read from `st.secrets["LLM_API_KEY"]`. Result: each reply streams token by token and the history survives reruns within the same browser session (a page refresh starts a new session).

### Example 3: Checking a change without a browser

**User request:**

```
Make sure the dashboard still renders after my edit.
```

The agent runs the `AppTest` snippet above in the project's virtualenv, asserts `at.exception` is empty, and prints the metric values.

## Guidelines

1. **Cache expensive work**: `@st.cache_data` for dataframes and query results, `@st.cache_resource` for connections and models; set a `ttl` for data that changes.
2. **Never put per-user data in a cached function's closure or in `cache_resource` objects**: they are shared across all sessions.
3. **`st.set_page_config` must be the first Streamlit call** in the entry script.
4. **Keep the script fast**: it reruns on every interaction; use `st.form` or `@st.fragment` to limit reruns.
5. **Use `width="stretch"`** on charts and dataframes, not the deprecated `use_container_width`.
6. **Secrets** go in `.streamlit/secrets.toml` (add it to `.gitignore`) or the Community Cloud secrets panel; read them with `st.secrets`.
7. **Unpickling is code execution**: do not `joblib.load` or `pickle.load` files from untrusted users.
8. **Not for**: multi-user apps with complex auth, or UIs needing fine-grained layout control; use a web framework there.
