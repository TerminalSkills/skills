---
name: streamlit
description: |
  Streamlit turns Python scripts into interactive web applications for data science.
  Learn to build dashboards with widgets, charts, file uploads, caching,
  multi-page apps, and deployment to Streamlit Cloud.
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
    - streamlit
    - python
    - dashboard
    - data-visualization
    - web-app
---

# Streamlit

Streamlit lets you build interactive data apps in pure Python. No HTML, CSS, or JavaScript needed — just write Python and Streamlit renders it as a web app.

## Installation

```bash
# Install Streamlit
pip install streamlit

# Run an app
streamlit run app.py
# Opens at http://localhost:8501
```

## Basic App

```python
# app.py: Simple Streamlit dashboard
import streamlit as st
import pandas as pd
import numpy as np

st.set_page_config(page_title="My Dashboard", page_icon="📊", layout="wide")

st.title("📊 Sales Dashboard")
st.markdown("Real-time overview of sales metrics")

# Sidebar filters
st.sidebar.header("Filters")
date_range = st.sidebar.date_input("Date Range", value=[])
category = st.sidebar.selectbox("Category", ["All", "Electronics", "Clothing", "Food"])

# Metrics row
col1, col2, col3, col4 = st.columns(4)
col1.metric("Total Revenue", "$125,430", "+12%")
col2.metric("Orders", "1,243", "+5%")
col3.metric("Customers", "892", "+8%")
col4.metric("Avg Order", "$100.91", "-2%")

# Sample data
df = pd.DataFrame({
    "date": pd.date_range("2026-01-01", periods=30),
    "revenue": np.random.randint(3000, 8000, 30),
    "orders": np.random.randint(20, 80, 30),
})

# Charts
st.subheader("Revenue Over Time")
st.line_chart(df.set_index("date")["revenue"])

st.subheader("Raw Data")
st.dataframe(df, use_container_width=True)
```

## Widgets

```python
# widgets.py: Interactive input widgets
import streamlit as st

# Text inputs
name = st.text_input("Your name", placeholder="Enter name...")
bio = st.text_area("Bio", max_chars=500)

# Numeric
age = st.number_input("Age", min_value=0, max_value=120, value=25)
rating = st.slider("Rating", 1, 10, 5)

# Selection
color = st.selectbox("Favorite color", ["Red", "Blue", "Green"])
languages = st.multiselect("Languages", ["Python", "JS", "Rust", "Go"])
agree = st.checkbox("I agree to terms")
option = st.radio("Plan", ["Free", "Pro", "Enterprise"])

# File upload
uploaded = st.file_uploader("Upload CSV", type=["csv"])
if uploaded:
    df = pd.read_csv(uploaded)
    st.dataframe(df)

# Button
if st.button("Submit", type="primary"):
    st.success(f"Hello, {name}!")
    st.balloons()
```

## Caching

```python
# caching.py: Cache expensive computations and data loading
import streamlit as st
import pandas as pd

@st.cache_data(ttl=3600)  # Cache for 1 hour
def load_data(url: str) -> pd.DataFrame:
    """Cached data loading — won't re-run if inputs are the same."""
    return pd.read_csv(url)

@st.cache_resource  # Cache across all users (for DB connections, ML models)
def get_database_connection():
    import sqlalchemy
    return sqlalchemy.create_engine("postgresql://user:pass@localhost/db")

@st.cache_data
def expensive_computation(data: pd.DataFrame, threshold: float) -> pd.DataFrame:
    # Only re-runs when data or threshold changes
    return data[data["score"] > threshold].groupby("category").agg("sum")

df = load_data("https://data.example.com/sales.csv")
result = expensive_computation(df, threshold=0.8)
st.dataframe(result)
```

## Charts and Visualization

```python
# charts.py: Various chart types in Streamlit
import streamlit as st
import pandas as pd
import plotly.express as px

df = pd.DataFrame({"x": range(50), "y": [i**2 for i in range(50)]})

# Built-in charts
st.line_chart(df.set_index("x"))
st.bar_chart(df.set_index("x"))
st.area_chart(df.set_index("x"))

# Plotly (interactive)
fig = px.scatter(df, x="x", y="y", title="Scatter Plot")
st.plotly_chart(fig, use_container_width=True)

# Map
map_data = pd.DataFrame({
    "lat": [40.7128, 51.5074, 48.8566],
    "lon": [-74.0060, -0.1278, 2.3522],
})
st.map(map_data)
```

## Multi-Page App

```text
Project structure for multi-page apps:

app.py              # Main entry point
pages/
├── 1_📊_Dashboard.py
├── 2_📈_Analytics.py
└── 3_⚙️_Settings.py
```

```python
# app.py: Main page with navigation
import streamlit as st

st.set_page_config(page_title="My App", layout="wide")
st.title("Welcome to My App")
st.markdown("Use the sidebar to navigate between pages.")
```

```python
# pages/1_📊_Dashboard.py: Dashboard page (auto-detected by Streamlit)
import streamlit as st

st.title("📊 Dashboard")
st.write("Dashboard content here...")
```

## Session State

```python
# state.py: Persist data across reruns with session state
import streamlit as st

# Initialize state
if "counter" not in st.session_state:
    st.session_state.counter = 0
    st.session_state.items = []

col1, col2 = st.columns(2)
if col1.button("Increment"):
    st.session_state.counter += 1
if col2.button("Reset"):
    st.session_state.counter = 0

st.write(f"Counter: {st.session_state.counter}")

# Form with state
with st.form("add_item"):
    item = st.text_input("Item name")
    if st.form_submit_button("Add"):
        st.session_state.items.append(item)

st.write("Items:", st.session_state.items)
```

## Deployment

```bash
# deploy.sh: Deploy to Streamlit Cloud or self-host
# Requirements file
pip freeze > requirements.txt

# Streamlit Cloud: Push to GitHub, connect at share.streamlit.io

# Docker deployment
cat > Dockerfile << 'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
EOF

docker build -t my-streamlit-app .
docker run -p 8501:8501 my-streamlit-app
```
