# API contract 0.1 for Issue 14

The active specification is the team's API wiki.
https://github.com/MINIONS-WORKFORCE/Human-Binoculars/wiki/The-API-contract

Daily task scope comes from Issue 14.
https://github.com/MINIONS-WORKFORCE/Human-Binoculars/issues/14

openapi.yaml is generated from app.main's Pydantic models, matching the schema
served by /openapi.json. The earlier Day 6 schema is retained as
legacy-day06-openapi.yaml. docs/SRS-MVP.md is an older, different specification.

See [frontend-guide.md](frontend-guide.md) and [sample notes](../../api_samples/README.md).
Run the sample validator from the repo root.

    .venv/Scripts/python.exe members/dong/scripts/validate_api_samples.py

Endpoint and field changes follow the wiki's discussion/review process.

For the proposed SRS v2 changes, see [the FE/BE review draft](srs-v2-draft.md)
and [its OpenAPI schema](openapi-srs-v2-draft.yaml).

## Forum extension (contract-first)

The separate [forum OpenAPI contract](openapi-forum-v1.yaml) and
[FE/BE guide](forum-v1.md) implement the contract step against the supplied
FORUM_BUSINESS_ANALYSIS.md. See [synthetic examples](examples/forum-v1.json).
Revision forum-v1.1 covers drafts, immutable revisions, review, managed tags,
comments/reports, hide/restore, notifications and audit. These endpoints are
planned, not implemented or deployed. Science schemas and active frontend types
remain unchanged; do not treat contract examples as working server responses.
