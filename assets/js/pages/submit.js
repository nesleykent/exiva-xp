/** Log a hunt — paste, parse, confirm the located ground, review, save. */

import { boot } from './_boot.js';
import { esc, newId } from '../lib/text.js';
import { kk, nf, gp, hm, pct } from '../lib/fmt.js';
import { $, say, pillEl, meters, note } from '../shell.js';
import { readAnalyser, isAnalyser } from '../engine/analyser.js';
import { locateHunt } from '../engine/locator.js';
import { readBattle } from '../engine/strategy.js';
import { judge, VOCATIONS } from '../engine/rules.js';
import { backend, logbook } from '../data/sources.js';

const { stage, codex, grounds, hunts } = await boot('submit.html', { codex: true, grounds: true, hunts: true });

const STEP_LABELS = { paste: 'Paste', review: 'Read', where: 'Location', confirm: 'Confirm' };

// `displaySteps` is what the stepper shows; `reachedKeys` is what's clickable.
// Steps 2-4 don't exist until a session has been parsed, so they stay locked
// (and absent from the DOM) until then — backward navigation among reached
// steps is always allowed, and switching steps never re-renders their markup,
// so nothing typed/picked earlier is lost.
let displaySteps = ['paste', 'review', 'where', 'confirm'];
let reachedKeys = ['paste'];
let activeStep = 'paste';

stage.classList.add('narrow');
stage.innerHTML = `
  <header class="page-head page-head-roomy">
    <h1>Log a hunt</h1>
    <p class="dim" id="paste-help">Paste the Hunting Analyser exactly as the client copies it. Parsing happens in your browser; the original text is saved untouched in your personal logbook.</p>
  </header>
  <nav class="stepper" id="stepper" aria-label="Log a hunt progress"></nav>
  <div class="steps" id="steps">
    <section class="step panel panel-pad" id="step-paste" data-step="paste">
      <div class="step-head"><h2 id="paste-heading" tabindex="-1">Paste your analyser</h2></div>
      <textarea id="paste" rows="12" aria-labelledby="paste-heading" aria-describedby="paste-help" placeholder="Session data: From 2026-07-01, 20:00:00 to 2026-07-01, 22:30:00
Session: 02:30h
Raw XP Gain: 3,412,500
XP Gain: 4,095,000
Loot: 812,340
Supplies: 402,100
Balance: 410,240
Killed Monsters:
  412x dragon
  96x dragon lord
Looted Items:
  1024x gold coin"></textarea>
      <div class="paste-actions">
        <button type="button" class="btn btn-primary" id="go">Read analyser</button>
        <span class="fine dim">Backend: ${esc(backend().label)}</span>
      </div>
      <div id="read-note" role="status" aria-live="polite"></div>
    </section>
    <div id="flow"></div>
  </div>`;

renderStepper();

$('#go').addEventListener('click', () => {
  const session = readAnalyser($('#paste').value);
  if (!isAnalyser(session)) {
    $('#read-note').innerHTML = note('red', 'No XP, loot or kill data found — that does not look like a hunting analyser.');
    $('#flow').innerHTML = '';
    displaySteps = ['paste', 'review', 'where', 'confirm'];
    reachedKeys = ['paste'];
    goToStep('paste');
    return;
  }
  $('#read-note').innerHTML = '';
  renderFlow(session);
});

/** Render the numbered/lined step nav; only reached steps are clickable. */
function renderStepper() {
  const activeIndex = displaySteps.indexOf(activeStep);
  $('#stepper').innerHTML = `<ol class="stepper-list">${displaySteps.map((key, i) => {
    const state = i === activeIndex ? ' is-active' : i < activeIndex ? ' is-done' : '';
    const reachable = reachedKeys.includes(key);
    return `
      <li class="stepper-item${state}">
        <button type="button" class="stepper-btn" data-goto="${key}" ${key === activeStep ? 'aria-current="step"' : ''} ${reachable ? '' : 'disabled aria-disabled="true"'}>
          <span class="stepper-num">${i + 1}</span><span class="stepper-label">${STEP_LABELS[key]}</span>
        </button>
      </li>`;
  }).join('')}</ol>`;
  $('#stepper').querySelectorAll('.stepper-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => goToStep(btn.dataset.goto));
  });
}

/** Show one step's section, hide the rest, and move focus to its heading. */
function goToStep(key) {
  if (!reachedKeys.includes(key)) return;
  activeStep = key;
  document.querySelectorAll('#steps [data-step]').forEach((section) => {
    section.hidden = section.dataset.step !== key;
  });
  renderStepper();
  const heading = document.querySelector(`#steps [data-step="${key}"] h2[tabindex="-1"]`);
  if (heading) heading.focus();
}

