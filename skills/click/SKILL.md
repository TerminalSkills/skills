---
name: click
description: >-
  Click is the Python library for building command-line tools from decorated
  functions: it parses options and arguments, validates types, prompts for
  missing values, and writes the --help pages. Use when a user asks to "build
  a Python CLI", "add a subcommand", "add an option with an environment
  variable fallback", "prompt for a password", "test a click command with
  CliRunner", "package a CLI with pyproject.toml scripts", or "add shell
  completion". Covers Click 8.2 to 8.5.
license: Apache-2.0
compatibility: "Python 3.10+ (Click 8.5), pip or uv"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "python, cli, click, command-line, argument-parsing"
  repository: https://github.com/pallets/click
---

# Click — Python command-line interfaces from decorated functions

## Overview

Click turns a Python function into a command: decorators declare the options and arguments, Click parses `sys.argv`, converts and validates each value, and generates `--help`. Commands nest into groups of any depth, values can fall back to environment variables or interactive prompts, and `click.testing.CliRunner` runs a command in-process for tests. Click is the engine underneath Typer and Flask's CLI. It is a Python library; for Node.js CLIs see the `commander` skill.

Everything below was run against Click 8.5.0 (current on PyPI in November 2026), which requires Python 3.10+.

## Instructions

### Install

Install into the project's virtual environment, never system Python.

```bash
python3 -m venv .venv
.venv/bin/pip install "click>=8.2"
```

### One command

Options start with `-`, arguments are positional. The parameter name is derived from the longest flag (`--dry-run` becomes `dry_run`) unless you give a name as a plain string.

```python
import click


@click.command()
@click.argument("database")
@click.option("--keep", type=click.IntRange(min=1, max=90), default=7, show_default=True,
              help="Number of backups to retain.")
@click.option("--dry-run", is_flag=True, help="Print the plan without writing.")
def backup(database, keep, dry_run):
    """Back up DATABASE and keep the newest backups."""
    click.echo(f"{database}: keeping {keep}, dry run={dry_run}")


if __name__ == "__main__":
    backup()
```

The docstring becomes the help text. Use `click.echo` rather than `print` (it handles encodings and pipes), and `err=True` for diagnostics so stdout stays machine-readable.

### Groups, shared state, and the root options

A group is a command whose subcommands are registered with `@group.command()`. Options on the group run first; pass what subcommands need through `ctx.obj`.

```python
@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(package_name="backupctl")
@click.option("-v", "--verbose", count=True, help="Repeat for more detail (-vv).")
@click.pass_context
def main(ctx, verbose):
    """Manage nightly database backups."""
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose


@main.command()
@click.pass_context
def status(ctx):
    """Show the last backup."""
    if ctx.obj["verbose"]:
        click.echo("reading state file", err=True)
    click.echo("last backup: 2026-11-04 02:00")
```

`version_option(package_name=...)` reads the installed package's version from its metadata. `count=True` turns repeated `-v` into an integer. Do not read `click.__version__`: it is deprecated since 8.2 and removed in 9.1; use `importlib.metadata.version("click")`.

### Types and validation

| Need | Use |
|---|---|
| Closed set of strings | `click.Choice(["sql", "custom"], case_sensitive=False)` |
| Bounded number | `click.IntRange(min=1, max=90)`, `click.FloatRange(...)` |
| File or directory path | `click.Path(exists=True, dir_okay=False, path_type=Path)` |
| Open file (supports `-` for stdin/stdout) | `click.File("r")` |
| Date | `click.DateTime(formats=["%Y-%m-%d"])` |

A violation prints `Error: Invalid value for '--keep': ...` with exit code 2 and no traceback. For your own checks raise `click.UsageError("...")` (exit 2) or `click.ClickException("...")` (exit 1) from inside the command.

### Environment variables, prompts, secrets, repeats

```python
@main.command()
@click.argument("database")
@click.option("--keep", type=click.IntRange(min=1, max=90), default=7, show_default=True,
              help="Number of backups to retain.")
@click.option("--token", envvar="BACKUPCTL_TOKEN", prompt=True, hide_input=True,
              help="API token; read from BACKUPCTL_TOKEN or prompted.")
@click.option("--tag", "tags", multiple=True, help="Label to attach; repeatable.")
@click.option("--format", "fmt", type=click.Choice(["sql", "custom"]), default="sql")
def run(database, keep, token, tags, fmt):
    """Run a backup of DATABASE."""
    click.echo(f"{database}: keep={keep} tags={list(tags)} format={fmt}")
```

Resolution order is the command line, then `envvar`, then `default`, then the prompt. With `prompt=True` the prompt only appears when no value was found, so a CI job that sets the variable never blocks. `multiple=True` gives a tuple (empty when the option is absent). Use `click.confirm("Delete every backup?", abort=True)` before destructive steps; answering no exits with code 1 and prints `Aborted!`.

