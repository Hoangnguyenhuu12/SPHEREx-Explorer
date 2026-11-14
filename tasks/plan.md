# Forum implementation plan — BA-aligned revision

Updated: 2026-11-14. Source: user-supplied FORUM_BUSINESS_ANALYSIS.md.
Status: contract step prepared; application implementation not started.

## Objective and controlling specification

Add a persistent community forum for sky-observation discussions using React,
FastAPI, Supabase Auth and PostgreSQL. The current implementation baseline is
[forum-v1.md](../shared/api-contract/forum-v1.md) and
[openapi-forum-v1.yaml](../shared/api-contract/openapi-forum-v1.yaml), revision
forum-v1.1. [JSON examples](../shared/api-contract/examples/forum-v1.json) are
synthetic contract samples, not server output.

This same-work plan replaces the earlier simpler proposal. The supplied BA
requires immutable submitted revisions, continued publication of the old version
while an edit is reviewed, admin-managed tags, reports, hide/restore, audit and
in-app notifications. Those requirements supersede the earlier approval-only
admin, free-form tags and temporarily hidden edited posts assumptions.

GitHub Issues remain the team task tracker. Packages below are proposed issue
bodies, not created/assigned issues. Confirm the new repo issue target because
some inherited README links still point to the old repository.

## Architecture and scope

- Supabase Auth manages account credentials, email confirmation, sessions and recovery.
- Frontend calls FastAPI forum endpoints with bearer access tokens.
- Backend verifies identity and resolves protected user/admin roles.
- Supabase PostgreSQL stores profiles, roles, posts, revisions, revision_tags,
  catalog tags, comments, reports, notifications, append-only audit and idempotency records.
- Use user-scoped access/RLS and guarded transactions; direct Supabase access must
  not bypass ownership, column restrictions, revision immutability or moderation.
- Public reads select only current approved revision of a published/non-deleted
  post. Private workspaces are separate, with identity-scoped client cache.
- Keep forum logic outside IRSA/FITS services. No forum action triggers image processing.
- V1: plain text, safe links, one-level comments, one hashtag filter. No uploads,
  voting, chat, email/push notifications or realtime requirement.

## Lifecycle and integrity rules

Post visibility: unpublished / published / hidden; soft deletion is separate.
Revision workflow: draft -> pending -> approved / rejected / withdrawn.
Submitted content is immutable; new edits clone into a new draft. At most one
active draft/pending per post. Only an explicit approval swaps the public pointer.
Approval never restores a hidden post. Only authors soft-delete their own content;
admins explicitly hide/restore with reasons, without rewriting authors' content.

Every sensitive transition compares expected versions atomically. Idempotency
keys protect POST retries; open reports have a reporter/target uniqueness rule.
Audit and recipient notification creation are atomic with the business transition
or recorded through a durable transactional outbox.

## Work packages and acceptance

| ID | Deliverable / likely locations | Acceptance and verification | Depends on |
| --- | --- | --- | --- |
| F01 | Forum contract, examples, BA traceability; shared/api-contract/ | Parse schema/refs; validate samples and invalid write payloads; temporary TS generation; science schema unchanged. Prepared in this step. | None |
| F02 | Real accounts/profile/session; frontend auth, backend identity | Signup/confirmation/login/logout/recovery works; profile has public name; no self-assigned admin. Auth and session-switch tests. | F01 |
| F03 | Persistence and permission foundation; supabase/migrations and tests | User A cannot access B's private data, even through direct Data API; protected columns cannot be changed. Test against isolated Supabase. | F02 |
| F04 | Managed tag catalog, public feed/detail | Admin creates/deactivates tag; only current published snapshots feed search/counts. Public/private schema tests. | F03 |
| F05 | Saved drafts/My posts/submission | Incomplete draft save works; submission validates limits/tags and freezes payload; private access enforced. API/browser flow. | F04 |
| F06 | Exact-revision review and private comparison | First approval publishes, rejection records reason; actor/audit/notification stored; stale/self-review blocked. Transaction/concurrency tests. | F05 |
| F07 | Public-post edits, withdrawal and soft deletion | Old snapshot stays public while editing; withdraw preserves history; approval swaps atomically; deleted post cannot publish. AC05-07 tests. | F06 |
| F08 | Comments create/update/soft-delete | Public parent enforced at commit, exact observed revision captured; ownership and stale edit tests. | F06 |
| F09 | Reports and admin hide/restore | Open-report uniqueness; no auto-hiding; hidden content excluded everywhere; restoring comment cannot unhide parent. API/RLS tests. | F07, F08 |
| F10 | Notification UI and audit queue | Recipient-only notifications, repeat-safe read; private reasons accessible; logout clears cache. No duplicate events on retries. | F06, F09 |
| F11 | Search/pagination and observation-link integration | q AND managed tag; counts current public only; inactive historical tags filter; safe viewer links preserve selection. Browser/query tests. | F07, F09 |
| F12 | CI/staging deployment | Disposable Supabase migrations/RLS tests, forum end-to-end flow, existing sky tests/build pass. Production CORS/auth redirects verified. | F10, F11 |

Checkpoints: after F03 permissions; after F07 immutable revision/publication flows;
after F10 moderation/report/privacy; after F12 full AC01-AC14 and sky regression checks.
Split packages into smaller reviewable issues/PRs where needed; do not treat these
packages as elapsed-time commitments.

## Integration and release

Proposed boundaries: members/dong/app/forum/ for routes/models/services/identity,
frontend forum/auth modules following the current integration branch conventions,
supabase/migrations and tests for database changes, shared/api-contract for schemas.
BA describes frontend auth/layout on its inspected branch; verify actual integration
branch paths before changing code rather than assuming those paths already exist here.

CORS will need write methods and Authorization/Content-Type/Idempotency-Key headers;
expose retry/auth headers while retaining configured origins. Existing sky APIs
stay public. No privileged key in VITE_* configuration or Git. Keep root .env ignored
and .env.example placeholder-only. Do not let FE mock mode silently write production data.

Use a dedicated implementation branch/worktree after preserving current unrelated
uncommitted frame/contract changes. Review migrations locally and in staging; never
reset a shared Supabase database. Add auth redirect origins for each environment.
Deploy migrations, compatible API then FE; rollback disables forum writes without
destroying user content. Do not promote the planned schema to runtime /openapi.json
until actual routes/models/database policies/types/tests are implemented together.

## Decisions still requiring product/operations sign-off

The BA's D01-D06 are treated as controlling decisions supplied by the user. Numeric
limits, seed tag list, plain-text choice, no self-review, email confirmation, error
copy, first admin provisioning and queue staffing are explicit implementation or
operational defaults rather than newly claimed user confirmations. No live Supabase
resources, GitHub Issues or wiki publication were created by the contract step.
