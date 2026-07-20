/** Logbook — local hunt review, rules filters, duplicate sweep, import/export. */

import { boot } from './_boot.js';
import { esc, fingerprint } from '../lib/text.js';
import { kk, nf, day } from '../lib/fmt.js';
import { $, say, dataTable, note } from '../shell.js';
import { assessImport, judge } from '../engine/rules.js';
import { logbook, writeLogbook } from '../data/sources.js';

const { stage } = await boot('admin.html');

const FIELDS = ['id', 'loggedAt', 'ground', 'vocation', 'level', 'party', 'world',
  'minutes', 'xpRaw', 'xpRawRate', 'xpRate', 'loot', 'supplies', 'balance'];

stage.innerHTML = `
  <header class="page-head">
    <h1>Logbook</h1>
    <p class="dim" style="max-width:64ch">Manage the hunt logbook stored in <em>this</em> browser: review analyser sessions, sweep duplicates, export backups and import older logs. Shared/public moderation can still happen on GitHub later.</p>
  </header>
  <section class="section section-tight">
    <div class="section-bar"><h2>Local logbook</h2><span class="fine dim" id="k-count"></span></div>
    <div id="k-undo" aria-live="polite"></div>
    <div id="k-rule-filters"></div>
    <div id="k-book"></div>
  </section>
  <section class="section">
    <div class="section-bar"><h2>Duplicate sweep</h2></div>
    <p class="fine dim" style="margin-top:calc(var(--s2) * -1)">Identical analyser text (whitespace-insensitive). Sweeping keeps the earliest copy.</p>
    <div id="k-dupes"></div>
  </section>
  <section class="section">
    <div class="section-bar"><h2>Move data</h2></div>
    <div class="admin-transfer-actions">
      <button type="button" class="btn btn-secondary" id="k-json">Export JSON</button>
      <button type="button" class="btn btn-secondary" id="k-csv">Export CSV</button>
      <button type="button" class="btn btn-secondary" id="k-xls">Export Excel</button>
      <button type="button" class="btn btn-tertiary" id="k-import-btn">Import JSON</button>
      <input type="file" id="k-import" accept=".json,application/json" hidden>
    </div>
    <div id="k-io" aria-live="polite"></div>
  </section>`;

let undoSnapshot = null;
let ruleFilter = 'all';

function ruleStatus(hunt, book) {
  const verdict = judge(hunt, book);
  if (!verdict.ok) return { key: 'faulted', verdict };
  if (verdict.flags.length) return { key: 'flagged', verdict };
  return { key: 'clean', verdict };
}

function clearUndo() {
  undoSnapshot = null;
  $('#k-undo').innerHTML = '';
}

function offerUndo(message, snapshot) {
  undoSnapshot = snapshot;
  $('#k-undo').innerHTML = `
    <div class="note note-amber admin-undo">
      <span>${esc(message)}</span>
      <button type="button" class="btn btn-tertiary" data-undo>Undo</button>
    </div>`;
}

$('#k-undo').addEventListener('click', (e) => {
  if (!e.target.closest('[data-undo]') || !undoSnapshot) return;
  const restore = undoSnapshot;
  clearUndo();
  writeLogbook(restore);
  refresh();
  say('Logbook restored.');
});

