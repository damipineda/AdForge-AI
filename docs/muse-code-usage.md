# Meta Model API integration

AdForge AI uses Meta Model API for live campaign generation. This document describes the implementation in this repository; it does not claim that every API capability or model is available on every account.

| Component | Use | Implementation |
| --- | --- | --- |
| Muse Spark (`muse-spark-1.3`) | Product analysis, strategy, copy, editorial and visual review | `src/lib/pipeline/sam-segmentation.ts`, `muse-spark.ts`, `creative-plan.ts`, `copy-review.ts`, `visual-review.ts` |
| Muse Image (`muse-image-1.0`) | Generate or retry artwork using an image as reference | `src/lib/pipeline/muse-image.ts` and `meta.ts` |
| SAM 3.1 | Not integrated as a segmentation-mask provider | The `sam` stage name is a legacy label; the current analysis uses Muse Spark |

The client in `src/lib/pipeline/meta.ts` calls `/v1/responses` for structured text and visual analysis and `/v1/images/edits` for image generation. Model names, sizes, timeout and credentials are configurable in `.env.local`; see `.env.local.example` for the variable names. Never commit credentials.

Each request has one total timeout budget, including backoff and retry for transient network/5xx/429 failures. Longer requests may split that budget across two attempts when the first attempt stalls; the second attempt uses the remaining time rather than resetting the full budget. Failed or interrupted generations mark the active stage as an error instead of leaving a spinner; the uploaded photos and brief remain available for a manual retry. This does not guarantee provider availability or completion within the configured timeout.

## Orchestration

1. Analyze the uploaded photo for a product description, colors and an approximate bounding box.
2. Produce campaign strategy, captions and creative directions, with editorial checks and an additional creative-plan review.
3. Generate two feed assets, optionally a story and four carousel slides, using image references and placement-specific prompts.
4. Review artwork individually and compare feed/story composition. Only critical findings, privacy issues or failed checks trigger automatic corrections; warnings alone do not regenerate images. Each affected piece gets at most two corrective generations and audits, with concurrency limited to two pieces. A shared four-minute budget cancels in-flight review requests and prevents new corrections. Unaffected images remain unchanged. Live progress identifies each piece and attempt. A failed or unverified correction keeps a draft, with requested, verified and pending corrections recorded separately; critical issues or failed checks disable the card's PNG download.
5. Present the results, review notices, downloads and optional local persistence. The app does not publish to social networks.

The live image model may reproduce details incorrectly, including packaging text. The bounding box is not a segmentation mask; the background in the source image may be preserved. An image-edit reference is not guaranteed to change only a requested region. New feed/story requests ask for the complete ad with integrated headline, supporting text, benefit pills and CTA. The frontend copies the original pixels at native resolution without typography overlays. Saved pieces can be refined individually through Muse Spark, Muse Image and the visual audit; failed or critical edits preserve the previous art. Earlier clean-background campaigns require this conversion because their text was stored separately.

## Data and privacy

Uploaded images are transmitted to the configured provider without prior anonymization. Pattern-based text redaction and model-based visual review are incomplete and do not guarantee detection or removal of license plates or other identifiers. Remove sensitive data before upload and review all results before publication.

## Demo and checks

`AI_PROVIDER=demo` uses local fixtures and Canvas fallbacks without live inference. `pnpm demo:check` requires a running demo server. `pnpm review:check`, `pnpm prompts:check`, `scripts/copy-review-check.ts`, and `scripts/privacy-check.ts` exercise selected rules with simulated inputs. Passing those tests does not establish live provider behavior or ad-policy compliance.

Live calls have variable latency, token usage and image costs. The initial visual review may trigger up to two additional image calls per flagged piece, and editorial review may perform additional text calls. Check provider pricing and quotas rather than assuming a fixed price per campaign.

## Hackathon submission

The event describes Muse Code as one of the available development tools. This repository does not provide independently verifiable records of which development tool produced individual changes; do not infer those details from commit authorship. Follow the participant portal and official rules for any required tool-use disclosure, demo, and submission materials.
