# Changelog

All notable client-facing changes to the `dashboard` project are documented here.

## Plattform-Updates für die Woche 2026-07-09 — 2026-07-15

This week features significant improvements to the HDRI Dashboard, including more accessible changelog information, enhanced privacy controls, and visible updates to design, usability, and documentation. Several visual aspects were refined for clarity and consistency, and privacy-related features were optimized to align with EU standards.

### Added

- Introduced an animated building blocks background and configurable visual parameters for canvas elements, making the dashboard more visually engaging and customizable.
- Added a Changelog link in the dashboard footer, displaying the number of published updates for better transparency (EU-wide).
- Integrated a Matomo analytics solution with privacy-first configuration, ensuring no browser fingerprinting and full opt-out functionality (DE/EU).
- Implemented external-link icons for links that open in new tabs, helping users recognize external navigation (EU-wide).
- Integrated @tanstack/table-core to enable advanced and user-friendly sorting in all table views (EU-wide).

### Improved

- Refined the overall theme: colors are lighter, typefaces updated to IBM Plex, shadows reduced, and the design system has been flattened and unified for a clearer, more modern experience.
- Applied asymmetric corner radius across UI elements and standardized chevron indicators for expand/collapse controls to improve visual consistency.
- Footer and link styling improvements for better accessibility and clearer navigation cues (e.g., underlines, correct heading order, accent updates).
- All terminology related to 'k-anonymity' replaced with 'publication threshold', and glossary/documentation harmonized for clarity and consistency (EU compliance).
- Legal and privacy documentation and references improved for accuracy and alignment with current regulations (DE, EU-wide).

### Fixed

- Corrected visual errors and inconsistencies in maturity bars, accent bars, and various buttons—elements now appear and behave as intended across light and dark backgrounds.
- Resolved minor sorting and tooltip interaction issues in tables, including fixes for sticky header tooltips and stable arrow indicators.
- Improved documentation and in-app texts for spelling, heading hierarchy, and link labels (DE).

### Security & Compliance

- Optimized Matomo tracking to maximize user privacy: browser feature detection is disabled by default and opt-out options are prominently available in the privacy settings page (DE/EU).

### Integrations

- Added @syrokomskyi/changelog-live tool for automated changelog generation, providing up-to-date and clear release notes to end users and stakeholders (EU-wide).

## Plattform-Updates für die Woche 2026-07-02 — 2026-07-08

This week focused on improving data accuracy for dashboards, consolidating shared functionality for more reliable text processing, and routine updates to keep software dependencies current. Clients benefit from increased data consistency, improved maintainability, and up-to-date integrations.

### Added

- Introduced better internal documentation with metadata annotations in selected configuration and source files, improving auditability and traceability for future enhancements.

### Improved

- Applied a secondary sort to HDRI dashboard data (2026 Q2) to ensure more stable and predictable ordering of German regions (bundeslaender) and corresponding matrices in visualizations. This makes tracking changes and comparisons over time easier for (DE) clients.
- Moved the core implementation for the 'brand-inticle' text processing feature into a shared package. This reduces duplication and simplifies future maintenance, ensuring consistent text formatting and branding across multiple applications (EU-wide).

### Fixed

- Resolved inconsistencies in the display and ordering of region-specific data within the 2026 Q2 HDRI dashboard, leading to more accurate and reliable reports (DE).

### Security & Compliance

- Renamed dependencies to clarify sources and improve supply chain transparency, supporting IT compliance requirements (EU-wide).

### Integrations

- Updated and synchronized package dependencies across all modules to guarantee integration with the latest, most secure external services and libraries (EU-wide).

## Plattform-Updates für die Woche 2026-06-25 — 2026-07-01

This update introduces improved transparency with a surfaced methodology changelog, enhanced homepage metadata for better searchability, and greater statistical rigor in trend analyses. Clients benefit from increased clarity when reviewing methods, more robust analytics, and better information presentation.

### Added

- Methodology changelog now visible on the Methodik page, providing clients direct access to the WP15 methodology history for greater transparency. (DE)
- Statistical methods in the Digital Observatory have been strengthened to enable more rigorous cross-quarter trend analysis, ensuring results are robust over time. (EU-wide)
- Integrity checks implemented for cross-quarter data comparisons in the Digital Observatory, helping detect and prevent discrepancies for clients reviewing longitudinal data. (EU-wide)

### Improved

- Homepage and informational pages (FAQ, Glossar) now include enriched schema.org metadata and dynamic descriptions, resulting in better discoverability on search engines and clearer information for site visitors. (EU-wide)

## Plattform-Updates für die Woche 2026-06-18 — 2026-06-24

This week focused on improving the reliability and user experience of all applications. Notable updates include enhanced formatting of the dashboard homepage, content corrections, and a comprehensive update of third-party and AI-related packages to ensure ongoing compatibility, security, and compliance. These updates help provide a more stable, visually consistent, and future-proof platform for our clients across Europe.

### Added

