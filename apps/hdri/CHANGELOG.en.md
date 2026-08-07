# Changelog

All notable changes to the `.` project are documented here.
## 2026-07-30 .. 2026-08-05

### Added
- Create CHANGELOG.md, changelog.config.yaml, and extract.config.yaml files for all relevant packages and apps.
- Add changelog links to all README.md files.
- Add smart upgrade script with major version pinning.

### Changed
- Rename @wgogol/changelog-live to @warpgogol/changelog-live, update all references and packages.

### Fixed
- Downgrade TypeScript from 7.0.2 to 6.0.3 to ensure compatibility with typescript-eslint.
- Explicitly exclude test files in tsconfig.json of HDRI Factory Apps.
- Fix error when copying eslint-rules directory in HDRI Export.
- Remove accidentally published files containing leaked AWS STS credentials.

### Removed
- Remove accidentally published files containing leaked AWS STS credentials.

### Security
- Remove accidentally published files containing leaked AWS STS credentials.

### Documentation
- Create and extend CHANGELOG.md as well as agent documentation (AGENTS.md), update entries, and add links in all READMEs.

## 2026-07-23 .. 2026-07-29

### Added
- Restore missing package.json files in all relevant packages and apps.
- Add README.md to documentation.

### Changed
- Perform project refactoring and move all content from 'apps/source/*' directly to the root directory.
- Update dependencies in all workspace packages.
- Clean up pnpm installation warnings to improve the build experience.
- Remove 'code-compass' from the DevDependencies and scripts of all package.json files.
- Standardize Vitest versions used across all projects.

### Fixed
- Resolve issues with missing package.json files in multiple apps and packages.

### Removed
- Delete outdated or duplicate directories and files after structural refactoring.
- Remove obsolete per-type write wrappers in 'observatory-vault'.

### Documentation
- Consolidate AGENTS.md and expand project documentation and inventory.
- Adapt documentation and configuration files to the new project structure.

## 2026-07-09 .. 2026-07-15

### Added
- Add Matomo analytics with a privacy-friendly configuration to the dashboard.
- Integrate a background animation featuring animated building blocks with configurable contrast and animation parameters into the dashboard.
- Add a changelog link to the dashboard footer that displays the number of entries.
- Add an external link indicator for links with target="\_blank".

### Changed
- Use the IBM Plex font family consistently and adapt the color scheme as well as the UI designs for a flatter, clearer appearance.
- Update the Glossary, FAQ, and methodology page for consistent terminology (e.g., publication threshold instead of k-anonymity), adapt the maturity levels and their presentation, and link related FAQ articles.
- Loosen the metadata line and change the export label to "Dashboard snapshot".
- Optimize the display of the maturity bar as well as meta and footer areas for better readability and structure.
- Ensure tooltip and SEO modules are used across the project and remove redundancies.
- Sort and update the display and interactive elements (such as the sort arrows) in tables for improved usability.
- Standardize all UI radii to asymmetric corners.

### Fixed
- Correct spelling and terminological inconsistencies in the German documentation as well as on the dashboard interface.
- Fix the sorting behavior of comparison tables and prevent accidental triggers when clicking on info markers.
- Properly mark the Matomo script as an inline script and remove a redundant TypeScript declaration.

### Removed
- Remove dead or unused components such as DimensionsChart, GermanyMap, and MatrixHeatmap, as well as the related CSS files from the dashboard.

### Documentation
- Consistently maintain the README, AGENTS, and changelog files in the dashboard and add missing or outdated entries.

## 2026-07-02 .. 2026-07-08

### Added
- Add MODULE_CONTRACT and CHANGE_SUMMARY annotations to various configuration and source code files.

### Changed
- Rename the package @org/compass-checks to @wgogol/compass, and subsequently rename @wgogol/compass to @wgogol/code-compass.
- Complete renaming of the GRACE name to COMPASS across all packages, source code files, tests, and build configurations.

### Fixed
- Split the implementation of EnrichBundeslandGogol.ts and ParseSourcesGogol.ts into smaller, more focused modules.
- Break up export-hdri-dashboard-archive.ts in the Digital Observatory into individual, specialized modules.

### Removed
- Remove legacy packages and unneeded files as a result of the COMPASS renaming.

### Security
- Improve source code traceability and clarity by adding module contracts and change notes.

### Documentation
- Document the GRACE-to-COMPASS renaming process as well as structured restructurings and pipeline changes.

## 2026-06-25 .. 2026-07-01

