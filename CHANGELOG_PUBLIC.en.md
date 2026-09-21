# Changelog

All notable client-facing changes to the `hdri` project are documented here.
## Platform Updates 2026-09-17 — 2026-09-23

During this update period, significant improvements were made to data qualification and methodology documentation, increasing transparency and traceability for users in Europe. Additionally, audit processes were expanded and errors in handling qualification data were fixed, resulting in more consistent data workflows.

### Added
- Operators can now selectively exclude data sources from audits, allowing for more flexible and precise control over audited data sources (EU-wide).
- Introduced new rehearsal adapters and defined order for projections to make test and audit processes for data qualification more transparent and consistent (EU-wide).
- Extended methodology snapshot and digest for Q2 provide greater transparency regarding changes and applied classification and suppression policies in scientific evaluations.

### Improved
- Methodology fingerprinting now uses real-time signal source and deficit data, enabling more detailed and reliable traceability of analysis results.
- Completion of the documentation for audit procedures with new rules for scaling security and deterministic verification to enhance reproducibility in test runs.

### Fixed
- Errors in processing and auditing large qualification datasets (e.g., 200k data points) were resolved, improving the stability of import, validation, and preservation of research data.
- The baseline import now processes current Q2 data more reliably, even with differing namespaces or data structures.

## Platform Updates 2026-09-10 — 2026-09-16

During this period, extensive improvements were made to data security as well as to the traceability of data origin and processing (provenance). The processes for verification, validation, and documentation of data were further expanded, strengthening the platform especially with respect to regulatory requirements (GDPR/EU) and trustworthy data processing (including for public attestations).

### Added
- Introduction of detailed checks and documentation for the origin and completeness of data sets (data provenance), improving traceability and transparency for customers and auditors (EU-wide).
- Linking current and archived data sources to verified and signed audit logs, including edge case handling and audit trail (EU-wide).
- Integration of tools for ongoing monitoring and verification of data integrity for both company-specific and publicly accessible areas (EU-wide).
- Expansion of evidence preservation methods: introduction of tools for verification, publication, and integrity checks of final reports and operational proofs (EU-wide).

### Improved
- Optimization of verification and comparison procedures for data sets, including differentiated reports for discrepancies as well as better handling of subsets and empty data input (EU-wide).
- Expansion of features for securing interim results (snapshots) and their continuous verification across multiple periods, ensuring uninterrupted documentation for regulatory or scientific audits.
- Refined source verification using additional methods for validation, derivation, and classification of classifications and source systems (EU-wide).

### Fixed
- Resolved several edge case treatments and validation mechanisms, such as for incomplete, contradictory, or empty data imports, resulting in more robust and consistent verification processes.
- Correction of connection logic between data origin, method protocols, and results assessment, preventing misinterpretations and incorrect attributions.
- Issues resolved in the processing of import data sets (e.g., CSV without URL, faulty keys, or provenance proofs), and more accurate error reporting for discrepancies.

### Security & Compliance
- Mandatory verification and logging of data origin and intake for all import and validation processes to meet GDPR requirements and proof obligations during audits (EU-wide).
- Safeguarding that operational trust (e.g., approval and trust lists) is always validated and clearly documented, preventing unauthorized or erroneous data inflows.

### Integrations
- Integration of a seamless verification interface for approval-relevant test results, enabling error-free and traceable further processing in EU-certified environments.

## Platform Updates 2026-09-03 — 2026-09-09

During this period, the processing pipelines for various applications were further modularized, enabling more flexible maintenance and expansion. Additionally, package dependencies were cleaned up and optimized to increase the reliability and maintainability of the platform. These changes offer customers greater long-term stability and adaptability.

### Added
- Provision of standalone pipeline components for audit and analysis processes, allowing more flexible adaptation to individual customer requirements and future extensions.

### Improved
- Segmentation and modularization of pipeline steps for the areas of audit, extraction, business registration, and ontologies (DE/EU-wide), resulting in improved maintainability and scalability.
- Optimized package management and reduction of unnecessary dependencies within platform modules, leading to fewer sources of error and enhanced performance.

### Fixed
- Removal of outdated or no longer needed components related to rate-limiting to prevent inconsistent processing workflows.

## Platform Updates 2026-08-27 — 2026-09-02

Various updates have been made to comparison data and summary information. As a result, the latest data is now always available for evaluations and comparisons.

### Added
- Introduced an automated script for updating profiles, making regular data updates easier and more reliable in the future.

### Improved
- Comparison data for state, dimension, trade, and matrix evaluations has been updated, ensuring that analyses are now up to date.
- The summary and methodology documentation has been updated, improving the transparency and traceability of analyses for users.

