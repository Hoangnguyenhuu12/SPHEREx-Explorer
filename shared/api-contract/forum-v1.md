# Forum API contract — forum-v1.1

Status: **contract-first; not implemented or deployed**. Aligned with `FORUM_BUSINESS_ANALYSIS.md` supplied by the user on 2026-11-14. This supersedes the earlier forum-v1.0 assumptions in this work session. It does not claim team-wide sign-off or working server endpoints.

Machine-readable source: [openapi-forum-v1.yaml](openapi-forum-v1.yaml), **25 paths / 32 operations**. [Synthetic JSON examples](examples/forum-v1.json) cover each operation. Each operation is marked `x-implementation-status: planned`.

This is a separate forum contract, not a change to the SPHEREx processing API. The runtime-generated [openapi.yaml](openapi.yaml), [science SRS draft](openapi-srs-v2-draft.yaml), backend code and active frontend types remain unchanged. `info.x-contract-revision: forum-v1.1` identifies this specification; JSON envelopes retain `api_version: "0.1"`. All fields marked required in new schemas are required from first implementation.

## 1. BA decisions and explicit scope change

| BA | Contract consequence |
| --- | --- |
| D01 | Submit an immutable revision for admin approval before initial publication. Review means community relevance, not scientific/NASA verification. |
| D02 | Comments publish immediately; users report content and admins explicitly hide/restore it. |
| D03 | Published snapshot remains visible while a new draft/pending revision exists. Only approval swaps the published pointer. |
| D04 | Admin-managed hashtag catalog with stable IDs; authors select existing active IDs and cannot create tags. |
| D05 | Public reads are anonymous; writing/reporting requires authenticated identity. |
| D06 | Plain text and safe HTTP(S) links, including The Eyes links; no upload pipeline. |

The BA expands admin scope beyond the original approval-only request: catalog management, reports, explicit hide/restore and audit access are now included. In-app notifications and saved drafts also belong to the BA's required first release. Original author edit/soft-delete requirements are retained.

The following implementation defaults are selected from BA proposals, not presented as independently confirmed product decisions: single-level comments; title 10–150/body 20–20,000/comment 1–3,000 characters; 1–5 catalog tags on submission; email confirmation; no self-review; one open report per reporter/target; one active draft/pending revision; one hashtag filter; canonical immutable tag slug; plain text with structured links. Review these defaults when the team signs off the contract.

## 2. Authentication and profile

Supabase Auth owns passwords, signup, login, refresh, logout and recovery. FastAPI does not implement password endpoints.

| Action | Supabase JS v2 method |
| --- | --- |
| Register | `auth.signUp({ email, password, options: { data: { display_name } } })` |
| Login | `auth.signInWithPassword({ email, password })` |
| Session updates | SDK session handling and `auth.onAuthStateChange` |
| Logout | `auth.signOut()` |
| Recovery | `auth.resetPasswordForEmail`, then recovery-session `auth.updateUser` |

Email confirmation is enabled; signup may succeed with `session: null`. Show confirmation instructions instead of pretending the user is logged in. Display name is trimmed public text (1–80 characters), not email. `/me` returns nullable display_name when profile completion is required; `PATCH /me` supplies it. Mutations require confirmed accounts and a complete profile, except profile completion itself only requires a confirmed account. Missing profile/dependency setup is 503; incomplete profile contributions are 403 with `details.reason: PROFILE_REQUIRED`.

Use `Authorization: Bearer <access_token>`. Verify signature, issuer, audience and expiry; resolve role from protected database state, never browser metadata. Exactly two app roles: user/admin. Guest is an anonymous session, not a third role. Operators assign admin outside the public API. Supabase Auth errors remain provider/SDK errors and are mapped separately from FastAPI errors.

Public GET accepts no token. An invalid supplied token returns 401, not silent anonymous fallback. FE may refresh once and retry reads. On logout/account switch, clear or identity-scope all private cached data, editor state and notifications; redirect targets must be internal safe paths. Do not expose passwords, email, tokens or service secrets in responses, links or logs.

## 3. Entities and privacy boundary

