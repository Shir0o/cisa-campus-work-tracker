# Integrations & External Services

This guide covers setup and usage of external integrations: GitHub, Gemini AI, Sheets, Twilio, GroupMe, and webhooks.

---

## Overview

| Service | Purpose | Required | Config |
|---------|---------|----------|--------|
| **GitHub** | Auto-create issues from feedback | No (optional) | `GITHUB_TOKEN`, `GITHUB_REPO` |
| **Gemini API** | AI activity parsing & summarization | Yes | `GEMINI_API_KEY` |
| **Google Sheets** | Attendance export (dry-run only) | No (optional) | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| **Twilio** | SMS webhook parsing | No (optional) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| **GroupMe** | Bot message relay | No (optional) | `GROUPME_BOT_ID`, `GROUPME_ACC_TOKEN` |

**Graceful degradation**: If a credential is missing, the app logs a warning and continues. No integration should block core functionality.

---

## GitHub Integration

### Purpose

When a user submits feedback through the web app (with screenshot), the server **auto-creates a GitHub issue** containing:
- Feedback kind + message
- Submitter name/email
- Screenshot link (attached in Firestore)
- Timestamp, page URL, viewport

### Setup

1. **Create GitHub personal access token**:
   - GitHub → Settings → Developer settings → Personal access tokens (classic)
   - Scopes: `repo` (full control of private repositories)
   - Copy token

2. **Set environment variable**:
   ```bash
   # .env (local)
   GITHUB_TOKEN=ghp_...
   GITHUB_REPO=Shir0o/cisa-campus-work-tracker  # or your repo
   
   # Cloud Run
   gcloud run services update campus-hub --set-env-vars GITHUB_TOKEN=ghp_...
   ```

### How It Works

1. **User submits feedback** on web (via `src/views/SubmitFeedback.tsx`)
2. **Form includes**:
   - Kind (thought, idea, issue, request)
   - Message
   - Optional screenshot (canvas capture via `html2canvas-pro`)
   - Context (URL, viewport, user agent)

