---
name: streamlit
description: Expert guidance for Streamlit, the Python framework for building interactive data applications and dashboards. Helps developers create web apps for data exploration, ML model demos, and internal tools using pure Python — no frontend skills required.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
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


Streamlit, the Python framework for building interactive data applications and dashboards. Helps developers create web apps for data exploration, ML model demos, and internal tools using pure Python — no frontend skills required.


## Instructions

### Basic App Structure

```python
# app.py — Complete Streamlit data dashboard
import streamlit as st
import pandas as pd
import plotly.express as px

st.set_page_config(
    page_title="Sales Dashboard",
    page_icon="📊",
    layout="wide",
)

st.title("📊 Sales Dashboard")
st.markdown("Real-time view of sales performance across all regions.")

# Sidebar filters
with st.sidebar:
    st.header("Filters")
    date_range = st.date_input(
        "Date Range",
        value=(pd.Timestamp("2026-01-01"), pd.Timestamp("2026-03-01")),
    )
    regions = st.multiselect(
        "Regions",
        ["North America", "Europe", "Asia Pacific", "Latin America"],
        default=["North America", "Europe"],
    )
    min_revenue = st.slider("Minimum Revenue", 0, 10000, 0, step=100)

# Load and filter data
@st.cache_data(ttl=600)                    # Cache for 10 minutes
def load_data():
    return pd.read_parquet("data/sales.parquet")

df = load_data()
filtered = df[
    (df["date"].between(*date_range)) &
    (df["region"].isin(regions)) &
    (df["revenue"] >= min_revenue)
]

# KPI metrics row
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Total Revenue", f"${filtered['revenue'].sum():,.0f}",
              delta=f"{filtered['revenue'].pct_change().mean():.1%}")
with col2:
    st.metric("Orders", f"{len(filtered):,}")
with col3:
    st.metric("Avg Order Value", f"${filtered['revenue'].mean():,.2f}")
with col4:
    st.metric("Unique Customers", f"{filtered['customer_id'].nunique():,}")

# Charts
tab1, tab2, tab3 = st.tabs(["📈 Trends", "🗺️ Regions", "📋 Data"])

with tab1:
    monthly = filtered.groupby(filtered["date"].dt.to_period("M")).agg(
        revenue=("revenue", "sum"),
        orders=("order_id", "count"),
    ).reset_index()
    monthly["date"] = monthly["date"].dt.to_timestamp()

    fig = px.line(monthly, x="date", y="revenue",
                  title="Monthly Revenue Trend",
                  labels={"revenue": "Revenue ($)", "date": "Month"})
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    by_region = filtered.groupby("region")["revenue"].sum().reset_index()
    fig = px.bar(by_region, x="region", y="revenue",
                 title="Revenue by Region", color="region")
    st.plotly_chart(fig, use_container_width=True)

with tab3:
    st.dataframe(
        filtered.head(100),
        use_container_width=True,
        column_config={
            "revenue": st.column_config.NumberColumn("Revenue", format="$%.2f"),
            "date": st.column_config.DateColumn("Date"),
        },
    )
```

### Forms and User Input

```python
# pages/submit_feedback.py — Multi-page app with form input
import streamlit as st

st.title("📝 Customer Feedback")

with st.form("feedback_form"):
    name = st.text_input("Your Name")
    email = st.text_input("Email")
    category = st.selectbox("Category", ["Bug", "Feature Request", "General"])
    rating = st.slider("Satisfaction (1-10)", 1, 10, 5)
    feedback = st.text_area("Your Feedback", height=150)
    file = st.file_uploader("Attach Screenshot", type=["png", "jpg"])

    submitted = st.form_submit_button("Submit Feedback")

    if submitted:
        if not name or not email:
            st.error("Please fill in all required fields.")
        else:
            # Save to database
            save_feedback(name, email, category, rating, feedback, file)
            st.success("✅ Thank you for your feedback!")
            st.balloons()
```