## Platform Updates 2026-08-20 — 2026-08-26

During this period, improvements were made to the user interface, document output, and underlying components. In addition, numerous libraries were updated, increasing the platform’s compatibility and security. A new export feature now makes it easier to further process analysis reports in markdown format.

### Added
- Export of analysis reports in markdown format in the truth-finding process: Reports can now be exported directly as markdown files, simplifying further processing and publication (EU-wide).

### Improved
- Updated table and compression libraries in the dashboard: This brings improved performance and smoother user interaction, especially when working with large tables (EU-wide).
- Several dashboard pages (e.g. Privacy Policy, Imprint, FAQ, Glossary) received minor design and content adjustments to enhance clarity (DE, EU-wide).
- Over 25 libraries and packages updated across multiple applications and components: Enhanced stability, better compatibility with modern browsers and hosting platforms, as well as optimized functionalities (EU-wide).

### Fixed
- Correction of pipeline definitions and workspace boundaries: Prevents errors when executing projects that consist of multiple sub-areas (EU-wide).

### Security & Compliance
- Various updates to dependencies and components raise security standards and continue to ensure GDPR compliance (EU-wide).

### Integrations
- Internally used components for data import/export and interfaces to third-party applications have been updated to ensure smoother integrations (EU-wide).

## Platform Updates 2026-08-06 — 2026-08-12

This week introduced several improvements and new features for more flexible control of CI builds and support for additional deployment options. The configuration for multi-package projects and workspace-specific CI processes has also been expanded, enabling better adaptation to various organizational structures. These changes enhance the efficiency of technical workflows and provide more control for complex application scenarios.

### Added
- Support for skipping the build step in specific CI jobs. This enables more flexible workflows in continuous integration processes, saving time and conserving resources.
- New feature for targeted selection of workspaces for CI builds ("Workspace Filter"). This allows testing or deploying only relevant components, optimizing large projects in particular for faster turnaround.
- Cloudflare Pages deployment is now supported. This offers new possibilities for hosting and deploying web projects, especially with regard to European data protection regulations (EU-wide hosting options).
- Added multi-package manager support (EU-wide). This facilitates the integration of projects that use different package management systems.

### Improved
- All configuration files have been updated and now include organization-specific values for a clearer, more customizable project structure.
- Build and deployment processes have been optimized: The build command now specifically uses workspace filters and can optionally skip exporting data. This results in a leaner and faster deployment, especially in conjunction with Astro and modern toolchains.

### Fixed
- Various corrections and simplifications to the CI and deployment process, including adjustment of the commands used for a more stable and reliable deployment.

### Security & Compliance
- Destructive transfers of Git histories during deployment have been removed to ensure transparency and log integrity (EU-wide compliance).

### Integrations
- Cloudflare Pages integration for an additional hosting platform that supports both European data protection requirements and international scalability.

## Platform Updates for the Week 2026-07-30 — 2026-08-05

This week focused on improving maintainability and traceability through comprehensive changelogs and documentation updates. In addition, several stability and security adjustments were made to ensure compliance requirements are met. As a result, users in Europe benefit from increased transparency and a more secure user experience.

### Added
- Automatically generated and linked changelogs for all applications and packages provide greater transparency regarding system changes (EU-wide relevance).

### Improved
- Multiple software dependencies were updated to close security gaps and ensure compatibility with current development standards (EU-wide relevance).

### Fixed
- Mitigation of risks from accidentally included access credentials in test files; these have been removed to ensure data security and compliance (EU-wide).
- Fixed an issue in project configuration so that test files are now correctly excluded; this leads to a more reliable build and test environment.

### Security & Compliance
- Removal of accidentally included credentials (AWS STS Credentials) from the source code to strengthen data protection and ensure compliance with legal requirements (e.g. GDPR) (EU-wide relevance).

### Integrations
- Renaming and updating of package integrations with third-party providers so that the current European provider '@warpgogol/changelog-live' is used, improving support and ensuring legal compliance (EU-wide).

## Platform Updates for the Week 2026-07-23 — 2026-07-29

This week focused primarily on technical maintenance, including dependency upgrades, removal of outdated development tools, and resolving installation warnings. These measures enhance the platform's security and compatibility, ensuring smoother operations. For customers, these improvements are particularly noticeable through increased reliability and improved long-term maintainability.

### Added
- A central README was added to facilitate orientation and documentation for platform users and administrators.

### Improved
- System-wide update of software dependencies to incorporate the latest security updates and enhancements. This increases overall security and ensures better compatibility with new browsers and devices (EU-wide).
- All installation warnings related to package management have been removed. This simplifies maintenance for customer teams and reduces the risk of potential errors (EU-wide).