3. **Server receives** POST to `/api/feedback`:
   ```typescript
   // server.ts
   app.post('/api/feedback', async (req, res) => {
     // 1. Save to Firestore: feedback/{id}
     const docRef = await db.collection('feedback').add(feedbackData)
     
     // 2. Create GitHub issue (if credentials exist)
     if (githubToken && githubRepo) {
       const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${githubToken}`,
           'Accept': 'application/vnd.github+json'
         },
         body: JSON.stringify({
           title: `[Feedback] ${kind}: ${message.slice(0, 50)}...`,
           body: formatFeedbackAsMarkdown(feedbackData),
           labels: [type, 'feedback']
         })
       })
       
       // 3. Update Firestore with issue URL
       await docRef.update({ githubIssueUrl: issueData.html_url })
     }
   })
   ```

4. **Admin can**:
   - Click "View GitHub issue" from feedback admin screen
   - Change issue status from within the app (auto-syncs to GitHub)
   - Add comments/details on GitHub, which sync back in Firestore

### Troubleshooting

**Issue: "GitHub API error 401"**
- Token expired or invalid
- Check `GITHUB_TOKEN` is set and valid
- Verify token has `repo` scope

**Issue: "Issue creation silently fails"**
- Check server logs: `npm run dev` shows GitHub API calls
- Verify `GITHUB_REPO` format: `owner/repo`
- Ensure Firestore write succeeds (issue URL might not save)

**Disable auto-creation**: Unset `GITHUB_TOKEN` environment variable

---

## Gemini AI Integration

### Purpose

**Activity parsing**: When users log interactions (calls, emails, events) through the web Quick Add modal or mobile feedback form, the server can **auto-summarize the content** using Gemini API.

**Note**: Currently used for feedback analysis; can be extended to interaction summaries.

### Setup

1. **Get Gemini API key**:
   - Visit https://ai.google.dev
   - Create new API key
   - Copy key

2. **Set environment variable**:
   ```bash
   # .env (required for full functionality)
   GEMINI_API_KEY=AIza...
   
   # Cloud Run
   gcloud run services update campus-hub --set-env-vars GEMINI_API_KEY=AIza...
   ```

### How It Works

**Initialize lazy** (only when first needed):
```typescript
// server.ts
function getAiClient() {
  if (!aiClientInstance) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured')
    }
    aiClientInstance = new GoogleGenAI({ apiKey })
  }
  return aiClientInstance
}
```

**Example: Analyze feedback**:
```typescript
const model = getAiClient().getGenerativeModel({ model: 'gemini-pro' })
const response = await model.generateContent({
  contents: [{
    parts: [{
      text: `Summarize this feedback in one sentence:\n\n${feedbackMessage}`
    }]
  }]
})
```

### Cost

- **Free tier**: 60 requests per minute
- **Paid**: $0.00075 per 1k input tokens, $0.003 per 1k output tokens
- **Estimate**: Summarizing 1000 feedback items = ~$0.50-$1.00

Monitor usage: https://console.cloud.google.com/apis/api/generativeai.googleapis.com

### Troubleshooting

**Issue: "GEMINI_API_KEY not configured"**
- Set in `.env` (dev) or Cloud Run (production)
- Restart server: `npm run dev`

**Issue: "API error 429 (rate limited)"**
- Free tier is 60 req/min; consider upgrading or batching requests
- Add exponential backoff retry logic

**Issue: "Quota exceeded"**
- Check Cloud Console → APIs & Services → Quotas
- Request quota increase if needed

**Disable AI analysis**: Unset `GEMINI_API_KEY`

---

## Google Sheets Integration

### Purpose

**Attendance export**: Managers can export attendance records to a Google Sheet for archival or sharing.

**Current state**: Dry-run only (preview before export); actual write not yet implemented.

### Setup

1. **Create Google Cloud service account**:
   - Google Cloud Console → IAM & Admin → Service Accounts
   - Create service account
   - Create key (JSON)
   - Download JSON

2. **Share a Google Sheet with the service account email**:
   - Copy service account email (e.g., `xyz@project.iam.gserviceaccount.com`)
   - Open Google Sheet
   - Share → Add service account email

3. **Set environment variable**:
   ```bash
   # .env
   GOOGLE_SERVICE_ACCOUNT_JSON={...}  # Paste entire JSON object
   
   # Or set via file (Cloud Run)
   gcloud run services update campus-hub \
     --set-env-vars "GOOGLE_SERVICE_ACCOUNT_JSON=$(cat service-account.json)"
   ```

### How It Works

1. **User navigates** to Settings → Attendance Export (admin only)
2. **Selects event** and date range
3. **Clicks "Dry Run"** to preview data:
   ```typescript
   // src/services/sheets.ts
   export async function previewAttendanceExport(eventId: string) {
     const attendance = await subscribeAttendance(eventId)
     return formatForSheet(attendance)  // Returns preview HTML table
   }
   ```

4. **Clicks "Export"** to write to sheet (deferred):
   ```typescript
   // Would use google-auth-library + googleapis package
   const sheets = google.sheets('v4')
   await sheets.spreadsheets.values.append({
     spreadsheetId: SHEET_ID,
     range: 'Sheet1!A1',
     valueInputOption: 'USER_ENTERED',
     resource: { values: formattedRows }
   })
   ```

### Troubleshooting

**Issue: "Permission denied"**
- Verify Google Sheet is shared with service account email
- Check service account JSON is valid (no newlines, properly escaped)

**Issue: "Sheet not found"**
- Verify `GOOGLE_SHEET_ID` is correct
- Sheet must exist before writing

**Disable**: Unset `GOOGLE_SERVICE_ACCOUNT_JSON`

---

## Twilio SMS Integration

### Purpose

**SMS webhook**: Team members can text a Twilio number to log quick moments.

**Message format**:
```
Log: Called John (student meeting) #prayer
```

Gets parsed and creates an interaction record.

### Setup

1. **Create Twilio account**: https://www.twilio.com
2. **Buy a phone number**
3. **Configure webhook** (Twilio Console → Messaging → Webhooks):
   - URL: `https://your-domain.com/api/webhook/sms`
   - Method: POST

4. **Set environment variables**:
   ```bash
   # .env
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   
   # Cloud Run
   gcloud run services update campus-hub \
     --set-env-vars TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=...
   ```

