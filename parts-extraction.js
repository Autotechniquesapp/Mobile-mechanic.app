/*
 * Mobile Mechanic AI — AI workup parts extraction and work-order seeding.
 *
 * Turns the free-text `parts_candidates` and `labor_suggestions` produced by the
 * intake AI workup into structured, orderable parts and into a pre-filled job
 * work order. Pure logic only: no DOM, no network, no Supabase. Loads in the
 * browser as `window.MobileMechanicParts` and in Node via `require`.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MobileMechanicParts = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /*
   * Ordered catalog. The first pattern that matches a candidate line wins, so
   * more specific entries must come before broader ones (for example
   * "wheel hub/bearing" before "bearing", "brake hose" before "hose").
   */
  const CATALOG = [
    // Starting and charging
    { name: 'Starter assembly', category: 'starting', match: /\bstarter(?!\s*relay)\b|starting motor|\bsolenoid\b/i },
    { name: 'Starter relay', category: 'starting', match: /starter relay/i },
    { name: 'Battery', category: 'starting', match: /\bbatter(?:y|ies)\b/i },
    { name: 'Battery cable / terminal', category: 'starting', match: /battery cable|\bterminals?\b|\bcables?\b/i },
    { name: 'Alternator', category: 'charging', match: /\balternator\b|\bgenerator\b/i },

    // Fuel and ignition
    { name: 'Fuel pump', category: 'fuel', match: /fuel pump/i },
    { name: 'Fuel filter', category: 'fuel', match: /fuel filter/i },
    { name: 'Fuel pressure regulator', category: 'fuel', match: /(?:fuel )?pressure regulator|\bregulator\b/i },
    { name: 'Fuel injector', category: 'fuel', match: /\binjectors?\b/i },
    { name: 'Ignition coil', category: 'ignition', match: /ignition coil|\bcoil pack\b|\bcoils?\b/i },
    { name: 'Spark plugs', category: 'ignition', match: /spark plugs?|\bplugs?\b/i },

    // Cooling
    { name: 'Thermostat', category: 'cooling', match: /\bthermostat\b/i },
    { name: 'Water pump', category: 'cooling', match: /water pump/i },
    { name: 'Radiator', category: 'cooling', match: /\bradiator\b/i },
    { name: 'Radiator / pressure cap', category: 'cooling', match: /pressure cap|radiator cap/i },
    { name: 'Coolant hose', category: 'cooling', match: /coolant hose|radiator hose/i },
    { name: 'Cooling fan', category: 'cooling', match: /cooling fan|\bfan (?:motor|assembly|clutch)\b/i },
    { name: 'Coolant', category: 'cooling', match: /\bcoolant\b|\bantifreeze\b/i },

    // Brakes
    { name: 'Brake pads', category: 'brakes', match: /brake pads?|\bpads?\b(?!dle)/i },
    { name: 'Brake shoes', category: 'brakes', match: /brake shoes?|\bshoes?\b/i },
    { name: 'Brake rotors', category: 'brakes', match: /\brotors?\b|brake discs?/i },
    { name: 'Brake drums', category: 'brakes', match: /\bdrums?\b/i },
    { name: 'Brake caliper', category: 'brakes', match: /\bcalipers?\b/i },
    { name: 'Wheel cylinder', category: 'brakes', match: /wheel cylinder/i },
    { name: 'Brake hose', category: 'brakes', match: /brake hose|brake line/i },
    { name: 'Brake hardware kit', category: 'brakes', match: /(?:brake )?hardware kit/i },
    { name: 'Master cylinder', category: 'brakes', match: /master cylinder/i },
    { name: 'Brake fluid', category: 'brakes', match: /brake fluid/i },

    // Wheels and driveline
    { name: 'Wheel hub / bearing assembly', category: 'driveline', match: /wheel (?:hub|bearing)|hub (?:assembly|bearing)|hub\/bearing/i },
    { name: 'CV axle', category: 'driveline', match: /\bcv (?:axle|joint|shaft)\b|\baxles?\b/i },
    { name: 'U-joint', category: 'driveline', match: /u-?joint|universal joint/i },
    { name: 'Carrier bearing', category: 'driveline', match: /carrier bearing/i },
    { name: 'Driveshaft', category: 'driveline', match: /drive ?shaft|prop ?shaft/i },
    { name: 'Differential fluid', category: 'driveline', match: /differential fluid|gear oil|transfer[- ]case fluid/i },

    // A/C and HVAC
    // Checked before the transmission clutch so an A/C line cannot produce one.
    { name: 'A/C compressor clutch', category: 'hvac', match: /compressor[^.]*\bclutch\b|\bclutch\b[^.]*compressor/i, supersedes: ['Clutch'] },
    { name: 'A/C compressor', category: 'hvac', match: /a\/?c compressor|\bcompressor\b/i },
    { name: 'A/C condenser', category: 'hvac', match: /\bcondenser\b/i },
    { name: 'A/C evaporator', category: 'hvac', match: /\bevaporator\b/i },
    { name: 'Receiver drier / accumulator', category: 'hvac', match: /receiver[- ]?drier|\baccumulator\b/i },
    { name: 'Expansion valve / orifice tube', category: 'hvac', match: /expansion (?:valve|device)|orifice tube/i },
    { name: 'Blend door actuator', category: 'hvac', match: /blend (?:door )?actuator/i },
    { name: 'Cabin air filter', category: 'hvac', match: /cabin (?:air )?filter/i },
    { name: 'Blower motor', category: 'hvac', match: /blower motor/i },

    // Engine and emissions
    { name: 'Serpentine belt', category: 'engine', match: /serpentine belt|drive belt|\bbelt\b/i },
    { name: 'Timing belt / chain', category: 'engine', match: /timing (?:belt|chain)/i },
    { name: 'Engine air filter', category: 'engine', match: /(?:engine )?air filter/i },
    { name: 'Valve cover gasket', category: 'engine', match: /valve cover gasket/i },
    { name: 'Intake manifold gasket', category: 'engine', match: /intake (?:manifold )?gasket/i },
    { name: 'Oil filter', category: 'engine', match: /oil filter/i },
    { name: 'PCV valve', category: 'engine', match: /\bpcv\b/i },
    { name: 'Catalytic converter', category: 'emissions', match: /catalytic converter|\bcat(?:alyst)?\b/i },
    { name: 'Oxygen sensor', category: 'emissions', match: /oxygen sensor|\bo2 sensor\b/i },
    { name: 'Mass air flow sensor', category: 'emissions', match: /mass air ?flow|\bmaf\b/i },
    { name: 'EGR valve', category: 'emissions', match: /\begr\b/i },
    { name: 'Purge valve', category: 'emissions', match: /purge (?:valve|solenoid)|\bevap\b/i },

    // Suspension and steering
    { name: 'Shock absorber', category: 'suspension', match: /\bshocks?\b|shock absorber/i },
    { name: 'Strut assembly', category: 'suspension', match: /\bstruts?\b/i },
    { name: 'Control arm', category: 'suspension', match: /control arm/i },
    { name: 'Ball joint', category: 'suspension', match: /ball joint/i },
    { name: 'Tie rod end', category: 'steering', match: /tie rod/i },
    { name: 'Sway bar link', category: 'suspension', match: /sway bar|stabilizer link/i },
    { name: 'Power steering pump', category: 'steering', match: /power steering pump/i },
    { name: 'Rack and pinion', category: 'steering', match: /rack (?:and|&) pinion|steering rack/i },
    // Must not swallow "wheel cylinder", "wheel hub", or "wheel speed sensor".
    { name: 'Wheel / tire', category: 'suspension', match: /\btires?\b|\bwheels?\b(?!\s*(?:cylinder|hub|bearing|speed|stud))/i },

    // Transmission
    { name: 'Transmission fluid', category: 'transmission', match: /transmission fluid|\batf\b/i },
    { name: 'Transmission filter', category: 'transmission', match: /transmission filter/i },
    { name: 'Clutch', category: 'transmission', match: /\bclutch\b(?! coil)/i },
    { name: 'Torque converter', category: 'transmission', match: /torque converter/i },

    // Electrical
    { name: 'Fuse / relay', category: 'electrical', match: /\bfuses?\b|\brelays?\b/i },
    { name: 'Wiring harness / connector', category: 'electrical', match: /wiring harness|\bconnectors?\b|\bwiring\b/i },
    { name: 'Crankshaft / camshaft position sensor', category: 'electrical', match: /(?:crank|cam)(?:shaft)? (?:position )?sensor|\bckp\b|\bcmp\b/i },
    { name: 'Coolant temperature sensor', category: 'electrical', match: /(?:coolant )?temperature sensor|\bect\b/i },
    { name: 'Wheel speed sensor', category: 'electrical', match: /wheel speed sensor|\babs sensor\b/i },
    { name: 'Headlight / bulb', category: 'electrical', match: /\bheadlights?\b|\bbulbs?\b/i },

    // Generic fallbacks — only reached when nothing more specific matched.
    { name: 'Gasket / seal', category: 'general', match: /\bgaskets?\b|\bseals?\b/i },
    { name: 'Hose / clamp', category: 'general', match: /\bhoses?\b|\bclamps?\b/i },
    { name: 'Sensor', category: 'general', match: /\bsensors?\b/i },
    { name: 'Pump', category: 'general', match: /\bpumps?\b/i },
    { name: 'Filter', category: 'general', match: /\bfilters?\b/i },
    { name: 'Module / control unit', category: 'general', match: /\bmodules?\b|control unit/i },
    { name: 'Motor', category: 'general', match: /\bmotors?\b/i },
    { name: 'Valve', category: 'general', match: /\bvalves?\b/i }
  ];

  /*
   * Lines that describe an absence of parts rather than a part. The AI is
   * instructed to emit these when the complaint is too vague to source against,
   * and they must never become an orderable row.
   */
  const NON_PART = /^\s*(?:no parts?\b|none\b|not applicable\b|n\/a\b|do not (?:order|select)\b|parts? (?:cannot|can't|should not)\b)/i;

  const MAX_PARTS = 12;

  function textOf(row) {
    if (typeof row === 'string') return row;
    if (row && typeof row === 'object') {
      return String(row.name || row.part || row.component || row.cause || '');
    }
    return '';
  }

  /*
   * Strip the conditional tail the AI appends to every candidate, e.g.
   * "Water pump — only if leaking, noisy, or circulation testing fails".
   * The tail is preserved separately as the sourcing condition.
   */
  function splitCondition(line) {
    const m = String(line).split(/\s+[—–-]{1,2}\s+|\s*[;:]\s+|\s+\bonly (?:if|after|when)\b\s*/i);
    const head = (m[0] || '').trim();
    const tail = String(line).slice(head.length).replace(/^[\s—–\-;:]+/, '').trim();
    return { head: head || String(line).trim(), condition: tail };
  }

  const MAX_PER_LINE = 4;

  /*
   * A single candidate line often names several parts
   * ("Battery, terminals, or cables"), so collect every specific catalog hit.
   * The `general` fallbacks are only consulted when nothing specific matched,
   * which stops a line like "Fuel pump or regulator" from also producing a
   * vague "Pump" row alongside the real ones.
   */
  function matchCatalog(text) {
    const specific = CATALOG.filter(e => e.category !== 'general' && e.match.test(text));
    if (specific.length) {
      // Drop broader entries that a more precise match already covers.
      const covered = new Set(specific.flatMap(e => e.supersedes || []));
      return specific.filter(e => !covered.has(e.name)).slice(0, MAX_PER_LINE);
    }
    const generic = CATALOG.find(e => e.category === 'general' && e.match.test(text));
    return generic ? [generic] : [];
  }

  /**
   * Extract orderable parts from an AI workup's `parts_candidates`.
   *
   * Each candidate line is matched against the catalog independently so the
   * per-part sourcing condition survives. Results are deduplicated by canonical
   * name and capped at MAX_PARTS.
   *
   * @param {Array<string|object>} rows
   * @returns {Array<{name:string, category:string, condition:string, source:string}>}
   */
  function extractParts(rows) {
    if (!Array.isArray(rows)) return [];
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      const raw = textOf(row).trim();
      if (!raw || NON_PART.test(raw)) continue;
      const { head, condition } = splitCondition(raw);
      // Match against the head first so a condition clause cannot invent a part.
      const entries = matchCatalog(head).length ? matchCatalog(head) : matchCatalog(raw);
      for (const entry of entries) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        out.push({ name: entry.name, category: entry.category, condition, source: raw });
        if (out.length >= MAX_PARTS) break;
      }
      if (out.length >= MAX_PARTS) break;
    }
    return out;
  }

  /**
   * Build the retailer search string for a part on a specific vehicle.
   * @returns {string}
   */
  function searchTerm(part, vehicle) {
    const v = vehicle || {};
    const name = typeof part === 'string' ? part : (part && part.name) || '';
    return [v.year, v.make, v.model, v.submodel, v.engine, name]
      .filter(Boolean)
      .join(' ')
      .trim() || String(name || '');
  }

  /**
   * Seed a job work order from an intake AI workup.
   *
   * Parts become `needed`/`inspect_first` rows, first checks and confirmation
   * tests become `tests`, and labor suggestions become `work` rows. Nothing is
   * priced and no labor hours are asserted — the mechanic still confirms every
   * line before it can reach an estimate.
   *
   * @param {object} workup
   * @returns {{parts:Array, work:Array, tests:Array, authorization:object, seeded_from_ai:boolean}}
   */
  function seedWorkOrder(workup) {
    const w = workup && typeof workup === 'object' ? workup : {};
    const parts = extractParts(w.parts_candidates).map(p => ({
      name: p.name,
      status: p.condition ? 'inspect_first' : 'needed',
      price: null,
      note: p.condition || 'Confirm fitment by VIN before ordering.',
      from_ai: true
    }));

    const work = (Array.isArray(w.labor_suggestions) ? w.labor_suggestions : [])
      .slice(0, 8)
      .map(x => ({
        name: String((x && x.operation) || 'Repair operation'),
        status: 'to_do',
        note: [(x && x.range) || '', (x && x.condition) || ''].filter(Boolean).join(' — '),
        hours: null,
        from_ai: true
      }));

    const testNames = [];
    for (const c of (Array.isArray(w.first_checks) ? w.first_checks : []).slice(0, 6)) {
      if (typeof c === 'string' && c.trim()) testNames.push({ name: c.trim(), purpose: 'First check' });
    }
    for (const t of (Array.isArray(w.diagnostic_tests) ? w.diagnostic_tests : []).slice(0, 6)) {
      const name = t && typeof t === 'object' ? String(t.test || '') : String(t || '');
      if (name.trim()) testNames.push({ name: name.trim(), purpose: (t && t.meaning) || 'Confirmation test' });
    }
    const seenTests = new Set();
    const tests = testNames
      .filter(t => !seenTests.has(t.name) && seenTests.add(t.name))
      .slice(0, 10)
      .map(t => ({ name: t.name, status: 'to_do', purpose: String(t.purpose || ''), from_ai: true }));

    return {
      parts,
      work,
      tests,
      authorization: { status: '', note: '' },
      seeded_from_ai: Boolean(parts.length || work.length || tests.length)
    };
  }

  /** True when a work order has no mechanic-entered content yet. */
  function isEmptyWorkOrder(wo) {
    if (!wo || typeof wo !== 'object') return true;
    const len = k => (Array.isArray(wo[k]) ? wo[k].length : 0);
    return len('parts') === 0 && len('work') === 0 && len('tests') === 0;
  }

  /** True when an AI workup actually contains diagnosis content worth carrying. */
  function hasDiagnosis(workup) {
    if (!workup || typeof workup !== 'object') return false;
    return ['likely_causes', 'parts_candidates', 'labor_suggestions', 'first_checks', 'diagnostic_tests']
      .some(k => Array.isArray(workup[k]) && workup[k].length > 0);
  }

  return { CATALOG, MAX_PARTS, extractParts, searchTerm, seedWorkOrder, isEmptyWorkOrder, hasDiagnosis };
});
