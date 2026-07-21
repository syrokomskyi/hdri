# You order a website — but receive digital infrastructure: an engineering view of web development

When the Owner of a crafts workshop or a local service business in Baden-Württemberg comes to me and says, “I need a website,” I understand: he is describing a category that is familiar to him. A web business card, a landing page, a project on a website builder or WordPress — something that can be shown to clients and found on Google. The wording is reasonable. But it does not describe what I am actually building.

The result of my work is more accurately called not a website, but managed digital infrastructure. This is not wordplay — it is a description of how the artifact the Client receives differs architecturally and economically. And where the honest boundaries of this model lie — because it is not suitable for everyone.

The owner of a carpentry workshop is not buying Astro or Ed25519 signatures. He is buying lower risk, predictable costs, and a clear course of action if he decides to leave. Technical decisions only make sense when they explain this.

## Why this is not WordPress and not a website builder

The Client receives a statically generated website built with Astro and TypeScript, deployed on Cloudflare. Not a dynamic CMS with a database that rebuilds the page on every request. Not a single-page application whose content appears only after JavaScript is executed. It is a compiled set of pages where interactivity is added selectively — as “islands,” not as a total dependency of the entire website on code running in the browser.

What does this mean for the business? Less complexity. A dynamic CMS requires continuous maintenance: core updates, plugin updates, vulnerability monitoring. I am not saying WordPress is insecure — with competent support, it can work for years. But static generation removes an entire class of runtime risks associated with server-side page generation, a database, and a chain of third-party plugins.

The second consequence. The website itself is structured as a thin compositional shell — business logic does not live inside it. Components, validators, and runtime are moved into shared packages. The site consists of a manifest, content files, a business profile, navigation, FAQs, and generated auxiliary files. The Client receives not handwritten code that “no one understands anymore” six months later, but an artifact that is built and validated: the same description produces the same website. Reproducibility is not aesthetics. It is protection against a situation where the business becomes hostage to the memory of a specific developer.

## Content as data, not as a chaos of edits

Pages are described declaratively — in Markdown and YAML, through an array of blocks, where each block has a type and parameters. There is no arbitrary HTML or JSX in the page body. Blocks are typed and validated against a schema.

The consequence: pages are not “redrawn from scratch” every time, but assembled from verifiable elements. Fewer accidental breakages, fewer inconsistencies between sections.

Business data is separated out — prices, legal details, addresses, contact points. They are not hardcoded into texts and components, but stored in one canonical location and inserted by reference. At first glance, this is a detail for engineers. In practice, it is a direct answer to a pain familiar to any Business Owner: the price changes, the office moves — and twenty pages need to be edited manually, while five are forgotten. Here, the change happens in one file and is propagated across the entire site.

## Design whose value lies in its restrictions

The visual language is defined through a design system that I call a biome. The biome defines the palette, typography, spacing, shadows, motion, effects — through tokens and CSS variables. Hardcoded colors are prohibited.

Perhaps the most unusual part here is the programmatic restrictions inside the design system. At build level, it does not allow certain visual clichés to be inserted — such as stock photos with hard hats or faceless handshakes — and it blocks certain marketing phrases. For example, “cheap” or “guaranteed result.”

Most platforms sell freedom: recolor buttons, change fonts, move blocks around. I offer the opposite. The Client buys not the ability to break the design, but protection against accidentally degrading communication. I cannot prove through conversion growth that restrictions work better — I do not have such data, and promising that would be dishonest. But the management logic is clear: the quality of communication that is maintained by the programmatic impossibility of breaking the rules is more resilient than quality that depends on discipline and a good mood.

The same applies to the sequence of blocks on the homepage — a designed chain that leads a skeptical Visitor from their problem to a clear offer. It is an engineered explanatory structure, not a random set of sections.

## Readiness for machine reading is not a layer on top

Search is increasingly becoming machine-mediated: part of the audience receives answers through AI assistants. This is a noticeable trend. But designing a website to be understandable not only to humans, but also to machines, is already reasonable now.

That is why the semantic layer is built into the assembly itself. Each page receives a JSON-LD structured data graph — with Organization, WebSite, BreadcrumbList, Service, Person, FAQPage entities, depending on the page type. In addition, machine-readable text indexes `llms.txt` and `llms-full.txt` are generated, as well as a structured discovery document `.well-known/agent.json` for agentic scenarios. The `robots.txt` file manages crawler access.