### How It Works

**Webhook verification** (Twilio sends signed requests):
```typescript
// server.ts
import { verifyTwilioRequest } from './src/lib/twilioVerify'

app.post('/api/webhook/sms', (req, res) => {
  // Verify request signature
  if (!verifyTwilioRequest(req, process.env.TWILIO_AUTH_TOKEN)) {
    return res.status(403).send('Unauthorized')
  }
  
  // Parse message
  const { From, Body } = req.body
  const parsed = parseLogMessage(Body)  // "Log: Called John..."
  
  // Create interaction
  await createInteraction(parsed)
  
  res.send('<Response><Message>Logged moment</Message></Response>')
})
```

### Troubleshooting

**Issue: "Twilio webhook not being called"**
- Check webhook URL is public (not localhost)
- Check Twilio Console logs: Messaging → Logs
- Verify phone number is receiving incoming messages

**Issue: "Signature verification failed"**
- Ensure `TWILIO_AUTH_TOKEN` is correct
- Check request is actually from Twilio (not spoofed)

**Disable**: Unset `TWILIO_ACCOUNT_SID` (graceful degradation)

---

## GroupMe Bot Integration

### Purpose

**Bot relay**: Team can text a GroupMe group chat, and a bot relays messages to the app's webhook.

**Example**: Team sends "Log: Talked with Sarah about prayer" in GroupMe → Bot posts to Slack (or app processes it)

### Setup

1. **Create GroupMe group** (if not existing)
2. **Add bot**:
   - GroupMe console → Create Bot
   - Callback URL: `https://your-domain.com/api/webhook/groupme`
   - Callback token: Generate random token (store in `GROUPME_TOKEN`)

3. **Set environment variables**:
   ```bash
   # .env
   GROUPME_BOT_ID=12345
   GROUPME_ACC_TOKEN=...
   GROUPME_GROUP_ID=... (optional: restrict to one group)
   
   # Cloud Run
   gcloud run services update campus-hub \
     --set-env-vars GROUPME_BOT_ID=12345 GROUPME_ACC_TOKEN=...
   ```

### How It Works

```typescript
// server.ts
app.post('/api/webhook/groupme', (req, res) => {
  const { text, name, avatar_url } = req.body
  
  // Optional: Restrict to configured group
  if (process.env.GROUPME_GROUP_ID && 
      req.body.group_id !== process.env.GROUPME_GROUP_ID) {
    return res.send('ok')
  }
  
  // Parse message (e.g., "Log: Called John")
  const parsed = parseLogMessage(text)
  
  // Create interaction or send confirmation
  console.log(`GroupMe bot: ${name} sent "${text}"`)
  
  res.send('ok')
})
```

### Troubleshooting

**Issue: "Bot not responding"**
- Check GroupMe Console → Bot → Callback URL
- Verify callback token matches `GROUPME_TOKEN`
- Test with a direct message to the bot

**Issue: "Group ID restriction not working"**
- Get group ID from GroupMe API: `GET https://api.groupme.com/v3/groups?token=...`
- Set `GROUPME_GROUP_ID` correctly

**Disable**: Unset `GROUPME_BOT_ID`

---

## General Webhook Best Practices

### Request Signature Verification

**Why**: Prevent spoofed requests from malicious sources.

**Pattern**:
```typescript
import crypto from 'crypto'

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return signature === expectedSignature
}
```

**Applied in**:
- Twilio: `src/lib/twilioVerify.ts`
- GroupMe: Verify token in callback URL
- GitHub: Verify X-Hub-Signature header (optional)

### Request Logging

**Dev server** logs all webhook requests to stdout:
```typescript
// server.ts
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhook')) {
    console.log(`[WEBHOOK] ${req.method} ${req.path}`)
    console.log(`Headers: ${JSON.stringify(req.headers)}`)
    console.log(`Body: ${JSON.stringify(req.body)}`)
  }
  next()
})
```

**Production** stores logs in Cloud Logging (auto via Cloud Run).

### Error Handling

