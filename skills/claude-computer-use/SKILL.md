---
name: claude-computer-use
description: >-
  Automate computer tasks using Anthropic's computer use API — Claude controls
  mouse, keyboard, and screen. Use when automating GUI workflows, browser
  automation without CSS selectors, desktop app testing, or any task that
  requires seeing and interacting with a graphical interface.
license: Apache-2.0
compatibility: "Anthropic API (claude-3-5-sonnet-20241022+), Python 3.9+, Linux/macOS/Windows with display"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["computer-use", "claude", "anthropic", "automation", "gui"]
  use-cases:
    - "Automate form filling in legacy web applications without APIs"
    - "Run end-to-end GUI tests on desktop applications"
    - "Extract data from applications that have no API or export feature"
  agents: [claude-code, cursor]
---

# Claude Computer Use

## Overview

Claude's computer use capability lets the model see your screen (via screenshots) and control mouse and keyboard. Unlike Playwright or Selenium, it requires no selectors — Claude navigates visually, the same way a human would. It's ideal for legacy software, complex multi-app workflows, and tasks that are hard to automate programmatically.

**⚠️ Always run in a sandboxed environment (Docker, VM, or dedicated machine). Never run on a machine with access to sensitive accounts or production systems.**

## Setup

### Install Dependencies

```bash
pip install anthropic pillow pyautogui
# Linux: also install scrot or gnome-screenshot for screenshots
apt-get install -y scrot
```

### Environment

Use Docker for safety:

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    xvfb x11vnc \
    scrot \
    chromium-browser \
    && pip install anthropic pillow pyautogui
ENV DISPLAY=:1
CMD ["Xvfb", ":1", "-screen", "0", "1280x800x24"]
```

```bash
docker build -t computer-use-sandbox .
docker run -d --name sandbox \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -p 5900:5900 \  # VNC to monitor what's happening
  computer-use-sandbox
```

## Core Implementation

### Tool Definitions

The computer use beta provides three tools:

```python
TOOLS = [
    {
        "type": "computer_20241022",  # Screen + mouse + keyboard
        "name": "computer",
        "display_width_px": 1280,
        "display_height_px": 800,
        "display_number": 1
    },
    {
        "type": "bash_20241022",      # Run shell commands
        "name": "bash"
    },
    {
        "type": "text_editor_20241022",  # View and edit files
        "name": "str_replace_editor"
    }
]
```

### Take a Screenshot

```python
import subprocess
import base64
from pathlib import Path

def take_screenshot() -> str:
    """Take a screenshot and return as base64 PNG."""
    path = "/tmp/screenshot.png"
    subprocess.run(["scrot", path], check=True)
    return base64.standard_b64encode(Path(path).read_bytes()).decode("utf-8")

def get_screenshot_block() -> dict:
    """Return an image content block for the API."""
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": take_screenshot()
        }
    }
```

### Execute Computer Actions

```python
import pyautogui
import time

def execute_computer_action(action: dict) -> str:
    """Execute a computer action from Claude's tool use response."""
    action_type = action["action"]

    if action_type == "screenshot":
        return take_screenshot()

    elif action_type == "mouse_move":
        pyautogui.moveTo(action["coordinate"][0], action["coordinate"][1])
        return "Mouse moved"

    elif action_type == "left_click":
        pyautogui.click(action["coordinate"][0], action["coordinate"][1])
        time.sleep(0.5)
        return "Clicked"

    elif action_type == "double_click":
        pyautogui.doubleClick(action["coordinate"][0], action["coordinate"][1])
        time.sleep(0.5)
        return "Double-clicked"

    elif action_type == "right_click":
        pyautogui.rightClick(action["coordinate"][0], action["coordinate"][1])
        return "Right-clicked"

    elif action_type == "type":
        pyautogui.write(action["text"], interval=0.02)
        return "Typed text"

    elif action_type == "key":
        pyautogui.hotkey(*action["key"].replace("+", " ").split())
        return f"Pressed {action['key']}"

    elif action_type == "scroll":
        direction = action.get("direction", "down")
        clicks = action.get("clicks", 3)
        pyautogui.scroll(-clicks if direction == "down" else clicks)
        return f"Scrolled {direction}"

    else:
        return f"Unknown action: {action_type}"


def execute_bash(command: str) -> str:
    """Execute a bash command and return output."""
    result = subprocess.run(
        command, shell=True, capture_output=True, text=True, timeout=30
    )
    return result.stdout + result.stderr
