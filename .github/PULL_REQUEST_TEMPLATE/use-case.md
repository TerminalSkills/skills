## Add Use Case: `your-use-case-slug`

### Checklist

Before submitting, ensure your use case meets these requirements:

#### Frontmatter (YAML header)
- [ ] `title` — Action-oriented, starts with a verb (e.g., "Analyze PDF Documents with AI"), max 100 chars
- [ ] `slug` — Lowercase kebab-case matching the filename (e.g., `analyze-pdf-documents`), max 64 chars
- [ ] `description` — One sentence explaining the use case, max 200 chars
- [ ] `skill` — References an existing skill by name, or omitted if no skill exists yet
- [ ] `category` — One of: `documents`, `development`, `data-ai`, `devops`, `business`, `design`, `automation`, `research`, `productivity`, `content`
- [ ] `tags` — Array of 3–5 relevant tags

#### Body Sections
- [ ] **The Problem** — Describes a real pain point (not generic or hypothetical)
- [ ] **The Solution** — Explains the approach; names the skill if one exists
- [ ] **Step-by-Step Walkthrough** — Numbered steps with code examples showing the full workflow
- [ ] **Real-World Example** — A concrete scenario from start to finish (specific role, specific data)
- [ ] **Related Skills** — Links to 2–3 complementary skills (if applicable)

#### Quality
- [ ] Problem is specific and relatable (not "data is hard to work with")
- [ ] Steps are concrete — a reader can follow them immediately
- [ ] Code examples use realistic data (no lorem ipsum / foo / bar)
- [ ] Real-world example tells a story with a specific persona and outcome
- [ ] Under 150 lines total

#### Files
- [ ] `use-cases/your-use-case-slug.md` added
- [ ] `use-cases/` table in `README.md` updated (optional but recommended)

---

### What problem does this use case address?

<!-- Describe the real-world problem. Be specific about who faces it and why it matters. -->

### Target audience

<!-- Who would benefit from this use case? (e.g., backend developers, data analysts, DevOps engineers) -->

### Does a matching skill exist?

<!-- Name the skill if one exists, or describe what skill would need to be built. -->

### Additional context

<!-- Any other information reviewers should know -->
