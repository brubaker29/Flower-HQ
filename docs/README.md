# Flower HQ docs

Longer-form notes that don't belong in `CLAUDE.md`. Keep `CLAUDE.md`
focused on "what do I need to know to start editing code"; put deeper
design, data-model, and operations content here.

## Index
- [data-model.md](./data-model.md) — table-by-table schema reference with
  an ER diagram.
- [runbook.md](./runbook.md) — step-by-step Cloudflare setup, deploy,
  adding users to Access, troubleshooting.

## Conventions for adding docs
- Each new sub-app gets its own `docs/<sub-app>.md` describing its data
  model, UX, and any business rules. Link it from this README.
- Keep diagrams in Mermaid so they render on GitHub and stay diff-able.
- Prefer short, skimmable sections over long prose.