**Always return 200 OK** (webhook provider marks as failed if you return 5xx):
```typescript
app.post('/api/webhook/xyz', (req, res) => {
  try {
    // Process webhook
    res.send('ok')  // 200 OK
  } catch (err) {
    console.error('Webhook processing failed:', err)
    res.send('error')  // Still 200 OK, but logged
  }
})
```

### Retry Logic

**Webhook providers** typically retry with exponential backoff:
- Twilio: 3 retries over 1 hour
- GroupMe: Configurable
- GitHub: 5 retries over 24 hours

**Handle idempotency**: Always check if the interaction already exists before creating:
```typescript
const existing = await getInteractionByExternalId(externalId)
if (existing) return res.send('already processed')

// Create new interaction
```

---

## Deploying Integrations

### Local Testing

```bash
# Start dev server
npm run dev

# Expose via ngrok (for webhooks)
ngrok http 3000
# Gives you: https://xxxx.ngrok.io

# Update Twilio/GroupMe webhook URL
# https://xxxx.ngrok.io/api/webhook/sms
```

### Cloud Run Deployment

```bash
# Set all integration secrets
gcloud run services update campus-hub \
  --set-env-vars \
    GITHUB_TOKEN=ghp_... \
    GEMINI_API_KEY=AIza... \
    TWILIO_ACCOUNT_SID=AC... \
    TWILIO_AUTH_TOKEN=... \
    GROUPME_BOT_ID=12345

# Verify secrets are set
gcloud run services describe campus-hub --format=json | jq '.spec.template.spec.containers[0].env'
```

### Never Commit Secrets

```bash
# Good: Use environment variables
GITHUB_TOKEN=ghp_XXX npm run dev

# Bad: Hardcode in source
const TOKEN = 'ghp_XXX'  // NEVER!

# Bad: Commit .env
git add .env  # NO!

# Good: Use .env.example
# .env.example
GITHUB_TOKEN=ghp_EXAMPLE_PLACEHOLDER

# Developers copy it
cp .env.example .env
# Edit .env with their real tokens (not committed)
```

---

## Monitoring & Alerts

### Request Logs

**Cloud Run**:
```bash
gcloud run logs read campus-hub --limit=50

# Or filter by integration
gcloud run logs read campus-hub --filter='textPayload:"GitHub"'
```

**Local**:
```bash
npm run dev 2>&1 | grep "WEBHOOK\|GitHub\|Gemini"
```

### Error Tracking

Set up external error tracking (optional):
- **Sentry**: `npm install @sentry/node`
- **LogRocket**: Browser + backend monitoring
- **Cloud Error Reporting**: Auto via Cloud Run

```typescript
// server.ts
import * as Sentry from '@sentry/node'

Sentry.init({ dsn: process.env.SENTRY_DSN })

app.use(Sentry.Handlers.errorHandler())
```

---

## Troubleshooting Integrations

### "All integrations failing"

1. **Check `.env`**:
   ```bash
   grep -E "GITHUB_TOKEN|GEMINI_API_KEY|TWILIO" .env
   ```

2. **Check environment variables** (Cloud Run):
   ```bash
   gcloud run services describe campus-hub
   ```

3. **Check server logs**:
   ```bash
   npm run dev
   # Look for initialization errors
   ```

### "One integration failing"

1. **Check credential**:
   - Expired token? Regenerate
   - Wrong format? Verify example
   - Case-sensitive? Check env var name

2. **Check API quota**:
   - Gemini: 60 req/min free tier
   - GitHub: 5000 req/hr (authenticated)
   - Twilio: Account balance

3. **Check firewall/network**:
   - Can server reach external API?
   - Test: `curl https://api.github.com`

### "Webhook not being called"

1. **Check webhook URL**:
   - Is it public (not localhost)?
   - Does path match (e.g., `/api/webhook/sms`)?
   - Is HTTP method correct (POST)?

2. **Check logs**:
   - Webhook provider's logs (Twilio, GitHub)
   - Your server logs (`npm run dev`)

3. **Test locally**:
   ```bash
   curl -X POST http://localhost:3000/api/webhook/test \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

---

## Next Steps

- See **[Operations & Deployment](/openwiki/operations.md)** for production setup
- See **[Architecture](/openwiki/architecture.md)** for system design
- Check `server.ts` for all webhook implementations
