---
name: grill-me
description: >-
  Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when: user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
license: Apache-2.0
compatibility: "Claude Code, any AI coding agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: planning
  tags: ["planning", "design-review", "interview", "stress-test", "decision-tree"]
  use-cases:
    - "Stress-test a technical plan by being interviewed about every design decision"
    - "Resolve ambiguities in a feature design through relentless questioning"
    - "Reach shared understanding on a plan by walking down each branch of the decision tree"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

If a question can be answered by exploring the codebase, explore the codebase instead.
