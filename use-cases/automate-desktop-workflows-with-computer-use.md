---
title: "Automate Desktop Workflows with Claude Computer Use"
slug: automate-desktop-workflows-with-computer-use
description: "Use Claude's computer use tool to automate repetitive GUI tasks, from legacy desktop apps to browser workflows, inside a sandbox and without brittle CSS selectors."
skills:
  - claude-computer-use
  - cua
category: automation
difficulty: intermediate
time_estimate: "2-4 hours"
tags: [automation, computer-use, claude, anthropic, gui, desktop, browser]
---

# Automate Desktop Workflows with Claude Computer Use

## The Problem

Alex is an ops engineer at a mid-size company. They use a legacy ERP system from 2008 that has no API. Every Monday, Alex manually exports 3 reports, reformats them in Excel, and uploads them to a dashboard. The whole process takes 2 hours. There is no Playwright selector and no API endpoint, just an ancient GUI.

## The Solution

Computer use is a client-side tool of the Claude API. Claude asks for an action (screenshot, click, type, scroll), your program performs it on a desktop you control and returns the result, and the loop repeats until the task is done. Nothing in the ERP needs to change. The tool runs in a disposable sandbox, a person approves risky steps, and the exported files are post-processed with ordinary code.

## Step-by-Step Walkthrough

### Step 1: Start Anthropic's reference sandbox

Anthropic's quickstart ships a container with a Linux desktop, a VNC viewer and a Streamlit chat UI. Bind every port to localhost so nothing else on the network can reach the desktop:

```console
$ docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
    -v $HOME/.anthropic:/home/computeruse/.anthropic \
    -p 127.0.0.1:5900:5900 -p 127.0.0.1:8501:8501 \
    -p 127.0.0.1:6080:6080 -p 127.0.0.1:8080:8080 \
    -it ghcr.io/anthropics/anthropic-quickstarts:computer-use-demo-latest
```

Open `http://127.0.0.1:8080` for the combined chat and desktop view. The source is in `anthropics/anthropic-quickstarts` under `computer-use-demo`.

The container controls a Linux desktop, so the ERP client has to be reachable from it. If the ERP has a web client, open that in Firefox. If it only exists as a Windows program, run it in a throwaway Windows VM and open an RDP or VNC viewer to that VM from the container's desktop. In both cases give the sandbox a dedicated, read-only ERP account and restrict its network access to the ERP host and the domains it truly needs.

### Step 2: Try the task interactively

Describe the task in the chat UI with exact labels and expected end states, and watch the desktop on port 8080:

```text
The ERP client is open. Go to Reports > Weekly Summary, set the date range to last
week, click Export and choose CSV. Save the file as weekly-summary.csv in Downloads.
After every step take a screenshot and confirm the result before the next step.
Stop and ask me if a dialog appears that you did not expect.
```

Fix any ambiguity in the wording until the run is reliable, then turn it into a script.

### Step 3: Script the loop with the Messages API

The current API shape is one entry, `{"type": "computer_toolset_20260801"}`, with no beta header. Claude 5.5 and later models accept only this toolset; older models still use `computer_20251124` with the `computer-use-2025-11-24` beta header. The toolset takes no display size, so coordinates are in the pixel space of the screenshots you return. Install `pip install anthropic pyautogui` plus `scrot` in the sandbox, then:

