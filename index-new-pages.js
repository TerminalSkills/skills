/**
 * Auto-index new/updated pages on terminalskills.io via Google Indexing API.
 * Scans skills/ and use-cases/ directories, compares against a local state file,
 * and submits only new or updated URLs.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SITE = 'https://terminalskills.io';
const STATE_FILE = path.join(__dirname, '.indexing-state.json');
const KEY_FILE = '/home/node/.openclaw/workspace/.gsc-key-1.json';
const THROTTLE_MS = 1500; // 1.5s between requests to stay under quota

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Load previous state (map of url → last indexed timestamp)
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Scan repo for all publishable pages
function getAllPages() {
  const pages = [];
  
  // Skills
  const skillsDir = path.join(__dirname, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, dir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const stat = fs.statSync(skillFile);
        pages.push({
          url: `${SITE}/skills/${dir}`,
          file: skillFile,
          mtime: stat.mtimeMs
        });
      }
    }
  }

  // Use cases
  const ucDir = path.join(__dirname, 'use-cases');
  if (fs.existsSync(ucDir)) {
    for (const file of fs.readdirSync(ucDir)) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace('.md', '');
      const filePath = path.join(ucDir, file);
      const stat = fs.statSync(filePath);
      pages.push({
        url: `${SITE}/use-cases/${slug}`,
        file: filePath,
        mtime: stat.mtimeMs
      });
    }
  }

  // Static pages
  pages.push({ url: SITE, file: null, mtime: Date.now() });
  pages.push({ url: `${SITE}/skills`, file: null, mtime: Date.now() });
  pages.push({ url: `${SITE}/use-cases`, file: null, mtime: Date.now() });

  return pages;
}

async function main() {
  // Auth
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  });
  const client = await auth.getClient();

  const state = loadState();
  const pages = getAllPages();
  
  // Find pages that are new or updated since last indexing
  const toIndex = pages.filter(p => {
    const lastIndexed = state[p.url];
    if (!lastIndexed) return true; // Never indexed
    if (p.file && p.mtime > lastIndexed) return true; // File updated
    return false;
  });

  console.log(`Total pages: ${pages.length}, New/updated: ${toIndex.length}`);

  if (toIndex.length === 0) {
    console.log('Nothing new to index.');
    return;
  }

  // Cap at 200 per run (daily quota)
  const batch = toIndex.slice(0, 200);
  let success = 0;
  let failed = 0;

  for (const page of batch) {
    try {
      await client.request({
        url: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
        method: 'POST',
        data: { url: page.url, type: 'URL_UPDATED' },
      });
      state[page.url] = Date.now();
      success++;
      process.stderr.write(`✓ ${page.url}\n`);
    } catch (e) {
      failed++;
      process.stderr.write(`✗ ${page.url}: ${e.message}\n`);
    }
    await sleep(THROTTLE_MS);
  }

  saveState(state);
  console.log(`Done. Submitted: ${success}, Failed: ${failed}, Remaining: ${Math.max(0, toIndex.length - 200)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
