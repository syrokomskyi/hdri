---
factory: extract-impressum-contacts
title: Extract Impressum Contacts (opt-in, factory-local PII)
purpose: >-
  Parse owner names, address, phone, email and USt-IdNr from fetched Impressum
  pages into the factory-local ext_impressum_contacts table. Personal data —
  never bridged into observations / HDRI / the published dashboard.
details: >-
  Runs only when brief.collectImpressumContacts is true. Reads each fetched
  Impressum page (ext_impressum.detected_page_sha256 → page_contents) from CAS,
  calls extractImpressumContacts(), and upserts one row per Impressum-page
  content hash. Idempotent on (content_sha256, extractor_ver). The target table
  has no entry in EXT_SIGNAL_MAP, so this data is structurally excluded from the
  observation pipeline (locked by a regression test in @syrokomskyi/observatory-core).
inputs:
  - ext_impressum (pages_YYYY.db) — provides detected_page_sha256 for fetched Impressum pages.
  - page_contents (pages_YYYY.db) — storage_path for the fetched Impressum HTML.
  - HTML files from CAS storage.
outputs:
  - ext_impressum_contacts rows in pages_YYYY.db (factory-local PII).
  - extract-report.json — counts of total, parsed, skipped.
definitionOfDone:
  - extract-report.json exists in the gogol output directory.
  - No ext_impressum_contacts data appears in any emit-bundle or observatory database.
---