- Added more detailed region data to site visualization features (DE), enabling more granular analysis for German clients.

### Improved

- Improved formatting, layout, and readability on various dashboard and informational pages to provide a clearer and more consistent user experience.
- Updated third-party and AI-related packages (including Astro, Wrangler, Prettier, Node types, and several AI SDKs) across all apps and packages to ensure ongoing compatibility, support for new features, and better security (EU-wide).

### Fixed

- Corrected and reformatted homepage content and other pages for improved display and user navigation.

### Security & Compliance

- Updated core dependencies and integrations to include the latest security fixes, supporting ongoing compliance with GDPR and other European regulatory requirements (EU-wide).

### Integrations

- Upgraded major integrations such as Cloudflare Workers and Sharp image processing for better reliability, improved developer support, and compatibility with European hosting scenarios (EU-wide).

## Plattform-Updates für die Woche 2026-06-11 — 2026-06-17

This week, several dependency updates were introduced to ensure ongoing security, performance, and compatibility with partner services. Additionally, dashboard data displays were improved for more comprehensive data analysis, which can be of special interest to clients working with regional and industry-wide datasets.

### Added

- Dashboard views now display all available Bundesländer, industry segments, and matrix items, allowing for full visibility into data trends instead of previously limited top entries. This offers a more complete overview for regional (DE) analysis.

### Improved

- Updated dashboard data arrays and trends to remove previous slice limits, ensuring that users can analyze full datasets without restriction. This is particularly beneficial for organizations needing detailed reports across all federal states and segments in Germany (DE).

### Fixed

- General updates to dependencies across the platform address minor issues and compatibility, helping maintain stable and predictable platform behavior.

### Security & Compliance

- Multiple libraries and frameworks regularly updated to their latest versions to address potential security vulnerabilities and maintain compliance with EU standards (EU-wide), including better-sqlite3, astro, OpenAI, and @cloudflare/workers-types.

### Integrations

- Upgrades to AI-related SDKs and workflow tools (such as @anthropic-ai/sdk, OpenAI, ai, and Playwright) provide smoother integration and future-proof connections with AI and automation services.

## Platform Updates for the Week 2026-06-04 — 2026-06-10

This update introduces new machine-readable metadata and readiness indicators for better integration with external services, clarifies authentication requirements, and updates several internal and external dependencies to improve security and stability. The dashboard's appearance was refined, and DNS configuration documentation was expanded for easier technical onboarding.

### Added

- Introduced machine-readable API information and agent readiness headers to the dashboard, making it easier for third-party systems to discover and integrate with available services (EU-wide).
- Documented DNS-AID configuration, including SVCB record usage and DNSSEC requirements, supporting secure and standards-compliant domain setup for automated agents (EU-wide).

### Improved

- Updated the dashboard styles for term highlighting (blue shades), ensuring more consistent and accessible visual feedback for users (EU-wide).

### Fixed

- Multiple dependency updates across the platform to enhance compatibility, security, and reliability, including key packages for deployment, AI integration, and cloud worker environments (EU-wide).

### Security & Compliance

- Clarified in documentation that certain resources (e.g. public API endpoints) require no authentication, ensuring transparent compliance with open data principles and simplifying access for users (EU-wide).

### Integrations

- Upgraded Cloudflare Workers and related packages, providing smoother and more reliable connectivity with Cloudflare-based data and integration services (EU-wide).

## Plattform-Updates für die Woche 2026-05-28 — 2026-06-03

This week introduced major upgrades to data transparency, accessibility, and structured documentation across the Handwerk Digital Reife Index dashboard. Enhancements include improved accessibility features, richer structured data for SEO and research, new and improved visualizations, as well as important legal and licensing updates. Clients benefit from more reliable, understandable, and compliant content, and an improved user experience for all audiences.

### Added

- Extensive Schema.org structured data added across all public pages, including home, codebook, FAQ, methodology, legal, and glossary sections, improving SEO and discoverability for search engines and research tools (EU-wide).
- DOI link and open data citation added in the dashboard footer, directly referencing the Zenodo dataset for verifiable scientific use (EU-wide).
- Dedicated page and SiteFooter sections for research partnerships and advisory board applications, supporting collaboration opportunities.
- Mobile-friendly scrolling for complex table and formula blocks to ensure usability on smaller screens.
- Statistical population and metrics (e.g., sample size, confidence level, P75/mean/median) documented on the homepage for greater methodological transparency (DE, EU-wide).
- Data archive, codebook versioning, and detailed comparison trends are available for download to support external analysis (DE, EU-wide).
- Open Graph and Twitter Card metadata images implemented on all pages, enabling rich previews when sharing platform content on social media.
- German and English documentation for the platform and all core apps, including easy navigation between languages, catering to both local and international stakeholders.
- Legal compliance files added: robots.txt, sitemap.xml, and AI/LLM discovery (ai.txt, llms.txt, llms-full.txt).

### Improved