### Fixed
- Missing configuration files for several platform components have been restored, enabling unrestricted development and operations once again.
- Version mismatches in testing tools were resolved, ensuring more consistent quality assurance across all modules.

### Security & Compliance
- Outdated development packages and scripts (e.g. code-compass) have been removed. This reduces potential attack surfaces, simplifies audit processes, and contributes to GDPR-compliant operations (EU-wide).

### Integrations
- Unnecessary or outdated integrations have been cleaned up, resulting in a clearer system structure and reduced error potential.

## Platform Updates for the Week 2026-07-09 — 2026-07-15

This week, we have made numerous improvements to the dashboard user interface, especially in design, readability, and privacy. New features have also been added to enhance usability and information transparency. Additionally, you benefit from further adjustments to privacy banners, tracking settings, and improved data exports.

### Added
- Animated background effects with building blocks provide a modern and attractive appearance to the dashboard (DE).
- Configurable contrast and boost parameters for the animated blocks to better suit user preferences (DE).
- Animated chevron indicators in expandable areas for more intuitive operation (DE).
- Link to the changelog with the current number of changes in the dashboard footer, allowing you to track changes directly (EU-wide).

### Improved
- Unified and modernized design: Introduction of IBM Plex as the new font family, simplified color scheme, reduced shadows, removal of glass effects, and consistent use of asymmetrical corners for a clearer UI (DE).
- Optimized usability and readability: Clear hierarchy for headings, revised term info buttons, improved highlighting of footer links, new underlines for accessibility, and adjusted colors for maturity indicators and meta cards (DE).
- Interactive, easily sortable tables through the integration of modern table features, including clear marking of external links (DE).
- Revision and centralization of metadata for better overview in FAQ and glossary, including improved terminology and consistent presentation (DE).
- New glossary entries and additions to the FAQ: More information on terms and methods to create more transparency in data understanding (DE).

### Fixed
- Several minor corrections to spelling, language, legal references, and terminology across the entire interface and documentation (DE).
- Improved functionality of sortable tables – no unintended sorting when clicking on info buttons (DE).
- Correct display of changelog entries in the footer even when exporting from different paths (EU-wide).

### Security & Compliance
- Privacy-First Tracking: Matomo Analytics has been equipped with settings such as disabled browser feature detection, updated privacy policy, and opt-out function – compliant with GDPR and without third-party cookies (DE).

### Integrations
- Integration of Matomo Analytics for privacy-compliant tracking without cookies (DE).
- Integration of @tanstack/table-core for modern, accessible table features (DE).

## Platform Updates for the Week 2026-07-02 — 2026-07-08

This week, the system previously known as the 'GRACE' framework received significant updates and has been uniformly renamed to 'COMPASS.' This change enhances clarity and maintainability, especially in external communications with clients. Additionally, internal structuring measures have been implemented to support greater stability and ongoing development in the medium term.

### Added
- Markers for contract modules and change summaries have been added to several configuration and source code files. This provides clear component structure and simplifies future adjustments and reviews. (EU-wide relevance)

### Improved
- All components of the system previously labeled as 'GRACE' have been consistently renamed to 'COMPASS.' This ensures consistent terminology, eases understanding, and prevents confusion for support and documentation. Existing functionalities and processes remain unchanged and fully usable. (EU-wide relevance)
- The structure and organization of central functional areas within the system have been improved by moving previously bundled logic into more clearly separated modules. This increases maintainability and speeds up future development.

### Fixed
- Minor corrections to markers and functional components ensure reliable operation even after the renaming and modularization.

### Security & Compliance
- Clear distinction and labeling of modular contracts within the system support compliance with documentation and record-keeping obligations, for example regarding data processing agreements or regulatory audits (EU GDPR).

### Integrations
- Modular renaming has also been applied to all interfaces and dependencies to ensure consistent compatibility across the platform.

## Platform Updates for the Week 2026-06-25 — 2026-07-01

This week, quality assurance was further enhanced in the areas of data integrity, traceability, and data protection. Additional information channels were created for users, and the platform’s reliability and security were further increased. The updates specifically support long-term data durability and European requirements for stability and transparency.

