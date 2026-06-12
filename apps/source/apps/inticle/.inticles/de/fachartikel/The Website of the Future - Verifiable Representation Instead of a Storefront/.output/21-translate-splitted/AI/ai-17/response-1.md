## Two loops, one source of truth

The most common architectural mistake I see is building a “site for people” and, separately, an “overlay for agents.” That is not the right approach.

The human interface and the machine contract are two projections of a single canonical business model. Price, service, terms, and availability are described once, in a machine-readable way, and from that source both the human-facing page and the response for the agent are rendered. Any divergence between what a person sees and what an agent receives is a defect, not a feature.

When I say “the site is not a separate API,” this is exactly what I mean: the machine layer is not an attachment bolted on from the side, but a second **projection** of the same core. The site remains the center not because it is a familiar format, but because the business already has the foundation its representation rests on: its own domain and certificate as the anchor point of identity. A set of trusted data without such an anchor ends up ownerless. The site gives it both an address and an owner.

That is why I remain calm about the hype around “agent-ready design.” Semantic HTML, clean JSON-LD, content that does not depend on JavaScript rendering, stable structure, and accessibility—what makes a site well built also makes it suitable for agents. The same “accessibility tree” that helps screen readers, by the same logic, helps structured reading by AI agents. Machine readability should be a byproduct of build quality, not a separate commercial layer. Do not buy a magical add-on—build correctly, and the basic machine layer will largely emerge from the same discipline.

But this is not free. Signed assertions, logs, and access levels are a real operational burden, and for any given business, their cost must be honestly treated as unknown in advance.
