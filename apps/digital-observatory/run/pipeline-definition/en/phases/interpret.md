---
title: Interpret
summary: >
  Applies the HDRI codebook to observations to produce versioned scores,
  computes cohorts, and generates narrative anchors.
members:
  - id: score-hdri
  - id: build-cohorts
---

# Phase: Interpret

Pure-function scoring: reads observations + codebook, writes Score records
with computation_hash for full theory reconstruction.