- Tooltip positioning and accessibility significantly improved: tooltips now offer better placement and can be navigated using keyboard, especially for tables and formulae, making the dashboard more inclusive.
- Maturity bar and scoring visualizations updated for clarity, color-coding, and simplified band structure (e.g., merging of advanced maturity categories), enabling faster comprehension of results (DE).
- Footer and navigation reorganized for clear access to legal, data sharing, and research partner information, and the FAQ is now exclusively in the main navigation to avoid duplication.
- Glossary and methodology sections extended with additional official references and term explanations, improving understandability and compliance.
- Font sizing, alignment, and layout adjustments throughout glossary, term popovers, headers, and cards to ensure consistency and readability across devices and print.
- Updated site favicons with a new icon design for better brand alignment.
- All public-facing text and documentation improved for linguistic clarity, including translation corrections and language switching.

### Fixed

- Corrected several minor formatting issues throughout all main dashboard pages (e.g., label formatting, removal of redundant elements), enhancing content professionalism.
- Resolved issues with codebook import paths, ensuring reliable data loading for all users.
- Fixed color gradients and legends in metric visualizations to avoid confusion, supporting accurate result interpretation.
- Eliminated font inheritance issues in term popovers and data tables; texts are now consistently styled regardless of context.

### Security & Compliance

- Switched homepage dataset license to Apache 2.0 and updated all affected structured data schemas, ensuring legal alignment on data distribution and re-use (EU-wide).
- Updated publisher schema to reflect an individual instead of an organization, and corrected German terms in datasets, improving regulatory transparency (DE, EU-wide).

### Integrations

- All pages now provide direct links and structured schema for the public GitHub repository, dataset downloads, and codebook, supporting open science and transparency standards (EU-wide).

## Plattform-Updates für die Woche 2026-05-21 — 2026-05-27

This week introduces numerous usability improvements, transparent documentation, and new statistical features to the HDRI Dashboard. Clients can benefit from clearer navigation, more accurate and readable data presentation, and expanded documentation of methodologies and data provenance. These changes facilitate better understanding, increased transparency, and more effective usage of the platform for all users.

### Added

- Introduced breadcrumb navigation on Codebook and Methodology pages, allowing users to easily understand their current location within the dashboard and navigate back to the homepage (DE).
- Added links within hero sections and dashboard cards for quick access to codebook documentation, enhancing transparency and learnability.
- Integrated new tooltips with dynamic positioning and improved styling, ensuring that important metric definitions and data explanations remain visible and readable, even on smaller screens (DE).
- Explicitly displayed reliability indicators, percentile tooltips, IQR bars, and citations within the dashboard for easier interpretation of statistical results.
- Expanded documentation: Methodology ('Methodik') page now includes in-depth guidance, an FAQ section, and detailed statistical explanations such as P75, IQR, and descriptive statistics (DE).
- Enriched Gewerk table with group labels for clearer context using Destatis codes and descriptions.
- Added non-breaking spaces and extended Gewerk labels in matrix cards for better readability.
- Displayed the expansion of HDRI (Handwerk Digital Readiness Index) in codebook labels and documentation for increased transparency (DE).
- Added percentile fields (p10/p50/p90) to dashboard data for finer-grained cohort and aggregate analysis.

### Improved

- Upgraded number formatting: All score, weight, threshold, and count displays now use consistent German locale formatting (including thousands separators and decimals), making numerical information more intuitive for EU users (DE).
- Replaced median with p50 and updated cohort sorting to use p75 percentile, delivering a more consistent and robust statistical overview of data distributions (EU-wide).
- Switched codebook export/import to YAML format, simplifying codebook management and enabling direct download of the latest data version.
- Improved consistency: All codebook version references across cards and meta elements now link directly to documentation, ensuring users can quickly access underlying details.
- Centralized dashboard styling: Switched from inline styles to semantic CSS classes for accent colors, spacing, and layout, improving design consistency and accessibility across all dashboard views.
- Enhanced tooltip styling and formatting for better readability, including increased padding, font adjustments for tabular alignment, and subtle hover animations.
- Clarified data sourcing in method cards, explaining that statistics are calculated from freely available public sources instead of technical infrastructure references.
- Removed now-obsolete 'Semantic Content Stack' visual from the dashboard for a cleaner and less distracting user interface.

### Fixed

- Resolved potential runtime errors in the matrix comparison section by improving the handling of undefined fields, ensuring reliable display of period comparisons and status information.
- Addressed edge cases in tooltip display to prevent overflow clipping and improve compatibility with different container layouts.

### Security & Compliance

- Eliminated non-production CSV debug data and large static reports from version control to prevent accidental disclosure and reduce storage requirements (EU-wide).

### Integrations

- Upgraded major dependencies (Astro, wrangler, @anthropic-ai/sdk, tldts, etc.) for improved security, reliability, and platform compatibility (EU-wide).
- Enhanced Cloudflare Pages deployment support via updated scripts and added configuration, enabling smoother and faster hosting upgrades for European clients.