- `PostState`: stable post ID/author, visibility `unpublished | published | hidden`, version and pointers to current approved revision and working draft/pending revision.
- `Revision`: content snapshot with `draft | pending | approved | rejected | withdrawn`, version, title/body, hashtag IDs, links/context and review metadata.
- `PublicPost`: current approved content only. No working revision, reasons, reports or private workflow fields, even when requested with an admin token.
- `Workspace`: author/admin-only post state plus published and working snapshots, reasons and referenced tag states. History has separate paginated revision endpoints.
- `Comment`: one level, anchored to a post and the public `observed_revision_id` at creation. Hidden/comment reasons are available only through the author/admin comment workspace.
- `Report`: private reporter receipt; `AdminReport` additionally contains reporter identity and internal resolution metadata.
- `Notification`: recipient-only event references, not a public copy of sensitive content.
- `AuditEvent`: append-only admin view of actor/action/target/reason/time and before/after state.

Database/RLS/guarded transitions must enforce the same rules if callers bypass FastAPI via Supabase Data API. Row ownership alone must not allow modifying role, status, publication pointers, reviewer identity or internal deletion state.

## 4. Revision lifecycle and publication

1. `POST /posts` creates an unpublished post plus a draft. Defaults permit empty title/body/tags/links for draft saving.
2. PATCH the current draft with `expected_version`. Omitted fields stay unchanged, `[]` clears arrays, null clears sky_context. No-op after normalization returns 400. Every draft change increments both revision.version and post.version, and updates timestamps.
3. Submit the exact draft with expected revision/post versions. Enforce full publication limits, valid links and 1–5 active catalog tags. Freeze content, set pending/submitted_at, increment both versions. Existing public snapshot stays unchanged.
4. Admin reviews an exact pending snapshot and current post version. Approve atomically updates published_revision_id and clears working_revision_id; reject clears working pointer and records reason. Both increment revision/post versions, update timestamps and preserve immutable content.
5. Withdrawal similarly requires both versions, records withdrawn status, clears working pointer, increments versions and preserves the public snapshot. Submitted payloads cannot be patched.
6. To continue after rejection/withdrawal or edit an approved post, create a new revision by cloning a same-post approved/rejected/withdrawn snapshot. Require no active draft/pending and expected_post_version. New draft starts version 1; its monotonically increasing number is unique within the post. Post version increments.

Initial approval changes unpublished -> published and sets published_at once. Replacement approval keeps original published_at and sets edited_at. Previous approved snapshots remain history, but only one pointer is current. Draft edits, rejection and withdrawal never replace public content or public hashtag associations.

Admin self-review is forbidden; an admin author's submission needs another admin. Two admins competing, withdrawal versus approval, or concurrent author edits are serialized through version/state checks: first valid transition wins; stale action returns 409. Each path revision must belong to the named post.

## 5. Hidden versus author-deleted

Admin hide/restore is independent of revision state. Hiding requires a published post; restoring requires a hidden post with a current approved pointer. Every action requires expected_version and nonblank reason, increments version, updates timestamp and records audit/notification. Approving a revision on a hidden post may update its approved pointer but **must leave visibility hidden**.

Public URL/feed/search/tag counts/comments never expose hidden content. Author/admin workspaces expose appropriate private state/reasons. Restoring a post restores access only to otherwise visible, non-deleted comments; it does not unhide individually hidden comments.

Author DELETE sets internal deleted_at, withdraws active pending work atomically and hides all associated content. No hard-delete or restore API. Admin cannot delete other authors' content or edit it under their names. A deleted resource is unavailable even to author/admin. Repeating author DELETE on the same row returns 204, except comment deletion when its parent is deleted (404). 204 has no response body. DELETE intentionally targets the latest version without a version precondition.

## 6. Comments, reports and notifications

Comments become visible immediately. Creation requires a published/non-deleted parent at the transaction boundary. `observed_revision_id` must match the current approved pointer; if it changed while the page was open, return 409 and ask FE to reload. Store that ID permanently to explain comment context after future revisions.

Authors PATCH visible comments under public posts with expected_version; hidden/deleted/inaccessible comments return 404. Actual edits increment comment.version and leave observed_revision_id unchanged. Authors can soft-delete their own hidden comments, including under a hidden parent. Admin hide/restore increments comment.version and requires reason/audit/notification. Restoring a comment under a hidden parent does not expose it publicly or restore the parent.

Reports require login/complete profile and a currently public post/comment. Reasons: off_topic, spam, abuse, personal_information, other; other needs nonblank description. A database uniqueness constraint allows one open report per reporter/target: create201, existing open report200 unchanged. Reports never auto-hide content. Admin resolves/dismisses only an open report at the expected version; resolution stores actor/time/reason and audit. Visibility is a separate explicit action. A deleted target does not prevent closing a report. Reporter identities/internal notes never appear publicly.

