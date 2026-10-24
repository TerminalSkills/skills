---
name: ppt-master
description: >-
  PPT Master turns a PDF, Word file, web page or pasted text into a natively editable PowerPoint (.pptx) deck, with real shapes, slide masters, optional animations and speaker-note narration, by running a workflow inside a coding agent. Use when someone says "make a PPT from this report", "build a pitch deck from this PDF", "fill this branded deck with new content", "turn this document into slides", or wants slides that stay editable instead of flat images.
license: Apache-2.0
compatibility: "Python 3.10+, Git, an agent that can read/write files and run shell commands (Claude Code, Codex CLI, Cursor, ...); Pandoc only for legacy formats"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: "pptx, powerpoint, presentations, slides, document-conversion"
  repository: https://github.com/hugohe3/ppt-master
---

# PPT Master — editable PowerPoint decks from documents, driven by your agent

## Overview

PPT Master is a workflow ("skill") that lives in a repository and is run by an AI coding agent. The agent converts your sources to Markdown, agrees a design spec with you, authors each slide as SVG, and exports a `.pptx` made of native PowerPoint objects (shapes, connectors, text, optional data-backed charts and tables) rather than pictures of slides. You then keep polishing the file in PowerPoint.

It has three routes, chosen from what you ask for:

- **Generate**: new deck from PDF, DOCX, HTML, EPUB, notebooks, Markdown, URLs or pasted text.
- **Edit Native PPTX**: "fill this deck with the new content". Keeps the existing design; unchanged pages are restored byte-for-byte and only the planned pages are edited.
- **Create Template**: distill a reusable Brand, Style, Layout or Deck template from a reference `.pptx`, then generate new decks with it.

The agent does the work in chat; there is no separate PPT Master CLI to learn. The only cost is your model usage, plus any image service you enable. Quality depends on the model: the project recommends a large-context model (Claude, Kimi K3) and an image model such as `gpt-image-2` or `gemini-nano-banana-2.1`.

## Instructions

### Install from a clone (recommended)

```bash
git clone https://github.com/hugohe3/ppt-master.git
cd ppt-master
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The README installs with plain `pip install -r requirements.txt`; a virtual environment is the same thing kept out of the system Python. If you use one, tell the agent to run scripts with `.venv/bin/python`. Dependencies include python-pptx, PyMuPDF (PDF sources only; AGPL-licensed), Pillow, edge-tts, google-genai and flask.

Pandoc is needed only for `.doc`, `.odt`, `.rtf`, `.tex`, `.rst`, `.org` and `.typ` sources (`.docx`, `.html`, `.epub`, `.ipynb` are handled in Python):

```bash
sudo apt install pandoc      # Debian / Ubuntu
brew install pandoc          # macOS
```

Update a clone later with:

```bash
python3 skills/ppt-master/scripts/update_repo.py
```

### Install as a skill only

```bash
npx skills add hugohe3/ppt-master
```

Inside Claude Code the plugin route is `/plugin marketplace add hugohe3/ppt-master` then `/plugin install ppt-master@ppt-master`. Either route fetches only the skill files, so you still run `python3 -m pip install -r requirements.txt in the installed skill folder` yourself. Start the agent in a persistent, writable working folder of your own choosing, not inside the host-managed skill directory.

### Generate a deck

Open the cloned folder (or your working folder) in the agent, put sources under `projects/` or anywhere readable, and ask:

```text
Please create a PPT from projects/q3-report/sources/report.pdf
```

By default the agent first confirms a design spec (canvas, page count, template or free design, audience). Name things explicitly to avoid the round trip; anything you state is followed, anything left out is decided by the agent:

```text
Quickly generate an 8-page deck from projects/q3-report/sources/report.pdf, dark corporate look, no need to confirm with me
```

You can also paste text into the chat. The result is `a .pptx in the project's exports/ folder`; page previews are written to `svg_final/`. While it runs, a live preview opens in the browser (default `http://localhost:5050`, next free port if taken) where you can edit text and positions or leave annotations for the agent ("apply my annotations").

Charts and tables are editable shapes by default. Ask for "native PowerPoint charts and tables" (the pipeline flag is `--native-charts-and-tables` on the export step) when you need data-backed chart objects.

### Reuse a company deck or brand

Fill an existing deck, keeping its design:

```text
Fill this deck with the new content from projects/q3-report/sources/report.pdf (deck: projects/brand/board_template.pptx)
```

Build a reusable template first, then use it:

```text
Create a reusable Deck template from projects/brand/board_template.pptx via /create-template
Make a deck from sources/report.pdf with template skills/ppt-master/templates/layouts/presentation_core/
```

Library templates live under `skills/ppt-master/templates/` (`brands`, `styles`, `layouts`, `decks`); ask the agent "what templates are available?". A bare brand name in a prompt is only a design brief, not a template.

