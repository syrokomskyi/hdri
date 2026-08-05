---
title: Validate quarter
factory: validate-quarter
summary: >
  Runs all 8 scientific QC report tools, executes empty-scratch rebuild
  verification, and produces a QuarterValidationReport.
decisionType: auto
---

# Validate quarter

Generates the 8 scientific QC reports, runs `quarter:rebuild-verify` to
prove an independent rebuild matches the public archive, then runs
`quarter:validate` to produce `validation-report.json`. The validation
report must show `status: "pass"` for the release step to proceed.