Auto-read all options from a prefix with `@click.group(context_settings={"auto_envvar_prefix": "BACKUPCTL"})` (variable names become `BACKUPCTL_<COMMAND>_<OPTION>` for subcommand options).

### Package it as an installable command

Put the code in `src/backupctl/cli.py`, expose the group as `main`, and declare the script in `pyproject.toml`:

```toml
[project]
name = "backupctl"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["click>=8.2"]

[project.scripts]
backupctl = "backupctl.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]
```

```bash
.venv/bin/pip install -e .
.venv/bin/backupctl --help
```

### Test with CliRunner

```python
from click.testing import CliRunner

from backupctl.cli import main


def test_bad_keep():
    result = CliRunner().invoke(main, ["run", "orders", "--keep", "0"],
                                env={"BACKUPCTL_TOKEN": "x"})
    assert result.exit_code == 2
    assert "Invalid value for '--keep'" in result.output
```

`invoke` takes the argument list, `input=` for prompts (`"hunter2\n"`), and `env=` for variables. Since 8.2 `result.output` holds stdout and stderr interleaved as the user would see them, `result.stdout` and `result.stderr` hold each stream separately, and the old `mix_stderr` argument is gone. Exceptions are caught into `result.exception`; check `result.exit_code` first and print `result.output` in the assertion message when debugging. `CliRunner.isolated_filesystem` is deprecated since 8.5: use pytest's `tmp_path` and absolute paths.

### Shell completion

Click ships completion for bash, zsh, fish and (8.5+) PowerShell. The variable name is `_<PROGRAM>_COMPLETE` with the program name upper-cased and dashes turned into underscores:

```bash
_BACKUPCTL_COMPLETE=bash_source backupctl > ~/.backupctl-complete.bash
echo 'source ~/.backupctl-complete.bash' >> ~/.bashrc
```

Use `zsh_source`, `fish_source` or `powershell_source` for the other shells. The command must be on `PATH` under its script name, so install it with `pip install -e .` first.

## Examples

### Example 1: Internal tool with a group and env-based token

Request: "Create a `backupctl` CLI with `run` and `purge` commands. The token comes from `BACKUPCTL_TOKEN` or a hidden prompt, and `purge` must ask before deleting."

The agent writes `src/backupctl/cli.py` with the group above plus:

```python
@main.command()
@click.option("--yes", is_flag=True, help="Skip confirmation.")
def purge(yes):
    """Delete all local backups."""
    if not yes:
        click.confirm("Delete every backup?", abort=True)
    click.echo("purged")
```

```bash
.venv/bin/pip install -e .
BACKUPCTL_TOKEN=tok-4821 .venv/bin/backupctl run orders --keep 14 --tag nightly
.venv/bin/backupctl run orders --format xml </dev/null
```

The first call runs without prompting. The second prints `Error: Invalid value for '--format': 'xml' is not one of 'sql', 'custom'.` and exits with status 2.

### Example 2: Test prompts, errors and exit codes

Request: "Write pytest tests for the CLI that cover the prompt, a bad value and the abort path."

```python
# appended to tests/test_cli.py, which already imports CliRunner and main
def test_prompt_input():
    result = CliRunner().invoke(main, ["run", "orders"], input="hunter2\n")
    assert result.exit_code == 0
    assert "Token:" in result.output


def test_purge_abort():
    result = CliRunner().invoke(main, ["purge"], input="n\n")
    assert result.exit_code == 1
    assert "Aborted!" in result.output
```

```bash
.venv/bin/pip install pytest
.venv/bin/pytest -q
```

Expected: with `test_bad_keep` from the CliRunner section in the same `tests/test_cli.py` (which holds the imports), `3 passed`.

## Guidelines

- Prefer `click.echo` over `print`, and send errors and progress to stderr (`err=True`) so pipes carry only data.
- A hidden prompt (`hide_input=True`) never echoes, but the value still appears in `ps` output if passed as `--token`. Offer `envvar` and document it; never log it.
- `@click.pass_context` and `ctx.obj` carry shared state; `ctx.invoke` and `ctx.forward` call other commands. Keep command functions thin and put logic in plain functions you can test directly.
- Set `show_default=True` on options with defaults, and always write the docstring: it is the user-facing help.
- Use `click.Path(path_type=Path)` to get `pathlib.Path` objects and avoid manual conversion.
- For large tools, load subcommands lazily with a custom `click.Group` subclass overriding `list_commands` and `get_command` so `--help` and start-up stay fast.
- Click is not for argument-heavy data pipelines that need type-hint-driven definitions; if the project already uses type annotations everywhere, Typer (built on Click) may suit better, but it is a separate tool.
- Pin `click>=8.2` if you use `CliRunner` output behaviour from this guide; older versions need `mix_stderr`.
