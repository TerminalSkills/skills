---
title: Triage a Backlog of Articles and Talks into Notes with Fabric
slug: triage-reading-and-watch-backlog-with-fabric
description: Rate a pile of saved articles and conference talks, keep structured notes on the ones worth it, and send a weekly digest to the team.
skills:
  - fabric
  - yt-dlp
  - ollama
category: productivity
tags:
  - reading-backlog
  - summarization
  - youtube-transcripts
  - note-taking
  - prompt-patterns
---

## The Problem

Priya Raman is a staff engineer at a 40-person payments startup. Her team expects her to keep up with the field: database internals, Go releases, incident write-ups, and conference talks. Her "read later" list has 63 items: 38 public articles, 22 recorded talks (most of them 40 to 90 minutes long) and 3 internal postmortems. Every Friday she spends about six hours skimming, and still cannot say which half of the list was worth it.

She has tried pasting articles into a chat window, but every time she writes a slightly different prompt, the notes come out in a different shape, and the transcripts of long talks do not fit in a paste. She wants the same questions asked of every item, notes that look the same each week, and a short digest she can post in the team channel. The internal postmortems must not leave her laptop.

## The Solution

The agent uses **Fabric** to run the same named prompt patterns over every item from the terminal: a custom `rate_for_team` pattern to decide what deserves attention, `extract_article_wisdom` and `extract_wisdom` for notes, and a custom pattern for the team digest. **yt-dlp** supplies YouTube transcripts through `fabric -y`. **Ollama** runs the triage pass and everything about the postmortems on a local model, and a cloud model writes notes only for the public items that pass triage.

Homebrew installs the binary as `fabric-ai`, and an agent runs every command in a fresh non-interactive shell where aliases do not exist, so all commands below call `fabric-ai` by name.

## Step-by-Step Walkthrough

### 1. Install and configure

> "Install Fabric and set it up so triage runs on a local model and the final notes on Claude. My Anthropic key is already exported as ANTHROPIC_API_KEY."

```bash
brew install fabric-ai yt-dlp ollama
brew services start ollama          # ollama pull needs a running server
ollama pull llama3.1:8b

mkdir -p ~/.config/fabric ~/fabric-patterns
cat >> ~/.config/fabric/.env <<EOF
DEFAULT_VENDOR=Anthropic
DEFAULT_MODEL=claude-sonnet-4-5
OLLAMA_API_URL=http://localhost:11434
CUSTOM_PATTERNS_DIRECTORY=$HOME/fabric-patterns
EOF
fabric-ai -U                        # download the built-in patterns
```

The default vendor is the cloud one, so every local step below passes `-V Ollama -m llama3.1:8b` on the command line. Nothing depends on an exported variable that a new shell would lose.

### 2. Pull every item into plain text once

> "Here is my list in queue.txt. Fetch each article and talk transcript into an inbox folder so we only download things once. The postmortems are in our repo; copy them to a separate private folder."

```bash
mkdir -p inbox private
n=0
while read -r url; do
  n=$((n+1)); out="inbox/$(printf '%03d' "$n").md"
  case "$url" in
    *youtube.com*|*youtu.be*) fabric-ai -y "$url" < /dev/null > "$out" ;;
    *)                        fabric-ai -u "$url" < /dev/null > "$out" ;;
  esac
  echo "$url" > "$out.src"
done < queue.txt
cp ~/src/payments-platform/docs/postmortems/2026-09-*.md private/
wc -w inbox/*.md | sort -n | tail -3
```

