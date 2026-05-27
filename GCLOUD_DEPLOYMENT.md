# Google Cloud (GCP) Deployment Guide

This guide describes how to host both the **frontend (React)** and **backend (Express)** of your application on **Google Cloud Platform (GCP)**. 

Because we have pre-designed this application with a **full-stack architecture** (combining the bundled Express server and compiled static React client assets into a single multi-stage Docker container), you can host the whole system on Google Cloud on a highly scalable, serverless, and cost-efficient setup!

---

## 🚀 The Recommended Architecture: Google Cloud Run

To achieve high scalability with near-zero latency and scale to zero (so it is free when no traffic hits it), we use **Google Cloud Run**.

* **How it works**: Cloud Run takes the custom `Dockerfile` we created in your project root, builds it into a highly optimized container, and hosts it.
* **Routing**: The container exposes port `3000`. Direct incoming traffic serves the built static React files instantly, while any request matching `/api/*` is handled on-demand by the integrated Express router.
* **Database & Auth**: Connects directly to GCP Firestore/Firebase and supports serverless security.

---

## 🛠️ Step-by-Step Deployment Instructions

You can deploy this application directly to your personal Google Cloud Account from your local machine with just terminal commands!

### 1. Prerequisite: Install the Google Cloud SDK
Ensure you have the Google Cloud CLI (`gcloud`) installed on your computer:
* [Download GCP SDK](https://cloud.google.com/sdk/docs/install)
* Log in and initialize:
  ```bash
  gcloud auth login
  gcloud init
  ```

### 2. Configure Your Project
Select the Google Cloud project ID you wish to use for hosting:
```bash
gcloud config set project <YOUR_GCP_PROJECT_ID>
```

### 3. Deploy to Google Cloud Run with 1 Command
Simply run the following `gcloud run deploy` command in your project root. The Google Cloud build environment will parse our custom `Dockerfile` automatically, upload it to Artifact Registry, and launch your container serverless-ly:

```bash
gcloud run deploy campus-hub \
  --source . \
  --platform managed \
  --region us-west2 \
  --allow-unauthenticated \
  --port 3000
```

> **What this command does**:
> * `--source .`: Packs the code and uploads it to Cloud Build automatically (no separate docker registry setup needed).
> * `--region us-west2`: Spins up the hosting in the Los Angeles, California datacenter (perfect for CA-based ultra-low latency).
> * `--allow-unauthenticated`: Makes the website publicly accessible to visitors.
> * `--port 3000`: Directs the container runtime ingress rules to use our server's internal listener port.

---

## 📝 Configuring System Credentials on GCP Cloud Run

Your application relies on database configurations and external APIs. You can keep credentials completely secure by attaching them under **Cloud Run Variables**:

1. Go to the [Google Cloud Run Console](https://console.cloud.google.com/run).
2. Click on your active service **`campus-hub`** &rarr; click on **Edit & Deploy New Revision**.
3. Under the **Variables & Secrets** Tab, append your production credentials (do not include these publicly in git!):
   * `FIREBASE_PROJECT_ID`: Cloud Firestore project ID.
   * `GEMINI_API_KEY`: Google Gemini Generative AI credentials.
   * `GROUPME_BOT_ID` and `GROUPME_ACC_TOKEN`: External bot integrations.
   * `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`: External SMS configurations.
4. Click **Deploy**.

---

## 🎯 Final Callback URL Setup for Integrations

Once your Cloud Run deployment completes, GCP will hand you a secure production URL, for example:  
`https://campus-hub-xyz123-ue.a.run.app`

Use this URL to wire up your live third-party callback integrations exactly like so:

* **Siri, GroupMe & API clients**: `https://<gcp-runner-url>/api/webhook/groupme`
* **Twilio SMS Webhooks**: `https://<gcp-runner-url>/api/webhook/sms`
