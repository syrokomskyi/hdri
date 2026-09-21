# @syrokomskyi/business-crawler

HTTP page capture, liveness, robots handling and HTML extraction helpers.

## Usage

Use the `fetch-page`, `liveness`, `robots-honor`, `extract`, `egress-policy` and
`collector-health` subpath exports. Browser launching belongs to the audit apps,
not this package.

`fetchPage` returns `contentHash` over the exact UTF-8 bytes of returned `html`:
these are the bytes callers store in the content-addressed HTML archive.
`entitySha256` and `entityBytes` describe the bounded response body before charset
conversion. Fetch may already have decompressed that body; neither is a wire-byte
measurement. `representation` is `utf8-html`. Limits are `maxEntityBytes` and
`maxDecodedBytes`; both must be positive safe integers. UTF-8 truncation preserves
whole code points and never exceeds the decoded-byte limit.

`complete: false` is incomplete evidence, not proof that a feature is absent.
The corresponding evidence contract is `HttpEvidence` schema `hdri-http-evidence@2`.
No old option aliases are retained; archived Q2 objects are not rewritten.

Egress policy helpers do not yet enforce socket destinations or every redirect in
the acquisition transport. Production caller propagation of incomplete capture is
also pending; passing helper tests is not an operational capture qualification.

## Changelog

[CHANGELOG.md](CHANGELOG.md)