### Added
- New feature for recording and publishing methodology change history on the Methodology page for full transparency (EU-wide).
- Methodology changes and per-period frozen methodology snapshots that enable reliable traceability for every analysis period (EU-wide).
- Business lifecycle events are now recorded to track all relevant business occurrences (EU-wide).
- Vault-shard manifest and scheduled regular review have been implemented to document and secure data inventories comprehensively and verifiably (EU-wide).
- Population frame validator and editable sample template available to simplify preparation for post-stratification and thus support more robust analyses (DE, EU-wide).
- Opt-in feature for imprint contact extraction for structured evaluation is available, managed separately from other processes in accordance with GDPR (DE).
- Staging environment and validated release processes prior to publication to catch errors early and further enhance data quality (EU-wide).
- New tool for creating permanently verifiable quarterly snapshots for maximum data durability and traceability (EU-wide).
- Automatic offsite replication of vaults and planned data verification significantly increase protection against data loss (EU-wide).
- Hot/cold-tiering for obs_json data introduced, so frequently used data is available faster while older, less frequently used data is securely archived (EU-wide).
- Mechanically enforced immutability of data shards: Overwriting is now technically prevented; older data is retained as read-only for maximum long-term integrity and protection against accidental modification (EU-wide).
- Tool introduced for complete reconstruction from vault data for valid recovery (EU-wide).
- Trusted key root published, including key rotation ceremony, to ensure long-term data integrity and trustworthiness (EU-wide).

### Improved
- Data validation expanded: Comparison criteria and integrity checks for quarterly and cross-quarter comparisons ensure reliable and consistent evaluations (EU-wide).
- Statistical evaluations for cross-quarter trends now provide additive accuracy and robustness, making analyses more reliable (EU-wide).
- Labeling in results tables adjusted so users can easily recognize the assessment criteria used (scoring version) (EU-wide).
- Improved export and rendering logic in the dashboard: The homepage description is now dynamic; additionally, structured schema.org metadata is used for greater visibility (EU-wide).

### Fixed
- Issue with data reconciliation fixed: Synchronization with the factory can now operate in a memory-efficient and collision-proof manner (EU-wide).
- Several minor errors in identity reconciliation across different years were resolved, so that mix-ups or duplicates in asset IDs are reliably excluded (EU-wide).
- Fail-safes for scoring and group assignment now ensure that identical input data no longer results in duplicate outputs or incorrect assignments; outdated runs are automatically cleaned up as well (EU-wide).

### Security & Compliance
- Backfill vault manifest and identity healing tools enable old data inventories to be consistently and GDPR-compliantly reconstructed and repaired (EU-wide).
- Planned backups before each version update increase redundancy and meet regulatory requirements for data persistence (EU-wide).

### Integrations
- Validator for comparing methodology hashes ensures consistent valuation methods—important for meaningful cross-country analyses (EU-wide).
- Key register and rotation mechanisms for cryptography have been integrated to ensure modern security standards and tamper-proof signatures (EU-wide).

## Platform Updates for the Week 2026-06-18 — 2026-06-24

This week saw numerous technical modernizations implemented to increase the maintainability and reliability of the platform. In addition, the layout of individual website sections was revised for a more consistent user experience. The focus was also on updating external libraries to improve security and GDPR compliance.

### Added
- Integration of the Prettier plugin for Astro, allowing Astro files to now be displayed consistently according to modern formatting standards (EU-wide).

### Improved
- Revision and standardization of formatting for all website components and privacy pages, enhancing visual consistency and resolving minor layout issues on the homepage and subpages (DE, EU-wide).
- Update of key external dependencies (including Astro, Node.js type definitions, wrangler, sharp, and several AI SDKs), improving the platform's compatibility, security, and performance (EU-wide).

### Fixed
- Minor formatting and layout issues in the dashboard and footer resolved, contributing to a more cohesive and accessible overall impression (DE).

### Security & Compliance
- All security patches from third-party libraries have been adopted and the codebase has been adapted to current GDPR/data protection standards to ensure optimal compliance (EU-wide).

### Integrations
- Greater integration and version updates of Cloudflare and AI-related interfaces, improving long-term maintainability as well as stability in processing and hosting (EU-wide).

## Platform Updates for the Week 2026-06-11 — 2026-06-17

This week saw numerous dependency updates to ensure future compatibility, reliability, and security. In addition, the dashboard now displays all data points, allowing users to perform more comprehensive evaluations.

### Added
- The dashboard now displays all federal states, trades, and matrix elements, instead of just the top 8 or 12. Trend analyses also now show complete data sets, supporting more extensive analyses. (DE)

### Improved
- Various updates to core libraries (including Astro, OpenAI, better-sqlite3, Lighthouse, Sharp, csv-parse) improve the platform’s stability and performance. This contributes to smoother operation and better future-proofing. (EU-wide)

### Fixed
- Multiple libraries were updated to address minor bugs and compatibility issues, especially related to data processing and AI integrations. This enhances application reliability. (EU-wide)

