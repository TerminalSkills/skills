---
title: "Generate Documentation with AI"
slug: generate-documentation
description: "Automatically generate READMEs, API references, and guides by reading your codebase."
skill: markdown-writer
category: content
tags: [documentation, markdown, readme, api-docs]
---

# Generate Documentation with AI

## The Problem

Documentation is always the last priority and the first thing that falls out of date. Writing a good README, API reference, or how-to guide takes significant effort. Most developers would rather write code than docs. The result: new team members struggle to onboard, API consumers guess at request formats, and institutional knowledge lives only in people's heads.

## The Solution

Use the **markdown-writer** skill to have your AI agent read your codebase and generate accurate, well-structured documentation. The agent examines source code, configuration files, and existing docs to produce READMEs, API references, how-to guides, and changelogs.

Install the skill:

```bash
npx terminal-skills install markdown-writer
```

## Step-by-Step Walkthrough

### 1. Describe what you need

```
Generate a README for this project. It's a Node.js CLI tool for image conversion.
```

### 2. The agent reads your codebase

It examines package.json for metadata and dependencies, reads the main source files to understand features, checks for existing docs, and identifies the target audience.

### 3. Documentation is generated

The agent produces structured Markdown following documentation best practices:
- Clear project description
- Installation instructions
- Quick start example
- Feature documentation with code samples
- Configuration reference as a table
- Contributing guidelines

### 4. Review and refine

```
Add a "Troubleshooting" section for common errors people report in our GitHub issues.
```

The agent reads the issues and adds targeted troubleshooting guidance.

### 5. Keep docs updated

When you add a new feature, ask the agent to update the docs:

```
I added WebP support. Update the README to include it.
```

## Real-World Example

A backend team has 30 API endpoints but no documentation. New frontend developers spend their first week asking "what's the request format for X?" Using the markdown-writer skill:

1. The agent reads all route handler files and middleware
2. It generates a complete API reference with: HTTP method, path, request parameters, request body schema, response body schema, error codes, and a curl example for every endpoint
3. The output is a single API.md file organized by resource (Users, Orders, Products, etc.)
4. The team adds it to their repository and sets up a process: when a new endpoint is added, they ask the agent to update the API reference

The time to onboard a new frontend developer drops from a week to a day.

## Related Skills

- [code-reviewer](../skills/code-reviewer/) -- Review the code that the docs describe
- [api-tester](../skills/api-tester/) -- Verify that documented API examples actually work
- [git-commit-pro](../skills/git-commit-pro/) -- Commit documentation updates with clear messages
