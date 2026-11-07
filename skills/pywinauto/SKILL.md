---
name: pywinauto
description: >-
  Drives Windows desktop applications from Python by finding windows and controls and clicking, typing and reading them through the Win32 or UI Automation backends. Use when someone asks to "automate a Windows app that has no API", "click a button in a desktop program", "fill a legacy form from a script", "read text out of a dialog", "script Notepad or an old ERP client", or "use pywinauto". Covers Application start and connect, window and child_window lookup, print_control_identifiers, type_keys, click_input, waits and Desktop.
license: Apache-2.0
compatibility: "Windows 10/11 with a logged-in interactive desktop session, Python 3 (stable release 0.6.9 lists 3.5-3.7 classifiers)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: "windows, gui-automation, desktop, uia, python"
  repository: https://github.com/pywinauto/pywinauto
---
# pywinauto — Scripted control of Windows desktop apps

## Overview
pywinauto finds windows and controls of a running Windows program and drives them: it reads their text, sets values, invokes buttons, selects menu items and sends real keystrokes and mouse clicks. It has two backends. `win32` (the default) works through window handles and suits classic Win32/MFC/VB/Delphi programs. `uia` uses Microsoft UI Automation and suits WPF, WinForms, Qt, UWP/WinUI and most modern apps.

This skill was written from the stable release 0.6.9 (PyPI, January 2025): its installed source and signatures, plus the repository metadata. The machine used for writing was Linux, where the library imports but cannot drive anything, so no automation code below was executed; treat each snippet as documentation-checked and run it on a Windows test machine first. PyPI also carries `1.0.0b1` (a pre-release published in October 2026, installed only with `pip install --pre`); it is not covered here. The project is maintained but slow: the previous stable release before 0.6.9 was in 2019.

## Instructions

### Installation
```powershell
py -m venv .venv
.venv\Scripts\pip install pywinauto
.venv\Scripts\python -c "import pywinauto; print(pywinauto.__version__)"
```
It pulls in `pywin32` and `comtypes` on Windows. Run scripts in the same interactive desktop session as the target app; a service, a locked screen or a disconnected remote-desktop session breaks input-based actions. If the target runs as administrator, run Python as administrator too, otherwise UI Automation cannot reach it.

### Start or connect
```python
from pywinauto import Application

app = Application(backend="uia").start("notepad.exe")                 # launch
app = Application(backend="uia").connect(title_re=".*Notepad$")      # attach to a running window
app = Application(backend="win32").connect(path="notepad.exe")       # by executable path
app = Application(backend="uia").connect(process=4128)               # by PID
```
`connect()` accepts one of `process`, `handle`, `path`, or the window criteria below (`title`, `title_re`, `class_name`, ...), plus `timeout`. `start(cmd_line, timeout=None, work_dir=None, wait_for_idle=True)` takes the whole command line as one string. Close with `app.kill()`.

Packaged (UWP/Store) apps and apps whose launcher exits right away do not leave a process that `start()` can follow. Start them any way you like, then find the window with `Desktop`:

```python
from pywinauto import Desktop

win = Desktop(backend="uia").window(title_re=".*Calculator$")
win.wait("ready", timeout=15)
```

### Find windows and controls
```python
main = app.window(title_re=".*Notepad$")        # top-level window of the Application
main.wait("ready", timeout=10)                  # also: "exists", "visible", "enabled", "active"; combine with spaces
save = main.child_window(title="Save", control_type="Button")   # uia criteria
name = main.child_window(auto_id="1001", class_name="Edit")
```
Useful criteria: `title`, `title_re`, `class_name`, `class_name_re`, `control_type` and `auto_id` (uia only), `found_index` when several match, `visible_only`. A lookup is lazy: it is resolved when you call a method, so a failed match raises at that moment (`ElementNotFoundError`, or `ElementAmbiguousError` for several matches).

Never guess names. Print the tree and copy the identifiers it shows:

```python
main.print_control_identifiers()                       # whole subtree
main.print_control_identifiers(depth=2, filename="notepad_tree.txt")
```
The output lists each control with its type, title, class and the child_window call that finds it.

### Act on controls
```python
edit = main.child_window(control_type="Edit")
edit.type_keys("Q3 totals{ENTER}", with_spaces=True)   # real keystrokes; {ENTER}, ^s (Ctrl+S), %{F4} (Alt+F4)
edit.set_edit_text("Replaced text")                    # sets the value directly, no keystrokes
print(edit.window_text())                              # text of a control
main.menu_select("File->Save As...")                   # menu path
save.click_input()                                     # real mouse click at the control
save.invoke()                                          # uia: InvokePattern, no mouse needed
```
`type_keys` needs `with_spaces=True`, `with_tabs=True`, `with_newlines=True` to type those characters literally. Prefer `invoke()`, `set_edit_text()` and `select()` over `click_input()`/`type_keys()` where the control supports them: they call the control's own pattern or message instead of moving the mouse. `click_input(button="right", double=True, coords=(x, y))` takes relative coordinates.