### Security & Compliance
- Regular updates to affected libraries and type declarations increase protection against potential vulnerabilities and make it easier to meet baseline compliance requirements (such as GDPR). (EU-wide)

### Integrations
- Updates to integrations with OpenAI and Anthropic AI provide more stable and up-to-date use of AI services within the platform. (EU-wide)

## Platform Updates for the Week 2026-06-04 — 2026-06-10

This week, various optimizations were made to the dashboard, including improved display, new features for the integration of automated agents, as well as updates to the documentation. In addition, numerous dependencies were updated to ensure security and compatibility with current technologies.

### Added
- Support for Agent Readiness in the dashboard: Machine-readable interface information (Link headers such as api-catalog, service-doc, service-desc, describedby) was added. This facilitates the integration of automated software agents and improves connectivity to external services (EU-wide).
- The documentation now includes practical examples for DNS configuration (including DNSSEC requirements) for secure service connectivity, as well as new guidance on public resources without authentication.

### Improved
- The user interface for highlighted areas has been adjusted: Instead of a variable color scheme, fixed shades of blue are now used, ensuring better readability and clarity when highlighting content.
- Updated interactive display cards: Additional metadata such as time period and sample size improve the traceability of presented information.

### Fixed
- Several minor visual adjustments, including an updated favicon for the dashboard to provide clearer branding.

### Security & Compliance
- The documentation has been supplemented with guidance on how to operate public endpoints without authentication. This provides greater transparency regarding GDPR-compliant access rules (EU-wide).

### Integrations
- Several system libraries and development tools have been updated to the latest versions, including Astro, Cloudflare, OpenAI, and other AI integrations. This supports current security standards and enables the benefits of new features (EU-wide).

## Platform Updates for the Week 2026-05-28 — 2026-06-03

This week, the dashboard user interface has been significantly optimized: new metric visualizations, numerous accessibility enhancements, and detailed FAQ entries provide greater transparency and accessibility. At the same time, the technical documentation and legal aspects (e.g., open-source licensing) have been expanded, metadata for social media optimized, and extensive structured data (Schema.org) added to increase visibility and traceability. As a result, you benefit from a more modern presentation, improved data clarity, and greater transparency around the legal framework.

### Added
- New FAQ section with 18 additional entries covering methodology, data sources, evaluation logic, data protection measures, and statistical analysis – for more transparency and traceability (DE).
- Extensive structured data (Schema.org) on all pages: including Dataset, Breadcrumbs, SoftwareSourceCode, DataDownload, StatisticalPopulation, and variableMeasured on the homepage, codebook, and methodology pages. This improves discoverability, enables clearer source attribution, and supports automated data processing (EU-wide).
- Open Graph and Twitter Card metadata on all pages, so that content is presented attractively and informatively when shared on social networks and messengers (EU-wide).
- DOI link (citation link) to Zenodo data repository in the footer for proper academic referencing (EU-wide).
- Apache 2.0 license link in the footer, prominently visible open-source labeling, and adaptation of the license in structured data – increases legal clarity (EU-wide).
- Navigation links to research collaborations and Advisory Board in the footer and on the methodology page to encourage collaboration with universities and associations (DE).
- Additional glossary entries for Handwerksordnung (HWO) and trade classification including links to official sources (DE).
- New calculation bases, including maturity band table with explanatory thresholds and formula documentation for score calculation (DE).
- Bidirectional links to switch between German and English documentation directly in the README files (DE/EN).

### Improved
- Visual overhaul of all metric cards: colored bars now immediately show the evaluation scale (excellent/good/satisfactory/poor) based on thresholds, with better contrast for readability – making it easier to intuitively interpret results (DE).
- Glossary and term popovers: improved text alignment, consistent font sizes and integrity, mobile optimization, as well as more semantically accurate markup – all enhance readability and accessibility, especially for users with assistive technologies (DE).
- Table elements on all relevant pages are now right-aligned for numbers, making them clearer to read (DE).
- Formula blocks with KaTeX are now legible on smartphones; horizontal scrolling and size adjustment have been optimized (DE).
- Improved navigation structure (sitemap.xml, breadcrumbs with structured data) for better overview and easier orientation (EU-wide).
- All public pages now include structured metadata (robots.txt, canonical, LLMs-discovery), making it easier for search engines and AI applications to index and utilize the content (EU-wide).

