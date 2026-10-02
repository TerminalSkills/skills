---
name: claude-computer-use
description: >-
  Claude computer use is an Anthropic API tool that lets Claude see a desktop
  through screenshots and operate it with mouse and keyboard. Use when
  automating GUI workflows, browser automation without CSS selectors, desktop app testing, or any task that
  requires seeing and interacting with a graphical interface.
license: Apache-2.0
compatibility: "Anthropic API key, Python 3.9+, a sandboxed Linux desktop (Xvfb) or VM"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/anthropics/anthropic-quickstarts
  category: data-ai
  tags: ["computer-use", "claude", "anthropic", "automation", "gui"]
  use-cases:
    - "Automate form filling in legacy web applications without APIs"
    - "Run end-to-end GUI tests on desktop applications"
    - "Extract data from applications that have no API or export feature"
  agents: [claude-code, cursor]
---

# Claude Computer Use

## Overview

Computer use is a client-side tool of the Claude API. Claude asks for actions (take a screenshot, click, type, scroll), your program performs them on a desktop you control and returns the result, and the loop repeats until the task is done. No selectors are needed, so it suits legacy apps and GUIs with no API. For tasks that stay inside web pages, Anthropic's browser use tool is the closer fit.

Current API shape (checked 2026-10): a single entry `{"type": "computer_toolset_20260801"}` in `tools`, no beta header. Claude 5.5 and later models on the Claude API and Google Cloud accept only this toolset. Older models (Opus 4.5 to 4.8, Sonnet 4.6) use `computer_20251124` with beta header `computer-use-2025-11-24`; Opus 5 and Sonnet 5 accept both shapes. Sonnet 4.5 and Haiku 4.5 use `computer_20250124` with `computer-use-2025-01-24`. The `computer_20241022` version from the first beta is gone.

**Always run it in a sandbox (container or VM) without credentials or production access.** Web pages and images can contain prompt injections.

## Instructions

### Setup

```bash
pip install anthropic pillow pyautogui
sudo apt-get install -y xvfb scrot xdotool     # Linux sandbox display and screenshots
export ANTHROPIC_API_KEY=...                    # from the environment, never in code
```

The fastest safe start is Anthropic's reference container (Linux desktop, VNC viewer, Streamlit UI, agent loop):

```bash
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -v $HOME/.anthropic:/home/computeruse/.anthropic \
  -p 127.0.0.1:5900:5900 -p 127.0.0.1:8501:8501 -p 127.0.0.1:6080:6080 -p 127.0.0.1:8080:8080 \
  -it ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
```

Open http://localhost:8080 for the combined view. Source: github.com/anthropics/anthropic-quickstarts, `computer-use-demo`.

### Declare the tools

```python
import anthropic

client = anthropic.Anthropic()
MODEL = "claude-sonnet-5-5"

TOOLS = [
    {"type": "computer_toolset_20260801"},
    {"type": "bash_20250124", "name": "bash"},
    {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"},
]
```

The toolset takes no display size: coordinates are in the pixel space of the screenshots you return. It rejects `name`, `display_width_px`, `display_height_px`, `display_number` and `enable_zoom`. To withhold a member, use `"configs": {"zoom": {"enabled": false}}`. Declaring the toolset costs about 4,500 input tokens per request.

### Member tools

Claude's `tool_use` blocks have `"toolset_name": "computer"` and a `name` that is one of 17 members; `input` has no `action` field.

| Member | Input |
|---|---|
| `screenshot`, `cursor_position` | none |
| `zoom` | `region: [x0, y0, x1, y1]` (returns an image) |
| `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click` | optional `coordinate: [x, y]`, optional `text` modifiers such as `shift` or `ctrl+shift` |
| `left_click_drag` | `start_coordinate`, `coordinate` |
| `mouse_move` | `coordinate` |
| `left_mouse_down`, `left_mouse_up` | none |
| `scroll` | `scroll_direction` (up/down/left/right), `scroll_amount`, optional `coordinate` |
| `type` | `text` |
| `key` | `text` such as `ctrl+s`, optional `repeat` 1-100 |
| `hold_key` | `text`, `duration` seconds (max 300) |
| `wait` | `duration` seconds (max 300) |

### Agent loop

