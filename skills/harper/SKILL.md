---
name: harper
description: >-
  Checks English spelling and grammar locally, in milliseconds, without sending text to any server, using the Harper command-line linter (harper-cli) and language server (harper-ls). Use when a user wants to proofread Markdown, docs, code comments or commit messages offline, add grammar checking to CI or a pre-commit hook, wire harper-ls into Neovim, Helix, Emacs, VS Code or Zed, tune rules and dialects, or replace Grammarly or LanguageTool for privacy reasons. Triggers include "offline grammar checker", "lint my docs for typos", "harper-ls config", "private spellcheck".
license: Apache-2.0
compatibility: "Linux, macOS or Windows; pre-built binaries from GitHub Releases, Homebrew, Scoop, pacman or Nix; Rust stable only if building from source; English text only"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: "harper, grammar-checker, spellcheck, language-server, privacy"
  repository: https://github.com/Automattic/harper
---

# Harper — private, instant grammar checking for docs and code comments

## Overview

Harper is an English grammar and spell checker written in Rust. It runs on your machine, lints a document in milliseconds, uses far less memory than LanguageTool, and never sends text anywhere. It only supports English (American, British, Australian, Canadian and Indian dialects).

Two binaries matter to an agent:

- `harper-cli`: a small command-line linter. The project calls it experimental and it is not published on crates.io, but pre-built binaries are attached to every GitHub release. It reads files or standard input, prints findings, and exits non-zero when it finds any, so it fits CI and scripts.
- `harper-ls`: a Language Server Protocol server. It lints Markdown, plain text, LaTeX, Typst, AsciiDoc and git commit messages, and the comments (only the comments) of most programming languages. Editors talk to it over stdio.

There are also a VS Code extension, a Zed extension, an Obsidian plugin, browser extensions and a JavaScript library (`harper.js`), which this skill does not cover.

## Instructions

### Install harper-ls

Prefer a package manager (all documented by the project):

```bash
brew install harper            # macOS and Linux
scoop install harper           # Windows
sudo pacman -S harper          # Arch Linux
cargo install harper-ls --locked   # needs Rust stable
```

Check with `harper-ls --version`. Run with no arguments it listens on TCP 127.0.0.1:4000; editors normally start it with `--stdio`.

### Install harper-cli

Download the archive for your platform from the releases page, extract it, and put the binary on `PATH`. Asset names follow `harper-cli-<target>.tar.gz` (for example `harper-cli-x86_64-unknown-linux-gnu.tar.gz`, `harper-cli-aarch64-apple-darwin.tar.gz`; the Windows asset is a `.zip`). Pin a release tag in scripts:

```bash
curl -fsSL -o harper-cli.tar.gz https://github.com/Automattic/harper/releases/download/v2.13.0/harper-cli-x86_64-unknown-linux-gnu.tar.gz
echo "3c2db5f53d374f7b3fe70200a6675f5ba43f01b3995974fb32a39e20237e914a  harper-cli.tar.gz" | sha256sum -c -
tar -xzf harper-cli.tar.gz
install -m 0755 harper-cli ~/.local/bin/harper-cli
harper-cli --version
```

The release publishes no checksum file; the SHA-256 above is the digest GitHub records for that asset (`gh api repos/Automattic/harper/releases/tags/v2.13.0 --jq '.assets[] | select(.name=="harper-cli-x86_64-unknown-linux-gnu.tar.gz") | .digest'`). Take it again whenever you change the version or platform.

From a clone of the repository, `cargo install --path harper-cli --locked` also works.

### Lint files

```bash
harper-cli lint README.md docs/guide.md      # rich report with source context
harper-cli lint --format compact docs/       # one line per finding: file:line:col: Rule: message
harper-cli lint --format json notes.md       # structured output with spans and suggestions
harper-cli lint --count notes.md             # only the number of findings
echo "We recieve the colour" | harper-cli lint --format compact -d british
```

Useful flags on `lint`:

- `--only SpellCheck,RepeatedWords` runs just those rules; `--ignore UseTitleCase,SpelledNumbers` runs everything except them (comma-separated rule names).
- `-d, --dialect` takes `us` (default) and the usual codes for British, Australian, Canadian and Indian English.
- `-u, --user-dict-path` points at a custom word list (one word per line); `-f, --file-dict-path` points at the directory of file-local dictionaries.
- `--quiet` hides informational messages, `--no-color` removes colors, `-o` keeps overlapping findings.
- `harper-cli config` prints every rule name with its default and a description; use it to find rule names.

Exit status is 0 when nothing is found and 1 when lints are found ("Error: Lints were found"), so no extra parsing is needed to fail a CI job. Rule names in `--only` and `--ignore` are the short names printed in the report (`SpellCheck`, `AnA`, `RepeatedWords`, `UseTitleCase`).

Suggestions in the JSON output are text such as `Replace with: “the”`. `harper-cli` does not rewrite files; the agent applies the fixes with its own edit tools after reading the findings.