### Helper scripts the agent runs

You rarely call these yourself, but they are safe to run to check an environment:

```bash
python3 skills/ppt-master/scripts/source_to_md.py projects/q3-report/sources/report.pdf
python3 skills/ppt-master/scripts/project_manager.py init q3-board --format ppt169
python3 skills/ppt-master/scripts/image_gen.py --list-backends
```

`project_manager.py init` creates `projects/<name>_<format>_<date>/`; `ppt169` is the 1280x720 widescreen canvas (other formats are listed in `skills/ppt-master/references/canvas-formats.md`).

### Images (optional)

Three sources can be mixed in one deck: your own files, AI generation, and web search.

- AI generation: ask the agent to use its own image tool (no extra key), or set `IMAGE_BACKEND` plus that provider's key for `image_gen.py`. Core backends: `openai` (`OPENAI_API_KEY`), `gemini` (`GEMINI_API_KEY`), `qwen`, `volcengine`, `zhipu`.
- Web search (`image_search.py`) works with no configuration via Openverse and Wikimedia Commons. `PEXELS_API_KEY` and `PIXABAY_API_KEY` (both free) add stock photography. Attribution credits are added automatically when a licence requires them.

Keys go in the environment or in a `.env` file. Only the first `.env` found is read, in this order: current directory, skill directory, repo root, `~/.ppt-master/.env`. Keys are not merged across files.

```bash
mkdir -p ~/.ppt-master
cp .env.example ~/.ppt-master/.env     # then edit; never commit it
```

### Animations and narration

Exports default to a `fade` page transition with no element animation. Ask for "animate with auto" or name a preset, and the agent exports real OOXML animations. For narration, ask "generate narration audio for this deck": speaker notes are voiced (default engine `edge-tts`) and embedded in the `.pptx`, which PowerPoint can export as a narrated video. Check motion in Microsoft PowerPoint; Keynote, WPS and LibreOffice may remap or drop effects.

## Examples

### Example 1: a board deck from a PDF, no questions asked

Request: "Take the Q3 report PDF and give me a 6-page board update, quickly."

```text
Quickly generate a 6-page board update from projects/q3-report/sources/report.pdf, ppt169, plain white background with navy accents, no need to confirm with me
```

The agent converts the PDF to Markdown, initialises a project folder, authors six SVG pages, runs its quality checks and exports. Result: `projects/q3-report_ppt169_<date>/exports/q3-report_<timestamp>.pptx`. Opening it in PowerPoint shows editable text boxes and shapes; the revenue-by-region table is a set of editable shapes unless you also asked for native tables.

### Example 2: put new numbers into last quarter's branded deck

Request: "Use last quarter's deck, keep our template, update it with the new report."

```text
Fill this deck with the new content from projects/q4-report/sources/report.docx. The deck is projects/q4-report/sources/q3_board_deck.pptx. Keep the cover and the closing slide untouched.
```

The agent imports the deck into a round-trip workspace, writes a page plan (select, reorder, repeat or omit pages), edits only the planned pages and exports a new `.pptx` in `exports/`. Unchanged slides are identical to the original, so the brand masters and layouts survive.

### Example 3: add narration to an existing export

Request: "Add a voice-over so I can send it as a video."

```text
Generate narration audio for this deck and re-export with the audio embedded. Use an English voice and ask me before generating.
```

The agent picks an edge-tts voice for the language, asks once, voices each slide's speaker notes and re-exports a `.pptx` with audio per slide. In PowerPoint, File > Export > Create a Video uses the recorded narrations.

## Guidelines

- The model sets the ceiling. Expect a strong first draft, not a finished deck; budget time to polish in PowerPoint. A small or short-context model produces visibly weaker layouts.
- Long decks can exceed the context window; if the agent forgets a step, ask it to re-read `skills/ppt-master/SKILL.md` and `skills/ppt-master/workflows/routing.md`.
- A raw `.pptx` plus new material means Edit Native PPTX. To build a reusable template from it, say "via /create-template" explicitly.
- Data stays on your machine except for model calls and any image, search or speech service you enable. Do not feed confidential documents to a provider you do not trust, and check licences of web-searched images for commercial decks.
- PyMuPDF (needed for PDF sources) is AGPL-3.0 while the project is MIT; read `skills/ppt-master/scripts/docs/conversion.md` before redistributing a bundle that includes it.
- Never put API keys in prompts, chat or the repository; use environment variables or `~/.ppt-master/.env`.
- Do not use it when you need a flattened image deck, a one-slide tweak that PowerPoint does faster, or a hosted service without a local agent.
- The project moves quickly. If a documented behaviour differs, the repository's `docs/getting-started.md` and `docs/faq.md` are the authority.