/** Back/Continue footer for a step, wired against the current step order. */
function stepFooter(key) {
  const i = displaySteps.indexOf(key);
  const backKey = i > 0 ? displaySteps[i - 1] : null;
  const nextKey = i < displaySteps.length - 1 ? displaySteps[i + 1] : null;
  if (!backKey && !nextKey) return '';
  return `<div class="step-nav">
    ${backKey ? `<button type="button" class="btn btn-tertiary" data-goto="${backKey}">Back</button>` : '<span></span>'}
    ${nextKey ? `<button type="button" class="btn btn-secondary" data-goto="${nextKey}">Continue</button>` : ''}
  </div>`;
}

function renderFlow(session) {
  const located = locateHunt(session.kills, codex, grounds.directory);
  const battle = readBattle(located.known.map((k) => ({ creature: k.creature, n: k.n })));
  const kills = session.kills.reduce((a, k) => a + k.n, 0);

  displaySteps = located.candidates.length ? ['paste', 'review', 'where', 'confirm'] : ['paste', 'review', 'confirm'];
  reachedKeys = [...displaySteps];

  $('#flow').innerHTML = `
  <section class="step" id="step-review" data-step="review" hidden>
    <div class="step-head"><h2 id="review-heading" tabindex="-1">What we read</h2></div>
    <div class="panel panel-pad">
      <div class="facts">
        <div class="fact"><b class="num">${hm(session.minutes)}</b><span class="fine dim">Session</span></div>
        <div class="fact"><b class="num">${kk(session.xpRaw)}</b><span class="fine dim">Raw XP</span></div>
        <div class="fact"><b class="num">${kk(session.xpRawRate)}</b><span class="fine dim">Raw XP/h</span></div>
        <div class="fact"><b class="num">${kk(session.xpRate)}</b><span class="fine dim">XP/h</span></div>
        <div class="fact"><b class="num">${gp(session.loot)}</b><span class="fine dim">Loot</span></div>
        <div class="fact"><b class="num">${gp(session.supplies)}</b><span class="fine dim">Supplies</span></div>
        <div class="fact"><b class="num">${gp(session.balance)}</b><span class="fine dim">Balance</span></div>
        <div class="fact"><b class="num">${kk(session.damageRate)}</b><span class="fine dim">Damage/h</span></div>
        <div class="fact"><b class="num">${kk(session.healingRate)}</b><span class="fine dim">Healing/h</span></div>
        <div class="fact"><b class="num">${nf(kills)}</b><span class="fine dim">Kills</span></div>
        <div class="fact"><b class="num">${nf(session.kills.length)}</b><span class="fine dim">Creatures</span></div>
        <div class="fact"><b class="num">${nf(session.drops.length)}</b><span class="fine dim">Item types</span></div>
      </div>
      ${located.unknown.length ? note('amber', `Not in the codex: ${located.unknown.map((u) => u.name).join(', ')} — kept in your submission, excluded from intelligence.`) : ''}
    </div>
    ${battle ? `
    <div class="step-head" style="margin-top:var(--s5)"><h2>Your battle read</h2></div>
    <div class="duo">
      <div class="panel panel-pad">
        <p class="eyebrow eyebrow-lede">This session's damage profile</p>
        ${meters(battle.profile)}
      </div>
      <div class="panel panel-pad">
        <p class="eyebrow eyebrow-lede">Suggestions</p>
        <ul class="tips">${battle.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
      </div>
    </div>` : ''}
    ${stepFooter('review')}
  </section>

  ${located.candidates.length ? `
  <section class="step" id="step-where" data-step="where" hidden>
    <div class="step-head"><h2 id="where-heading" tabindex="-1">Where were you?</h2></div>
    <div class="guess-list" id="guesses">
      ${located.candidates.map((cand, i) => `
        <button type="button" class="guess ${i === 0 ? 'picked' : ''}" aria-pressed="${i === 0 ? 'true' : 'false'}" data-name="${esc(cand.ground?.name || cand.habitat)}">
          <span class="guess-copy">
            <b>${esc(cand.ground?.name || cand.habitat)}</b>
            <span class="fine dim">${cand.dwellers.length} matched creature${cand.dwellers.length === 1 ? '' : 's'} · explains ${pct(cand.coverage * 100)} of your kills${cand.ground && cand.ground.name !== cand.habitat ? ` · codex habitat: ${esc(cand.habitat)}` : ''}</span>
          </span>
          <span class="pct num">${cand.certainty}</span>
        </button>`).join('')}
    </div>
    <p class="fine dim" style="margin:var(--s2) 0 0">Scored by creature overlap, kill volume, rarity and coverage. Pick one or type the ground below.</p>
    ${stepFooter('where')}
  </section>` : ''}

  <section class="step" id="step-confirm" data-step="confirm" hidden>
    <div class="step-head"><h2 id="confirm-heading" tabindex="-1">Confirm and save</h2></div>
    <form class="panel panel-pad" id="hunt-form">
      <div class="form-row">
        <label class="lbl lbl-wide"><span class="eyebrow">Ground *</span><input type="text" id="h-ground" list="ground-names" required></label>
        <datalist id="ground-names">${[...grounds.directory].sort((a, b) => a.name.localeCompare(b.name)).map((g) => `<option value="${esc(g.name)}">`).join('')}</datalist>
        <label class="lbl"><span class="eyebrow" id="h-voc-label">Vocation (solo) *</span><select id="h-voc" required><option value="">Pick…</option>${[...VOCATIONS].sort().map((v) => `<option>${v}</option>`).join('')}</select></label>
        <label class="lbl lbl-narrow"><span class="eyebrow">Level *</span><input type="number" id="h-level" min="8" max="2000" required></label>
        <label class="lbl"><span class="eyebrow">Hunt type</span><select id="h-party"><option value="">Solo</option><option value="party">Team hunt</option></select></label>
        <label class="lbl"><span class="eyebrow">World</span><input type="text" id="h-world" placeholder="Optional"></label>
      </div>
      <div id="verdict" role="status" aria-live="polite"></div>
      <div style="margin-top:var(--s4)"><button type="submit" class="btn btn-primary btn-lg" id="publish">Save hunt</button></div>
    </form>
    ${stepFooter('confirm')}
  </section>`;

  const guessHost = $('#guesses');
  if (guessHost) {
    const pick = (el) => {
      guessHost.querySelectorAll('.guess').forEach((guess) => {
        guess.classList.remove('picked');
        guess.setAttribute('aria-pressed', 'false');
      });
      el.classList.add('picked');
      el.setAttribute('aria-pressed', 'true');
      $('#h-ground').value = el.dataset.name;
    };
    guessHost.addEventListener('click', (e) => {
      const g = e.target.closest('.guess');
      if (g) pick(g);
    });
    $('#h-ground').value = guessHost.querySelector('.guess').dataset.name;
  }

  const huntForm = $('#hunt-form');
  const publishButton = $('#publish');
  const syncVocationRequirement = () => {
    const solo = $('#h-party').value !== 'party';
    $('#h-voc').required = solo;
    $('#h-voc-label').textContent = solo ? 'Vocation (solo) *' : 'Vocation (optional)';
  };
  $('#h-party').addEventListener('change', syncVocationRequirement);
  syncVocationRequirement();
  let saving = false;
  huntForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const hunt = {
      id: newId(),
      loggedAt: new Date().toISOString(),
      ground: $('#h-ground').value.trim(),
      vocation: $('#h-voc').value || null,
      party: $('#h-party').value === 'party',
      level: +$('#h-level').value || null,
      world: $('#h-world').value.trim() || null,
      minutes: session.minutes,
      xpRaw: session.xpRaw,
      xp: session.xp,
      xpRawRate: session.xpRawRate,
      xpRate: session.xpRate,
      loot: session.loot,
      supplies: session.supplies,
      balance: session.balance,
      damage: session.damage,
      damageRate: session.damageRate,
      healing: session.healing,
      healingRate: session.healingRate,
      kills: session.kills,
      drops: session.drops,
      raw: session.raw,
    };

    const verdict = judge(hunt, [...hunts, ...logbook()]);
    $('#verdict').innerHTML = [
      ...verdict.faults.map((f) => note('red', f)),
      ...verdict.flags.map((f) => note('amber', f)),
    ].join('');
    if (!verdict.ok) return;

    saving = true;
    huntForm.setAttribute('aria-busy', 'true');
    publishButton.disabled = true;
    publishButton.textContent = 'Saving…';
    try {
      const result = await backend().send(hunt);
      if (result.followUp) window.open(result.followUp, '_blank', 'noopener');
      $('#verdict').innerHTML += note(result.ok ? 'green' : 'amber', result.message);
      say(result.ok ? 'Hunt saved to your logbook.' : result.message);
    } catch (err) {
      $('#verdict').innerHTML += note('red', `Saving failed: ${err.message}`);
    } finally {
      saving = false;
      huntForm.removeAttribute('aria-busy');
      publishButton.disabled = false;
      publishButton.textContent = 'Save hunt';
    }
  });

  $('#flow').querySelectorAll('.step-nav [data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => goToStep(btn.dataset.goto));
  });
  goToStep('review');
  $('#review-heading').focus();
}
export {};
