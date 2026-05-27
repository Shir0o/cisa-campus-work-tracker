# 🌐 Hybrid Deployment Guide: Cloudflare & Google Cloud (GCP)

This guide documents how to host your application with an optimal hybrid architecture:
1. **Frontend**: Static React assets served directly from the ultra-fast, free **Cloudflare Pages CDN**.
2. **Backend**: Custom Express server, Firestore, and Gemini AI operations running securely on serverless **Google Cloud Run**.

All `/api/*` requests sent to your Cloudflare Pages site will automatically and transparently route to your GCP Cloud Run backend of choice on the fly via our zero-latency edge-proxy function (`/functions/api/[[path]].ts`).

---

## 🏗️ Architecture Blueprint

```
                     ┌────────────────────────┐
                     │   User Browser (Web)   │
                     └───────────┬────────────┘
                                 │
                 Asset Requests  │  API Requests (/api/*)
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
 ┌──────────────────────┐                ┌──────────────────────┐
 │  Cloudflare Pages    │ ── (Edge) ──  │  GCP Cloud Run       │
 │  (Static Frontend)   │                │  (Express Backend)   │
 └──────────────────────┘                └───────────┬──────────┘
                                                     │
                                             ┌───────┴───────┐
                                             ▼               ▼
                                         Firestore      Gemini API
```

---

## 🚀 Part 1: Deploy Backend to Google Cloud Run

Google Cloud Run allows you to run your Express backend within a serverless container that automatically scales down to zero when inactive, ensuring near-zero running costs.

### 1. Prerequisite: Mount GCP Command Line
Ensure you have the Google Cloud CLI (`gcloud`) installed:
* [Download GCP CLI](https://cloud.google.com/sdk/docs/install)
* Login and identify project:
  ```bash
  gcloud auth login
  gcloud init
  ```

### 2. Run Container Build & Deploy
Simply launch the following deployment command in your project root. Cloud Build will read our high-performance `Dockerfile` and publish the backend container instantly:

```bash
gcloud run deploy campus-hub-backend \
  --source . \
  --platform managed \
  --region us-west2 \
  --allow-unauthenticated \
  --port 3000
```
> **Note**: `--region us-west2` deploys your backend container directly to Los Angeles, California to give you ultra-low latency.

Once deployment completes, write down the secure Google Cloud URL generated for you (e.g., `https://campus-hub-backend-xyz123-ue.a.run.app`).

### 3. Add Google Cloud Environment Secrets
Head to the [Google Cloud Run Console](https://console.cloud.google.com/run), look up your active services `campus-hub-backend`, click **Edit & Deploy New Revision**, and add the following variables under the **Variables & Secrets** section:

* `GEMINI_API_KEY`: Your private Google Gemini API Access key.
* `APP_URL`: Your live production front-end URL (e.g., `https://my-app.pages.dev`).

All Firestore reads, writes, and authentication calls on your Cloud Run instance use native service credentials automatically without needing separate JSON service keys!

---

## ⚡ Part 2: Deploy Frontend on Cloudflare Pages

Configure your static compiled Web environment to load rapidly from Cloudflare Pages.

### 1. Build & Push Configuration
Set up your Cloudflare Pages project with these build commands:
* **Framework Preset**: `Vite` (or `None`)
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* **Root Directory**: `/`

### 2. Wire the Transparent API Bridge
To tell the Cloudflare Edge server where to forward API and Webhook calls, configure your environment variables in the Cloudflare Dashboard under **Project Settings > Environment Variables > Production**:

| Variable Name | Value | Type |
| :--- | :--- | :--- |
| `BACKEND_API_URL` | Your Cloud Run Service URL (`https://campus-hub-backend-xyz123-ue.a.run.app`) | Plain Text |

Once deployed, Cloudflare will build the static frontend. Any client-side HTTP call or external webhook targeting `https://your-page.pages.dev/api/...` will automatically map directly to Cloud Run for processing!

---

## 🔗 Part 3: Configure External Webhook Triggers
Point your integrations to your consolidated front-end URL (provided by Cloudflare Pages). The requests will safely traverse the CF CDN proxy back to your Google Run engine:

* **Twilio SMS Webhook (POST)**: `https://your-page.pages.dev/api/webhook/sms`
* **GroupMe Callback (POST)**: `https://your-page.pages.dev/api/webhook/groupme`
* **API Quick Status Verify (GET)**: `https://your-page.pages.dev/api/quick-add/status`
