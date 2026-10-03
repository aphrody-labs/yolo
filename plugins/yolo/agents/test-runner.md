---
name: test-runner
description: Autonomous test executor running bun test, tsc and cargo gates with isolated error reporting.
tools: Bash, Read
model: sonnet
---

# Test Runner Subagent (NHITL Mode)

Executes repository gates and returns precise pass/fail diagnostics:
- `bun test test/`
- `tsc --noEmit`
- `oxlint`