### Fixed
- Standardization of publisher information in structured data: switched from organization to person and corrected German terms for consistent attribution (DE).
- The menu on mobile devices now uses a uniformly white background instead of a semi-transparent effect – for better readability and user experience on small screens (DE).
- Empty menu rows (header) are suppressed on non-glossary pages to avoid distracting empty lines (DE).
- Bug fixes for scroll behavior with anchor links and adjustments to section title spacing have improved user navigation (DE).

### Security & Compliance
- Licensing switched to Apache 2.0 and clarification of legal terms in the footer, structured data, and download section – this increases legal certainty for data access and reuse (EU-wide).

### Integrations
- DOI (Zenodo) integration in the footer for unique and permanent citability of the publicly available dataset (EU-wide).

## Platform Updates for the Week 2026-05-21 — 2026-05-27

Numerous improvements have been made to the HDRI Dashboard platform this week, significantly enhancing user-friendliness, transparency, and data interpretation. Statistical evaluations, new navigation options, as well as improved tooltips and formatting, all contribute to making results easier to understand and follow for users and decision-makers. In addition, compliance with data protection standards for public data exports has been strengthened.

### Added
- Breadcrumb navigation to the Codebook and Methodology pages in the HDRI Dashboard, making it easier for users to navigate between pages. (DE)
- New YAML-based data export and download links for the Codebook, providing more transparent and readily accessible documentation. (EU-wide relevance)
- Tooltips and reliability indicators for statistical metrics (e.g., percentiles, IQR) are now displayed, increasing the traceability of results. (DE)
- Documentation on measurement methods, including expanded FAQs, statistical interpretation, and details on key metrics such as P75 and IQR. (DE)
- New navigation links and hyperlinks from the dashboard to relevant codebook sections, making background information on individual analyses directly accessible. (DE)
- Grouping of sectors (“Gewerk Gruppen”) in tables for improved clarity and analysis, including display of group names and descriptions. (DE)
- Removal of domains in publicly provided debug articles (CSV/JSON) to prevent identification of individual pages, ensuring compliance with data protection requirements. (EU-GDPR)
- Release baseline 1.0.0 introduced and versioning established for major components such as hdri-dashboard and factory.

### Improved
- Tooltips are now dynamically positioned and are no longer cut off, which greatly improves readability. (DE)
- Statistical evaluations are now based on percentiles (p10/p50/p75/p90) instead of median values, enabling more realistic comparison and aligning with methodological standards. (DE, EU-wide)
- All numerical and date values in the dashboard are uniformly presented in German format (e.g. 1.234,56), improving readability and comprehension for users in the DACH region.
- Buttons and navigation elements in the dashboard now use consistent styles and labels to harmonize the user experience.
- Expanded and clearer tooltip and table layouts for better comparability and a higher density of information in statistical data.
- The underlying infrastructure for data export and database access has been optimized, leading to faster load times and more efficient usage.

### Fixed
- Runtime errors in the dashboard have been fixed by better validation of optional fields and completion of comparison points to prevent display errors. (DE)
- Removal of outdated and duplicate assets as well as dynamic regeneration of dashboards and data archives to ensure information is current and accurate.
- Textual and typographic standardizations throughout the documentation and result display to ensure a more consistent appearance.

### Security & Compliance
- Public debug exports are now automatically cleansed of all domains, preventing identification of individual pages. This meets the requirements of European data protection law (DSGVO/GDPR). (EU-wide relevance)

### Integrations
- Updated major dependencies and interfaces to Cloudflare, Astro, Node.js, DuckDB and other components to ensure compatibility with current European hosting platforms. (EU cloud compatibility)

## Platform Updates for the Week of 2026-05-14 — 2026-05-20

This week saw numerous improvements to the auditing and data processing pipeline. The changes primarily enhance traceability, improve performance, and, through more targeted checks, enable more efficient operations. Relevant audits, database paths, as well as terminology and format standardizations ensure a more precise and GDPR-compliant handling of European company data.

### Added
- Audits using both Lighthouse and Axe now exclusively consider actually accessible ("live") websites to improve result quality and accuracy (DE, EU-wide).
- Support for various database path formats (pages\__.db and pages-_.db) as well as periods like half-years and quarters: This facilitates flexible analysis and integration of EU/DE-specific data imports.
- Multilingual data coverage has been added to the documentation: It is now transparently documented how filter cascades affect live sites, so clients can understand why certain domains were excluded.
- Automatic linking and recognition of database paths via device configurations (e.g. ${DEVICE_ID}) simplifies cross-installation workflows.