Create recipient-only in-app events for submission_received, revision_approved/rejected, post_hidden/restored and comment_hidden/restored. Commit event/audit or a durable outbox record with the business transaction; retries do not duplicate events. List newest first; PATCH read=true is repeat-safe and preserves first read_at. No email/push/realtime requirement. Notifications link to authorized workspaces, exact revision details or comment workspaces for reasons; unavailable/deleted targets can return404 without exposing cached private text.

## 7. Hashtags, links and search

Catalog tag: stable UUID, immutable unique slug, display_name, active flag and version. Admin creates tags, renames display_name or toggles active with expected_version; no delete endpoint. Trim/lowercase slug and remove one leading # before checking `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max40. Name max80. Existing IDs remain historical even when a tag becomes inactive.

Authors submit `hashtag_ids`, not free-form labels. Unknown IDs or new inactive selections are rejected on draft create/update; unchanged/copied inactive IDs may remain in drafts for correction. Submit and approve require every tag still active. If a pending tag is deactivated, approval returns409 with `details.reason: INACTIVE_HASHTAG`; admin rejects with explanation or author withdraws and changes tags. Never silently rewrite a submitted snapshot. Existing published posts keep inactive tags and remain filterable. Slug/name changes do not create content revision associations; admin may change name only, not slug.

Plain text body and up to10 structured links (label1–120, URL up to2048), HTTP(S) only, no URL credentials. Validate actual URL parsing/host, escape labels/text; do not fetch user URLs server-side. The Eyes link preserves selection in its URL; illustrative example URLs are not deployment configuration. Optional sky_context uses current ra/dec/size/detector semantics. collection/time bounds/product IDs are metadata, not new science API query parameters. Saving or sharing never triggers image processing automatically.

Public search uses trimmed NFC `q` (max200), case-insensitive/accent-sensitive literal substring in public title OR body. Empty q means no keyword filter; percent/underscore are literal, not SQL wildcards. One `hashtag` slug, normalized as above; unknown valid slug yields empty results. q AND hashtag. A literal # in a URL must be encoded `%23`; prefer canonical slug without #. Hashtags typed into body do not create relationships.

Tag counts count distinct non-deleted published posts using current approved revisions only, including historical inactive tags. Search, feeds, counters and previews never use unapproved or hidden snapshots.

## 8. Endpoints and pagination

All paths below are relative to `/api/forum`; exact schemas/examples are in OpenAPI.

| Group | Endpoints |
| --- | --- |
| Profile | GET/PATCH `/me` |
| Taxonomy | GET `/hashtags`; POST `/admin/hashtags`; PATCH `/admin/hashtags/{tag_id}` |
| Public posts | GET `/posts`; GET `/posts/{post_id}` |
| Author posts | POST `/posts`; DELETE `/posts/{post_id}`; GET `/me/posts`; GET `/posts/{post_id}/workspace` |
| Revisions | GET/POST `/posts/{post_id}/revisions`; GET/PATCH `/posts/{post_id}/revisions/{revision_id}` |
| Submit/withdraw | POST `/posts/{post_id}/revisions/{revision_id}/submission` or `/withdrawal` |
| Review | GET `/admin/reviews`; POST `/admin/posts/{post_id}/revisions/{revision_id}/decision` |
| Visibility | POST `/admin/posts/{post_id}/visibility`; POST `/admin/comments/{comment_id}/visibility` |
| Comments | GET/POST `/posts/{post_id}/comments`; PATCH/DELETE `/comments/{comment_id}`; GET `/comments/{comment_id}/workspace` |
| Reports | POST `/reports`; GET `/admin/reports`; POST `/admin/reports/{report_id}/decision` |
| Notifications | GET `/me/notifications`; PATCH `/me/notifications/{notification_id}` |
| Audit | GET `/admin/audit-events` |

List limit default20/max50; opaque cursor resets when filters change, scoped to endpoint/order/filters/identity. Malformed/expired/mismatched cursor400. No frozen snapshot promise: recheck permissions/visibility on every page. Empty list200 with next_cursor:null. No global total except explicit public tag counts. Unknown/repeated scalar query parameters are400.