### Wire harper-ls into an editor

Neovim (with nvim-lspconfig):

```lua
require('lspconfig').harper_ls.setup {
  settings = {
    ["harper-ls"] = {
      linters = { SpellCheck = true, SpelledNumbers = false, LongSentences = false },
      dialect = "American",
      diagnosticSeverity = "hint",
    }
  }
}
```

Helix, in `languages.toml`:

```toml
[language-server.harper-ls]
command = "harper-ls"
args = ["--stdio"]

[[language]]
name = "markdown"
language-servers = ["marksman", "markdown-oxide", "harper-ls"]
```

Include the language's default servers in the list, because Helix cannot append a server to the defaults. Emacs (29+, Eglot): `(add-to-list 'eglot-server-programs '(markdown-mode . ("harper-ls" "--stdio")))`. VS Code: `code --install-extension elijah-potter.harper` (setting `harper.path` points at your own `harper-ls`). Zed has an extension that downloads `harper-ls` itself.

### Configuration keys

Settings are sent by the editor under the `harper-ls` key. The documented ones: `linters` (rule name to boolean), `dialect` (`"American"`, `"British"`, `"Australian"`, `"Canadian"`, `"Indian"`), `diagnosticSeverity` (`"error"`, `"hint"`, `"information"`, `"warning"`, default `"hint"`), `maxFileLength` (bytes, default 120000), `excludePatterns` (globs), `userDictPath`, `workspaceDictPath`, `fileDictPath`, `ignoredLintsPath`, `markdown.IgnoreLinkTitle`, `codeActions.ForceStable`, `isolateEnglish`.

### Dictionaries and ignoring

- User dictionary: `~/.config/harper-ls/dictionary.txt` on Linux (created on first use). Workspace dictionary: `.harper-dictionary.txt` at the workspace root, which is the right place for project vocabulary you want to commit.
- A comment containing `harper:ignore` (or `spellcheck:ignore`, `spell-checker:ignore`) makes `harper-ls` skip that comment block.
- Code actions in the editor: ignore for the session, or add a word to the user, workspace or file dictionary.

## Examples

### Example 1: proofread release notes before publishing

**Request**: "Check CHANGELOG.md for typos and grammar mistakes and fix them."

```bash
harper-cli lint --quiet --format compact CHANGELOG.md
```

Output (from a real run on a similar sample file):

```text
CHANGELOG.md:3:66: Miscellaneous::AnA: Incorrect indefinite article.
CHANGELOG.md:3:34: Repetition::RepeatedWords: Did you mean to repeat this word?
CHANGELOG.md:3:14: Spelling::SpellCheck: Did you mean to spell `containes` this way?
CHANGELOG.md:1:1: Capitalization::UseTitleCase: Try to use title case in headings.
Error: Lints were found
```

The agent opens line 3, fixes "containes" to "contains", removes the doubled "the", changes "an new" to "a new", then re-runs the command until it exits 0. The `UseTitleCase` finding is a style choice; leave the heading or add `--ignore UseTitleCase`.

### Example 2: fail a pull request on prose errors in docs

**Request**: "Add a docs check to CI that uses Harper but doesn't nag about project jargon."

```bash
mkdir -p .ci
printf 'Kubernetes\nGrafana\nhelmfile\n' > .ci/words.txt
harper-cli lint --quiet --format compact \
  --user-dict-path .ci/words.txt \
  --ignore UseTitleCase,SpelledNumbers \
  docs/*.md README.md
```

The step exits 1 if any finding remains, which fails the job. Install `harper-cli` earlier in the job from the pinned release URL shown above. The custom word list replaces the default user dictionary, so project terms are accepted while ordinary typos are still caught.

### Example 3: grammar-check comments in a Rust or Python repo

**Request**: "Lint the comments in src/ for typos."

```bash
harper-cli lint --quiet --format compact src/retry.rs
```

Only comments are analysed, not code, so identifiers are not flagged. A real run on `// Retrys the request when the the server is busy` reported `Grammar::RegularIrregulars` (Retrys to Retries) and the repeated word.

## Guidelines

- English only. Do not use Harper on other languages; `isolateEnglish` is documented as new and unstable.
- Findings are suggestions. Harper is fast and occasionally wrong; treat style rules (`LongSentences`, `UseTitleCase`, `SpelledNumbers`) as opinions to enable or disable per project.
- `harper-cli` is explicitly experimental; flags may change between releases, so pin the release tag and read `harper-cli lint --help` after upgrading. Use `harper-ls` through an editor when you want fixes applied interactively.
- Files larger than `maxFileLength` (120000 bytes by default) are skipped by `harper-ls`.
- `harper-ls` listens on 127.0.0.1 in TCP mode; do not expose it on a public interface. Prefer `--stdio`.
- Harper is a grammar and style linter, not a security or code linter. It will not catch logic errors, and it will not check text it cannot parse (binary files, minified code).
- For a consistent house style across many writers, combine it with a documented word list in the repository rather than ad-hoc ignores.
