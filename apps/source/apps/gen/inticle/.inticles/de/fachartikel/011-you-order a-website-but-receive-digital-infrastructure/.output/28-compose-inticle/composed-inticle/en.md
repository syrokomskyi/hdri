# You Order a Website - but Receive Digital Infrastructure: an Engineering View of Web Development

When the owner of a craft workshop or a local service business in Baden-Württemberg comes to me and says, "I need a website," I understand: he is describing a category i.e. familiar to him. A web business card, a landing page, a project built with a site builder or WordPress - something that can be shown to clients and found on Google. The wording is reasonable. But it does not describe what I am actually building.

The result of my work is more accurately called not a website, but managed digital infrastructure. This is not wordplay - it is a description of how the artifact the Client receives differs architecturally and economically. And where the honest boundaries of this model lie - because it is not suitable for everyone.

The owner of a carpentry workshop is not buying Astro or Ed25519 signatures. He is buying lower risk, predictable costs, and a clear course of action if he decides to leave. Technical decisions only make sense when they explain this.

---

## Why This Is Not WordPress and Not a Website Builder

The client receives a statically generated website built with Astro and TypeScript, deployed on Cloudflare. Not a dynamic CMS with a database that rebuilds the page on every request. Not a single-page app whose content only appears after JavaScript has executed. It is a compiled set of pages where interactivity is added selectively - as "islands" - rather than making the entire website dependent on code running in the browser.

What does this mean for the business? Less complexity. A dynamic CMS requires continuous maintenance: core updates, plugin updates, vulnerability monitoring. I am not claiming that WordPress is insecure - with proper support, it can run for years. But static generation removes an entire class of runtime risks related to server-side page generation, the database, and the chain of third-party plugins.

The second consequence: the site itself is structured as a thin compositional shell - business logic does not live inside it. Components, validators, and runtime are moved into shared packages. The site consists of a manifest, content files, a business profile, navigation, FAQ, and generated auxiliary files. The client receives not hand-written code that, six months later, "no one understands anymore," but a buildable and validated artifact: the same site is built from the same description every time. Reproducibility is not aesthetics. It is protection against a situation where the business becomes hostage to the memory of a specific developer.

---

## Content as Data, Not as a Chaos of Edits

Pages are described declaratively - in Markdown and YAML, through an array of blocks where each block has a type and Param. There is no arbitrary HTML or JSX in the page body. Blocks are typed and validated against a schema.

The result: pages are not "redrawn from scratch" each time, but assembled from verifiable elements. Fewer accidental breakages, fewer inconsistencies between sections.

Business data is separated out - prices, legal details, addresses, contact points. They are not hardcoded in texts and components, but stored in a single canonical place and inserted by reference. At first glance, this looks like an engineering detail. In practice, it is a direct answer to a pain familiar to any Business Owner: a price changes, the office moves - and twenty pages have to be edited manually, with five forgotten. Here, the change is made in one file and propagates across the entire site.

---

## Design I.e. Valuable Because of Its Constraints

The visual language is defined through a design system that I call a biome. The biome defines the palette, typography, spacing, shadows, motion, and effects through tokens and CSS variables. Hardcoded colors are prohibited.

What is probably most unusual here is the programmatic restrictions inside the design system. At the build level, it prevents certain visual clichés from being inserted - such as stock photos with hard hats or faceless handshakes - and blocks specific marketing phrases. E.g., "cheap" or "results guaranteed."

Most platforms sell freedom: recolor buttons, change fonts, move blocks around. I propose the opposite. The client is not buying the ability to break the design, but protection against the accidental degradation of communication. I cannot prove through conversion growth that restrictions work better - I do not have that data, and promising it would be dishonest. But the management logic is transparent: the quality of communication i.e. maintained by the programmatic impossibility of breaking the rules is more resilient than quality that depends on discipline and a good mood.

The same applies to the sequence of blocks on the homepage - a designed chain that leads a skeptical Visitor from their problem to a clear offer. This is an engineered structure of explanation, not a random set of sections.

---

## Machine-readiness is not a layer on top