### Added
- Add new validation gates for data quality drift, methodology comparability, and population-frame readiness.
- Implement offsite replication for vaults with scheduled audits, as well as a shard manifest and scheduled CI integrity checks.
- Extend the system with retention and rebuild tools, including rebuild-from-vault, snapshot tools, and tiered storage for obs_json.
- Integrate a Trusted-Keys Root CA with key rotation ceremony and a mechanism for mechanical immutability of vault shards.
- Build a stable asset identity registry with backfill and healing mechanisms spanning multiple years.
- Provide a model for business lifecycle events (WP13) and methodology snapshots per period.
- Offer a population-frame validator and template, as well as a backfill-identity tool.
- Extend the dashboard to display the WP15 methodology changelog, and improve schema.org metadata and the dynamic homepage description.
- Add stats and comparison tools to enhance statistical significance for quarterly trends.
- Enable opt-in contact extraction for the legal notice (Impressum) in the factory and a runbook for disaster recovery.

### Changed
- Explicitly specify the Node/pnpm runtime and pin versions for improved reproducibility.
- Optimize verify:vault through streaming for better performance and enable versioned migrations with backups.
- Refactor internal page structure in the dashboard for better code organization.

### Fixed
- Pipeline_runs.codebook_version is now labeled with the effective scoring version.
- Fix cases with inconsistent asset identity across year changes and increase the longevity of DuckDB tests with longer timeouts.
- Resolve collisions and memory issues during factory synchronization, as well as idempotency issues with scoring and GC of outdated runs.

### Removed
- Remove obsolete code sections related to storage and validation processes.

### Security
- Enhance the mechanical immutability of vault shards by enforcing write protection and preventing overwrites.

### Documentation
- Supplement and update LONGEVITY.md, RUNBOOK.md, and the disaster recovery runbook for better traceability.
- Update METHODOLOGY.md with new statistical methods for cross-quarter analyses.

## 2026-06-18 .. 2026-06-24

### Added
- Add the Prettier plugin for Astro to the development configuration.

### Changed
- Update various dependencies and AI SDKs across the entire monorepo, including @types/node, astro, wrangler, sharp, prettier, as well as several internal packages.
- Format source code, stylesheets, and configuration files across all projects for a consistent style.
- Restructure various helper texts, Markdown documentation, and prompts for a more uniform appearance and clarity.
- Update the package.json files with current versions of important libraries and improved file arrays.

### Fixed
- Fix minor display issues and improve the layout on the HDRI Dashboard homepage and in individual components.

### Removed
- Remove unused documentation references in several pipeline-specific Markdown files.

### Documentation
- Revise and standardize numerous README and help documents in applications and packages for better clarity.

## 2026-06-11 .. 2026-06-17

### Changed
- Remove slice limits from dashboard data arrays to fully display all federal states, trades, and matrix entries including trend data.
- Update numerous dependencies across multiple packages and applications, including bessere-sqlite3, astro, @anthropic-ai/sdk, openai, playwright, @cloudflare/workers-types, wrangler, ai, tldts, csv-stringify, csv-parse, vitest, lighthouse, and sharp.

## 2026-06-04 .. 2026-06-10

### Added
- Add YAML frontmatter to auth.md to indicate public read-only usage without authentication requirement.
- Implement Agent Readiness Features in hdri-dashboard: support Link headers (api-catalog, service-doc, service-desc, describedby), add webmcp.ts, extend meta-card with data attributes (period, sample-size), and configure DNS-AID including SVCB record example and DNSSEC requirement.

### Changed
- Perform multiple dependency updates in hdri-dashboard, workspace packages, and helper packages.
- Completely replace the CSS custom property --layer-schema in term.css with hard-coded blue values for background, hover, focus, and box-shadow.
- Update the favicon for hdri-dashboard.

### Documentation
- Extend the README with DNS-AID configuration, SVCB record example, and DNSSEC requirement for hdri-dashboard.

## 2026-05-28 .. 2026-06-03

### Added
- Added numerous new Schema.org markups (Dataset, FAQPage, TechArticle, BreadcrumbList, StatisticalPopulation, variableMeasured, SoftwareSourceCode, DataDownload, Open Graph, and Twitter Card metadata) to all pages to improve visibility and structure for search engines and social media.
- Expanded the methodology, homepage, and codebook pages with mathematical formula documentation, scoring details, and KaTeX-LaTeX rendering for scientific traceability.
- Integrated a DOI link to the Zenodo dataset and an Apache-2.0 license link in the footer navigation.
- Added new FAQ entries with detailed explanations on methodology, data protection, and calculations, and created a glossary table as well as references to official craft regulations and Destatis classifications.
- Designed dashboards with a new, full-width maturity classification table and ensured mobile-optimized, scrollable formatted KaTeX formulas.
- Created comprehensive GOVERNANCE, METHODOLOGY, and RUNBOOK documentation references in all German and English README files; supported bi-directional language navigation in the documentation.
- Included .env.example files for all apps and packages to standardize configuration.

