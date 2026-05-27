---
factory: capture-environment-profile
title: Capture Environment Profile
purpose: >-
  Record the hardware, software, and configuration context of the machine
  running the audit to ensure transparency and enable reproducibility analysis.
details: >-
  Collects CPU model and core count, total memory, OS platform and version,
  Node.js version, and versions of key tools (lighthouse, chrome-launcher,
  playwright, axe-core, systeminformation). Records brief configuration
  parameters that influence audit execution (concurrency, timeouts, fixture
  mode flags). Emits environment-profile.json with structured data and
  environment-profile.md for human review. This artifact supports peer-review
  and helps explain variance in performance metrics between runs on different
  hardware.
inputs:
  - Brief configuration (audit parameters that affect execution).
outputs:
  - environment-profile.json — structured system and tool metadata.
  - environment-profile.md — human-readable summary.
definitionOfDone:
  - environment-profile.json exists with non-empty hardware and tool sections.
---