### Caching and Performance

```python
# Caching strategies for fast dashboards
import streamlit as st

# Cache data loading (survives reruns, clears on TTL or input change)
@st.cache_data(ttl=3600)                    # 1-hour cache
def load_large_dataset(path: str) -> pd.DataFrame:
    """Load and preprocess a large dataset.
    Cached result is serialized — safe for DataFrames."""
    df = pd.read_parquet(path)
    df["month"] = df["date"].dt.to_period("M")
    return df

# Cache resource objects (database connections, ML models)
@st.cache_resource                           # Persists across all users/sessions
def get_db_connection():
    """Create a shared database connection.
    Cached as a resource — not serialized, shared by reference."""
    return create_engine(st.secrets["database"]["url"])

@st.cache_resource
def load_ml_model():
    """Load a trained ML model (shared across all sessions)."""
    import joblib
    return joblib.load("models/classifier.pkl")

# Session state for per-user data
if "cart" not in st.session_state:
    st.session_state.cart = []

def add_to_cart(item):
    st.session_state.cart.append(item)
```

### Chat Interface

```python
# pages/ai_chat.py — AI chatbot interface
import streamlit as st
from openai import OpenAI

st.title("🤖 AI Assistant")

client = OpenAI(api_key=st.secrets["openai"]["api_key"])

# Initialize chat history in session state
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Chat input
if prompt := st.chat_input("Ask me anything..."):
    # Add user message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # Generate AI response
    with st.chat_message("assistant"):
        stream = client.chat.completions.create(
            model="gpt-4o",
            messages=st.session_state.messages,
            stream=True,
        )
        response = st.write_stream(stream)

    st.session_state.messages.append({"role": "assistant", "content": response})
```

### Deployment

```bash
# Run locally
streamlit run app.py

# Deploy to Streamlit Community Cloud (free)
# 1. Push to GitHub
# 2. Go to share.streamlit.io
# 3. Connect repo → Deploy

# Deploy with Docker
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

```toml
# .streamlit/config.toml — Streamlit configuration
[theme]
primaryColor = "#6366f1"
backgroundColor = "#0e1117"
secondaryBackgroundColor = "#1e1e2e"
textColor = "#ffffff"

[server]
maxUploadSize = 200    # MB
enableCORS = false
```


## Examples


### Example 1: Setting up an evaluation pipeline for a RAG application

**User request:**

```
I have a RAG chatbot that answers questions from our docs. Set up Streamlit to evaluate answer quality.
```

The agent creates an evaluation suite with appropriate metrics (faithfulness, relevance, answer correctness), configures test datasets from real user questions, runs baseline evaluations, and sets up CI integration so evaluations run on every prompt or retrieval change.

### Example 2: Comparing model performance across prompts

**User request:**

```
We're testing GPT-4o vs Claude on our customer support prompts. Set up a comparison with Streamlit.
```

The agent creates a structured experiment with the existing prompt set, configures both model providers, defines scoring criteria specific to customer support (accuracy, tone, completeness), runs the comparison, and generates a summary report with statistical significance indicators.


## Guidelines

1. **Cache everything expensive** — Use `@st.cache_data` for data, `@st.cache_resource` for connections and models
2. **Wide layout for dashboards** — Set `layout="wide"` in `set_page_config` for data-heavy pages
3. **Sidebar for filters** — Keep filters in `st.sidebar`; main area for results and visualizations
4. **Columns for KPIs** — Use `st.columns(4)` with `st.metric()` for a dashboard-style KPI row
5. **Tabs for sections** — Use `st.tabs()` instead of scrolling; organize related content together
6. **Session state for interactivity** — Use `st.session_state` for per-user data (carts, selections, chat history)
7. **Secrets management** — Use `.streamlit/secrets.toml` locally; Streamlit Cloud manages secrets in the dashboard
8. **Multi-page apps** — Create a `pages/` directory; each Python file becomes a sidebar navigation item