### Waiting
Wait for state, not for time: `win.wait("ready", timeout=20)`, `dialog.wait_not("visible", timeout=10)`, `win.exists(timeout=3)`. A `pywinauto.timings.TimeoutError` means the state never arrived. Global defaults live in `pywinauto.timings.Timings`.

### Dialogs, focus and cleanup
```python
from pywinauto import Application

app = Application(backend="uia").connect(title_re=".*RouteDesk.*", timeout=30)
print([w.window_text() for w in app.windows()])   # every top-level window of the process
top = app.top_window()                            # the application's topmost window in z-order
top.set_focus()                                   # bring it forward before sending keystrokes
top.close()                                       # ask the window to close, like the X button
```
A modal dialog is a separate top-level window: look it up with `app.window(title="...")` after the click that opens it, wait for `"ready"`, act, then `wait_not("visible")`. To act on a selection, `select()` exists on list items, tabs and combo-box items in the `uia` backend; list the available methods of any wrapper with `dir(control.wrapper_object())`.

### Fix lookups that fail
- `ElementNotFoundError`: the title or `auto_id` is not what you assumed. Dump the tree again, check that you are on the right backend, and check that the control is visible (collapsed panels and other tabs hide their children).
- `ElementAmbiguousError`: more than one control matches. Add `control_type`, `auto_id` or `found_index=0`.
- `timings.TimeoutError`: the state never arrived. Print the tree at that moment to see whether a different dialog (an update prompt, a license warning) is in the way.
- Keystrokes land in the wrong window: call `set_focus()` first, and make sure no other process steals focus while the script runs.
- Access denied or controls missing for an elevated app: run the Python process elevated as well.

## Examples

### 1. Export a weekly report from a legacy client
**Request:** "Our dispatch software, `RouteDesk.exe`, has no API. Every Friday someone opens Reports, picks Weekly Manifest and clicks Export. Script it."

```python
from pywinauto import Application

app = Application(backend="uia").start(r"C:\Program Files\RouteDesk\RouteDesk.exe")
main = app.window(title_re="RouteDesk.*")
main.wait("ready", timeout=60)
main.print_control_identifiers(depth=3, filename="routedesk_tree.txt")   # first run: read this file
main.menu_select("Reports->Weekly Manifest")
dialog = app.window(title="Weekly Manifest")
dialog.wait("ready", timeout=20)
dialog.child_window(auto_id="txtOutputFolder", control_type="Edit").set_edit_text(r"D:\exports\manifests")
dialog.child_window(title="Export", control_type="Button").invoke()
dialog.wait_not("visible", timeout=120)
app.kill()
```
**Result:** the tree file shows the real titles and `auto_id` values to put in `child_window`, the dialog closes when the export finishes, and the manifest file appears in the output folder. The names RouteDesk uses (`Weekly Manifest`, `txtOutputFolder`) are placeholders for what your own tree dump shows; replace them with what it prints.

### 2. Read the value of a dialog in a program that is already open
**Request:** "Read the status text of the open 'Backup Wizard' window and tell me if it says Completed."

```python
from pywinauto import Desktop

wizard = Desktop(backend="uia").window(title="Backup Wizard")
wizard.wait("exists", timeout=5)
status = wizard.child_window(auto_id="lblStatus", control_type="Text")
text = status.window_text()
print(text)
raise SystemExit(0 if "Completed" in text else 1)
```
**Result:** the script prints the label text and exits 0 only when it contains `Completed`, so a scheduler can alert on exit code 1. `Desktop(...).windows(title_re=".*")` returns every top-level window if you need to list what is open.

## Guidelines
- Use `uia` first for anything modern, `win32` for old Win32/MFC/Delphi programs; if one backend shows few controls in `print_control_identifiers`, try the other.
- Keep a dump of the control tree next to the script and re-dump after every app update: titles and `auto_id` values change between versions.
- `type_keys`, `click_input` and `menu_select` move the real mouse and keyboard: nothing else may use the desktop while they run, and the session must be unlocked.
- Avoid fixed `time.sleep`; use `wait`/`wait_not`. Avoid screen coordinates; use control lookups.
- Use dynamic regexes (`title_re`) for titles that carry a document name or version.
- Windows only for practical purposes: do not use it on Linux or macOS, and do not use it for web pages (use Playwright), or for apps with a real API or command line.
- Test on a throwaway account or copy of the data: a wrong lookup can click Delete as easily as Export. Do not script entry of passwords; read secrets from environment variables if a login is unavoidable.
- When the UI exposes nothing to UI Automation (games, remote-desktop windows, custom-drawn canvases), pywinauto cannot see inside; see the [claude-computer-use](/skills/claude-computer-use) skill for screenshot-based control.
- Log what the script does (window titles found, controls clicked) so a failed unattended run can be diagnosed from the log alone.
- Pin the version in `requirements.txt` (`pywinauto==0.6.9`); behaviour of lookups differs between releases and the 1.0 beta is a different line.
- Run unattended jobs in a dedicated session (a VM or a user that stays logged in), never on a workstation someone is using.
