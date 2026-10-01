---
name: git-guardrails-claude-code
description: >-
  Installs a Claude Code PreToolUse hook that stops destructive git commands before the shell
  runs them: force pushes, pushes to protected branches, reset --hard, clean -f, checkouts and
  restores that discard edits, stash clear and history rewrites, while risky but legitimate
  commands become a confirmation prompt. Use when someone says "stop Claude from pushing",
  "block git push --force", "protect main from Claude Code", "add git safety hooks", "Claude
  wiped my changes with reset --hard", or wants guardrails before running Claude Code in auto
  mode or with permissions bypassed.
license: Apache-2.0
compatibility: "Claude Code with hooks in settings.json (PreToolUse); Python 3.8+ on macOS, Linux or WSL, standard library only."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: devops
  tags: ["claude-code", "git", "hooks", "safety", "guardrails"]
---

# Git Guardrails for Claude Code

## Overview

Claude Code fires a `PreToolUse` hook before every tool call and hands it the call as JSON on stdin; for the Bash tool the command line is in `tool_input.command`. This skill installs one Python script on that event. It tokenizes the command the way a shell would, finds the `git` invocations in it, and answers in one of three ways: stay silent (the normal permission flow continues), return `permissionDecision: "ask"` (the user gets a prompt, even in auto mode), or exit with code 2 (the call is cancelled and Claude reads the reason from stderr). A hook block holds in every permission mode, `bypassPermissions` included.

A plain deny rule such as `Bash(git push *)` is not enough on its own: Claude Code's documentation lists `git -C . push`, `git -c push.default=current push` and `git 'push'` as spellings such a rule does not stop, and a command wrapped in `sh -c '...'` slips past it too. The script handles all of these. It is still a seatbelt for an honest agent, not a security boundary.

## Instructions

### 1. Agree on the policy

Ask three things: where to install, which branches are protected, and what an ordinary push should do. The defaults:

| Command | Outcome | Reason |
|---|---|---|
| `push --force`, `-f`, `+refspec`, `--mirror` | block | overwrites commits on the remote |
| push whose target is a protected branch, named or implied by `HEAD` | block | publishing there is the user's call |
| any other push; `--force-with-lease`, `--delete`, `:branch`, `--all`, `--tags` | ask | visible to others, sometimes wanted |
| `reset --hard`, `clean -f`, `checkout -- path`, `checkout .`, `checkout -f`, `restore` without `--staged` only, `switch --discard-changes` | block | uncommitted work has no reflog |
| `stash clear`, `reflog expire`, `gc --prune`, `prune`, `filter-branch`, `filter-repo`, `update-ref -d`, `rm` on `.git` | block | removes the recovery net itself |
| `branch -D`, `stash drop`, `commit --no-verify`, `checkout name` when `name` is also an existing path | ask | recoverable, or possibly a branch switch |
| commit, rebase, merge, `reset --soft`, `clean -n`, `push --dry-run`, the rest | pass | the reflog can undo it |

- Whole team, this repository: hook in `.claude/settings.json`, script in `.claude/hooks/git-guard.py`, both committed.
- Only you, this repository: hook in `.claude/settings.local.json`, same script path.
- Every project on this machine: hook in `~/.claude/settings.json`, script in `~/.claude/hooks/git-guard.py`.

### 2. Write the script

Save this as `git-guard.py` in the hooks directory chosen above and edit the three constants at the top to match the policy.

