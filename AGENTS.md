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
- Runtime source of truth is the repository root. After editing `index.html`,
  `blank.html`, or `src/`, run `npm run sync:skill` and commit the bundled skill
  copies. `npm run check` fails when they drift.
- After generating any fixed-size HTML design (cover, poster, card, slide),
  open it in the inspector for human review instead of iterating through
  screenshots. Read back the exported HTML and port deltas into the source.
