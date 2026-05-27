---
title: Phase 2 · Extract
purpose: >-
  Run focused signal-extraction gogols over crawled HTML, each writing to its
  own flat table in pages_YYYY.db.
entryCriteria:
  - Phase 1 (crawl) complete; page_observations populated for this batch.
  - HTML files present in CAS storage under .output/data/content/.
successSignals:
  - ext_impressum, ext_datenschutz, ext_opening_hours, ext_cookie_banner,
    ext_copyright_year, ext_phone, ext_email all populated for the batch content hashes.
  - Each gogol has written extract-report.json.
exitCriteria:
  - All extract-report.json artifacts exist.
members:
  - extract-impressum
  - extract-datenschutz
  - extract-opening-hours
  - extract-cookie-banner
  - extract-copyright-year
  - extract-phone
  - extract-email
  - extract-schema-local-business
  - extract-schema-service
  - extract-schema-faq
  - extract-schema-how-to
  - extract-schema-breadcrumb
  - extract-schema-opening-hours-spec
  - extract-schema-person
  - extract-schema-review
  - extract-schema-product
  - extract-bfsg-page
  - extract-agb-page
  - extract-widerruf-page
  - extract-versand-page
  - extract-contact-form
  - extract-portfolio
  - extract-map
  - extract-team-page
  - extract-testimonials
  - extract-certifications
  - extract-awards
  - extract-memberships
  - extract-meister
  - extract-case-studies
  - extract-link-handelsregister
  - extract-link-unternehmensregister
  - extract-link-kammern
  - extract-link-industry-catalogs
  - extract-link-google-business
  - extract-social-facebook
  - extract-social-instagram
  - extract-social-youtube
  - extract-social-xing
  - extract-social-linkedin
  - extract-social-tiktok
  - extract-social-whatsapp
  - extract-social-pinterest
  - extract-social-twitter
---