Search is increasingly becoming machine-mediated: part of the audience gets answers through AI assistants. This is a noticeable trend. But designing a site so that it is understandable not only to humans but also to machines already makes sense today.

I.e. why the semantic layer is built into the site build itself. Each page receives a JSON-LD structured data graph - with Organization, WebSite, BreadcrumbList, Service, Person, and FAQPage entities, depending on the page type. In addition, machine-readable text indexes `llms.txt` and `llms-full.txt` are generated, along with a structured discovery document `.well-known/agent.json` for agentic scenarios. The `robots.txt` file manages crawler access.

This improves machine-readability, but it does not guarantee inclusion in AI answers, citation, or positions in search results. `llms.txt` and similar formats are not yet official web standards. I build the site so that it is understandable to machines. This is preparation, not a promise of visibility.

It is important not to confuse this layer with programmatic SEO (below): one determines whether a machine will understand an already existing page; the other determines how many relevant pages will exist in the first place.

---

## Programmatic Pages Only with an Evidence Base

For a local business, it is important to be present for narrow queries - such as "facade painting in Backnang." One approach is programmatic generation of landing pages across a geo-cascade: industry, country, region, city, demand. The problem is well known: mass generation of thousands of low-quality pages (thin content) harms the site.

I.e. why every programmatically created page in my system passes through five gates before it becomes indexable:

1/ is there real search demand
2/ is there factual evidence of completed work in this region
3/ is there enough substantial, unique material
4/ has the page become outdated
5/ does it fit within the plan's budget

The point is not to "generate a lot of pages," but to be able to say: this page should not be indexed yet.

My gates at the moment are configurable admission rules, not a proven universal methodology. They reduce the risk of weak pages, but they do not guarantee indexation or the absence of search engine penalties (Google evaluates quality according to its own non-public criteria).

---

## What Is Included in the Cost and Why It Is Predictable

The client pays €70 per month (or €700 per year) plus €200 for setup. This is not the lowest price on the web development market. But it does not cover an abstract "hosting" service; it covers a specific set of components:

- deployment on Cloudflare Workers
- build and validation on every change
- maintenance of the design system and its constraints
- keeping the semantic layer up to date
- quality gates for programmatic pages
- the change management process itself through a controlled lifecycle - from materializing the edit to release

The economic predictability here is not that the costs are lower than a WordPress site on cheap hosting or a website builder for a few euros per month - in pure numerical terms, it may well be more expensive. The predictability lies elsewhere: there are no hidden cost items that usually surface later - emergency fixes for a hacked plugin, a full rebuild after changing developers, or "rewriting from scratch" because of undocumented custom code. I do not yet have comparative studies of the total cost of ownership across different web development models, so I am not promising that my model is cheaper either immediately or over time. But I do promise that the cost structure is visible in advance and does not change as the site grows.

A separate question is who edits the content. Editing is done through structured files and a managed process. Typical changes - text, prices, photos, a new programmatic page - are handled by me as part of maintenance, either within the plan or as a separately agreed task. This is not a model where "the client moves blocks around with a mouse every day." If the business needs exactly that kind of freedom, it is more honest to say so upfront (see the section on limitations).

---

## Compliance: an architectural principle, not a legal guarantee

For businesses in Germany and the DACH region, DSGVO and accessibility (BFSG) are part of operational risk. Some of the answers are embedded at the architectural level. But the boundary should be clear: what architecture does does not replace legal review or manual accessibility testing.

The infrastructure is EU-oriented: hosting and data processing are designed with this in mind. This addresses some questions around data transfer, but it does not remove the need to review specific integrations - forms, email, CRM, analytics - that the Client connects on top of the website. Each such service has its own jurisdiction, and this needs to be checked separately.

The design system and validation help with accessibility indirectly: programmatic constraints make typical violations of contrast, heading structure, and layout - issues often identified during WCAG or EN 301 549 compliance audits - less likely. But I do not perform a formal manual accessibility audit by default, and architectural discipline is not a BFSG compliance certificate. If accessibility is a critical legal requirement, the audit must be a separate, explicitly commissioned task.

Architecture reduces some of the technical risks associated with DSGVO and accessibility, but it does not replace legal consultation or a specialist audit. I design with these requirements in mind; I do not guarantee compliance with them.

