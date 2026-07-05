/**
 * Optional sharing Action: merge approved hunts and rebuild the shared ledger.
 * Pulls open issues labelled `hunt` + `approved`, re-judges each payload
 * against the merged dataset (duplicates included), appends the clean ones to
 * data/shared-hunts.json, rebuilds data/ledger.json with the same engine the
 * browser runs, closes the processed issues. Idempotent — safe nightly.
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { judge } from '../assets/js/engine/rules.js';
import { buildLedger } from '../assets/js/engine/ledger.js';
import { normalizeGrounds } from '../assets/js/data/sources.js';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.error('GITHUB_TOKEN and GITHUB_REPOSITORY are required.');
  process.exit(1);
}

const gh = async (path, options = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const file = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = (name, fallback) => {
  try { return JSON.parse(readFileSync(file(name), 'utf8')); }
  catch { return fallback; }
};

const sharedHunts = readJson('shared-hunts.json', []);
const grounds = normalizeGrounds(readJson('grounds.json', { entries: [] }));

const issues = await gh(`/repos/${repo}/issues?labels=hunt,approved&state=open&per_page=100`);
console.log(`${issues.length} approved hunt issue(s).`);

let merged = 0;
for (const issue of issues) {
  try {
    const m = String(issue.body).match(/```json\s*([\s\S]*?)```/);
    if (!m) throw new Error('no payload block');
    const hunt = JSON.parse(m[1]);
    hunt.issue = issue.number;
    if (!hunt.loggedAt) hunt.loggedAt = issue.created_at;

    const verdict = judge(hunt, sharedHunts);
    if (!verdict.ok) {
      await gh(`/repos/${repo}/issues/${issue.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: `❌ Faulted at merge time:\n${verdict.faults.map((f) => `- ${f}`).join('\n')}` }),
      });
      await gh(`/repos/${repo}/issues/${issue.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed', labels: ['hunt', 'faulted'] }),
      });
      console.log(`#${issue.number}: faulted — ${verdict.faults.join('; ')}`);
      continue;
    }

    sharedHunts.push(hunt);
    merged += 1;
    await gh(`/repos/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: '✅ Merged into the shared hunt dataset — thank you for the hunt!' }),
    });
    await gh(`/repos/${repo}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    console.log(`#${issue.number}: merged (${hunt.ground}, ${hunt.vocation || 'Party'} ${hunt.level})`);
  } catch (err) {
    console.error(`#${issue.number}: skipped — ${err.message}`);
  }
}

if (merged) {
  writeFileSync(file('shared-hunts.json'), JSON.stringify(sharedHunts, null, 1));
  const tableRows = buildLedger(grounds.entries, sharedHunts);
  writeFileSync(file('ledger.json'), JSON.stringify({
    builtAt: new Date().toISOString(),
    hunts: sharedHunts.length,
    table: tableRows,
  }, null, 1));
  console.log(`Merged ${merged} hunt(s); ledger rebuilt (${tableRows.length} rows).`);
} else {
  console.log('Nothing to merge.');
}
