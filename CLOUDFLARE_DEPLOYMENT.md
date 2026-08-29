# Cloudflare Pages Unified Deployment Strategy

Your full-stack application (frontend static web assets + backend webhook API routes) has been completely unified to run natively and at no cost on **Cloudflare's serverless edge networks** (via Cloudflare Pages Functions). 

All backend logic (Gemini Parsing, Firestore administrative reads/writes, Twilio SMS Webhook, and GroupMe Webhooks) has been successfully migrated to high-performance, edge-optimized JavaScript / TypeScript handlers using Cloudflare Pages.

---

## 🚀 Step 1: Export Google Cloud Service Account Credentials
Since Cloudflare does not run inside Google Cloud, your serverless Workers must utilize a Google Cloud Service Account key to authenticate administrative requests to your Firestore database.

1. Open the [Google Cloud Console (IAM & Admin)](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Ensure you have the correct project selected (`sac-campus-hub`).
3. Click **Create Service Account**:
   - **Name**: `cloudflare-pages-api`
   - **Service account ID**: `cloudflare-pages-api`
4. Assign the following roles to the service account to authorize database reads, writes, and logging:
   - **Cloud Datastore Owner** (or **Firebase Doc/Firestore Admin**)
5. Click **Done** to save the account.
6. Find your newly created Service Account under the service account inventory list, click the **three dots** (Actions) on the far right, and select **Manage Keys**.
7. Click **Add Key** -> **Create New Key**, verify that **JSON** is selected, and click **Create**.
8. A `.json` file containing your login key will be automatically saved to your computer. Open this file using any text editor (e.g., VS Code or Notepad) and copy the entire text content.

---

## ⚙️ Step 2: Configure Environment Secret Strings on Cloudflare Pages
Once your project has been imported and connected to Cloudflare Pages via GitHub/Gitlab, add the following variables under **Project Settings > Environment Variables > Production**:

| Variable Name | Description/Value | Type |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Your Google Gemini API Key | Encrypted Secret |
| `FIREBASE_SERVICE_ACCOUNT` | The **entire raw content** of your downloaded Service Account `.json` file. | Encrypted Secret |
| `FIREBASE_PROJECT_ID` | `sac-campus-hub` | Text |
| `FIREBASE_DATABASE_ID` | `prod` | Text |

---

## 🧪 Step 3: Deployment Setup on Cloudflare
By using Cloudflare Pages, your framework configuration is automatically discovered during deployment. Use the following build settings in Cloudflare Dashboard:

- **Framework Preset**: `Vite` (or None)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

Our customized build command natively copies compiled HTML, JS, CSS assets, alongside our custom API gateway logic, automatically. When you press deploy, Cloudflare builds and serves your full stack concurrently.

---

## 🔗 Step 4: Update Webhook Targets (Twilio / GroupMe)
Once deployed, Cloudflare will provide a production preview domain (e.g., `https://my-app.pages.dev`). You can now point your trigger integrations directly to your edge backend endpoints:

- **Verification Endpoint (GET)**: `https://my-app.pages.dev/api/quick-add/status`
- **Twilio SMS Webhook (POST)**: `https://my-app.pages.dev/api/webhook/sms`
- **GroupMe Callback (POST)**: `https://my-app.pages.dev/api/webhook/groupme`
- **Manual POST Trigger**: `https://my-app.pages.dev/api/quick-add` (Headers: `Content-Type: application/json` Body: `{ "text": "Met John Doe at Miller Hall..." }`)

---

## 🧪 QA environment (Cloudflare Pages)

For a QA/staging URL that runs against the isolated `qa-db` Firestore database
and the `campus-hub-qa` Cloud Run backend, create a second Pages project
(`cisa-campus-work-tracker-qa`, serving `https://cisa-campus-work-tracker-qa.pages.dev`)
connected to the same repo, with identical build settings (`npm run build`, output `dist`).

Two variables are needed because the edge proxy (`functions/api/[[path]].ts`) only
forwards `/api/*` — client-side Firestore reads bypass it entirely:

| Variable Name | Value | Where |
| :--- | :--- | :--- |
| `BACKEND_API_URL` | `https://campus-hub-qa-914549253362.us-west2.run.app` | Runtime env (the `/api/*` proxy target) |
| `VITE_FIREBASE_API_KEY` | same web API key as prod (`AIzaSyDRfV-…`, shared — one key per project) | Build env (baked into the web bundle; `firebase-applet-config.json` ships an empty apiKey) |
| `VITE_FIREBASE_FIRESTORE_DB_ID` | `qa-db` | Build env (baked into the web bundle at `vite build`) |

The build env vars point the client Firestore SDK at `qa-db` and supply the
auth API key; the runtime var points API/webhook calls at the QA backend.
Leave `VITE_FIREBASE_DATABASE_URL` unset so The Board stays Firestore-only
(avoids writing to prod's live Realtime Database). `EXPO_ACCESS_TOKEN` and
`GEMINI_API_KEY` are NOT needed here — those are Cloud Run server-side env
(already set on `campus-hub-qa` for push; add `GEMINI_API_KEY` there only if
QA should exercise AI quick-add).

Finally, allow Firebase Auth on the QA host: Firebase Console → **Authentication →
Settings → Authorized domains** → add `cisa-campus-work-tracker-qa.pages.dev`
(otherwise sign-in fails with `auth/unauthorized-domain`).

The mobile app's QA build uses the same site as its `EXPO_PUBLIC_API_URL`
(`apps/mobile/eas.json` → `qa` profile), so push/quick-add/AI go through the
Cloudflare edge to the QA backend.

---

## 🔐 Google sign-in on a partitioned-browser (Chrome / Safari) — issue #557

The web app is NOT hosted on Firebase Hosting, so Firebase Auth's sign-in helper
lives cross-origin at `sac-campus-hub.firebaseapp.com`. Browsers that partition
third-party storage (Safari's "Prevent cross-site tracking", Chrome's partitioned
storage) then can't read the helper's initial state and Google sign-in fails
with `Unable to process request due to missing initial state.`

The fix is Firebase's documented **Option 3** for non-Firebase hosting: serve the
auth helper FROM the app's own domain so the helper and the app share storage.
Two repo-side pieces already do the proxying:

- `functions/__/auth/[[path]].ts` — transparently forwards every `cisa-campus-work-tracker.pages.dev/__/auth/*` request to `sac-campus-hub.firebaseapp.com/__/auth/*` (no redirects, no body rewrites).
- `functions/__/firebase/init.json.ts` — answers `__/firebase/init.json` with the web app's own config (that file is generated by Firebase Hosting, which this project doesn't use).

To **activate** the same-origin flow you must point the SDK's `authDomain` at the
app domain and tell Google's OAuth client about it:

1. **Google Cloud Console** (the OAuth 2.0 client that backs `sac-campus-hub`):
   add `https://cisa-campus-work-tracker.pages.dev/__/auth/handler` to
   **Authorized redirect URIs** (and the QA host's URL for the QA project).
2. **Deploy** the Pages project with `VITE_FIREBASE_AUTH_DOMAIN`
   `= cisa-campus-work-tracker.pages.dev` in the build env (QA: `cisa-campus-work-tracker-qa.pages.dev`).
   The override is read in `src/lib/firebase.ts`; without it the SDK keeps using
   the default `firebaseapp.com` auth domain and the proxy stays dormant.

Until step 1 is done, leave `VITE_FIREBASE_AUTH_DOMAIN` unset — the current
`firebaseapp.com` flow keeps working for browsers without partitioning, and the
web app now shows a clear "use email/password or another browser" message instead
of a silently dead popup when the partitioning error is detected.
