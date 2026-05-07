# Contributing

## Deployment Workflow

All production deployments must flow through `main` via pull request.

1. Create a feature branch from `main`.
2. Push the feature branch to GitHub.
3. Open a pull request into `main`.
4. Confirm checklist items in the PR template.
5. Merge only after review.

## Branch Naming Convention

Use one of these prefixes:

- `feat/<short-description>` for new features
- `fix/<short-description>` for bug fixes
- `chore/<short-description>` for maintenance
- `test/<short-description>` for test-only changes
- `docs/<short-description>` for documentation updates

Examples:

- `feat/lobby-create-join-ui`
- `fix/socket-origin-on-deploy`
- `test/engine-battle-edge-cases`

## Pull Request Rules

- Keep PRs focused on one change set.
- Include tests for behavior changes.
- Do not merge if CI fails.
- Do not push directly to `main`.

## Merge Policy

Prefer **Squash and merge** so each deployment maps to one clean commit on `main`.
