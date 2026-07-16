## Facts can be compared; trust must be verified

I suggest keeping a simple distinction in mind. It organizes the entire architecture.

**Comparable facts** are what an agent should be able to read cleanly and without guesswork: services, price ranges, availability, timelines, constraints, service areas. These should be provided as a precise machine-readable model.

**Trust-based claims** are what you cannot simply write on a page and expect others to believe: identity, qualifications, warranty, reputation, responsibility for the result. Trust cannot be "rendered." It must be verified.

From this follows an engineering principle: wherever a claim carries risk, a promise, a guarantee, liability, or proof of origin, what is signed matters more than what is visible. Such a claim should exist as verifiable signed evidence, separate from the unsigned text on the page. For ordinary descriptive content, this is of course excessive.

I mention specific mechanisms—cryptographic signatures, W3C Verifiable Credentials, binding identity to a domain via DNS and TLS—as examples of approaches, not as established winning standards. What matters is not the technology itself, but the function: to give the agent a source of trust, not just a rendered paragraph.

One more qualification. Being signed does not equal automatic legal force or commercial persuasiveness. Cryptographic verification does not replace the institutional, legal, and operational context of trust—it only makes part of the facts machine-distinguishable.