### Changed
- Updated the favicon icon design and various manifest timestamps.
- Improved navigation in the layout and positioned the MaturityBar component before the reading bar on the homepage.
- Optimized the MaturityBar ribbon for a consolidated display, removed the model ribbon, and used programmatic mapping of segments.
- Switched Schema.org licenses and publisher from Organization to Person; corrected the spelling of sample size and other metadata labels.
- Adjusted table styles, colors, and alignments for cards, tooltips, and glossary terms, and refined IQR/statistics visualization using semantic color classes.
- Revised international domain references from handwerk-digitals.de to handwerk-index.de and modernized all cross-references and publication links in the documentation.
- Extracted footer and visualization components, consolidated dashboard visualization, and simplified the build structure by removing external D3 dependencies.

### Fixed
- Fixed issues with font-size inheritance, context formatting, and consistent alignment of tables, tooltips, and glossary terms across all pages.
- Revised import logic for YAML codebook to robustly handle environment differences and implement path fallbacks.

### Removed
- Removed detailed explanatory texts on maturity bands, merged FAQs from the footer, and eliminated redundant color/legend elements from the homepage.
- Deleted old codebook YAML versions and no longer needed manifest trend files to clean up the repository.

### Security
- Improved data protection evidence by expanding source documentation and adding explicit data protection sections in the README and methodology.

### Documentation
- Provided complete LLM and context files, AI.txt and LLMS.txt/full.txt as well as extensive user guidance and migration notes in all central documents.

## 2026-05-21 .. 2026-05-27

### Added
- Add AXE accessibility audit indicators to the ontology and introduce the new dimension "accessibility_audit" with Missing-Policy and countClampInverse rule in the codebook data.
- Create a new workspace and export pipeline for the hdri-dashboard, including automated data exports and a basic structure as a standalone app.
- Add version fields to all package.json files of the hdri-dashboard, hdri-factory, and digital-observatory applications to establish a release baseline (1.0.0).
- Implement minimal display for export progress and console logs during dashboard archive export and signing processes, and log progress for AXE audit signatures.
- Add extensive tooltips and statistical metrics (IQR bars, reliability indicators, FAQ, methodology explanations for P75/IQR/descriptive statistics) to the methodology and dashboard interface.
- Add breadcrumb navigation to codebook and methodology pages, as well as navigation links in the dashboard and methodology for transparency.
- Add gewerk_group/industry grouping to asset statuses and cohort members for better aggregation.

### Changed
- Replace median with p50, introduce p10/p90 percentiles in cohort statistics and rankings, and sort matrix, slice, and dimension rankings by p75.
- Switch codebook export from JSON to YAML as the single data source, systematically reformat and version CHANGELOG/notes, and automate extraction of version information.
- Optimize styling and readability of tooltips, labels, and cards using tabular-nums, standardized classes, and layout improvements.
- Adjust all HDRI labels and documentation to clarify the meaning "Handwerk Digital Readiness Index" and explain the HDRI acronym in the codebook, ontology, and READMEs.
- Change number formatting to consistent German locale formats (score, number, date, time), and standardize formatting in count, percentage, and date functions.
- Adjust default logic for consent_quality scoring (from zero to skip for not_applicable/default); align codebook weightings (legal 28%, contact 22%, accessibility 16%, etc.).
- Replace all raw console outputs in the pipeline and bundling process with structured NDJSON loggers including context information and event-based names.

### Fixed
- Fix errors in optional chaining logic and ensure all comparison objects contain complete fields, and that manifest files are found in export.
- Clean debug and public export data of sensitive domain information, and remove large static CSVs to ensure data privacy and maintainability of debug artifacts.
- Restore gewerk_group in emissions from database mappings after the column was previously removed.

### Removed
- Remove the now obsolete static visualization ‘Semantic Content Stack’ from the dashboard hero and delete non-versioned build artifacts as well as legacy functionalities (JSON codebook export, fixtures, Astro-TypeDefs, large static debug CSV).

### Security
- Consistently clean publicly shared debug artifacts of domains to protect against unwanted disclosure of website identities in data exports.

### Documentation
- Expand and revise READMEs in digital-observatory and hdri-dashboard with explanations on HDRI, data mart terminology, export and regeneration workflows for the dashboard, as well as statistical methodology and data source descriptions.

