/*
 * Work order pricing.
 *
 * Two rules drive everything here:
 *
 * 1. An estimate and a confirmed number are never the same field. Estimates
 *    live on `line.estimate`, confirmed values live on the line itself. A
 *    confirmed value always wins, and writing one never destroys the estimate
 *    it replaced, so you can always see what the guess was.
 *
 * 2. There is no single total. `totals()` returns a confirmed total and a
 *    projected total separately. Blending a guessed labor time into one figure
 *    is how an estimate gets invoiced as if it were real.
 *
 * Pure functions only — no DOM, no network, no storage. job-work-order.js owns
 * the rendering and job-work-order money inputs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MobileMechanicPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Matches the shop settings defaults in supabase-production.js.
  const DEFAULTS = { laborRate: 75, partsMarkup: 25, taxRate: 0, travelFee: 0 };

  /*
   * Mechanic attestation.
   *
   * Terms of Service section 2 puts responsibility for diagnosis, testing and
   * repair on the shop and technician, and section 4 puts responsibility for
   * estimate and pricing accuracy on the shop. So a number does not become
   * quotable because somebody typed it — it becomes quotable when a named user
   * attests to it against a named source. That record is what separates the
   * shop owner from a technician's mistake.
   *
   * Versioned like terms_acceptances so an old attestation always says which
   * wording was agreed to. Bump the version if any item text changes; never
   * edit an item in place, because past records reference this version.
   */
  const ATTESTATION_VERSION = '2026-09-v1';
  const ATTESTATION = {
    version: ATTESTATION_VERSION,
    labor: [
      { id: 'labor_source', text: 'This labor time comes from a labor guide (Identifix, ALLDATA, Mitchell) or my own measured time — not the AI estimate.' },
      { id: 'labor_fitment', text: 'The operation matches this vehicle\u2019s year, make, model, engine and drivetrain.' },
      { id: 'labor_scope', text: 'The time covers only work actually required for this repair, with no padding and no unrelated operations.' }
    ],
    parts: [
      { id: 'parts_fitment', text: 'I confirmed this part fits this specific vehicle by VIN or engine code.' },
      { id: 'parts_price', text: 'This price came from a supplier quote, counter price or invoice — not the AI estimate.' },
      { id: 'parts_identity', text: 'I recorded the supplier and the brand or part number where one applies.' }
    ]
  };

  function checklistFor(kind) {
    return (kind === 'labor' || kind === 'work' ? ATTESTATION.labor : ATTESTATION.parts).map(x => ({ ...x }));
  }

  function requiredItemIds(kind) {
    return checklistFor(kind).map(x => x.id);
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function positive(v) {
    const n = num(v);
    return n !== null && n > 0 ? n : null;
  }

  /* Money rounds to cents. Hours round to two places so 1.75 hr survives. */
  function round2(v) {
    const n = num(v);
    return n === null ? null : Math.round(n * 100) / 100;
  }

  /* Read pricing off the shop record, tolerating both shapes the app uses. */
  function shopPricing(shop) {
    const s = shop?.settings || shop || {};
    const pick = (a, b, fallback) => {
      const v = num(s[a]) ?? num(s[b]);
      return v === null || v < 0 ? fallback : v;
    };
    return {
      laborRate: pick('laborRate', 'labor_rate', DEFAULTS.laborRate),
      partsMarkup: pick('partsMarkup', 'parts_markup', DEFAULTS.partsMarkup),
      taxRate: pick('taxRate', 'tax_rate', DEFAULTS.taxRate),
      travelFee: pick('travelFee', 'travel_fee', DEFAULTS.travelFee)
    };
  }

  function markUp(cost, markupPercent) {
    const c = num(cost);
    if (c === null) return null;
    const m = num(markupPercent) ?? 0;
    return round2(c * (1 + m / 100));
  }

  /*
   * Is this line's number formally attested, and by whom?
   *
   * An attestation counts only if it names a user, names a source, and covers
   * every required checklist item. A partial tick is not an attestation.
   */
  function attestationOf(line = {}, kind = 'parts') {
    const a = line.attested;
    if (!a || typeof a !== 'object') return null;
    if (!a.by_user_id || !a.at) return null;
    if (!String(a.source || '').trim()) return null;
    const have = new Set(Array.isArray(a.items) ? a.items : []);
    if (!requiredItemIds(kind).every(id => have.has(id))) return null;
    return a;
  }

  function isAttested(line = {}, kind = 'parts') {
    return attestationOf(line, kind) !== null;
  }

  /*
   * What a part line is worth, and on what authority. Three states, because
   * "someone typed it" and "someone stands behind it" are not the same thing:
   *
   *   attested   — a real cost or price, with a signed attestation. Quotable.
   *   entered    — a real cost or price typed in, not yet attested.
   *   estimated  — nothing real yet, so the AI's guess, clearly flagged.
   *
   * A typed price is used as-is (whoever quoted it already did the markup);
   * a typed cost gets the shop's parts markup applied.
   */
  function partAmount(part = {}, pricing = DEFAULTS) {
    const attested = isAttested(part, 'parts');
    const price = num(part.price);
    if (price !== null) {
      return { amount: round2(price), basis: 'price', source: 'entered', attested, estimated: false };
    }
    const cost = num(part.cost);
    if (cost !== null) {
      return { amount: markUp(cost, pricing.partsMarkup), basis: 'marked_up', source: 'entered', attested, estimated: false };
    }
    const guess = num(part.estimate?.price);
    if (guess !== null) {
      return { amount: round2(guess), basis: 'estimated', source: 'ai', attested: false, estimated: true };
    }
    return { amount: null, basis: null, source: null, attested: false, estimated: false };
  }

  /*
   * Labor is hours times a rate. A line may carry its own rate (imported from
   * a labor guide at a historical rate); otherwise the shop rate applies.
   */
  function laborAmount(line = {}, pricing = DEFAULTS) {
    const rate = positive(line.rate) ?? positive(pricing.laborRate) ?? DEFAULTS.laborRate;
    const attested = isAttested(line, 'labor');
    const hours = positive(line.hours);
    if (hours !== null) {
      return { amount: round2(hours * rate), hours: round2(hours), rate, basis: line.hours_source || 'entered', source: 'entered', attested, estimated: false };
    }
    const guess = positive(line.estimate?.hours);
    if (guess !== null) {
      return { amount: round2(guess * rate), hours: round2(guess), rate, basis: 'estimated', source: 'ai', attested: false, estimated: true };
    }
    return { amount: null, hours: null, rate, basis: null, source: null, attested: false, estimated: false };
  }

  /*
   * Three totals, because there are three grades of number on a work order and
   * collapsing them is how a guess ends up on an invoice:
   *
   *   attested.total   — every line signed for by a named user against a named
   *                      source. THIS is the only figure that may be quoted to
   *                      a customer.
   *   entered.total    — attested lines plus real numbers someone typed but has
   *                      not signed for yet. Internal working figure.
   *   projected.total  — everything, including unconfirmed AI guesses. Planning
   *                      only, never quotable.
   *
   * Each is a superset of the one above it. Tax applies to parts and labor; the
   * travel fee is added untaxed, matching estimate-approvals.js. A bucket with
   * nothing in it totals null rather than 0, so the UI can say "nothing
   * attested yet" instead of showing a confident "$0.00".
   */
  function totals(wo = {}, pricing = DEFAULTS) {
    const parts = Array.isArray(wo.parts) ? wo.parts : [];
    const work = Array.isArray(wo.work) ? wo.work : [];
    const acc = {
      attestedParts: 0, attestedLabor: 0, attestedHours: 0, attestedLines: 0,
      enteredParts: 0, enteredLabor: 0, enteredHours: 0, enteredLines: 0,
      projectedParts: 0, projectedLabor: 0, projectedHours: 0,
      estimatedLines: 0, unpricedLines: 0
    };

    for (const p of parts) {
      const r = partAmount(p, pricing);
      if (r.amount === null) { acc.unpricedLines++; continue; }
      acc.projectedParts += r.amount;
      if (r.estimated) { acc.estimatedLines++; continue; }
      acc.enteredParts += r.amount; acc.enteredLines++;
      if (r.attested) { acc.attestedParts += r.amount; acc.attestedLines++; }
    }
    for (const w of work) {
      const r = laborAmount(w, pricing);
      if (r.amount === null) { acc.unpricedLines++; continue; }
      acc.projectedLabor += r.amount;
      acc.projectedHours += r.hours || 0;
      if (r.estimated) { acc.estimatedLines++; continue; }
      acc.enteredLabor += r.amount; acc.enteredHours += r.hours || 0; acc.enteredLines++;
      if (r.attested) { acc.attestedLabor += r.amount; acc.attestedHours += r.hours || 0; acc.attestedLines++; }
    }

    const taxRate = num(pricing.taxRate) ?? 0;
    const travel = num(pricing.travelFee) ?? 0;
    const build = (partsTotal, laborTotal, hours, any) => {
      if (!any) return { parts: null, labor: null, hours: null, subtotal: null, tax: null, travel: null, total: null };
      const subtotal = round2(partsTotal + laborTotal);
      const tax = round2(subtotal * (taxRate / 100));
      return {
        parts: round2(partsTotal), labor: round2(laborTotal), hours: round2(hours),
        subtotal, tax, travel: round2(travel), total: round2(subtotal + tax + travel)
      };
    };

    const anyProjected = acc.projectedParts > 0 || acc.projectedLabor > 0 || acc.projectedHours > 0;
    const pendingLines = acc.enteredLines - acc.attestedLines;
    const attested = build(acc.attestedParts, acc.attestedLabor, acc.attestedHours, acc.attestedLines > 0);
    return {
      attested,
      entered: build(acc.enteredParts, acc.enteredLabor, acc.enteredHours, acc.enteredLines > 0),
      projected: build(acc.projectedParts, acc.projectedLabor, acc.projectedHours, anyProjected),
      // Retained so existing callers keep working; "confirmed" now means attested.
      confirmed: attested,
      counts: {
        attestedLines: acc.attestedLines,
        enteredLines: acc.enteredLines,
        pendingLines,
        confirmedLines: acc.attestedLines,
        estimatedLines: acc.estimatedLines,
        unpricedLines: acc.unpricedLines
      },
      hasEstimates: acc.estimatedLines > 0,
      hasPending: pendingLines > 0,
      quotable: acc.attestedLines > 0 && acc.estimatedLines === 0 && pendingLines === 0 && acc.unpricedLines === 0,
      fullyConfirmed: acc.estimatedLines === 0 && acc.unpricedLines === 0 && pendingLines === 0 && acc.attestedLines > 0,
      pricing
    };
  }

  /*
   * Confirming a line. Both of these keep `estimate` intact on purpose: the
   * mechanic should be able to see that the guess was 2.4 hr when they book
   * 3.1, and an accidental entry can be cleared back to the estimate.
   */
  function confirmPartCost(part = {}, cost) {
    const next = { ...part };
    const c = num(cost);
    if (c === null) { delete next.cost; } else { next.cost = round2(c); }
    delete next.price; // a typed cost supersedes a previously quoted price
    return next;
  }

  function confirmPartPrice(part = {}, price) {
    const next = { ...part };
    const p = num(price);
    if (p === null) { delete next.price; } else { next.price = round2(p); }
    return next;
  }

  function confirmLaborHours(line = {}, hours, source = 'confirmed') {
    const next = { ...line };
    const h = positive(hours);
    if (h === null) { delete next.hours; delete next.hours_source; } else { next.hours = round2(h); next.hours_source = source; }
    return next;
  }

  /*
   * Record an attestation on a line.
   *
   * Deliberately strict: no user, no source, or an unticked box and you get the
   * line back unattested. Silently recording a half-finished attestation would
   * be worse than none, because the total would claim someone signed for a
   * number they did not.
   *
   * Snapshots the amount and the AI guess as they stood at signing time, so the
   * record still means something after the shop rate or the estimate changes.
   */
  function attestLine(line = {}, kind = 'parts', { userId, userName, source, items, amount, at, userAgent } = {}) {
    const required = requiredItemIds(kind);
    const ticked = Array.isArray(items) ? items : [];
    const missing = required.filter(id => !ticked.includes(id));
    const cleanSource = String(source || '').trim();
    if (!userId || !cleanSource || missing.length) {
      return { line: { ...line }, ok: false, missing, needsSource: !cleanSource, needsUser: !userId };
    }
    const next = { ...line };
    next.attested = {
      by_user_id: userId,
      by_name: String(userName || '').trim() || null,
      at: at || new Date().toISOString(),
      source: cleanSource.slice(0, 200),
      checklist_version: ATTESTATION.version,
      items: required.slice(),
      amount_at_signing: num(amount),
      ai_estimate_at_signing: kind === 'labor' || kind === 'work'
        ? (num(line.estimate?.hours) ?? null)
        : (num(line.estimate?.price) ?? null),
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null
    };
    return { line: next, ok: true, missing: [], needsSource: false, needsUser: false };
  }

  /* Undo an attestation, keeping the typed number. Used when a value changes. */
  function clearAttestation(line = {}) {
    const next = { ...line };
    delete next.attested;
    return next;
  }

  /*
   * Attach AI estimates without ever touching a confirmed field.
   *
   * The intake workup may carry `estimated_hours` on a labor suggestion or
   * `estimated_price` on a part candidate. Those are model guesses with no
   * fitment or supplier data behind them, so they land on `line.estimate` and
   * are matched to lines by name. Lines the AI said nothing about are left
   * alone, and an existing estimate is not overwritten by a later empty one.
   */
  function applyAiEstimates(wo = {}, aiWorkup = {}) {
    const next = structuredClone(wo);
    next.parts = Array.isArray(next.parts) ? next.parts : [];
    next.work = Array.isArray(next.work) ? next.work : [];

    const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const partGuesses = new Map();
    for (const c of (Array.isArray(aiWorkup.parts_candidates) ? aiWorkup.parts_candidates : [])) {
      if (!c || typeof c !== 'object') continue;
      const price = positive(c.estimated_price);
      if (price !== null && c.name) partGuesses.set(key(c.name), price);
    }
    const laborGuesses = new Map();
    for (const l of (Array.isArray(aiWorkup.labor_suggestions) ? aiWorkup.labor_suggestions : [])) {
      if (!l || typeof l !== 'object') continue;
      const hours = positive(l.estimated_hours);
      if (hours !== null && l.operation) laborGuesses.set(key(l.operation), hours);
    }

    let applied = 0;
    const attach = (line, field, value) => {
      if (value === null || value === undefined) return;
      const estimate = { ...(line.estimate || {}), [field]: round2(value), source: 'ai', confirmed: false };
      line.estimate = estimate;
      applied++;
    };
    for (const p of next.parts) {
      const g = partGuesses.get(key(p.name));
      if (g !== undefined && num(p.price) === null && num(p.cost) === null) attach(p, 'price', g);
    }
    for (const w of next.work) {
      const g = laborGuesses.get(key(w.name));
      if (g !== undefined && positive(w.hours) === null) attach(w, 'hours', g);
    }
    if (applied > 0) next.has_ai_estimates = true;
    return next;
  }

  /* True when any line is carrying an unconfirmed AI guess. */
  function hasUnconfirmedEstimates(wo = {}) {
    const lines = [...(Array.isArray(wo.parts) ? wo.parts : []), ...(Array.isArray(wo.work) ? wo.work : [])];
    return lines.some(l => {
      if (!l?.estimate) return false;
      const hasReal = num(l.price) !== null || num(l.cost) !== null || positive(l.hours) !== null;
      return !hasReal;
    });
  }

  function formatMoney(v) {
    const n = num(v);
    if (n === null) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  function formatHours(v) {
    const n = num(v);
    if (n === null) return '';
    return `${Number(n.toFixed(2))} hr`;
  }

  return {
    DEFAULTS,
    shopPricing,
    markUp,
    partAmount,
    laborAmount,
    totals,
    confirmPartCost,
    confirmPartPrice,
    confirmLaborHours,
    ATTESTATION,
    ATTESTATION_VERSION,
    checklistFor,
    requiredItemIds,
    attestationOf,
    isAttested,
    attestLine,
    clearAttestation,
    applyAiEstimates,
    hasUnconfirmedEstimates,
    formatMoney,
    formatHours,
    round2
  };
});