This improves machine readability, but does not guarantee inclusion in AI answers, citations, or rankings in search results. `llms.txt` and similar formats are not official web standards yet. I build the website so that machines can understand it. This is preparation, not a promise of visibility.

It is important not to confuse this layer with programmatic SEO (below): one determines whether a machine will understand an existing page; the other determines how many relevant pages will appear at all.

## Programmatic pages only with an evidence base

For a local business, it is important to be present for narrow queries — such as “façade painting in Backnang.” One approach is programmatic generation of landing pages using a geo cascade: industry, country, region, city, demand. The problem is well known: mass generation of thousands of low-quality pages (thin content) harms the site.

That is why each programmatically created page in my system passes through five gates before it becomes indexable:

1/ is there real search demand
2/ is there factual evidence of completed work in this region
3/ is there enough meaningful, unique material
4/ has the page become outdated
5/ does it fit within the tariff budget

The point is not to “generate pages,” but to be able to say: this page cannot be indexed yet.

My gates are currently configurable admission rules, not a proven universal methodology. They reduce the risk of weak pages, but do not guarantee indexing or the absence of search engine penalties (Google evaluates quality according to its own non-public criteria).

## What is included in the price and why it is predictable

The Client pays €70 per month (or €700 per year) plus €200 for onboarding. This is not the lowest price on the web development market. But it includes not abstract “hosting,” but a specific set:

- deployment on Cloudflare Workers
- build and validation on every change
- maintenance of the design system and its restrictions
- keeping the semantic layer up to date
- quality gates for programmatic pages
- the process of moving changes through a managed lifecycle — from materializing the edit to release

Economic predictability here does not mean that the costs are lower than for a WordPress site on cheap hosting or a builder that costs a few euros per month — by the raw number, it may even be more expensive. The predictability lies elsewhere: there are no hidden cost items that usually surface later: emergency repair of a hacked plugin, a full rebuild when changing developers, “rewriting from scratch” because of undocumented custom code. I do not yet have comparative studies of the total cost of ownership for different web development models, so I do not promise that my model is cheaper immediately or over time — but I do promise that the cost structure is visible in advance and does not change as the site grows.

A separate question is who edits the content. Editing is done through structured files and a managed process. Typical changes — text, prices, photos, a new programmatic page — I make myself as part of maintenance, within the tariff or as a separate agreed task. This is not a model where “the Client moves blocks around with a mouse every day.” If a business needs exactly that kind of freedom, it is more honest to say so immediately (see the section on limitations).

## Compliance: an architectural principle, not a legal guarantee

For businesses in Germany and DACH, questions of DSGVO and accessibility (BFSG) are part of operational risk. Part of the answer is embedded at the architectural level. But let us mark the boundary: what the architecture does does not replace legal review or manual accessibility testing.

The infrastructure is EU-oriented: hosting and data processing are designed with this in mind. This resolves some questions about data transfer, but does not remove the need to check specific integrations — forms, email, CRM, analytics — that the Client connects on top of the site. Each such service has its own jurisdiction, and this needs to be checked separately.

The design system and validation help with accessibility indirectly: programmatic restrictions make typical violations of contrast, heading structure, and layout — often caught during audits for WCAG or EN 301 549 compliance — unlikely. But I do not conduct a formal manual accessibility audit by default, and architectural discipline is not a BFSG compliance certificate. If accessibility is a legally critical requirement, the audit must be a separate, explicitly ordered task.

The architecture reduces some of the technical risks associated with DSGVO and accessibility, but does not replace legal consultation or a specialized audit. I design with these requirements in mind; I do not guarantee compliance with them.

## Managed changes, not edits on the live site

Changes to the website pass through a managed lifecycle: materialization, migration, edits, validation, release preparation, reconciliation, closure. Direct edits on the “live” site are detected and blocked. Every change leaves a trace in the history — it is clear who changed what and when. These are changes without chaos, not editing at random.

## Exit without illusions and verifiable authenticity

“The website belongs to the client” is something almost everyone says. Few can prove it. If the Client decides to leave, the question is not the declaration, but whether the infrastructure can be taken away in full, its authenticity verified, and confirmation obtained that what was received is exactly what was agreed at the start.

## Check: do you need just a website or managed digital infrastructure?

Answer a few questions about your current website, edits, data, integrations, and visibility requirements. At the end, you will receive an honest risk profile: where the engineering model can help, and where it is better to check the limitations in advance.

**Next step:** Take the 3-minute self-audit
