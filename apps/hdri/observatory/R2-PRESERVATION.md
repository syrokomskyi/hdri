# HDRI R2 preservation operations

## Current scope — 2026-09-29

The operator selected R2 **instead of Google Drive** for HDRI preservation.
The dedicated bucket is `hdri-preservation`, reached through the existing `r2:`
rclone remote. Bucket creation and object read/write succeeded with the existing
credentials. No public domain or public-development URL was enabled. Keep this
bucket private: raw captures, site identities and internal QC are not public products.
Do not reuse the unrelated `dater-*` buckets. Never commit or print credentials.

Use `/home/syrokomskyi/bin/rclone` on the current workstation. Configuration and
credentials remain outside the repository. See the official
[R2 rclone guide](https://developers.cloudflare.com/r2/examples/rclone/) and
[public-access boundary](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Google Drive migration

Read-only enumeration of `gdrive-root:preserve-q2` found **21 files, 25,628,409
bytes**, across `replica/`, `replica-v2/` and `replica-v3/`. This was an incomplete
remote residue, **not** the complete Q2 preservation closure described by old
local receipts. Old mount paths were not mounted. Preserve those historical
receipts unchanged; do not reinterpret them as current storage proof.

All 21 files were copied, without replacement, to:

```text
r2:hdri-preservation/migrations/2026-09-26/gdrive-preserve-q2/
```

`rclone check --download` read both remotes and reported 21 matches and zero
differences on 2026-09-26. The operator authorized cleanup; only the matched
source files were removed successfully using `--drive-use-trash=true`, a
21-file deletion ceiling and the verified filename list; empty directories were
then removed. The files remain recoverable from Google Drive trash or their
verified R2 copy. No Google Drive trash purge, whole-account deletion, credential removal,
local Q2 deletion or Dater mutation is authorized by this migration.

Operational evidence (gitignored) is under
`apps/hdri/.evidence/storage-migrations/2026-09-26-r2/`:
`gdrive-copy.log`, `remote-readback.log`, `remote-readback.txt`,
`matched-files.txt`, and `gdrive-trash.log`. These are transfer evidence, not
scientific-release receipts. Keep the local complete Q2 originals/replicas until
their own full R2 migration and restoration are independently verified. Never
open retained Q2 DB/WAL/SHM originals through SQLite.

## Sealed Q2 declared closure — recovery completed

`hdri-q2-sealed-r2-retry-20260927.service` (invocation
`cb90063fc4f84041a43d7ec35ed575df`) completed successfully. The receipt records
03:42:17–03:46:49 UTC on 2026-09-27. All 21 declared artifacts plus the manifest
and signature were archived, uploaded/readback-verified, freshly downloaded and
restored. The restored capsule signature and every declared artifact digest passed.
No retained original DB/WAL/SHM was opened through SQLite.

Local work: `apps/hdri/preservation/q2-sealed-r2-20260927/`; script:
`apps/hdri/.evidence/q2-sealed-r2-20260927/preserve.mts`. Archive SHA-256:
`f3118803467aa3897e2723307eb309b7c7399d8504a46458253fcd3f9ef74de6`.
Remote archive:

```text
r2:hdri-preservation/quarters/2026-q2/01a0c5e6-7029-7c75-897e-78f03e4c03c8/sealed-20260927/q2-sealed-declared-closure.tar.zst
```

The retained `restore-receipt.json` explicitly reports
`declared-closure-restored-not-scientific-rebuild`: same-host byte recovery, not
scientific recalculation or migration of every historical original. Other Q2
originals/replicas remain untouched. Do not rerun the completed operation merely
to check status. The first `.ts` launch failed before writes on CommonJS top-level
await; the successful retry used `.mts`, and both logs remain retained.

## Q3 raw snapshot upload

The Factory bundle completed at **2026-09-26 07:17:04 UTC**. At that point Q3 was not
scientifically sealed or publication-ready. A separate raw-preservation operation
completed successfully as `hdri-q3-r2-raw-20260926.service` (invocation
`a810a6c362574d619fbd944245709aa2`). The 10.593 GiB remote archive was fully
download-hashed; its SHA-256 matches the local archive:
`1453274b399ab977118a94a512fbda23b952fb760d28df7c1b0d4f94c8bba808`.
Receipts: `q3-raw-local.sha256` and `q3-raw-r2-readback.sha256` in the evidence
directory. This proves transfer integrity, not restoration or scientific release.

The operation script is retained at the evidence directory above as
`archive-q3-raw.sh`. It:

1. Archives the complete Q3 capsule directory with tar+pax and zstd, retaining
   original file timestamps and without following symlinks.
2. Compares archive contents against the source; a difference stops the operation.
3. Records the local archive SHA-256, uploads without replacing remote objects,
   downloads the remote archive for SHA-256, and compares the two hash files.

Local archive directory: `apps/hdri/preservation/q3-raw-20260926/`.
Remote prefix:

```text
r2:hdri-preservation/quarters/2026-q3/019ff219-69fe-7025-943c-dae2a8c37801/raw-20260926/
```

The filename ends in `raw-unsealed.tar.zst` deliberately. A successful upload
does not convert staging into a sealed release. Keep the source capsule stable
until the archive comparison completes. Do not remove partial archives on retry
without inspecting them; the script refuses existing local output rather than
overwriting it. If interruption occurs after packing, resume the upload/readback
against that same archive, without recreating measurements.

Inspect collection services **at most once per 20 minutes**, unless explicitly
requested otherwise. The operator clarified that recovery/debugging is not bound
to that interval: inspect meaningful milestones/errors without idle model loops.
The availability dependency service uses the collection interval without a model
loop. Relevant service logs are available with:

```sh
rtk proxy journalctl --user -u hdri-q3-r2-raw-20260926.service -n 20 --no-pager
```

## Restoration and durability boundary

A same-host remote recovery drill ran as
`hdri-q3-r2-restore-20260926.service` (invocation
`efb5aa7faa474a44892d0b569473c4ed`). Its retained script is
`restore-q3-raw.sh` in the migration evidence directory. It downloads R2 bytes
into the new private directory `apps/hdri/preservation/q3-restore-20260926/`,
checks the archive hash, rejects links/special files and escaping archive paths,
extracts without overwriting existing files, compares the extracted archive,
verifies every staging inventory entry, and reruns availability preparation and
signed-projection reconciliation against the restored capsule. Both output hashes
must match their previously inspected production artifacts. The original script
failed at archive comparison at 16:45:36 UTC: extraction deliberately restricted
permissions, so tar reported `Mode differs`. Download and extraction completed;
that failure did not certify artifact contents. The retained original script
documents this failed attempt and must not be blindly rerun.

`hdri-q3-r2-restore-resume-20260926.service` (invocation
`bf1ae1d0aef14d6f84892fdec101f48c`) started at 17:08:32 UTC using
`resume-q3-restore.sh`. It reuses the downloaded/extracted bytes, verifies every
declared inventory object's content and then reruns both availability commands.
Its final marker is `SAME_HOST_DECLARED_CLOSURE_RESTORE_AND_AVAILABILITY_REPLAY_PASSED`.
The resume completed successfully at **2026-09-26 17:40:17 UTC** (exit 0).
Declared artifact inventory verification completed at 17:35:18 UTC; replayed
candidate and reconciliation hashes match their original production artifacts.
The unsigned operational note `q3-recovery-run.json`, resume script, downloaded
archive checksum and both command outputs were copied to the R2 receipts prefix
and download-verified: five matches, zero differences. The note is a factual
execution record, not a signed release/admission receipt.
Do not claim source filesystem-mode preservation or verification of unlisted
archive extras. Do not duplicate the drill or report success before its final
marker and successful service exit.
It uses the current workstation/runtime and therefore cannot establish
fresh-machine, offline-runtime or independent-implementation reproduction.

A source kit from Git revision `74ddece13` was separately archived at
`r2:hdri-preservation/source/74ddece13/hdri-source-74ddece13.tar.gz` and verified
by remote download (one match, zero differences). It contains tracked HDRI source,
the Observatory/bundler workspace dependencies, root package/lock/TypeScript
configuration and public verification keys. It excludes `.env`, private keys and
runtime output. The local SHA-256 receipt is `source-74ddece13.sha256` in the
migration evidence directory. This is a source kit, not a self-contained offline
runtime image: registry dependencies, native binaries and the full fresh-machine
reconstruction still need qualification.

Download into a fresh private directory with adequate disk space, verify against
the externally retained SHA-256, inspect archive paths, then extract without root
privileges into an empty directory. Verify capsule signatures and every inventory
part/leaf using the retained public keys and runtime; reconstruct the availability
product independently. Merely listing an archive or checking its checksum is not
a restoration drill or scientific reproduction.

The operator explicitly selected **one local copy plus one R2 copy** on
2026-09-26; a second offsite destination is not required. The decision is retained
in `.input/preservation-scope.yaml`. This is two storage locations, not two offsite
replicas. Shared workstation access to cloud credentials remains a compromise
risk. Full closure verification, remote readback and recovery/reconstruction
remain required. Never invent receipts or classify RAM/cache as durable storage.

The intent file is not an admission override. `quarter:release` now accepts the
explicit `hdri-local-r2-config@1` object in `.input/replica-config.json` in addition
to historical directory-replica arrays. It validates quarter scope and exact
policy bytes, binds configuration/policy to release intent, packages the declared
inventory and readback-verifies archive plus control objects in R2. Attestation
v2 signs the custody-policy digest; it does not claim two offsite replicas.
The source release completed on September 28 and the separately admitted score
derivation on September 29; their exact archive identities are recorded below.
Historical signed receipts and their original policy are unchanged.

The direct transport implementation `run/release/r2-transport.ts` now supports
immutable upload followed by streamed full remote readback, with digest/size and
source-stability checks. Fifteen external-process-boundary tests cover corrupt,
truncated and failed transfers, source mutation, path scope and symlinks. A real
132-byte retained checksum object was also verified through this implementation.
This qualifies that small-object transfer path, not archive membership, final
release custody or fresh-machine recovery. The release branch subsequently ran
on the actual Q3 archives; fresh-machine recovery is not claimed.

`run/release/local-r2-archive.ts` prepares an archive from an explicit release
inventory, including authenticated inventory parts and all their leaves. It
excludes unlisted working files, rejects duplicate/escaping/symlink paths,
verifies source content before and after packing, compares tar contents, syncs
the local archive and performs full direct R2 readback. The result binds the
envelope digest, closure digest, object/byte totals and both archive locations.
It is explicitly `archive-verified-not-release-admission`; caller-managed writer
exclusion and a durable local work root are required. Six actual-archive tests
plus fifteen transport tests pass. The local archive has a stable content-addressed
path, preserving receipt identity on retry. The new release branch delivers the
envelope, custody records and signed attestation as private hash-addressed control
objects. Fifty-three focused tests cover archive retry, policy binding, signature
binding, historical release helpers and entrypoint admission blocking. These tests
do not establish successful end-to-end release or fresh-machine recovery.

## Completed isolated offline replay

`hdri-q3-offline-replay-20260927.service` completed at **2026-09-26 22:34:28 UTC**
(September 27 local time), exit 0, final marker
`OFFLINE_AVAILABILITY_REPLAY_MATCHED_ALL_FOUR_HASHES`. Four rootless containers
ran preparation, full reconciliation, preview generation and disclosure review
with `--network none`, read-only root filesystems and no project node_modules,
private keys, cloud credentials or Docker socket mounted. They consumed the
restored capsule read-only and matched the four original content digests.
Containers share the workstation kernel: this is isolated offline reproduction,
not a different physical machine or an independent algorithm implementation.

The pinned Node image is
`sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`.
The local kit `apps/hdri/preservation/offline-runtime-kit-20260927/` contains
367 inventoried files: the exported image, four standalone commands, exact build
input source closure, lockfile, public verification keys, policy, command outputs
and replay script. Its manifest records the inspected successful container
states and mount/network restrictions. It is not a release-admission receipt.
The script records the original host paths; relocate its explicit mounts when
restoring elsewhere. The raw capsule archive is retained separately.

Archive: `apps/hdri/preservation/offline-runtime-kit-20260927.tar.zst`.
Remote: `r2:hdri-preservation/runtime/2026-09-27/offline-runtime-kit-20260927.tar.zst`.
SHA-256: `7bb9f5182d44fe63dbb71de7762dc54d63b04e5983e6ccb2abeb446490b4d55d`.
Full remote readback completed at 2026-09-26 23:07:32 UTC: one matching file,
zero differences. The earlier `availability-runtime-20260926` bundles failed
bootstrap qualification and must not be used as the qualified runtime.

The final closure must also retain methodology, source/runtime identities,
dependencies, public verification keys and executable recovery instructions.
Scheduled integrity checks and quarterly restore drills must produce actual
evidence. This raw upload alone does not establish preservation for decades.

## Admitted Q3 score derivation — September 29

The signed source capsule and its availability scope remain immutable. The score
release has its own ID `b2c497fe-67df-4619-bd98-42fc96b34e52`, five scientific
reports, operator-signed admission, disclosure review and publication attestation
at `2026-09-29T10:04:13.710Z`. Storage remains one local copy plus one R2 copy.

Both archives below are required. R2 paths are
`r2:hdri-preservation/releases/<envelope-sha>/<archive-sha>.tar.zst`.

| Closure | Envelope SHA-256 | Archive SHA-256 |
| --- | --- | --- |
| Immutable source | `12ac79964bd0ea0fe54f4851ae3c15f58585081755ff5897e08f69ff8d00cb75` | `3d95b7837a31ad25a1d2be54781e614a655aee7a3dbb192b64c11d84e69b07fa` |
| Score derivation | `3ea7214d902a60ad90892c3494c86be8dfc997f4053e5ffc14ee5cfe815396ea` | `66c8d98dffbd4dd2096f5a6c16d03bad5053b5a943f43466ff68e958b552bb46` |

The derived archive is 659,208 bytes, 225 objects, 4,018,266 uncompressed bytes.
It retains exact scoring/export bundles and source closure, codebook, policy,
public products, replay evidence and admission. It is **not self-contained**:
raw observations and the exported Node image remain in the source archive.
Local archives are under `apps/hdri/preservation/releases/` by archive digest.
Private hash-addressed envelope, custody receipts and attestation objects are
under each release prefix's `controls/`; verify their signatures, not just names.

The score runtime replay used network-disabled, read-only rootless containers:
101,321 NDJSON score records matched SHA-256
`84d056eff26fa8506dfb131974c3736245afeeecac1dd82a4cc3640e45131a54`
and all five dashboard payloads matched byte-for-byte. This is same-host isolated
reproduction, not independent hardware or an independent scoring implementation.

The derived archive and all three controls were freshly downloaded from R2 to
`apps/hdri/preservation/derived-q3-restored-Fui6ph/`. All 225 entries, attestation,
derived evidence and operational admission passed before dashboard writes.
`installation-receipt.json` records installation at 10:10:53 UTC. The one-time
installer is `.evidence/q3-score-20260928/install-derived-score.mts`; it refuses
an existing Q3 period. Do not rerun it to check status.

For disaster recovery, download both pinned archives into fresh private roots,
verify exact sizes/hashes and safe inventory paths before extraction, verify
signatures/admission and each entry, load the source-retained Node image, then run
the derived `artifacts/rebuild/runtime/runtime/offline-{calculate,snapshot}.mjs`
with network disabled and explicit read-only source/runtime mounts. Follow retained
rebuild receipts and container inspections for arguments and compare score/payload
hashes. Never expose source identities, raw captures or private admission evidence
in the public dashboard. The completed source recovery need not be repeated for
each status request.
