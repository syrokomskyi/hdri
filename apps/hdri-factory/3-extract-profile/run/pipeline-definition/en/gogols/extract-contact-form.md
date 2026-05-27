---
factory: extract-contact-form
title: Extract Contact Form
purpose: >-
  Detect contact forms on crawled pages.
details: >-
  Two-pass detection: (1) known CSS selectors for contact/Kontaktformular IDs
  and classes, form[action*=contact]; (2) generic <form> with an email-type
  input field. Returns confidence 85 for known selectors, 70 for generic match.
  Writes one row per content_sha256 to ext_contact_form.
  Idempotent: skips already-extracted content.
inputs:
  - page_observations (pages_YYYY.db) — source of content_sha256 for this batch.
  - HTML files from CAS storage.
outputs:
  - ext_contact_form rows in pages_YYYY.db.
  - extract-report.json — counts of total, extracted, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
---