```python
import base64, subprocess, time
from pathlib import Path
import pyautogui

def screenshot_block() -> dict:
    subprocess.run(["scrot", "-o", "/tmp/screen.png"], check=True)
    # Images must fit the model limit (2576 px long edge for 5.x models): downscale
    # larger screens with Pillow and scale Claude's coordinates back up.
    data = base64.standard_b64encode(Path("/tmp/screen.png").read_bytes()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}

def run_member(name: str, a: dict):
    """Perform one computer member call; return text or an image block."""
    xy = a.get("coordinate")
    if name == "screenshot":
        return [screenshot_block()]
    if name == "left_click":
        pyautogui.click(*xy)
    elif name == "right_click":
        pyautogui.rightClick(*xy)
    elif name == "double_click":
        pyautogui.doubleClick(*xy)
    elif name == "mouse_move":
        pyautogui.moveTo(*xy)
    elif name == "type":
        pyautogui.write(a["text"], interval=0.02)
    elif name == "key":
        for _ in range(a.get("repeat", 1)):
            pyautogui.hotkey(*a["text"].lower().split("+"))
    elif name == "scroll":
        amount = a["scroll_amount"] * (-1 if a["scroll_direction"] == "down" else 1)
        pyautogui.scroll(amount, *(xy or pyautogui.position()))
    elif name == "wait":
        time.sleep(a["duration"])
    else:
        raise NotImplementedError(name)   # implement the rest as needed (zoom, drag, ...)
    time.sleep(0.5)
    return "OK"

def run_agent(task: str, max_steps: int = 25) -> str:
    messages = [{"role": "user", "content": task}]
    for _ in range(max_steps):
        resp = client.messages.create(model=MODEL, max_tokens=4096, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})
        calls = [b for b in resp.content if b.type == "tool_use"]
        if not calls:
            return next((b.text for b in resp.content if b.type == "text"), "")
        results, failed = [], False
        for call in calls:                       # a turn may hold a batch: run in order
            res = {"type": "tool_result", "tool_use_id": call.id}
            if getattr(call, "toolset_name", None) == "computer":
                res["toolset_name"] = "computer"
            if failed:
                res.update(is_error=True, content="Not executed: an earlier computer action in this turn failed.")
            else:
                try:
                    if res.get("toolset_name") == "computer":
                        out = run_member(call.name, call.input)
                    else:
                        out = run_other_tool(call)       # your bash / editor handlers
                    res["content"] = out
                except Exception as exc:
                    failed = True
                    res.update(is_error=True, content=f"Error: {exc}")
            results.append(res)
        messages.append({"role": "user", "content": results})
    return "Stopped: max_steps reached"
```

Rules from the docs: answer every `tool_use` block (an unanswered one is a 400 error), echo `toolset_name` on computer results, stop at the first failure and answer the rest with the exact halt text above, and return an image only for `screenshot` and `zoom` (text `OK` otherwise). `run_other_tool` is yours to write (run the bash command in the sandbox, apply the editor command). With `tool_choice` set to `{"type": "auto", "disable_parallel_tool_use": true}` Claude issues one action per turn.

### Migrating from computer_20251124 or computer_20241022

Remove the beta header, change the tool entry to the toolset, dispatch on `name` plus `toolset_name` instead of `input.action`, iterate over every `tool_use` block, honor `repeat` on `key`, resize screenshots yourself, and decide whether to keep `zoom` (on by default, whereas `enable_zoom` defaulted to off).

### Human approval

Ask a person before irreversible steps. Check before each block runs, because a batch can finish a multi-step action in one turn:

```python
RISKY_WORDS = ("submit", "delete", "purchase", "send", "pay")

def approved(call, task: str) -> bool:
    if call.name in ("left_click", "double_click", "key") and any(w in task.lower() for w in RISKY_WORDS):
        return input(f"Allow {call.name} {call.input}? [y/N] ").strip().lower() == "y"
    return True
```

## Examples

### Fill in a legacy web form

User: "Open the supplier portal in Firefox and register Brightwell Tools, contact maria.lopez@brightwelltools.com. Stop before pressing Submit."

```python
print(run_agent(
    "Firefox is open on the supplier portal at http://localhost:8080/register. "
    "Fill Company='Brightwell Tools' and Email='maria.lopez@brightwelltools.com'. "
    "After each step take a screenshot and confirm it worked. Do not press Submit; "
    "tell me when the form is ready."
))
```

Result: a handful of `screenshot`, `left_click` and `type` calls, then Claude replies that the form is filled and waiting. Add the approval check before any Submit click.

### Read data from an app with no export

User: "Copy the open invoice numbers from the desktop accounting app into a text file."

```python
print(run_agent(
    "In the Ledger app, open Invoices > Open. Read every invoice number in the list "
    "(scroll if needed, zoom into the table to read small text) and write them one per line "
    "to /home/computeruse/open_invoices.txt using the bash tool. Done when the file exists."
))
```

Result: Claude zooms into the list, scrolls, writes the file with bash, and returns a summary with the count.

## Guidelines

- Use a throwaway container or VM; never your daily desktop with signed-in browsers. Restrict network access to an allowlist of domains.
- Put the task text before the screenshot in the first user turn; click accuracy improves.
- Ask Claude to screenshot and verify after each step, and to use keyboard shortcuts for dropdowns and scrollbars that resist the mouse.
- Always cap the loop (`max_steps`) and log actions and screenshots for audit.
- Do not hand over passwords casually: logged-in sessions raise prompt-injection risk. Keep payment and admin accounts out of the sandbox.
- Latency is high and coordinates can be wrong; it is not for speed-critical or precision-critical work. Prefer APIs, then Playwright, when they exist.
- Each screenshot is billed as image input; keep screens near the model's size limit and trim history of old screenshots in long runs.
- Everything runs on your side: screenshots and files stay in your environment; Anthropic only sees what you send in each request.
