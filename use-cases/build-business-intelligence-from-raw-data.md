---
title: "Build Business Intelligence from Raw Data"
slug: build-business-intelligence-from-raw-data
description: "Transform raw CSV and Excel data into actionable business intelligence with automated analysis, visualization-ready datasets, and executive summary reports."
skills:
  - data-analysis
  - excel-processor
  - report-generator
category: data-ai
tags:
  - business-intelligence
  - data-analysis
  - reporting
  - dashboards
---

# Build Business Intelligence from Raw Data

## The Problem

A director of operations at a 150-person e-commerce company receives monthly data exports from 5 systems: Shopify (orders and revenue), Google Analytics (traffic and conversion), Mailchimp (email campaign performance), the warehouse management system (inventory and fulfillment), and the customer service platform (support tickets and resolution times).

Each export is a CSV or Excel file with different column formats, date conventions, and granularity. The director spends the first week of every month manually merging these files in Excel, creating pivot tables, and building charts for the executive team. By the time the insights reach decision-makers, the data is 10 days old. Last quarter, a product return spike was only detected 12 days after it started because the data pipeline could not keep up with the analysis demand.

## The Solution

Use the **excel-processor** skill to ingest and normalize multi-source data files, the **data-analysis** skill to identify trends, anomalies, and correlations across the merged dataset, and the **report-generator** skill to produce formatted executive reports with key findings and recommendations.

## Step-by-Step Walkthrough

### 1. Ingest and normalize the monthly data exports

Process all 5 source files into a consistent, analysis-ready format:

> Process these 5 monthly data exports for January 2026. Shopify export (orders.csv, 14,200 rows): normalize dates from M/D/YYYY to YYYY-MM-DD, convert currency strings to numbers, and split the "customer_location" field into city, state, and country columns. Google Analytics export (traffic.xlsx): map "Session duration" from "HH:MM:SS" strings to seconds, rename "Source / Medium" to "traffic_source". Mailchimp export (campaigns.csv): parse "Open Rate" and "Click Rate" from percentage strings to decimals. Warehouse export (fulfillment.xlsx): standardize SKU format from mixed "SKU-001" and "SKU001" to a consistent "SKU-001" pattern. Support tickets (tickets.csv): convert "Created At" timestamps from UTC to Eastern time zone. Validate row counts match expected ranges and flag any empty required fields.

Date and format normalization sounds trivial but consumes most of the manual effort. When five systems use five date formats and three currency conventions, the normalization step is the difference between a clean analysis and a week of debugging broken pivot tables.

### 2. Merge datasets and create unified customer view

Join the normalized data to enable cross-system analysis:

> Merge the 5 normalized datasets using these join keys: Shopify orders to GA traffic by session ID (where available) and by date for aggregate metrics, Shopify customer emails to Mailchimp subscriber records, Shopify order IDs to warehouse fulfillment records, and Shopify customer emails to support ticket customer fields. Create a unified customer-level view showing: total orders, lifetime revenue, average order value, first order date, most recent order date, email engagement score (opens and clicks), support tickets filed, average fulfillment time for their orders, and acquisition source from GA. Report match rates for each join and flag records that could not be linked.

Match rates reveal data quality issues. If only 60% of Shopify orders match to GA sessions, the tracking pixel might be broken on certain pages. If 15% of customer emails do not match Mailchimp records, the email list has desynchronized from the customer database.

### 3. Run automated trend and anomaly analysis

Identify the significant patterns in the merged dataset without manual exploration:

> Analyze the merged January 2026 dataset for trends and anomalies. Revenue analysis: daily revenue trend with day-of-week patterns, compare to December 2025 and January 2025, identify any days with revenue above or below 2 standard deviations from the mean. Customer analysis: cohort retention rates by month of acquisition, identify cohorts with unusually high or low repeat purchase rates, calculate customer lifetime value by acquisition channel. Operational analysis: average fulfillment time by week, correlate support ticket volume with order volume (is it proportional or growing faster?), identify product categories with the highest return rates. Marketing analysis: email campaign ROI ranked by revenue per send, traffic source conversion rates, and the correlation between email engagement and repeat purchase behavior.

Anomaly detection surfaces insights that humans miss when looking at averages. A day with revenue 2 standard deviations above the mean might be a flash sale. A week where support tickets grow 30% while orders grow only 10% indicates a product quality or fulfillment problem worth investigating.

### 4. Generate key findings with statistical backing

Distill the analysis into specific, actionable insights:

> From the January 2026 analysis, extract the top 8 findings ranked by business impact. For each finding, provide: the insight in one sentence, the supporting data point, the confidence level (based on sample size and statistical significance), and a recommended action. Expected findings to validate: whether the holiday-to-January revenue drop follows the same pattern as prior years or is steeper, which traffic source has the best 90-day customer LTV (not just first-order conversion), whether the support ticket growth rate is outpacing order growth (a quality or fulfillment problem), and which email campaign type drives the most repeat purchases within 30 days.

Ranking findings by business impact rather than statistical interest keeps the report actionable. A statistically significant finding that affects 0.5% of revenue is less useful than a directionally clear finding that affects 15% of revenue.

### 5. Produce the executive report

Format the findings into a presentation-ready report for the leadership team:

> Generate the January 2026 Monthly Business Intelligence Report. Structure: Executive Summary (5 bullet points with the most important numbers: revenue, growth rate, top finding, biggest risk, key recommendation), Revenue Dashboard (monthly trend, channel breakdown, year-over-year comparison), Customer Health (new vs returning customer split, cohort analysis, LTV trends), Operational Metrics (fulfillment speed, support ticket trends, inventory turnover), Marketing Performance (channel ROI, email effectiveness, conversion funnel), and Recommendations (3-5 specific actions with expected impact and priority). Format each section with a key metric callout, a brief narrative explanation, and a supporting data table. The report should be complete enough to stand on its own without the director presenting it.

A report that requires a presenter to explain it is incomplete. Each section should have a one-sentence narrative that tells the reader what to take away before they look at the data table.

## Real-World Example

The data lands in the shared folder on February 1st. By February 2nd, the normalized and merged dataset reveals that January revenue of $487,000 is down 18% from December but actually up 12% year-over-year, meaning the seasonal dip is smaller than expected. The anomaly detection flags January 15th as an outlier with $31,000 in revenue versus a $15,700 daily average, traced to a flash sale.

The customer analysis surfaces that Instagram-acquired customers have a 90-day LTV of $142 versus $89 for Google Ads customers, despite Google driving 3x more first orders. This single finding redirects $8,000 monthly ad spend from Google to Instagram. The support ticket analysis reveals that ticket volume grew 24% while orders grew only 12%, indicating a fulfillment quality problem concentrated in the electronics category. The executive report reaches the leadership team on February 3rd, seven days earlier than the previous manual process, and the operations director spends the recovered week acting on the findings instead of compiling them.
