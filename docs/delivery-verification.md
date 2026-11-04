# Delivery verification — 4 November 2026

Verified locally with Node.js 24.13.0 and pnpm 10.33.2.

## Passed checks

- Production build and repository-wide ESLint.
- Prompt rules, creative direction, copy review, privacy text handling, visual-review retries, targeted refinement, download policy and timeout/error-state tests.
- Demo API generation for feed, story and carousel placements, including merchant fields.
- Isolated SQLite persistence: projects, source assets, campaign restoration, brief/focus, file serving, learning signals and brand kit.
- Playwright browser: Spanish/English switching with persisted language, tour opening/reopening, product upload, demo generation, PNG download and reopening the saved session.
- The downloaded demo PNG was measured at 1080×1350.
- Known local credentials were checked against files eligible for Git. No matches were found. `.env.local`, `data/`, `.probe/` and build outputs are excluded.

The browser and persistence checks used a separate temporary database. Existing campaigns were not modified.

## Corrections made during verification

- Removed invalid synchronous state updates from the tour and language initialization.
- Fixed the API-key settings flow so deleting a UI key restores the environment fallback instead of retaining the deleted value in the process environment.
- Updated smoke checks to accept detailed stage-progress events while still requiring every stage to start and finish.
- Updated an outdated copy-test expectation to the current CTA policy; unsupported factual numbers remain rejected.
- Corrected metadata that had claimed working SAM cutouts, instant delivery and production-ready catalog imports.
- Corrected Spanish/English stage and tour labels to identify Muse Spark product analysis instead of claiming SAM segmentation.
- Documented the separately composited brand logo and the current total request-timeout budget.

## Boundaries

- Demo and simulated-provider checks do not establish current live Muse availability, latency, output quality or quotas. No new live Muse image was generated for this verification.
- Product analysis uses Muse Spark vision with an approximate bounding box; SAM 3.1 segmentation masks are not integrated.
- Authentication, public hosting, Meta Ads publishing and catalog import acceptance are outside this local prototype verification.
- Publishing Git commits is separate from submitting the entry through the organizers' portal. Portal submission and eligibility were not verified here.
