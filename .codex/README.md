# Codex Project Notes

This folder contains project-specific guidance for future Codex sessions.

Read `../AGENTS.md` first. The short version:

- Keep business flows clean.
- Move request/translation/parsing/cleanup details into helpers or adapters.
- Keep prompts in `src/prompts/`.
- Keep UI components in `src/components/`.
- Validate with `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.

## Current Priorities

1. Continue reducing `src/App.tsx` by extracting focused UI components.
2. Keep local llama.cpp and cloud OpenAI-compatible runtime support.
3. Preserve file-based local report storage.
4. Avoid mixing provider quirks into business flow or UI code.

## Useful Commands

```bash
npm.cmd run lint
npm.cmd run build
git status --short
git diff --check
```

## Local Context

The user often runs commands from Git Bash, but Codex may run PowerShell. In PowerShell, prefer `npm.cmd` instead of `npm`.

Reports are local artifacts under `reports/` and are ignored by git.