```

### Full Action Loop

```python
import anthropic

client = anthropic.Anthropic()

def run_computer_use_agent(task: str, max_steps: int = 20) -> str:
    """
    Run Claude computer use to complete a task.

    Args:
        task: Natural language description of what to do
        max_steps: Safety limit on number of actions

    Returns:
        Claude's final response describing what was done
    """
    # Start with screenshot so Claude sees current state
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": task},
                get_screenshot_block()
            ]
        }
    ]

    for step in range(max_steps):
        print(f"\n[Step {step + 1}/{max_steps}]")

        response = client.beta.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            tools=TOOLS,
            messages=messages,
            betas=["computer-use-2024-10-22"]
        )

        # Add Claude's response to history
        messages.append({"role": "assistant", "content": response.content})

        # Check if Claude is done
        if response.stop_reason == "end_turn":
            final_text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            print(f"\n✅ Task complete: {final_text}")
            return final_text

        # Process tool uses
        if response.stop_reason == "tool_use":
            tool_results = []

            for block in response.content:
                if block.type != "tool_use":
                    continue

                print(f"  → Tool: {block.name}, Action: {block.input.get('action', block.name)}")

                if block.name == "computer":
                    result = execute_computer_action(block.input)

                    # Always include a fresh screenshot after actions
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": [
                            {"type": "text", "text": result},
                            get_screenshot_block()
                        ]
                    })

                elif block.name == "bash":
                    output = execute_bash(block.input["command"])
                    print(f"  ← Output: {output[:200]}")
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": output
                    })

                elif block.name == "str_replace_editor":
                    # Handle file viewing/editing
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": "File operation completed"
                    })

            messages.append({"role": "user", "content": tool_results})

    return "Max steps reached without completion"
```

## Human-in-the-Loop

For sensitive tasks, add approval checkpoints:

```python
SENSITIVE_ACTIONS = ["left_click", "type", "key"]
REQUIRE_APPROVAL_FOR = ["submit", "delete", "purchase", "send"]

def execute_with_approval(action: dict, task_context: str) -> str:
    """Pause and ask for human approval on potentially dangerous actions."""
    action_type = action.get("action", "")
    text = action.get("text", "")

    # Check if this looks like a high-risk action
    is_risky = any(word in task_context.lower() for word in REQUIRE_APPROVAL_FOR)

    if is_risky and action_type in SENSITIVE_ACTIONS:
        print(f"\n⚠️  APPROVAL REQUIRED")
        print(f"   Action: {action_type}")
        print(f"   Details: {action}")
        approval = input("   Approve? (y/n): ")
        if approval.lower() != "y":
            raise RuntimeError("Action denied by user")

    return execute_computer_action(action)
```

## Usage Examples

```python
# Fill out a web form
result = run_computer_use_agent(
    "Open Chrome, go to https://forms.example.com/application, "
    "fill in Name='John Smith', Email='john@smith.com', and submit the form."
)

# Extract data from a desktop app
result = run_computer_use_agent(
    "Open the Excel file at /home/user/data.xlsx, "
    "copy all values from column B rows 2-50, and save them to /tmp/extracted.txt"
)

# Automate a repetitive workflow
result = run_computer_use_agent(
    "In the open CRM application, find all contacts with status 'Follow Up', "
    "change their status to 'Active', and export the list to CSV."
)
```

## Safety Checklist

- ✅ Always run in Docker or a dedicated VM
- ✅ Never mount production credentials or sensitive files in the sandbox
- ✅ Add human-in-the-loop for submit/delete/purchase actions
- ✅ Set `max_steps` to prevent runaway loops
- ✅ Monitor via VNC to watch what Claude does in real time
- ✅ Log all actions and screenshots for audit trail
- ❌ Do NOT run on your main machine with browser sessions logged into accounts
- ❌ Do NOT give Claude access to payment methods or admin panels without oversight

## Guidelines

- Start tasks with a screenshot so Claude has current context
- Be specific in your task description — vague tasks lead to wrong actions
- Include success criteria: "task is done when you see the confirmation page"
- Set a reasonable `max_steps` (10–30 depending on task complexity)
- Add delays (`time.sleep`) after clicks to let UI render before next screenshot
- Use bash tool for file operations; computer tool for GUI interactions
- Monitor token usage — each screenshot adds ~1K tokens to context
