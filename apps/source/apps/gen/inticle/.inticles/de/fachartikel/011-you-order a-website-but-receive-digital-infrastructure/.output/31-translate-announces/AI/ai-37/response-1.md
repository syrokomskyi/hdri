Technically, a small local business website often looks like a simple task until it goes into operation. Then it becomes clear that the problem is not the initial launch, but edits, data, dependencies, releases, and the ability to reproduce the system a year later.

- Static generation with Astro and TypeScript, deployed on Cloudflare, is interesting not because it is a fashionable stack. The point is that it removes an entire class of runtime complexity: a database for every page, server-side generation on request, a chain of plugins, and the constant need to patch extensions. WordPress can work well with competent maintenance, but the static model simply distributes risks differently.

- Content as data matters more than it may seem. If pages are described in Markdown/YAML through typed blocks, and prices, addresses, and legal details are moved into canonical files, the system becomes verifiable. You cannot accidentally insert arbitrary HTML into the body of a page, break the layout of a separate section, or forget to update an old price on the fifteenth page. This is boring engineering, but it is exactly what keeps things in order.

- A managed change lifecycle is needed even for small projects. Materializing an edit, migration, validation, release preparation, reconciliation, and change history sound excessive for a workshop website. But the alternative is edits on the live site, an unclear state of the files, and dependence on who remembers what. In EDV practice, this is a familiar problem: the absence of a process always becomes a process — just a bad one.

Where, in your experience, is the reasonable boundary between a simple static page and a full-fledged maintenance infrastructure?

---
