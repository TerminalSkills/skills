---
name: mkdocs
description: >-
  Build documentation sites with MkDocs and Material for MkDocs. Use when a user asks to create project documentation, configure MkDocs themes, add search and navigation, deploy docs to GitHub Pages, or customize Markdown extensions.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["documentation", "python", "static-site", "material-theme", "markdown"]
---
# MkDocs — Python Documentation Generator

## Overview

You are an expert in MkDocs with the Material theme, the Python-powered documentation site generator. You help developers build documentation from Markdown with auto-navigation, search, versioning, and Material Design styling. MkDocs Material is the most popular documentation theme on GitHub, used by FastAPI, Pydantic, and hundreds of open-source projects.

## Instructions

### Setup

```bash
pip install mkdocs-material
mkdocs new my-docs && cd my-docs
mkdocs serve                           # Live preview at localhost:8000
mkdocs build                           # Generate static site
```

### Configuration

```yaml
# mkdocs.yml — Full configuration
site_name: My SDK Documentation
site_url: https://docs.example.com
repo_url: https://github.com/org/repo
repo_name: org/repo

theme:
  name: material
  palette:
    - scheme: default
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-7
        name: Switch to dark mode
    - scheme: slate
      primary: indigo
      accent: indigo
      toggle:
        icon: material/brightness-4
        name: Switch to light mode
  features:
    - navigation.instant           # SPA-like navigation
    - navigation.tracking          # URL updates as you scroll
    - navigation.tabs              # Top-level tabs
    - navigation.sections          # Group sidebar items
    - navigation.expand            # Auto-expand sidebar sections
    - navigation.top               # Back to top button
    - search.suggest               # Search suggestions
    - search.highlight             # Highlight search terms
    - content.code.copy            # Copy button on code blocks
    - content.code.annotate        # Code annotations
    - content.tabs.link            # Linked content tabs
    - announce.dismiss             # Dismissible announcements

plugins:
  - search
  - tags
  - social                          # Auto-generate social cards

markdown_extensions:
  - admonition                     # Callout boxes
  - pymdownx.details               # Collapsible callouts
  - pymdownx.superfences           # Nested code blocks, Mermaid
  - pymdownx.tabbed:
      alternate_style: true        # Content tabs
  - pymdownx.highlight:
      anchor_linenums: true
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
  - attr_list
  - md_in_html
  - toc:
      permalink: true

nav:
  - Home: index.md
  - Getting Started:
    - Installation: guide/installation.md
    - Quick Start: guide/quickstart.md
    - Configuration: guide/configuration.md
  - API Reference:
    - Client: api/client.md
    - Authentication: api/auth.md
  - Changelog: changelog.md
```

### Markdown Features (Material Theme)

```markdown
## Admonitions (Callout Boxes)

!!! note "Custom Title"
    This is a note with a custom title.

!!! warning
    This is a warning. Pay attention.

!!! tip "Pro Tip"
    Use admonitions to highlight important information.

!!! danger "Breaking Change"
    This API is deprecated and will be removed in v3.0.

??? info "Click to expand"
    This is a collapsible admonition.

## Content Tabs

=== "Python"

    ```python
    import my_sdk
    client = my_sdk.Client(api_key="xxx")
    ```

=== "JavaScript"

    ```javascript
    import { Client } from "my-sdk";
    const client = new Client({ apiKey: "xxx" });
    ```

=== "cURL"

    ```bash
    curl -H "Authorization: Bearer xxx" https://api.example.com/v1/users
    ```

## Code Annotations

```python
client = Client(
    api_key="xxx",        # (1)!
    timeout=30,           # (2)!
    retry=True,           # (3)!
)
```

1. Get your API key from the dashboard
2. Timeout in seconds. Default is 60.
3. Automatically retry on 429 and 5xx errors
```

## Installation

```bash
pip install mkdocs-material
```

## Examples

**Example 1: User asks to set up mkdocs**

User: "Help me set up mkdocs for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure mkdocs
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with mkdocs**

User: "Create a dashboard using mkdocs"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Material theme** — Always use `mkdocs-material`; the default theme is functional but Material is beautiful and feature-rich
2. **Code annotations** — Use code annotations `(1)!` for inline explanations; cleaner than long comments
3. **Content tabs** — Show examples in multiple languages side by side; users pick their stack
4. **Admonitions for callouts** — Use `!!! note/warning/tip/danger` for important information; more visible than bold text
5. **Auto-generate API docs** — Use `mkdocstrings` plugin to generate API reference from Python docstrings
6. **Versioning** — Use `mike` for versioned documentation; readers can switch between v1.0, v2.0, latest
7. **Social cards** — Enable the social plugin for auto-generated Open Graph images; looks great on Twitter/Slack
8. **GitHub Pages deployment** — `mkdocs gh-deploy` pushes to GitHub Pages in one command; add to CI for auto-deploy on merge