The `< /dev/null` matters: Fabric reads all of stdin whenever it is not a terminal, so without it the first call would swallow the rest of `queue.txt` and send it to the model as a chat. The postmortems never go through `-u` (Jina's reader service) or into `inbox/`.

### 3. Rate everything on the local model

> "Rate each item for our team's interests and give me a table sorted by score."

The built-in `rate_content` pattern scores content against its author's own themes (human meaning, the future of AI, mental models, art, books), so database and incident material would land in C or D. The agent writes a team version with the themes as a variable:

```bash
mkdir -p ~/fabric-patterns/rate_for_team
cat > ~/fabric-patterns/rate_for_team/system.md <<'EOF'
# IDENTITY and PURPOSE

You decide whether a piece of content is worth the time of an engineer on the {{team}} team.

# STEPS

- Count the distinct, useful ideas in the input.
- Judge how closely the input matches these themes: {{themes}}.

# OUTPUT

TIER: one letter from S, A, B, C, D (S = read or watch the original now, D = skip)
SCORE: an integer from 1 to 100
WHY: three short bullets

Output only these three sections, as plain text.

# INPUT:
EOF

for f in inbox/*.md; do
  fabric-ai -p rate_for_team -V Ollama -m llama3.1:8b --modelContextLength 32768 \
    -v "team:payments platform" \
    -v "themes:Postgres and database internals, Go, incident response, payment systems" \
    < "$f" > "${f%.md}.rating"
done

for r in inbox/*.rating; do
  score=$(sed -n 's/^SCORE: *\([0-9]*\).*/\1/p' "$r" | head -1)
  tier=$(sed -n 's/^TIER: *\([SABCD]\).*/\1/p' "$r" | head -1)
  printf '%s\t%s\t%s\n' "${score:-0}" "${tier:-?}" "$(cat "${r%.rating}.md.src")"
done | sort -t$'\t' -k1,1nr | head -20
```

`--modelContextLength 32768` is needed because Ollama's default window is 4,096 tokens, which would cut a 90-minute transcript to its first few minutes. The larger window costs about 4 GB of extra memory for an 8B model. A rating with `?` means the model ignored the format; the agent reruns that file. The ratings are a small model's judgment and can shift between runs, so they sort the list; they do not replace reading.

### 4. Extract notes for the items that pass

> "For every S or A tier item, write full notes into my notes folder. Talks get extract_wisdom, articles get extract_article_wisdom. Do the postmortems locally."

```bash
mkdir -p ~/notes/reading ~/notes/private
for r in $(grep -l -E '^TIER: *[SA]([^A-Za-z]|$)' inbox/*.rating); do
  f="${r%.rating}.md"
  case "$(cat "$f.src")" in
    *youtube.com*|*youtu.be*) p=extract_wisdom ;;
    *)                        p=extract_article_wisdom ;;
  esac
  fabric-ai -p "$p" < "$f" -o ~/notes/reading/"$(date +%F)-$(basename "$f")"
done

for f in private/*.md; do
  fabric-ai -p extract_article_wisdom -V Ollama -m llama3.1:8b --modelContextLength 32768 \
    < "$f" -o ~/notes/private/"$(date +%F)-$(basename "$f")"
done
```

Postmortem notes go to a separate folder, so the cloud digest in the next step never sees them.

### 5. Write the team digest with a custom pattern

> "Make a pattern that turns this week's notes into a short digest for the payments platform team, and run it."

```bash
mkdir -p ~/fabric-patterns/write_team_digest
cat > ~/fabric-patterns/write_team_digest/system.md <<'EOF'
# IDENTITY and PURPOSE

You write a weekly reading digest for the {{team}} team.

# OUTPUT

- A section called WORTH YOUR TIME: at most 5 items, one line each, with why it matters to {{team}}.
- A section called ONE THING TO TRY: a single concrete experiment.
- Plain Markdown, under 250 words.

# INPUT:
EOF

cat ~/notes/reading/"$(date +%F)"-*.md \
  | fabric-ai -p write_team_digest -v "team:payments platform" -o digest.md
```

Only `~/notes/reading` feeds the digest, so it contains public material alone.

## Real-World Example

On the first Friday, Priya's queue of 60 public links produced 60 inbox files (about 390,000 words of text, most of it from the 22 talk transcripts), and her 3 postmortems went to `private/`. The local triage pass took 52 minutes on her laptop and cost nothing. It rated 4 items S tier, 9 A tier, and 25 C or D tier.

The 13 S and A items went to Claude for notes, about 180,000 input tokens in total, which she checked with `--show-metadata`. The postmortem notes came from the local model and stayed on disk. She read the notes over coffee, watched two of the talks in full, and deleted the 25 C and D items from her list without opening them. `digest.md` came out at 212 words and went into the team channel unchanged except for one link.

Friday reading time dropped from about six hours to under two. Because the patterns are files, she committed `rate_for_team` and `write_team_digest` to the team's dotfiles repository, and two colleagues now run the same loop on their own lists with their own `themes`.

## Related Skills

- [fabric](/skills/fabric) — runs the custom rate_for_team and write_team_digest patterns and the built-in extract_wisdom and extract_article_wisdom
- [yt-dlp](/skills/yt-dlp) — fetches the YouTube captions that `fabric -y` turns into transcripts
- [ollama](/skills/ollama) — serves the local model for triage and for the confidential postmortems