### Improved
- The database schema and data processing logic for all audit and extraction steps have been standardized and adjusted for better reusability. Terms like 'coreDbPath' have been renamed to 'registryDbPath' (EU-wide) to clarify the source and structure of company data.
- Caching mechanism optimized: A new cache significantly reduces loading times during website extraction and checking, resulting in noticeable performance boosts for large data sets (e.g. German company lists).
- Progress indicators in the terminal have been switched to single-line status messages, making even large processing runs clearer and less distracting.
- Audit logging and traceability have been improved: Already checked websites are reliably skipped, saving time and preventing redundant checks.
- Plausibility and validation measures have been extended, providing clear and early error messages for missing databases or inconsistent period configurations.

### Fixed
- Data formats such as periods have been standardized to the 'yyyy-qn' schema (e.g. 2026-q2), minimizing errors during data import and reporting and increasing interoperability with other European systems.
- The assignment and updating of website homepages is now performed directly via the domain identifier, thus preventing erroneous or duplicate entries in summaries (DE, EU-wide).
- Several minor issues with handling closed database connections and extracting website content (e.g. due to incorrect column names or faulty CSV exports) have been resolved.
- Ambiguous or misleading statements in automatically generated reports and documentation have been clarified for clients.

### Security & Compliance
- Filtering and documentation according to GDPR-compliant criteria for only actually accessible domains have been ensured (DE, EU-wide).
- Process steps around signatures and audit trail documentation have been expanded for all use cases, enabling compliance with European evidence and audit requirements.

### Integrations
- Integration of new and existing database interfaces now allows flexible connection to different systems and data sources of European origin, enabling clients to more easily map their individual workflows.

## Platform Updates for the Week 2026-05-07 — 2026-05-13

During this period, the processing of German postal codes and data analysis were improved in several areas. Additionally, relevant bug fixes were made related to regional group sorting and the resolution of configuration file paths. These optimizations ensure more consistent regional analyses, clearer configuration, and more reliable data processing.

### Added
- Centralized management of the path for cryptographic transparency keys was introduced; this facilitates uniform key management and reduces future configuration errors. (DE/ EU-wide)
- Comprehensive documentation for generating device identity keys was added, including security recommendations and key rotation. This explains secure device usage transparently for all stakeholders. (EU-wide)

### Improved
- Sorting of Destatis groups in all reporting tables and statistics now follows the official Roman numbering (I–VII) instead of frequency. This makes comparisons between datasets and with other official statistics easier. (DE)
- The configuration and use of German postal code data (zipcodes.de.json) has been standardized and now includes error messages, making data enrichment for federal states more robust and understandable. (DE)
- When assigning subregions (federal states), conflicts are now resolved using a documented consensus algorithm when different sources provide different results. This improves traceability and the quality of regional analyses. (DE)
- Improved progress output in the console reduces output flooding during large classifications – the current line is now overwritten, increasing clarity.

### Fixed
- The resolution of the file path to zipcodes.de.json has been corrected so that the file is now reliably found in all processing steps. Errors when loading are now clearly treated as errors and no longer silently ignored. (DE)
- A robust check now ensures that if the zipcodes file is missing or unreadable, the process is deliberately aborted with a clear message rather than continuing with incomplete partial data. (DE)
- The detection and assignment of manifests for apps now explicitly considers the app_id instead of relying on directory names. This makes the system less error-prone to structural changes.
- Several minor corrections in group aggregation ensure that special cases like 'unclassified' are always correctly placed at the end of group tables. (DE)

### Security & Compliance
- Centralized management and use of verification keys for transparency (cryptography) ensures easier compliance with regulatory requirements and reduces security risks in key management. (EU-wide)

### Integrations
- The interface for using centrally managed transparency keys has been standardized, making future integrations with other systems and audit requirements easier. (EU-wide)

## Platform Updates for the Week 2026-04-30 — 2026-05-06

This week saw numerous improvements in data structuring, legal signal evaluation, and geographic analysis. The main focus was on providing a more transparent, modular processing of legally and content-relevant information as well as improving performance and traceability for reports and audits. These changes are designed to help you maintain oversight of legal requirements and deliver more detailed geographic and content-driven evaluations for your website analysis.

### Added
- Additional extraction and evaluation of legally relevant pages such as Imprint, Privacy Policy, Cookie Banner, Copyright Year, and Opening Hours. This data is now stored in separate, granular tables and highlighted separately in the profile summaries (JSON and Markdown), enabling a significantly more differentiated legal overview. (DE, EU-wide requirements)
- Integrated Reporting: All signal groups (Schema.org, legal pages, content signals, external links, social platforms) are now grouped and presented in new overview tables and Markdown reports. This facilitates analysis and compliance checks for your domains.
- Recording of the utilized technical environment (CPU, RAM, operating system, Node.js version, etc.) for in-depth audits. This increases transparency and traceability of audit results, especially in regulatory contexts. (EU-wide)

