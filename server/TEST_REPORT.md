# Test Report

Generated: 2026-05-12
Scope: Unit and regression/behavioral test status for the server package.

## Overall Status

- Result: PASS
- Test files: 9 passed / 9 total
- Test cases: 205 passed / 205 total
- Duration: 3.03s
- Command used: npm test

## Suite Breakdown

### Unit-focused suites

- tests/movementRules.test.ts: 3 passed
- tests/recruitmentRules.test.ts: 3 passed
- tests/engine.test.ts: 45 passed
- tests/ai-controller.test.ts: 4 passed

Subtotal (unit-focused): 55 passed

### Regression and behavioral suites

- tests/behavioral.test.ts: 58 passed
- tests/engine-advanced.test.ts: 39 passed
- tests/rules-advanced.test.ts: 30 passed

Subtotal (regression/behavioral): 127 passed

### UI snapshot suite

- tests/framework-ui.behavioral.test.ts: 3 passed
- tests/framework-ui.inventory.test.ts: 20 passed
- Dedicated report: FRAMEWORK_UI_TEST_REPORT.md

Subtotal (UI snapshot): 23 passed

Grand total: 205 passed

## Coverage Summary

Source: coverage/coverage-summary.json

- Statements: 89.38%
- Branches: 80.74%
- Functions: 92.02%
- Lines: 89.61%

## Coverage by Area

- src/game/recruitmentRules.ts: 96.77% statements, 89.28% branches
- src/game/movementRules.ts: 91.11% statements, 78.12% branches
- src/game/engine.ts: 90.24% statements, 83.05% branches
- src/ai/controller.ts: 85.58% statements, 73.88% branches
- src/game/creatureDefs.ts: 80.00% statements, 50.00% branches

## Notes

- Behavioral test output includes deterministic move/recruit flows for Marsh and Plains terrain paths.
- UI snapshot coverage is provided by tests/framework-ui.behavioral.test.ts and captures the lobby shell, tower selection, and in-game panel render states.
- The lowest branch coverage is in src/game/creatureDefs.ts and src/ai/controller.ts.
- If desired, branch coverage can be improved with focused edge-case tests around creature definitions and AI decision branches.