function refresh() {
  const book = logbook();
  const statuses = new Map(book.map((hunt) => [String(hunt.id), ruleStatus(hunt, book)]));
  const visible = ruleFilter === 'all'
    ? book
    : book.filter((hunt) => statuses.get(String(hunt.id))?.key === ruleFilter);
  $('#k-count').textContent = `${book.length} hunt${book.length === 1 ? '' : 's'} in this browser`;

  for (const id of ['#k-json', '#k-csv', '#k-xls']) $(id).disabled = !book.length;

  if (!book.length) {
    ruleFilter = 'all';
    $('#k-rule-filters').innerHTML = '';
    $('#k-book').innerHTML = `
      <div class="panel empty-action admin-empty">
        <div>
          <h3>No hunts logged yet</h3>
          <p class="fine dim">Paste a Hunting Analyser session to start building private evidence for your planner and progress views.</p>
        </div>
        <a class="btn btn-primary" href="submit.html">Log a hunt</a>
      </div>`;
  } else {
    const filters = [
      ['all', 'All'],
      ['clean', 'Clean'],
      ['flagged', 'Flagged'],
      ['faulted', 'Faulted'],
    ];
    $('#k-rule-filters').innerHTML = `
      <div class="admin-rule-filters" role="group" aria-label="Filter hunts by rules check">
        ${filters.map(([key, label]) => `<button type="button" class="admin-rule-filter" data-rule-filter="${key}" aria-pressed="${ruleFilter === key}">${label}</button>`).join('')}
      </div>`;

    if (!visible.length) {
      $('#k-book').innerHTML = `
        <div class="panel empty-action admin-empty">
          <div>
            <h3>No ${esc(ruleFilter)} hunts</h3>
            <p class="fine dim">None of the hunts in this browser currently have that rules status.</p>
          </div>
          <button type="button" class="btn btn-secondary" data-rule-filter="all">Show all hunts</button>
        </div>`;
    } else {
      dataTable($('#k-book'), {
        cols: [
          { id: 'loggedAt', label: 'Date', cell: (h) => day(h.loggedAt) },
          { id: 'ground', label: 'Ground', cell: (h) => esc(h.ground || '—') },
          { id: 'vocation', label: 'Vocation', cell: (h) => esc(h.vocation || (h.party ? 'Party' : '—')) },
          { id: 'level', label: 'Level', num: true, cell: (h) => nf(h.level) },
          { id: 'xpRawRate', label: 'Raw XP/h', num: true, cell: (h) => kk(h.xpRawRate) },
          { id: 'check', label: 'Rules', cell: (h) => {
            const { key, verdict } = statuses.get(String(h.id));
            if (key === 'faulted') return `<span class="badge badge-error" title="${esc(verdict.faults.join(' '))}">Faulted</span>`;
            if (key === 'flagged') return `<span class="badge badge-warning" title="${esc(verdict.flags.join(' '))}">Flagged</span>`;
            return '<span class="badge badge-success">Clean</span>';
          } },
          { id: 'x', label: '', cell: (h) => `<button type="button" class="btn btn-destructive btn-sm admin-delete" data-drop="${esc(h.id)}">Delete</button>` },
        ],
        rows: visible,
      });
    }
  }

  $('#k-book').onclick = (e) => {
    const nextFilter = e.target.dataset?.ruleFilter;
    if (nextFilter) {
      ruleFilter = nextFilter;
      refresh();
      return;
    }
    const id = e.target.dataset?.drop;
    if (!id) return;
    const before = logbook();
    const after = before.filter((h) => String(h.id) !== id);
    if (after.length === before.length) return;
    writeLogbook(after);
    offerUndo('Hunt deleted.', before);
    refresh();
  };

  const packs = new Map();
  for (const h of book) {
    const fp = fingerprint(h.raw || '');
    if (!packs.has(fp)) packs.set(fp, []);
    packs.get(fp).push(h);
  }
  const dupes = [...packs.values()].filter((p) => p.length > 1);
  const host = $('#k-dupes');
  if (!dupes.length) {
    host.innerHTML = '<p class="fine dim">No duplicates.</p>';
  } else {
    host.innerHTML = dupes.map((p, i) => `
      <div class="panel panel-pad" style="display:flex; align-items:center; gap:var(--s3); margin-bottom:var(--s2)">
        <span><b>${esc(p[0].ground || 'Unknown ground')}</b> — ${p.length} identical logs (${p.map((h) => day(h.loggedAt)).join(', ')})</span>
        <button type="button" class="btn btn-secondary" style="margin-left:auto" data-sweep="${i}">Sweep</button>
      </div>`).join('');
    host.onclick = (e) => {
      const i = e.target.dataset?.sweep;
      if (i == null) return;
      const pack = dupes[+i].sort((a, b) => String(a.loggedAt).localeCompare(String(b.loggedAt)));
      const drop = new Set(pack.slice(1).map((h) => h.id));
      const before = logbook();
      writeLogbook(before.filter((h) => !drop.has(h.id)));
      offerUndo(`Swept ${pack.length - 1} duplicate${pack.length > 2 ? 's' : ''}.`, before);
      refresh();
    };
  }
}

$('#k-rule-filters').addEventListener('click', (e) => {
  const nextFilter = e.target.dataset?.ruleFilter;
  if (!nextFilter || nextFilter === ruleFilter) return;
  ruleFilter = nextFilter;
  refresh();
});

function download(filename, mime, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('#k-json').addEventListener('click', () =>
  download('exiva-logbook.json', 'application/json', JSON.stringify(logbook(), null, 2)));

$('#k-csv').addEventListener('click', () => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [FIELDS.join(','), ...logbook().map((h) => FIELDS.map((f) => cell(h[f])).join(','))];
  download('exiva-logbook.csv', 'text/csv', lines.join('\n'));
});

$('#k-xls').addEventListener('click', () => {
  const cell = (v) => (typeof v === 'number'
    ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
    : `<Cell><Data ss:Type="String">${esc(String(v ?? ''))}</Data></Cell>`);
  const rows = [FIELDS, ...logbook().map((h) => FIELDS.map((f) => h[f]))]
    .map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('');
  download('exiva-logbook.xls', 'application/vnd.ms-excel',
    `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Hunts"><Table>${rows}</Table></Worksheet></Workbook>`);
});

$('#k-import-btn').addEventListener('click', () => $('#k-import').click());

$('#k-import').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming)) throw new Error('expected a JSON array of hunts');
    const book = logbook();
    const report = assessImport(incoming, book);
    if (report.accepted.length) {
      writeLogbook([...book, ...report.accepted]);
      clearUndo();
    }
    const summary = [
      `Imported ${report.accepted.length} new hunt${report.accepted.length === 1 ? '' : 's'}.`,
      `${report.duplicates.length} duplicate${report.duplicates.length === 1 ? '' : 's'} skipped.`,
      `${report.rejected.length} invalid row${report.rejected.length === 1 ? '' : 's'} rejected.`,
    ].join(' ');
    const reasons = report.rejected.slice(0, 10)
      .map((row) => `Row ${(row.index ?? 0) + 1}: ${row.faults.join(' ')}`)
      .join(' · ');
    const truncated = report.rejected.length > 10 ? ' Showing the first 10 rejection reasons.' : '';
    $('#k-io').innerHTML = note(report.rejected.length ? 'amber' : 'green', `${summary}${reasons ? ` ${reasons}` : ''}${truncated}`);
    refresh();
  } catch (err) {
    $('#k-io').innerHTML = note('red', `Import failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

refresh();
export {};
