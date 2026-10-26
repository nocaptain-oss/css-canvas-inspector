# AGENTS.md

Pointers for agents landing in this repository:

- User-facing docs: `README.md`
- Adoption guide for design workflows, skills, and sub-agents: `INTEGRATION.md`
- Model-invocable skill: `skills/css-canvas-inspector/` — install it into your
  harness's skills directory (`~/.codex/skills/`, `~/.claude/skills/`, or
  `~/.agents/skills/`) to launch the editor on demand.
- Launch: `python3 skills/css-canvas-inspector/scripts/open_inspector.py <source.html> --width W --height H`
- After generating any fixed-size HTML design (cover, poster, card, slide),
  open it in the inspector for human review instead of iterating through
  screenshots. Read back the exported HTML and port deltas into the source.