```python
import base64
import subprocess
import time
from pathlib import Path

import anthropic
import pyautogui

client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY
MODEL = "claude-sonnet-5-5"
# All 17 members are on by default; withhold the ones this loop does not implement.
UNUSED = ("zoom", "middle_click", "triple_click", "left_click_drag", "mouse_move",
          "left_mouse_down", "left_mouse_up", "cursor_position", "hold_key")
TOOLS = [{"type": "computer_toolset_20260801",
          "configs": {m: {"enabled": False} for m in UNUSED}}]
RISKY = ("submit", "delete", "purchase", "send", "pay", "upload")


def screenshot() -> list[dict]:
    subprocess.run(["scrot", "-o", "/tmp/screen.png"], check=True)
    data = base64.standard_b64encode(Path("/tmp/screen.png").read_bytes()).decode()
    return [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}]


def perform(name: str, a: dict):
    xy = a.get("coordinate")
    if name == "screenshot":
        return screenshot()
    if name == "left_click":
        pyautogui.click(*xy)
    elif name == "double_click":
        pyautogui.doubleClick(*xy)
    elif name == "right_click":
        pyautogui.rightClick(*xy)
    elif name == "type":
        pyautogui.write(a["text"], interval=0.02)
    elif name == "key":
        for _ in range(a.get("repeat", 1)):
            pyautogui.hotkey(*a["text"].lower().split("+"))
    elif name == "scroll":
        sign = -1 if a["scroll_direction"] == "down" else 1
        pyautogui.scroll(sign * a["scroll_amount"], *(xy or pyautogui.position()))
    elif name == "wait":
        time.sleep(a["duration"])
    else:
        raise NotImplementedError(name)   # add a member here, and remove it from UNUSED, if the task needs it
    time.sleep(0.5)
    return "OK"


def approved(name: str, a: dict, task: str) -> bool:
    """Ask a person before clicks or keys when the task involves irreversible words."""
    if name in ("left_click", "double_click", "key") and any(w in task.lower() for w in RISKY):
        return input(f"Allow {name} {a}? [y/N] ").strip().lower() == "y"
    return True


def run_agent(task: str, max_steps: int = 40) -> str:
    messages = [{"role": "user", "content": task}]
    for _ in range(max_steps):
        resp = client.messages.create(model=MODEL, max_tokens=4096, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})
        calls = [b for b in resp.content if b.type == "tool_use"]
        if not calls:
            return next((b.text for b in resp.content if b.type == "text"), "")

        results, failed = [], False
        for call in calls:                    # a turn can hold several actions: answer every one
            res = {"type": "tool_result", "tool_use_id": call.id, "toolset_name": "computer"}
            if failed:
                res.update(is_error=True, content="Not executed: an earlier computer action in this turn failed.")
            elif not approved(call.name, call.input, task):
                failed = True
                res.update(is_error=True, content="Denied by the operator. Stop and explain what you were about to do.")
            else:
                try:
                    res["content"] = perform(call.name, call.input)
                except Exception as exc:
                    failed = True
                    res.update(is_error=True, content=f"Error: {exc}")
            results.append(res)
        messages.append({"role": "user", "content": results})
    return "Stopped: max_steps reached"


if __name__ == "__main__":
    print(run_agent(
        "The ERP client is open and logged in. Export the 'Weekly Summary' report for last "
        "week as CSV into ~/Downloads/weekly-summary.csv. Take a screenshot after every step "
        "and verify it. If anything unexpected appears, stop and describe it."
    ))
```

If a screenshot is larger than the model's limit (2,576 px on the long edge for the newest models, 1,568 px for older ones), downscale it and scale Claude's coordinates back up. Docs recommend 1024x768 or 1280x720 for general desktop work and 1280x800 for web apps, and nothing above 1920x1080. Credentials belong in the sandbox's saved session or an environment variable, never in the prompt text.

### Step 4: Post-process outside the sandbox

Copy the exported CSVs out of the container and let ordinary code do the Excel work. The only part that needs vision is the GUI export:

```console
$ docker cp <container>:/home/computeruse/Downloads/weekly-summary.csv ./exports/
$ python3 reformat_and_upload.py exports/weekly-summary.csv
```

### Step 5: Run it safely every week

- Cap the loop (`max_steps`), log each action and keep the screenshots for an audit trail.
- Run the sandbox only for the duration of the job and delete the container afterwards (`docker rm -v <container>`).
- Keep human approval on any step with real-world consequences, such as uploads, deletions and payments. The reference container's own notes warn that Claude can follow instructions it finds in on-screen content, so keep untrusted content out of the session.
- Review the first few runs by watching the desktop on port 8080 before leaving it unattended.

## Real-World Example

Alex's three Monday exports run as three tasks in one sandbox session. The first week Alex watches every step and tightens the wording where the ERP's save dialog differs from the prompt. After that the script runs from a scheduler, the operator approval prompt stays on for the upload step, and the reports reach the dashboard without the two hours of manual clicking. When the ERP vendor ships a real export API, Alex deletes the automation and calls the API instead, which is the better option whenever one exists.

## Related Skills

- [claude-computer-use](/skills/claude-computer-use) - API shape, member tools, sandboxing and the agent loop
- [cua](/skills/cua) — when the agent needs a disposable local Linux, Windows or macOS desktop with screenshot, mouse, keyboard and shell access, as an alternative to the reference Docker container
