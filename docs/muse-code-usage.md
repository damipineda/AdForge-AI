# Meta Model API integration

AdForge AI uses Meta Model API for live campaign generation. This document describes the implementation in this repository; it does not claim that every API capability or model is available on every account.

| Component | Use | Implementation |
| --- | --- | --- |
| Muse Spark (`muse-spark-1.3`) | Product analysis, strategy, copy, editorial and visual review | `src/lib/pipeline/sam-segmentation.ts`, `muse-spark.ts`, `creative-plan.ts`, `copy-review.ts`, `visual-review.ts` |
| Muse Image (`muse-image-1.0`) | Generate or retry artwork using an image as reference | `src/lib/pipeline/muse-image.ts` and `meta.ts` |
| SAM 3.1 | Not integrated as a segmentation-mask provider | The `sam` stage name is a legacy label; the current analysis uses Muse Spark |

The client in `src/lib/pipeline/meta.ts` calls `/v1/responses` for structured text and visual analysis and `/v1/images/edits` for image generation. Model names, sizes, timeout and credentials are configurable in `.env.local`; see `.env.local.example` for the variable names. Never commit credentials.

## Orchestration

1. Analyze the uploaded photo for a product description, colors and an approximate bounding box.
2. Produce campaign strategy, captions and creative directions, with editorial checks and an additional creative-plan review.
3. Generate two feed assets, optionally a story and four carousel slides, using image references and placement-specific prompts.
4. Review artwork individually and compare feed/story composition. Selected findings can trigger a bounded correction attempt; a failed or unverified correction does not replace the earlier asset.
5. Present the results, review notices, downloads and optional local persistence. The app does not publish to social networks.

The live image model may reproduce details incorrectly, including packaging text. The bounding box is not a segmentation mask; the background in the source image may be preserved. An image-edit reference is not guaranteed to change only a requested region. Generated text is not a deterministic typography layer.

## Data and privacy

Uploaded images are transmitted to the configured provider without prior anonymization. Pattern-based text redaction and model-based visual review are incomplete and do not guarantee detection or removal of license plates or other identifiers. Remove sensitive data before upload and review all results before publication.

## Demo and checks

`AI_PROVIDER=demo` uses local fixtures and Canvas fallbacks without live inference. `pnpm demo:check` requires a running demo server. `pnpm review:check`, `pnpm prompts:check`, `scripts/copy-review-check.ts`, and `scripts/privacy-check.ts` exercise selected rules with simulated inputs. Passing those tests does not establish live provider behavior or ad-policy compliance.

Live calls have variable latency, token usage and image costs. The visual review may trigger up to two additional image calls, and editorial review may perform additional text calls. Check provider pricing and quotas rather than assuming a fixed price per campaign.

## Hackathon submission

The event describes Muse Code as one of the available development tools. This repository does not provide independently verifiable records of which development tool produced individual changes; do not infer those details from commit authorship. Follow the participant portal and official rules for any required tool-use disclosure, demo, and submission materials.
