---
title: "Automate Desktop Workflows with Claude Computer Use"
description: "Use Claude's computer use API to automate repetitive GUI tasks — from legacy desktop apps to browser workflows — without writing brittle CSS selectors."
skills:
  - claude-computer-use
difficulty: intermediate
time_estimate: "2-4 hours"
tags: [automation, computer-use, claude, anthropic, gui, desktop, browser]
---

# Automate Desktop Workflows with Claude Computer Use

## The Problem

Alex is an ops engineer at a mid-size company. They use a legacy ERP system from 2008 that has no API. Every Monday, Alex manually exports 3 reports, reformats them in Excel, and uploads them to a dashboard. The whole process takes 2 hours. There's no Playwright selector, no API endpoint — just an ancient Windows GUI.

## What You'll Build

An automation agent that:
- Takes a screenshot of the current screen
- Analyzes what it sees
- Decides what to click/type
- Repeats until the task is done
- Pauses for human confirmation on uncertain steps

## Step 1: Set Up Sandboxed Environment

Always run computer use in an isolated container.

```dockerfile
# Dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    xvfb x11vnc \
    firefox \
    scrot \
    xdotool \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install anthropic pillow

# VNC for monitoring
EXPOSE 5900

CMD ["bash", "-c", "Xvfb :99 -screen 0 1280x768x24 & x11vnc -display :99 -nopw -forever & bash"]
```

```bash
docker build -t computer-use-sandbox .
docker run -it -p 5900:5900 -e DISPLAY=:99 computer-use-sandbox
```

## Step 2: Define Computer Use Tools

```python
import anthropic
import base64
import subprocess
from PIL import ImageGrab
import io

client = anthropic.Anthropic()

def take_screenshot() -> str:
    """Take screenshot and return as base64."""
    result = subprocess.run(["scrot", "-o", "/tmp/screenshot.png"], capture_output=True)
    with open("/tmp/screenshot.png", "rb") as f:
        return base64.b64encode(f.read()).decode()

def execute_action(action: dict) -> str:
    """Execute a computer use action."""
    action_type = action["type"]

    if action_type == "screenshot":
        return take_screenshot()

    elif action_type == "left_click":
        x, y = action["coordinate"]
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "1"])
        return "Clicked"

    elif action_type == "type":
        text = action["text"].replace('"', '\\"')
        subprocess.run(["xdotool", "type", "--", text])
        return "Typed"

    elif action_type == "key":
        subprocess.run(["xdotool", "key", action["key"]])
        return "Key pressed"

    elif action_type == "right_click":
        x, y = action["coordinate"]
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "3"])
        return "Right-clicked"

    elif action_type == "double_click":
        x, y = action["coordinate"]
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "--repeat", "2", "1"])
        return "Double-clicked"

    return f"Unknown action: {action_type}"
```

## Step 3: The Automation Loop

```python
def run_automation(task: str, max_steps: int = 50, human_in_loop: bool = True):
    messages = []
    steps = 0

    print(f"Starting task: {task}")
    print("-" * 50)

    while steps < max_steps:
        # Take screenshot
        screenshot_b64 = take_screenshot()

        # Add to messages
        if not messages:
            messages.append({
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_b64,
                        },
                    },
                    {"type": "text", "text": task},
                ],
            })
        else:
            # Append screenshot result
            messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": last_tool_use_id,
                    "content": [{
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_b64,
                        },
                    }],
                }],
            })

        # Ask Claude what to do
        response = client.beta.messages.create(
            model="claude-opus-4-5",
            max_tokens=1024,
            tools=[{
                "type": "computer_20241022",
                "name": "computer",
                "display_width_px": 1280,
                "display_height_px": 768,
            }],
            messages=messages,
            betas=["computer-use-2024-10-22"],
        )

        messages.append({"role": "assistant", "content": response.content})

        # Check if done
        if response.stop_reason == "end_turn":
            print("Task completed!")
            break

        # Find tool use
        tool_use = next(
            (block for block in response.content if block.type == "tool_use"),
            None
        )

        if not tool_use:
            print("No action requested — task may be complete")
            break

        last_tool_use_id = tool_use.id
        action = tool_use.input

        print(f"Step {steps + 1}: {action['action']} {action.get('coordinate', action.get('text', ''))[:50]}")

        # Human-in-the-loop for risky actions
        if human_in_loop and action["action"] in ["left_click", "type"]:
            confirm = input(f"  Execute? [Y/n]: ").strip().lower()
            if confirm == "n":
                print("  Skipped by user")
                steps += 1
                continue

        execute_action({"type": action["action"], **action})
        steps += 1

    return steps
```

## Step 4: Run It

```python
if __name__ == "__main__":
    task = """
    Open Firefox, go to http://internal-erp.company.com/reports,
    log in with username 'ops_export' and password from the password manager,
    export the 'Weekly Summary' report as CSV to the Downloads folder,
    then confirm the file was downloaded.
    """

    run_automation(task, max_steps=30, human_in_loop=True)
```

## Step 5: Error Recovery

```python
def run_with_recovery(task: str):
    try:
        steps = run_automation(task)
        print(f"Completed in {steps} steps")
    except Exception as e:
        print(f"Automation failed: {e}")
        # Take error screenshot
        screenshot = take_screenshot()
        with open("error_screenshot.png", "wb") as f:
            f.write(base64.b64decode(screenshot))
        print("Error screenshot saved to error_screenshot.png")
        raise
```

## Safety Guidelines

- **Always use Docker/VM** — never run on your main machine unattended
- **Enable human-in-loop** for production tasks
- **Set max_steps** to prevent infinite loops
- **Log all actions** for audit trail
- **Use read-only credentials** when possible

## Tips

- Be very specific in your task description — include URLs, button labels, expected states
- For web automation, Playwright is faster; use computer use only for GUI apps without APIs
- Take extra screenshots after each action to verify success
- Claude works best with 1280x768 resolution
