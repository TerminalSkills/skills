---
title: "Build MCP Tools That Give AI Agents Direct Database Access"
slug: build-mcp-tools-for-ai-data-access
description: "Create MCP servers that let AI agents query your databases and APIs directly, replacing manual data lookups with natural language tool calls."
skills:
  - mcp-server-builder
  - langchain
category: data-ai
tags:
  - mcp
  - langchain
  - ai-agents
  - database
  - tool-integration
---

# Build MCP Tools That Give AI Agents Direct Database Access

## The Problem

A product analytics team spends 40% of their time answering ad-hoc data questions from other departments. "How many users signed up last week?" "What is the conversion rate for the new pricing page?" "Which customers are on the enterprise plan but haven't used feature X?" Each question requires writing a SQL query, running it, formatting the results, and sending them in Slack. The analysts want to give everyone access to answers through their AI assistant (Claude Desktop, Cursor, or similar), but the data lives in PostgreSQL, a REST API, and a metrics service -- and AI agents cannot access any of them without custom tooling.

## The Solution

Using the **mcp-server-builder** and **langchain** skills, the workflow builds an MCP server that exposes database queries and API calls as structured tools that AI agents can invoke directly, then wraps them with a LangChain retrieval layer that translates natural language questions into the right tool calls with proper parameters.

## Step-by-Step Walkthrough

### 1. Build the MCP server with data access tools

Create an MCP server that exposes three tools: one for running safe read-only SQL queries, one for querying the metrics API, and one for looking up customer details.

> Build an MCP server in TypeScript with three tools. First: "query-analytics" that accepts a SQL query string, validates it is a SELECT statement (reject INSERT/UPDATE/DELETE), runs it against a read-only PostgreSQL replica, and returns results as a JSON table with column names and rows. Second: "get-metric" that accepts a metric name, date range, and optional segment, and calls the internal metrics API to return time-series data. Third: "customer-lookup" that accepts an email or company name and returns the customer record with plan, usage stats, and feature flags. Add input validation with Zod and rate limiting (10 queries per minute per tool).

The read-only validation is critical for safety. The MCP server connects to a PostgreSQL read replica so even if validation is bypassed, no data can be modified. Rate limiting prevents an enthusiastic agent from running 1,000 queries in a loop.

### 2. Add natural language query translation with LangChain

Build a LangChain chain that converts natural language questions into structured tool calls so users do not need to know SQL or API parameters.

> Create a LangChain chain that takes a natural language question about product analytics and translates it into the correct MCP tool call. Use a few-shot prompt with 10 example question-to-tool mappings. For SQL questions, generate the query using the database schema (provide the schema as context). For metric questions, map common terms to metric names ("signups" maps to "user.registration.completed", "conversion rate" maps to "funnel.step.completion"). Include a validation step that checks the generated SQL against the schema before executing.

The LangChain layer acts as a translator between human intent and structured tool calls. Instead of asking "run this SQL," a product manager can ask "how many enterprise customers used the export feature last month?" and the chain generates the correct tool call with proper date ranges and filters.

### 3. Test tool calls with realistic queries

Verify that the MCP tools handle real-world queries correctly, including edge cases and ambiguous questions.

> Test the MCP tools with these 10 real questions that our team gets weekly: "How many users signed up last week?", "What is the trial-to-paid conversion rate this month?", "Which enterprise customers have not logged in for 30 days?", "What are the top 5 most-used features?", "How does this month's revenue compare to last month?", "Show me the signup trend for the last 90 days", "Which pricing plan has the highest churn?", "How many support tickets did we get yesterday?", "What percentage of users completed onboarding?", "List all customers on the legacy plan." Verify each returns correct, well-formatted results.

Testing with real questions reveals gaps in the few-shot examples and schema mapping. "Support tickets" might not map to any existing metric, revealing that the metrics API does not cover support data -- a gap the team did not realize existed until they tried to automate the queries.

### 4. Deploy and configure for AI assistants

Package the MCP server for use with Claude Desktop and other AI assistants, with authentication and logging.

> Add bearer token authentication to the MCP server. Create a Claude Desktop configuration that connects to the server. Add query logging that records every tool call with the original question, generated query, execution time, and row count returned. Set up a weekly digest that shows the most common questions asked through the tool so the team knows what data needs are most frequent.

The query log doubles as a requirements document. After a month of use, the top 20 most-asked questions reveal which dashboards the company actually needs to build -- data that was invisible when analysts were answering questions individually in Slack.

## Real-World Example

A 45-person SaaS company deployed an MCP analytics server connected to their PostgreSQL database and metrics API. Within the first week, 12 team members across product, marketing, and customer success connected it to Claude Desktop. The number of ad-hoc data requests in the analytics Slack channel dropped by 68% in the first month. Product managers who used to wait 2-4 hours for an analyst to answer a question now got answers in under 10 seconds. The query log revealed that "churn by plan" was asked 34 times in the first month -- leading the team to build a dedicated churn dashboard that eliminated the question entirely. The two analysts reclaimed roughly 16 hours per week, which they redirected toward building predictive models instead of answering repetitive data questions.