```python
#!/usr/bin/env python3
"""Claude Code PreToolUse hook: stop git commands that destroy work or publish it unasked."""
import json, os, re, shlex, sys

PROTECTED = {"main", "master", "production"}  # Claude never pushes to these
PLAIN_PUSH = "ask"                             # every other push: "ask", "allow" or "deny"
FREE_PREFIXES = ()                             # e.g. ("claude/",): pushes to these branches pass silently
VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "fish"}
OPERATOR = re.compile(r"^[();<>|&\n]+$")
def current_branch(cwd):  # reads HEAD from disk, follows a worktree's gitdir file, spawns nothing
    d = os.path.abspath(cwd)
    while True:
        dot = os.path.join(d, ".git")
        if os.path.isfile(dot):
            dot = os.path.join(d, open(dot).read().split("gitdir:", 1)[-1].strip())
        if os.path.isfile(os.path.join(dot, "HEAD")):
            ref = open(os.path.join(dot, "HEAD")).read().strip()
            return ref.split("refs/heads/", 1)[-1] if ref.startswith("ref:") else ""
        if os.path.dirname(d) == d:
            return ""
        d = os.path.dirname(d)
def check_git(argv, cwd):  # argv = the words after "git"; returns (verdict, reason) or None
    i = 0
    while i < len(argv) and argv[i].startswith("-"):  # global options before the subcommand
        if argv[i] == "-C" and i + 1 < len(argv):
            cwd = os.path.join(cwd, argv[i + 1])
        i += 2 if argv[i] in VALUE_OPTS else 1
    if i >= len(argv):
        return None
    sub, args = argv[i], argv[i + 1:]
    longs = {a.split("=")[0] for a in args if a.startswith("--")}
    shorts = "".join(a[1:] for a in args if re.match(r"^-[A-Za-z]+$", a))
    words = [a for a in args if not a.startswith("-")]
    dry = "n" in shorts or "--dry-run" in longs
    if sub == "push" and not dry:
        if longs & {"--force", "--mirror"} or "f" in shorts or any(a.startswith("+") for a in args):
            return "deny", "force push overwrites commits on the remote"
        here = current_branch(cwd)
        targets = [w.split(":")[-1].replace("refs/heads/", "") for w in words[1:]] or [here]
        targets = [here if t in ("HEAD", "@") else t for t in targets]
        mass = longs & {"--delete", "--all", "--branches", "--tags", "--prune"} or "d" in shorts
        if PROTECTED & set(targets) and (words[1:] or not mass):  # --tags or --all alone does not imply HEAD
            return "deny", "push to protected branch " + ", ".join(sorted(PROTECTED & set(targets)))
        if mass or "--force-with-lease" in longs or any(w.startswith(":") for w in words):
            return "ask", "push that rewrites, deletes or mass-updates remote branches"
        if PLAIN_PUSH == "allow" or all(t.startswith(FREE_PREFIXES) for t in targets):
            return None
        return PLAIN_PUSH, "push to " + ", ".join(t or "?" for t in targets)
    if sub == "reset" and "--hard" in longs:
        return "deny", "reset --hard discards uncommitted changes"
    if sub == "clean" and ("f" in shorts or "--force" in longs) and not dry:
        return "deny", "clean -f permanently deletes untracked files"
    if sub == "checkout" and ("f" in shorts or "--force" in longs or "--" in args or "." in args):
        return "deny", "checkout of paths (or -f) overwrites uncommitted changes"
    staged_only = ("--staged" in longs or "S" in shorts) and "--worktree" not in longs and "W" not in shorts
    if sub == "restore" and not staged_only:
        return "deny", "restore overwrites uncommitted changes in the working tree"
    if sub == "switch" and (longs & {"--discard-changes", "--force"} or "f" in shorts):
        return "deny", "switch --discard-changes throws away local edits"
    if sub == "stash" and words[:1] == ["clear"]:
        return "deny", "stash clear deletes every stash"
    if sub in ("filter-branch", "filter-repo", "prune") or (sub == "gc" and "--prune" in longs) \
            or (sub == "reflog" and words[:1] in (["expire"], ["delete"])) or (sub == "update-ref" and "d" in shorts):
        return "deny", sub + " removes history or the objects that make recovery possible"
    if sub == "branch" and ("D" in shorts or {"--delete", "--force"} <= longs or {"d", "f"} <= set(shorts)):
        return "ask", "force-delete of a branch that may hold unmerged commits"
    if sub == "stash" and words[:1] == ["drop"]:
        return "ask", "stash drop"
    if sub == "checkout" and not set("bB") & set(shorts) and any(os.path.exists(os.path.join(cwd, w)) for w in words):
        return "ask", "checkout of a name that is also a path overwrites uncommitted changes in it"
    if sub == "commit" and ("--no-verify" in longs or "n" in shorts):
        return "ask", "commit that skips the pre-commit hooks"
    return None
def scan(command, cwd, depth=0):
    lex = shlex.shlex(command.replace("\\\n", ""), posix=True, punctuation_chars="();<>|&\n")  # join continued lines
    lex.whitespace, lex.whitespace_split, lex.commenters = " \t\r", True, ""
    tokens = [t.strip("`$({})") or t for t in lex]
    found = []
    for i, tok in enumerate(tokens):
        name, rest = os.path.basename(tok).lower(), tokens[i + 1:]
        rest = rest[:next((k for k, t in enumerate(rest) if OPERATOR.match(t)), len(rest))]
        if name in ("git", "git.exe"):
            found.append(check_git(rest, cwd))
        elif name in ("cd", "pushd") and rest:
            cwd = os.path.join(cwd, os.path.expanduser(rest[0]))
        elif name in ("rm", "rmdir") and any(re.search(r"(^|/)\.git(/|$)", t) for t in rest):
            found.append(("deny", "deleting .git destroys the repository history"))
        elif depth < 3 and (name == "eval" or (name in SHELLS and any(re.match(r"^-[a-z]*c$", t) for t in rest))):
            for t in rest:  # the string handed to sh -c or eval is a command line of its own
                if " " in t or name == "eval":
                    found.extend(scan(t, cwd, depth + 1))
    return [f for f in found if f]
