## Machine-readiness is not a layer on top

Search is increasingly becoming machine-mediated: part of the audience gets answers through AI assistants. This is a noticeable trend. But designing a site so that it is understandable not only to humans but also to machines already makes sense today.

That is why the semantic layer is built into the site build itself. Each page receives a JSON-LD structured data graph — with Organization, WebSite, BreadcrumbList, Service, Person, and FAQPage entities, depending on the page type. In addition, machine-readable text indexes `llms.txt` and `llms-full.txt` are generated, along with a structured discovery document `.well-known/agent.json` for agentic scenarios. The `robots.txt` file manages crawler access.

This improves machine-readability, but it does not guarantee inclusion in AI answers, citation, or positions in search results. `llms.txt` and similar formats are not yet official web standards. I build the site so that it is understandable to machines. This is preparation, not a promise of visibility.

It is important not to confuse this layer with programmatic SEO (below): one determines whether a machine will understand an already existing page; the other determines how many relevant pages will exist in the first place.
