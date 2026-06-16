import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'Shir0o/cisa-campus-work-traker';

if (!GITHUB_TOKEN) {
  console.error('ERROR: GITHUB_TOKEN environment variable is required.');
  console.error('Please run the script as:');
  console.error('  GITHUB_TOKEN="your_token" npx tsx scripts/migrate-feedback-to-github.ts');
  process.exit(1);
}

if (!existsSync('firebase-applet-config.json')) {
  console.error('ERROR: firebase-applet-config.json was not found in the workspace.');
  process.exit(1);
}

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
admin.initializeApp({ projectId: cfg.projectId });
const db = getFirestore(admin.app(), cfg.firestoreDatabaseId);

const kindLabels: Record<string, string> = {
  thought: 'A thought',
  idea: 'An idea',
  off: "Something's off",
  request: 'A request',
};

async function migrate() {
  console.log(`Connecting to Firestore projectId="${cfg.projectId}"...`);
  const feedbackColl = db.collection('feedback');
  
  // Get all feedbacks
  const snapshot = await feedbackColl.get();
  const docs: any[] = [];
  snapshot.forEach(doc => {
    docs.push({ id: doc.id, ...doc.data() });
  });

  const unlinked = docs.filter(d => !d.githubIssueUrl && d.status !== 'resolved');
  if (unlinked.length === 0) {
    console.log('No unresolved, unlinked feedback items found for migration.');
    return;
  }

  console.log(`Found ${unlinked.length} feedback items to migrate to GitHub repo "${GITHUB_REPO}"...`);

  for (const item of unlinked) {
    const kindLabel = item.kind ? (kindLabels[item.kind] || item.kind) : item.type;
    const cleanMsg = item.message || '';
    const title = `[Feedback] ${kindLabel}: ${cleanMsg.slice(0, 50)}${cleanMsg.length > 50 ? '...' : ''}`;
    
    const createdAtStr = item.createdAt ? 
      (typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate().toISOString() : String(item.createdAt)) : 
      new Date().toISOString();

    const body = `### Feedback Details
- **Submitted By:** ${item.userName || 'Anonymous'} (${item.userEmail || 'anonymous'})
- **Type:** ${item.type || 'enhancement'}
- **Kind:** ${kindLabel}
- **Date:** ${new Date(createdAtStr).toLocaleString()}
- **Status:** ${item.status || 'new'}

### Message
\`\`\`text
${cleanMsg}
\`\`\`

---
*Created automatically via bulk migration script from CISA Campus Work Tracker.*`;

    const labels = [item.type || 'enhancement', 'feedback'];

    console.log(`Migrating item "${item.id}": "${title}"...`);

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'CISA-Campus-Work-Tracker-Migration-Script',
        },
        body: JSON.stringify({
          title,
          body,
          labels,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const issueData = (await response.json()) as { html_url: string; number: number };
      console.log(`  ✓ Created GitHub Issue #${issueData.number}: ${issueData.html_url}`);

      // Update Firestore
      await feedbackColl.doc(item.id).update({
        githubIssueUrl: issueData.html_url,
        status: 'in_progress',
      });
      console.log(`  ✓ Updated Firestore document "${item.id}" status to in_progress and githubIssueUrl.`);
    } catch (err: any) {
      console.error(`  ✗ Failed to migrate item "${item.id}":`, err.message || err);
    }
  }
}

migrate()
  .then(() => { console.log('Migration complete.'); process.exit(0); })
  .catch((err) => { console.error('Migration failed:', err); process.exit(1); });
