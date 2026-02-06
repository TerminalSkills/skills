## Add Skill: `your-skill-name`

### Checklist

Before submitting, ensure your skill meets these requirements:

#### Frontmatter (SKILL.md YAML header)
- [ ] `name` — Lowercase kebab-case only (`a-z`, `0-9`, `-`), max 64 chars
- [ ] `description` — States WHAT it does and WHEN to use it, includes trigger words, max 1024 chars, third person (no "I"/"you"/"we")
- [ ] `license` — Present (e.g., `Apache-2.0`)
- [ ] `compatibility` — Concrete system requirements (e.g., "Requires Python 3.9+") or "No special requirements"
- [ ] `metadata.author` — Your GitHub username
- [ ] `metadata.version` — Semantic version (`"1.0.0"`)
- [ ] `metadata.category` — One of: `documents`, `development`, `data-ai`, `devops`, `business`, `design`, `automation`, `research`, `productivity`, `content`
- [ ] `metadata.tags` — Array of 3–5 relevant tags

#### Body Sections
- [ ] **Overview** — 2–3 sentence summary
- [ ] **Instructions** — Step-by-step actionable workflow (not prose), each step tells the agent what to DO
- [ ] **Examples** — At least 2 concrete input/output examples with realistic data (no lorem ipsum / foo / bar)
- [ ] **Guidelines** — Best practices, edge cases, error handling

#### Quality
- [ ] Under 300 lines total
- [ ] Instructions are specific enough that an AI agent can follow them without guessing
- [ ] Works cross-platform (no vendor lock-in or proprietary APIs without a free tier)
- [ ] Solves a real, recurring problem a developer would encounter at least weekly

#### Files
- [ ] `skills/your-skill-name/SKILL.md` added
- [ ] Use-case article added in `use-cases/` (optional but recommended)

---

### What problem does this skill solve?

<!-- Describe the recurring problem this skill addresses -->

### Example usage

<!-- Show a concrete example of the skill in action -->

### Category

<!-- Which category does this skill belong to? -->

### Additional context

<!-- Any other information reviewers should know -->