---

## Managed Changes, Not Live-Site Edits

Changes to the site go through a managed lifecycle: materialization, migration, edits, validation, release preparation, verification, and closure. Direct edits on the "live" site are detected and blocked. Every change leaves a trace in the history - it is clear who changed what and when. These are changes without chaos, not random editing.

---

## An exit without illusions and verifiable authenticity

"The website belongs to the client" is something almost everyone says. Few can prove it. If the Client decides to leave, the issue is not the declaration, but whether the infrastructure can be taken in full, its authenticity verified, and confirmation obtained that what was received is exactly what was agreed at the start.

---

# Pricing in Market Context

_The table and accompanying notes were prepared by Claude Fable; I did not make any corrections._

| Segment | ~3 Years | What the Client Gets |
|---|---|---|
| Website builder (Baukasten: Wix, Jimdo, STRATO) | ~€400–1,600 | rented space on the provider's platform; limited SEO, often slow load times [1] [2] |
| Freelancer (DE, Handwerk) | ~€800–4,000 one-time | portable WordPress, personal contact; usually no mandatory maintenance contract [1] [2] |
| Agency (DE, WordPress-based) | ~€1,800–10,000+ | more production polish on the same WordPress base; typical benchmark for Saarland: €1,800–4,500 [1] [3] |
| AI + human hybrid (B12-type) | ~€1,400–3,500 (≈$1,500–3,800) | bundle of business tools for service professionals (lawyers, consultants, coaches); section-based editor, no drag-and-drop; not built for Handwerk [4] [5] |
| Warpgogol | ~€2,440–2,720 | ownership + SSG crawlability + anti-spam pSEO + Cosmic Passport + agent-readiness |

The local market for Handwerk websites in Germany rests on three tiers.

**Website builders (Baukasten)** — €10–30/month plus a one-time €0–500 for a premium template [1], or up to €40/month with no one-time fee according to other data [2]; over three years that comes to roughly €400–1,600.

**Freelancer** — €800–2,500 net for a simple 3-page site [2], or €1,000–4,000 on a broader estimate [1]; usually with no mandatory maintenance contract.

**WordPress-based agency** — from €2,000 to €10,000+ [1], with a typical benchmark of €1,800–4,500 for a Handwerk project in Saarland [3].

**AI + human hybrid (B12)** starts at $42–49/month and offers an optional done-for-you setup for a one-time $1,999 [4] [5]. Over three years, the cost is comparable to a local freelancer, but the model is built for service professionals — lawyers, consultants, coaches — rather than Handwerk, and its section-based editor limits design to no drag-and-drop [5].

**Warpgogol** — at €70/month (or €700/year) plus a €200 setup fee, three years add up to ≈€2,440–2,720: €1,040 in the first year (per the studio's own figures) and €700–840 in each of the following two years, depending on monthly or annual billing. That sits in the range of a serious local specialist rather than a premium agency — but with engineering guarantees (ownership, verifiability, resilience to known algorithmic risk) that the specialist doesn't offer.

---

## Sources

[1] blackforest-webcraft.de — Handwerker-Website Kosten 2026 — https://blackforest-webcraft.de/blog/handwerker-website-kosten-2026/
[2] webentwicklung-rottweil.de — Was kostet eine Website für Handwerker? — https://webentwicklung-rottweil.de/blog/was-kostet-eine-website-fuer-handwerker/
[3] ditella.de — Handwerker-Website 2026: Der komplette Guide — https://ditella.de/blog/handwerker-website-guide
[4] toolsforhumans.ai — B12 AI Website Builder review 2026 — https://www.toolsforhumans.ai/ai-tools/b12-ai-website-builder
[5] fahimai.com — B12 AI Built My Site in 60 Seconds — https://www.fahimai.com/b12-ai

---

## Check: do you need just a website, or managed digital infrastructure?

Answer a few questions about your current website, updates, data, integrations, and visibility requirements. At the end, you will receive an honest risk profile: where an engineering model can help, and where it is better to check the constraints in advance.

**Next step:** Complete the 3-minute self-audit