## 2026-05-14 .. 2026-05-20

### Added
- Add brief support for six new upstream database path fields in a-contract-ontology, and enable device-dependent placeholder substitution for device-specific path resolution.
- Add factoryContractRootDir field in digital-observatory brief for automatic path detection and extend SyncFromFactoryGogol to prioritize explicit paths, auto-discovery, and legacy fallback.
- Extend observations table in digital-observatory with period, factory_run_id, and crawl_hash fields for direct period filtering and tracking of origin.
- Integrate period/factory_run_id/crawl_hash support during synchronization of observations from emit bundles and other digital factory components, including period-based table declarations and tests.

### Changed
- Temporarily optimize auditSampleSize configuration in audit-lighthouse brief from -1 to 3 and back to -1 for accelerated pipeline iterations and later removal of the limit.
- Update multiple package dependencies to the latest versions and normalize the ordering in package.json files of various packages.

### Fixed
- Correct database joins to use the local site_pages table during translation operations, fixing faulty queries against empty or non-existent tables in TranslateProfileObservationsGogol and TranslateOntologyGogol.

### Removed
- Remove outdated TranslateProfileObservationsGogol and IngestAssetStatesGogol scripts as well as related tests, to consolidate data ingestion and observation derivation to the current, canonical synchronization path via emit-bundle.

## 2026-05-07 .. 2026-05-13

### Added
- Add getTransparencyKeysDir() as a central method for resolving the transparency keys path and use it in VerifyUpstreamGogol to avoid redundancy between apps.
- Document the generation of device identity keys, including security and placement instructions.
- Document the Phase 1 pipeline, signature verification system, and the new configuration structure for shared settings such as zipcodesTablePath.

### Changed
- Explicitly compute transparencyDir from repoRoot in config.ts to ensure the stability of key resolution regardless of app nesting depth.
- Adjust VerifyUpstreamGogol.findManifestPath to filter by manifest.app_id instead of directory name to be robust against step numbering.
- Move zipcodesTablePath from the app-local brief.md into the factory configuration and provide rootBrief as a shared pipeline variable; have EnrichBundeslandGogol and SnapshotHarvestGogol fail immediately if the file is missing.

### Fixed
- Correct the path resolution of zipcodesTablePath in SnapshotHarvestGogol so that briefInputDir is now used instead of ctx.inputDir for determination.
- Fix loading of zipcodes.de.json in brief.md and incorrect error handling in loadGeoIndex, so that errors are now signaled with an Error instead of null.

### Removed
- Remove transparencyDir from config.ts in favor of the central logic for transparency keys in @org/observatory-crypto.

### Documentation
- Expand RUNBOOK.md with instructions for device key generation and configuration, as well as pipeline descriptions and notes on shared configuration.

## 2026-04-30 .. 2026-05-06

### Added
- Introduce new ext\_\* signal tables (Schema.org, Legal, Content, External Links, Social) and extend SummarizeProfileGogol to aggregate all signal groups with a new markdown report and enhanced profile snapshots.

### Changed
- Rename the 'extracted' counter in all 37 Extraction-Gogols to 'parsed' to better reflect the actual HTML parsing functionality; update variable declarations, log messages, and the extract-report.json output accordingly.
- Rename the pipeline ID and references from 'crawl' to 'crawl-pages' in CrawlGogol to prevent collisions in pipeline definition and registry.

### Fixed
- Fix CAS file path resolution in all Extraction-Gogols so that storage_path is now correctly based on outputRootDir using getContentRootDir().
- Correct the openingHoursCount query in SummarizeProfileGogol to properly reference the 'text' column in the ext_opening_hours table instead of a non-existent 'present' column.

### Removed
- Remove the split-input batches from the industry-index input directory.

## 2026-04-23 .. 2026-04-29

### Added
- Add output v2 of the industry index with various new reports, datasets, and summaries for different processing steps.
- Add new postal codes for Germany.

### Changed
- Replace all occurrences of 'Bavaria' with 'Bayern' in the postal code data.

### Removed
- Remove a test source from the input industry index and clean up the associated source files.

## 2026-04-16 .. 2026-04-22

### Added
- Introduce an interactive smoke test suite for the app catalog-harvest, including test scenarios and new data sources.
- Extend the app catalog-harvest with additional company catalogs for batch processing.

### Changed
- Optimize the parser for catalog data as well as several classification rules in apps/catalog-harvest and business-core.

### Fixed
- Fix minor inconsistencies in the classification rules and parser functions for company data.
