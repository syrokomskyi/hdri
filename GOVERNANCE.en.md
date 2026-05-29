# Project governance

> [Deutsche Version](GOVERNANCE.md)

This document describes how the Handwerk Digital Readiness Index (HDRI) project is governed at its current stage of development and how this governance model may evolve as additional contributors and partner institutions become involved.

HDRI is currently an independent open-source project initiated and maintained by a private individual based in Backnang, Baden-Württemberg, Germany. At the present stage, the project is not institutionally sponsored and does not operate under the authority of any public body, research institute, company, or association.

## 1. Purpose of this document

This document exists to provide clarity on:

- who is currently responsible for the project;
- how technical and organisational decisions are made;
- how external contributors can participate;
- how future governance roles may be established if the project grows.

The aim is to ensure transparency, continuity, and a predictable basis for cooperation with contributors, users, research organisations, chambers, ministries, and other potential partners.

## 2. Current governance model

HDRI currently follows a **single-lead, open-contribution model**.

This means that:
- the project is publicly developed in the open;
- contributions from external participants are welcome;
- final responsibility for roadmap, architecture, releases, and repository stewardship currently rests with the Project Lead.

This model reflects the current size and maturity of the project. It is intentionally lightweight, while still providing clear accountability.

## 3. Roles

### 3.1 Project Lead

The Project Lead is responsible for:

- defining the overall direction of the project;
- approving major architectural and methodological decisions;
- maintaining consistency between the project's technical implementation and its public mission;
- deciding on releases and repository administration;
- representing the project in external discussions with institutions and potential partners.

Current Project Lead:

- **Name:** Andrii Syrokomskyi
- **Location:** Backnang, Baden-Württemberg, Germany
- **Contact:** via GitHub profile and repository issues

### 3.2 Maintainers

Maintainers are trusted contributors who may be granted review or write access to specific parts of the repository.

Maintainers may:
- review and merge pull requests;
- oversee defined technical areas;
- help enforce coding, documentation, testing, and privacy-related standards;
- participate in decisions on significant changes.

At present, the Project Lead is the sole maintainer.

Additional maintainers may be appointed in the future based on sustained, high-quality contributions, reliability in review, and demonstrated alignment with the project's public mission.

### 3.3 Contributors

Contributors are individuals or organisations who participate by:
- opening issues;
- suggesting improvements;
- submitting pull requests;
- improving documentation;
- reporting bugs;
- contributing analysis, methodology, or domain expertise.

Contributors do not automatically receive governance authority. Governance responsibilities are earned over time through sustained participation and trust.

## 4. Decision-making

### 4.1 Routine decisions

Routine technical decisions are made through normal repository workflows, including issues, pull requests, code review, and documentation updates.

### 4.2 Significant decisions

Significant decisions should be discussed publicly in GitHub issues or pull requests before implementation. This applies in particular to:

- substantial changes to the scoring model or codebook;
- changes to ontology design or data structures;
- changes affecting privacy guarantees or publication rules;
- major architectural refactorings;
- breaking changes to outputs, interfaces, or dashboards.

Where appropriate, such proposals should be marked as an RFC.

### 4.3 Final responsibility

The project seeks public discussion and reasoned consensus wherever possible. However, at the current stage of governance, the Project Lead retains final responsibility for decisions when no consensus emerges.

All contributors are expected to follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## 5. Contribution and review

All non-trivial changes should be proposed through pull requests.

Contributors are expected to:
- keep changes appropriately scoped;
- include tests where relevant;
- update documentation where behaviour or outputs change;
- respond constructively to review feedback.

Pull requests are reviewed before merging. For changes affecting privacy, public data outputs, or methodological validity, additional review may be required.

## 6. Releases and official outputs

The repository's default branch reflects the current development state of the project.

Tagged releases are the preferred basis for:
- public demonstrations;
- reproducible analyses;
- external evaluation;
- institutional review;
- deployment of dashboards or derived outputs.

Release notes should document major changes, migration implications, and any relevant methodological adjustments.

## 7. Institutional cooperation

HDRI is open to cooperation with public institutions, chambers, research organisations, civic-technology groups, and commercial partners.

Such cooperation does not automatically confer governance authority over the repository or project direction.

If institutional cooperation develops into a more formal structure — for example through advisory roles, co-maintainership, or a steering group — this will be documented explicitly in this file or in a successor governance document.

Until such a structure is formally established, governance remains with the Project Lead and any maintainers explicitly appointed by the Project Lead.

## 8. Amendments

This document may be updated as the project evolves.

Proposed changes should be made through a pull request. At the current stage, amendments require approval by the Project Lead.

---

All contributions and the project's source code are released under the **[Apache License 2.0](LICENSE)**.