### Improved
- Legal signal detection (e.g., for Imprint and Privacy Policy) now includes a keyword-based evaluation. This improves accuracy in classifying legal pages and provides clues about compliance with GDPR/imprint obligations.
- Merging data from multiple sources now offers an improved overview of deduplicated domains, categories, and origin history. Your reports will become more precise and easier to trace. (DE)
- The control and documentation of background processes, especially when processing and classifying large volumes of data, has been made more transparent. Progress is now regularly output to the operator.

### Fixed
- Fixed incorrect counting of opening hours – the evaluation now correctly considers the designated database column name, providing reliable overviews in location profiles. (DE)
- Ensured correct path resolution for storing evaluations, guaranteeing that result files are saved in the correct output directory and avoiding confusion during archiving.
- Optimized assignment of federal state and municipal data as well as more precise normalization of federal state names (e.g., “Sachsen,” “Niedersachsen,” “Berlin”) to ensure reliable geographic breakdowns in all reports. (DE)

### Security & Compliance
- The newly structured storage and analysis of legal information (such as Imprint, Privacy Policy, Cookie Banner, and Copyright Notices) makes compliance with GDPR, TMG, and other EU legal requirements easier, with targeted detection and counting of such pages per domain. (DE, EU-wide)

### Integrations
- Expanded support for the analysis and counting of various external links and social media on your websites. This ensures a complete overview of external dependencies and possible integrations with third-party providers.

## Platform Updates for the Week 2026-04-23 — 2026-04-29

This week, data quality, clarity, and usability of the platform were further improved — especially through optimized classification, more accurate reports, and a completely revised pipeline for categorization and location analysis (DE, EU). Data protection was also strengthened through the maintenance of regional data (e.g., postal codes Germany) and clearer source information.

### Added
- Extended release (v2) of the industry index with improved reports and evaluations, including tabular and geographic summaries as well as export options in various formats (DE, EU).
- Added postal code dataset for Germany, further improving the regional evaluation of industry data (DE).

### Improved
- Industry classification: Assignment of websites to sectors is now even more reliable, with multiple assigned categories per website evaluated and regional as well as thematic aspects better considered (DE, EU).
- Automated reports and tables on the distribution of trades and locations are now clearer and, sorted by federal state and municipality, provide more context as well as an easier comparison (DE).
- The entire pipeline for industry index and locations has been thoroughly documented and optimized for transparency in sources and processes (including explicit source citation for postal code dataset, new guides for users) (DE, EU).

### Fixed
- Test data sources have been removed from the industry index input data to avoid incorrect or misleading results (DE).

### Security & Compliance
- Source information for used postal code data (Syrokomskyi/postal-codes on GitHub) added and specified in the configuration documents — significance includes transparency for GDPR compliance (DE, EU).

## Platform Updates for the Week 2026-04-16 — 2026-04-22

The current update introduces major features for data aggregation, evaluation, and publication. In addition, numerous measures have been implemented to enhance GDPR compliance (across the EU), as well as traceability and transparency. The platform is now well-equipped for publicly accessible indicators and reports.

### Added
- New modules for annual reports, open data, and badges: The platform now generates an annual report, creates open datasets, and integrates a certification badge for public display of key metrics (EU-wide).
- Expansion of k-anonymity and self-report features: Data analysis now includes k-anonymity mechanisms and provides users with the ability to view and check their own data, enhancing privacy and transparency (GDPR, EU-wide).
- Introduction of public project governance: Advisory from independent experts and documentation of the governance process increase the trustworthiness, objectivity, and legal security of the project (EU-wide).
- Publication of an open-source codebook for scoring: Clear documentation of the evaluation methodology and rules enables independent traceability (EU-wide).
- Initial modules for industry recognition, catalog analysis, and duplicate checking to automatically analyze data from company catalogs (DE).

### Improved
- Performance improvement and modern libraries for CSV exports: Export functions now use an up-to-date external library, significantly enhancing reliability and compatibility for data exports.
- Optimized traceability and monitoring: New logging and orchestration features make data processing and error analysis more transparent and reliable (EU-wide).
- Expanded documentation for end-users and AI-powered agents to increase transparency and support.

### Fixed
- Various quality improvements, including corrections in data processing and bug fixes in self-reporting and publishing, ensure smoother platform operations.

### Security & Compliance
- Comprehensive enhancements for GDPR implementation and strengthening of privacy mechanisms, such as integration of k-anonymity and self-control options for end users (EU-wide).

### Integrations
- Integration of external CSV libraries for high-performance, standards-compliant data export.