def main(raw):
    data = json.loads(raw)
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return 0
    command = (data.get("tool_input") or {}).get("command") or ""
    try:
        found = scan(command, data.get("cwd") or ".")
    except ValueError:  # quoting shlex cannot balance, such as an unquoted heredoc body
        risky = re.search(r"\bgit\b[^\n;|&]*\b(push|reset|clean|checkout|restore|switch|stash|reflog|gc|prune|filter-branch"
                          r"|filter-repo|update-ref)\b|\brm\b[^\n;|&]*\.git\b", command)
        found = [("ask", "unparseable command that mentions " + risky.group(0).strip()[:60])] if risky else []
    deny = sorted({reason for verdict, reason in found if verdict == "deny"})
    ask = sorted({reason for verdict, reason in found if verdict == "ask"})
    if deny:
        print("git-guard blocked this command: " + "; ".join(deny) + ". Do not retry it in another form. "
              "Tell the user what you wanted to achieve and let them run it.", file=sys.stderr)
        return 2
    if ask:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask",
                                                 "permissionDecisionReason": "git-guard: " + "; ".join(ask)}}))
    return 0
if __name__ == "__main__":
    raw = sys.stdin.read()
    try:
        sys.exit(main(raw))
    except Exception as exc:  # a broken guard must not wave git commands through
        print(f"git-guard error: {exc!r}", file=sys.stderr)
        sys.exit(2 if "git" in raw else 0)
```

### 3. Register the hook

Add one matcher group to `hooks.PreToolUse` in the chosen settings file. Read the file first and keep every existing key, hook and permission rule; if a group that runs `git-guard.py` is already there, change nothing. Finish with `python3 -m json.tool .claude/settings.json` to prove the file still parses.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "python3",
                    "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guard.py"], "timeout": 10 }] }
    ]
  }
}
```

- `args` selects exec form: no shell starts, so nothing from a shell profile can land in front of the JSON the script prints and the path needs no quoting. If your Claude Code version rejects `args`, the shell form `"command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/git-guard.py"` also works.
- Exec form substitutes `${CLAUDE_PROJECT_DIR}` itself; with no shell involved, do not count on `~` or `$HOME` expanding. For a machine-wide install write the absolute path that `echo "$HOME/.claude/hooks/git-guard.py"` prints.
- Do not add `"if": "Bash(git *)"`. The filter is best-effort and follows permission-rule matching, which does not see a `git` call inside `sh -c '...'`; the script has to receive every Bash command.
- On Windows, where Claude may use the PowerShell tool, set the matcher to `Bash|PowerShell` and the command to `python`.

### 4. Test the script before trusting it

Pipe sample hook input through it; nothing here touches a repository.

```bash
guard() {
  python3 -c 'import json,os,sys; print(json.dumps({"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":os.getcwd(),"tool_input":{"command":sys.argv[1]}}))' "$1" \
    | python3 .claude/hooks/git-guard.py; echo "[exit $?] $1"
}
guard 'git push -u origin feature/invoice-export'   # exit 0 and JSON with permissionDecision "ask"; a harmless command prints nothing
guard 'git push origin HEAD:main'                   # exit 2, reason on stderr
guard "sh -c 'git clean -fdx'"                      # exit 2
guard 'git commit -m "Explain why git push --force is blocked"'   # exit 0: quoted text is not a command
```

### 5. Confirm it is live in Claude Code

