# AGENTS.md

Pointers for agents landing in this repository:

- User-facing docs: `README.md`
- Adoption guide for design workflows, skills, and sub-agents: `INTEGRATION.md`
- Model-invocable skill: `skills/css-canvas-inspector/` — self-contained
  runtime; install the whole directory into `~/.codex/skills/`,
  `~/.claude/skills/`, or `~/.agents/skills/`.
- Verify: `python3 <skill>/scripts/open_inspector.py <source.html> --check`
  must print `Runtime: OK`.
- Launch from any project:
  `python3 <skill>/scripts/open_inspector.py /absolute/source.html`.
  Omit dimensions for automatic measurement; pass them only for responsive or
  ambiguous layouts.
- Runtime source of truth is `skills/css-canvas-inspector/`. Edit its
  `index.html`, `blank.html`, and `src/` directly; `npm run check` validates
  that the bundled runtime is complete.
- After generating any fixed-size HTML design (cover, poster, card, slide),
  open it in the inspector for human review instead of iterating through
  screenshots. Read back the exported HTML and port deltas into the source.
