<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/43298cca-4d70-4c5d-bada-c10ab66ab897

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Testing

Unit tests are executed via Vitest and coverage thresholds are enforced:
- Run tests: `npm run test`
- Run tests with coverage: `npm run test:coverage`

Coverage thresholds (lines, statements, functions, branches) are defined in `vitest.config.ts` and enforced on every commit/PR in CI. All new code must be accompanied by unit tests, and thresholds must only be adjusted upwards.