1. Run `/hooks` and open `PreToolUse`: the handler must be listed with the settings file it came from. Edits to settings are picked up by the file watcher; restart the session if the entry is missing.
2. Ask Claude to run `git restore does-not-exist.txt`. With the hook working the transcript shows the git-guard message. If git's own "pathspec did not match" error appears instead, the hook did not run, and nothing was lost.
3. A `hook error` notice on a Bash call that says `Failed with non-blocking status code` means the hook could not start (no `python3` on `PATH`). Claude Code lets the command through in that case, so fix it at once. A wrong script path fails the other way: `python3` exits 2 with `can't open file`, which blocks every Bash call until the path is corrected. `claude --debug-file /tmp/claude-hooks.log` records every hook's exit code and output.

### 6. Add the layers the hook cannot provide

```json
{ "permissions": { "deny": ["Bash(git push --force *)", "Bash(git push -f *)", "Bash(git reset --hard *)", "Bash(git clean -f*)"] } }
```

Deny rules are evaluated whatever a hook returns, so these still hold if Python goes missing. Then tell the user to protect the branch on the git host as well (on GitHub: a ruleset or branch protection that blocks force pushes and requires pull requests); only the server can enforce that.

## Examples

### Example 1: a team repository that already has hooks

Request: "Stop Claude from pushing to main in this repo. Feature branches are fine if it asks first." The repository of a small invoicing product already formats files after edits. The policy is the default one, scope is the project, and the merged `.claude/settings.json` keeps what was there:

```json
{
  "permissions": { "allow": ["Bash(npm run *)"] },
  "hooks": {
    "PostToolUse": [{ "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "npx prettier --write --ignore-unknown .", "timeout": 30 }] }],
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "python3", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guard.py"], "timeout": 10 }] }]
  }
}
```

Test run on branch `feature/invoice-export`:

```text
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "git-guard: push to feature/invoice-export"}}
[exit 0] git push -u origin feature/invoice-export
git-guard blocked this command: push to protected branch main. Do not retry it in another form. Tell the user what you wanted to achieve and let them run it.
[exit 2] git push origin HEAD:main
git-guard blocked this command: reset --hard discards uncommitted changes. Do not retry it in another form. Tell the user what you wanted to achieve and let them run it.
[exit 2] git -C . reset --hard HEAD~1
```

Report to the user: both files are ready to commit, pushes to `main`, `master` and `production` are refused, other pushes prompt, and `main` still needs a ruleset on GitHub.

### Example 2: a solo developer who lets Claude push its own branches

Lena releases from `trunk` and runs Claude Code in auto mode. She wants branches named `claude/...` pushed without a prompt and every other push refused. Only the constants change:

```python
PROTECTED = {"trunk", "release"}
PLAIN_PUSH = "deny"
FREE_PREFIXES = ("claude/",)
```

```text
[exit 0] git push -u origin claude/csv-import
git-guard blocked this command: push to protected branch trunk. Do not retry it in another form. Tell the user what you wanted to achieve and let them run it.
[exit 2] git push origin claude/csv-import:trunk
git-guard blocked this command: push to fix/typo. Do not retry it in another form. Tell the user what you wanted to achieve and let them run it.
[exit 2] git push origin fix/typo
```

Tags are refused too (`git push origin v2.4.0` targets a name outside `claude/`), which suits her: releases stay manual.

## Guidelines

- The hook reads command text only. It cannot see a git call inside a script file, a Makefile target, an npm script, a git alias, a variable (`G=git; $G push -f`), a command substitution inside double quotes (`echo "$(git reset --hard)"`), or text fed to a shell on stdin (`echo ... | sh`, `bash <<< ...`). Server-side branch protection covers what it misses.
- Only exit code 2 blocks. Exit 1, a crash, a missing interpreter and a timeout are all non-blocking and the command runs. The script therefore exits 2 when it fails on input that mentions git.
- `ask` reaches the user as a permission prompt and is not shown to Claude; a block is shown to Claude. Keep the block message instructive, or the model will try the same thing in a different spelling.
- Expected false positives: a heredoc body or a comment whose line contains a blocked command is treated as that command. Use the Write tool for such files instead of weakening the rules.
- `checkout`, `restore` and `clean` are blocked because uncommitted work cannot be recovered. When Claude needs a clean tree, the safe route is `git stash push -u`, which the guard allows.
- `.claude/` is a protected path: a write there prompts in default and acceptEdits modes, goes to the classifier in auto mode, and is allowed outright in `bypassPermissions`. Review changes to the script and the settings like any other code.
- Not the right tool for secret scanning, commit-message rules or code checks. Those belong in git's own pre-commit and pre-push hooks or in CI.
