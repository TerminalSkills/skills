---
title: "Create Data Visualizations with AI"
slug: create-data-visualizations
description: "Generate publication-quality charts and graphs from your data using AI-selected chart types and styling."
skill: data-visualizer
category: data-ai
tags: [visualization, charts, matplotlib, data]
---

# Create Data Visualizations with AI

## The Problem

You have the data, but presenting it clearly is a separate skill. Choosing the right chart type, formatting axes, adding labels, picking colors, and producing something that actually communicates the story in the data takes time. Most developers are not trained in data visualization, so charts end up as default Excel graphs with no labels and confusing colors.

## The Solution

Use the **data-visualizer** skill to have your AI agent generate publication-quality charts from your data. Describe what you want to show and the agent chooses the right chart type, applies clean styling, and saves a ready-to-use image.

Install the skill:

```bash
npx terminal-skills install data-visualizer
```

## Step-by-Step Walkthrough

### 1. Provide your data

```
Create a chart from sales_data.csv showing monthly revenue trend for 2024,
with a separate line for each product category.
```

### 2. The agent inspects the data

It loads the file, checks the columns, data types, and value ranges. It identifies that this is a time series with a categorical breakdown.

### 3. The right chart type is chosen

For a time series with categories, the agent selects a multi-line chart. It would choose a bar chart for category comparisons, a scatter plot for correlations, or a heatmap for matrices.

### 4. A clean chart is generated

The agent produces a matplotlib chart with:
- Descriptive title and axis labels
- Formatted axis numbers (currency, thousands separators)
- A legend for each product category
- Clean styling with removed chart junk (top/right borders, unnecessary gridlines)
- Saved at 150 DPI for clarity

### 5. Iterate on the design

```
Can you make the Electronics line red and add data labels for Q4 values?
```

The agent modifies the chart and regenerates it.

## Real-World Example

A startup founder needs to include data visualizations in their investor deck. They have raw data in CSV files but no design team. Using the data-visualizer skill:

1. "Create a line chart of monthly recurring revenue from mrr.csv"
2. "Make a bar chart comparing customer acquisition cost by channel from cac.csv"
3. "Generate a pie chart of revenue by customer segment from segments.csv" -- the agent suggests a horizontal bar chart instead because there are 12 segments, which is too many for a readable pie chart
4. The founder gets three professional charts in minutes, ready to drop into a presentation

## Related Skills

- [excel-processor](../skills/excel-processor/) -- Prepare and clean data before visualizing
- [pdf-analyzer](../skills/pdf-analyzer/) -- Extract data from PDF reports to visualize
- [sql-optimizer](../skills/sql-optimizer/) -- Query databases for the data you want to chart
