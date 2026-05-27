# Cloudflare Pages Deployment & Callback URL Guide

This guide describes how to deploy the **Campus Hub** community management system to Cloudflare Pages, configure Callback URLs for external triggers (like the GroupMe bot or Twilio SMS), and manage backend API routing using the prebuilt **Cloudflare Pages Function**.

---

## 1. How API Routing Works on Cloudflare Edge

Cloudflare Pages natively hosts your static React assets (HTML, JS, CSS). Because the application relies on dynamic backend services (such as Firebase Admin SDK, Firebase Auth, and Google Gemini AI) which require secure server credentials:
* We have created a Cloudflare Pages Function at `/functions/api/[[path]].ts`.
* Any incoming request to `https://<your-subdomain>.pages.dev/api/*` is intercepted by Cloudflare Edge and proxied securely to your live app container backend.
* This allows you to deploy the frontend to Cloudflare safely without breaking callbacks or exposing secrets in client-side code!

---

## 2. Which Callback URLs to Use for GroupMe & Twilio

When configuring third-party webhooks, use your Cloudflare Pages domain name followed by the specific endpoint path.

### 🤖 GroupMe Bot Callback URL
* **URL to use in GroupMe Developer Console**:  
  `https://<your-subdomain>.pages.dev/api/webhook/groupme`
* **Trigger Prefix**: `!add <note>`, `add: <note>`, or `/add <note>`

### 📞 Twilio SMS/WhatsApp Webhook URL
* **URL to use in Twilio Console (A Message Comes In)**:  
  `https://<your-subdomain>.pages.dev/api/webhook/sms`
* **HTTP Method**: Should be set to `HTTP POST`

---

## 3. Configuring Environment Variables in Cloudflare

To ensure the proxy routes calls to the correct backend server containing your active database connection:
1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to your **Pages** application.
2. Go to **Settings** -> **Environment variables**.
3. Under **Production** (and **Preview** if desired), click **Add variable** and configure the target backend target:
   * **Variable Name**: `BACKEND_API_URL`
   * **Value**: `https://ais-pre-ziirfaj5atjrwm6w4t7gn4-82064505754.us-east1.run.app` *(or your developer specific backend url)*
4. Click **Save**.

---

## 4. Deploying via Git or CLI

### Option A: Connected Git Repository
If you connect your GitHub repository directly to Cloudflare Pages:
* **Build command**: `npm run build`
* **Build output directory**: `dist`
* **Node.js compatibility limit**: Ensure Node.js version is configured to `18+` or `20+` in your Cloudflare settings if specified.

### Option B: Direct Upload via Wrangler CLI
You can also build and publish manually:
```bash
# 1. Build client-side bundle
npm run build

# 2. Deploy dist folder containing functions/ to Pages
npx wrangler pages deploy dist/ --project-name=campus-hub
```