Ordering: public posts published_at DESC/id DESC; My posts updated_at DESC/id DESC; review queue submitted_at ASC/revision id ASC; comments/reports created_at ASC/id ASC; notifications/audit created_at DESC/id DESC; revision history number DESC/id DESC; tags slug ASC/id ASC. My posts supports visibility AND the status of the latest revision by number (draft/pending/rejected/withdrawn; if the latest is approved, none of these filters match). Taxonomy active filter omitted includes both; notification unread filter omitted includes both; report status defaults open.

## 9. Idempotency, errors and transport

Every POST requires a client-generated UUID `Idempotency-Key`, one per user intent reused on retries/double-click. Scope to actor+operation+resource, reserve atomically, compare canonical request payload hash, retain at least24h. Completed successes replay original status/body after current authorization/resource accessibility checks; same key/different payload or in-flight returns409. A different key does not bypass revision-state checks or open-report uniqueness. Only retry a failed write once rollback is known; an ambiguous commit remains unresolved rather than executing twice. After retention expires, clients must reconcile state before retrying an uncertain old operation. No API promises network-level exactly-once delivery.

All JSON envelopes require api_version:0.1. Reuse `{api_version,error:{code,message,details}}`. Codes: BAD_PARAM400, UNAUTHORIZED401, FORBIDDEN403, NOT_FOUND404, CONFLICT409, RATE_LIMITED429, INTERNAL500, SERVICE_UNAVAILABLE503. 400 covers strict unknown fields, invalid lengths/IDs/cursors and no-op edits; 409 covers stale/wrong states, inactive pending tags, duplicate slugs and idempotency conflicts. Detail reasons include PROFILE_REQUIRED, STALE_VERSION, INVALID_STATE, INACTIVE_HASHTAG and IDEMPOTENCY_CONFLICT as applicable; never leak hidden content.

Reject unauthenticated requests first; non-admin at admin endpoints gets403. Private resources denied to ordinary readers return404. A foreign publicly visible author's mutation returns403. Invalid supplied token on public GET returns401. Unavailable auth/DB dependencies return503, not invalid-password or not-found messages.

Every response including204/errors uses Cache-Control:no-store. 401 includes WWW-Authenticate:Bearer; 429 includes Retry-After seconds. Future CORS must permit GET/POST/PATCH/DELETE and Authorization/Content-Type/Idempotency-Key, expose Retry-After/WWW-Authenticate, and retain explicit allowed origins. No cookie credentials required by this bearer contract. Existing astronomy APIs remain public and independent. UI hides controls for convenience; backend/database enforce all permissions.

## 10. BA acceptance traceability

These are implementation acceptance checks, not claims that runtime tests pass now.

| BA AC | Contract surface / required check |
| --- | --- |
| AC01 | Public posts/comments/tags: only current public contents; contribution requires login. |
| AC02 | Draft submission and private workspace: no public access to pending revision. |
| AC03 | Exact-version decision + idempotency + transactional event: publish once, notify, correct counts. |
| AC04 | Reject requires reason; immutable rejected snapshot can seed a new draft. |
| AC05 | PublicPost schema excludes working content; public search/tags use approved pointer only. |
| AC06 | Approval swaps pointer; rejection/withdrawal preserves old public revision. |
| AC07 | Post/revision versions and state compare: concurrent reviewer/withdrawal cannot overwrite. |
| AC08 | Immediate comment publication; verify parent public state and observed revision at commit. |
| AC09 | Visibility separate from review; no-store/private boundaries; audit/reason; hidden remains hidden on approval. |
| AC10 | Catalog IDs, active checks, immutable associations and current-public counts. |
| AC11 | Backend/RLS ownership/role/column/state checks, not UI-only guards. |
| AC12 | Identity-scoped private APIs plus FE session cache cleanup; no-store alone is not enough. |
| AC13 | Unique open reporter/target; private receipts/admin queue; no automatic hiding. |
| AC14 | Safe preserved observation links/context; no inference of verified scientific results. |

Contract validation checks schema/ref integrity, request/response samples, write-schema negative cases and temporary TypeScript generation. Implementation still needs migrations/RLS, actual auth, routes/services/models, public/private filtering, concurrency tests, FE integration and deployed smoke tests. Do not regenerate active frontend types from an unimplemented contract or claim these routes already appear in server Swagger.

Official references: [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup), [login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [JWT verification](https://supabase.com/docs/reference/javascript/auth-getclaims), [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0).
