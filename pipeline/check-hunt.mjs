/**
 * Optional sharing Action: check a hunt issue against the same rules the browser ran.
 * Reads the issue body from ISSUE_BODY (or a file path argument), pulls the
 * JSON payload, judges it, writes `verdict` and `comment` to $GITHUB_OUTPUT.
 * Exit 0 = accepted for review, 1 = faulted.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { judge } from '../assets/js/engine/rules.js';

function payloadOf(body) {
  const m = String(body).match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('No ```json payload block in the issue body.');
  return JSON.parse(m[1]);
}

function sharedHunts() {
  try { return JSON.parse(readFileSync(new URL('../data/shared-hunts.json', import.meta.url), 'utf8')); }
  catch { return []; }
}

function out(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const eof = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}<<${eof}\n${value}\n${eof}\n`);
}

const body = process.argv[2] && existsSync(process.argv[2])
  ? readFileSync(process.argv[2], 'utf8')
  : process.env.ISSUE_BODY || '';

let verdict = 'faulted';
let comment;
try {
  const result = judge(payloadOf(body), sharedHunts());
  const lines = [];
  if (result.ok) {
    verdict = 'clean';
    lines.push('✅ **Hunt checks out.** Approving this issue merges it into the optional shared dataset.');
  } else {
    lines.push('❌ **Hunt was faulted** and will be closed:');
    lines.push(...result.faults.map((f) => `- ${f}`));
  }
  if (result.flags.length) {
    lines.push('', '⚠️ Review flags:', ...result.flags.map((f) => `- ${f}`));
  }
  comment = lines.join('\n');
} catch (err) {
  comment = `❌ Could not read the hunt payload: ${err.message}`;
}

out('verdict', verdict);
out('comment', comment);
console.log(`verdict: ${verdict}\n\n${comment}`);
process.exit(verdict === 'clean' ? 0 : 1);
