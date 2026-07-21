## Content as Data, Not as a Chaos of Edits

Pages are described declaratively — in Markdown and YAML, through an array of blocks where each block has a type and parameters. There is no arbitrary HTML or JSX in the page body. Blocks are typed and validated against a schema.

The result: pages are not “redrawn from scratch” each time, but assembled from verifiable elements. Fewer accidental breakages, fewer inconsistencies between sections.

Business data is separated out — prices, legal details, addresses, contact points. They are not hardcoded in texts and components, but stored in a single canonical place and inserted by reference. At first glance, this looks like an engineering detail. In practice, it is a direct answer to a pain familiar to any Business Owner: a price changes, the office moves — and twenty pages have to be edited manually, with five forgotten. Here, the change is made in one file and propagates across the entire site.
