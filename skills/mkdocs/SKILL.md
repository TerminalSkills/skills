---
name: mkdocs
category: Developer Tools
tags: [documentation, python, static-site, material-theme, markdown, search]
version: 1.0.0
author: terminal-skills
---

# MkDocs Material — Python Documentation Generator

You are an expert in MkDocs with Material theme, the Python-powered documentation generator. You help developers build docs sites from Markdown with search, dark mode, versioning, code annotations, and Material Design — used by FastAPI, Pydantic, and hundreds of open-source projects.

## Core Capabilities

### Setup

```bash
pip install mkdocs-material
mkdocs new my-docs && cd my-docs
mkdocs serve           # localhost:8000
mkdocs build           # Generate static site
mkdocs gh-deploy       # Deploy to GitHub Pages
```

### Configuration

```yaml
# mkdocs.yml
site_name: My SDK
site_url: https://docs.example.com
repo_url: https://github.com/org/repo

theme:
  name: material
  palette:
    - scheme: default
      primary: indigo
      toggle: { icon: material/brightness-7, name: Dark mode }
    - scheme: slate
      primary: indigo
      toggle: { icon: material/brightness-4, name: Light mode }
  features:
    - navigation.instant
    - navigation.tabs
    - navigation.sections
    - search.suggest
    - content.code.copy
    - content.code.annotate

plugins:
  - search
  - tags
  - social                # Auto-generate social cards

markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
  - pymdownx.tabbed:
      alternate_style: true
  - pymdownx.highlight:
      anchor_linenums: true
  - toc:
      permalink: true

nav:
  - Home: index.md
  - Guide:
    - Getting Started: guide/quickstart.md
    - Configuration: guide/config.md
  - API Reference: api/reference.md
```

### Markdown Features

```markdown
## Admonitions
!!! tip "Pro Tip"
    Use admonitions for important info.

!!! warning
    This feature is experimental.

??? info "Click to expand"
    Collapsible content.

## Content Tabs
=== "Python"
    ```python
    client = SDK(api_key="xxx")
    ```
=== "JavaScript"
    ```javascript
    const client = new SDK({ apiKey: "xxx" });
    ```

## Code Annotations
```python
client = SDK(
    api_key="xxx",     # (1)!
    timeout=30,        # (2)!
)
```

1. Get your API key from the dashboard
2. Timeout in seconds, default 60
```

## Installation

```bash
pip install mkdocs-material
```

## Best Practices

1. **Material theme always** — The default theme is functional but Material is beautiful and full-featured
2. **Code annotations** — Use `(1)!` for inline explanations; cleaner than long comments
3. **Content tabs** — Show examples in multiple languages side by side
4. **Admonitions** — `!!! note/warning/tip/danger` for important information
5. **mkdocstrings** — Auto-generate API reference from Python docstrings
6. **mike for versioning** — Versioned docs (v1.0, v2.0, latest) with one command
7. **Social cards** — Enable the social plugin for auto-generated OG images
8. **gh-deploy** — `mkdocs gh-deploy` pushes to GitHub Pages instantly
