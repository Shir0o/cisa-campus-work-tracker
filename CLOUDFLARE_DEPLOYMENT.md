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
| `FIREBASE_DATABASE_ID` | `ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897` | Text |

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
