const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const offlineBanner = document.querySelector("#offline-banner");

const TERMS_VERSION = "2026-08-26";
const CURRENT_YEAR = new Date().getFullYear();
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const vehicleCatalog = {
  Chevrolet: {
    Sonic: { trims: ["LS", "LT", "LTZ", "RS", "Other"], engines: ["1.4L Turbo", "1.8L", "Other"] },
    Silverado: { trims: ["WT", "Custom", "LT", "RST", "LTZ", "High Country", "Other"], engines: ["4.3L V6", "5.3L V8", "6.2L V8", "3.0L Diesel", "Other"] },
    Tahoe: { trims: ["LS", "LT", "RST", "Z71", "Premier", "High Country", "Other"], engines: ["5.3L V8", "6.2L V8", "3.0L Diesel", "Other"] },
    Traverse: { trims: ["LS", "LT", "RS", "Premier", "High Country", "Other"], engines: ["2.5L Turbo", "3.6L V6", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Ford: {
    "F-150": { trims: ["XL", "XLT", "Lariat", "King Ranch", "Platinum", "Raptor", "Other"], engines: ["2.7L EcoBoost", "3.3L V6", "3.5L EcoBoost", "5.0L V8", "Other"] },
    "F-250": { trims: ["XL", "XLT", "Lariat", "King Ranch", "Platinum", "Other"], engines: ["6.0L Diesel", "6.2L V8", "6.7L Diesel", "7.3L V8", "Other"] },
    Escape: { trims: ["S", "SE", "SEL", "Titanium", "Active", "ST-Line", "Other"], engines: ["1.5L", "2.0L", "2.5L Hybrid", "Other"] },
    Mustang: { trims: ["EcoBoost", "GT", "Dark Horse", "Shelby", "Other"], engines: ["2.3L Turbo", "5.0L V8", "5.2L V8", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  GMC: {
    Sierra: { trims: ["Pro", "SLE", "Elevation", "SLT", "AT4", "Denali", "Other"], engines: ["2.7L Turbo", "5.3L V8", "6.2L V8", "3.0L Diesel", "Other"] },
    Acadia: { trims: ["SLE", "SLT", "AT4", "Denali", "Other"], engines: ["2.0L Turbo", "2.5L", "3.6L V6", "Other"] },
    Yukon: { trims: ["SLE", "SLT", "AT4", "Denali", "Other"], engines: ["5.3L V8", "6.2L V8", "3.0L Diesel", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Toyota: {
    Camry: { trims: ["LE", "SE", "XLE", "XSE", "TRD", "Other"], engines: ["2.5L", "3.5L V6", "2.5L Hybrid", "Other"] },
    Tacoma: { trims: ["SR", "SR5", "TRD Sport", "TRD Off-Road", "Limited", "Other"], engines: ["2.4L Turbo", "2.7L", "3.5L V6", "Other"] },
    Corolla: { trims: ["L", "LE", "SE", "XLE", "XSE", "Other"], engines: ["1.8L", "2.0L", "1.8L Hybrid", "Other"] },
    RAV4: { trims: ["LE", "XLE", "Adventure", "Limited", "TRD", "Other"], engines: ["2.5L", "2.5L Hybrid", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Honda: {
    Accord: { trims: ["LX", "Sport", "EX", "EX-L", "Touring", "Other"], engines: ["1.5L Turbo", "2.0L Turbo", "2.0L Hybrid", "Other"] },
    Civic: { trims: ["LX", "Sport", "EX", "Touring", "Si", "Type R", "Other"], engines: ["1.5L Turbo", "2.0L", "Other"] },
    "CR-V": { trims: ["LX", "EX", "EX-L", "Sport", "Touring", "Other"], engines: ["1.5L Turbo", "2.0L Hybrid", "2.4L", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Nissan: {
    Frontier: { trims: ["S", "SV", "PRO-X", "PRO-4X", "Other"], engines: ["2.5L", "3.8L V6", "4.0L V6", "Other"] },
    Altima: { trims: ["S", "SV", "SR", "SL", "Other"], engines: ["2.0L Turbo", "2.5L", "Other"] },
    Sentra: { trims: ["S", "SV", "SR", "Other"], engines: ["1.8L", "2.0L", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Ram: {
    "1500": { trims: ["Tradesman", "Big Horn", "Laramie", "Rebel", "Limited", "Other"], engines: ["3.6L V6", "3.0L Diesel", "5.7L V8", "Other"] },
    "2500": { trims: ["Tradesman", "Big Horn", "Laramie", "Power Wagon", "Limited", "Other"], engines: ["6.4L V8", "6.7L Diesel", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Dodge: {
    Charger: { trims: ["SXT", "GT", "R/T", "Scat Pack", "SRT", "Other"], engines: ["3.6L V6", "5.7L V8", "6.4L V8", "Other"] },
    Challenger: { trims: ["SXT", "GT", "R/T", "Scat Pack", "SRT", "Other"], engines: ["3.6L V6", "5.7L V8", "6.4L V8", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Jeep: {
    Wrangler: { trims: ["Sport", "Willys", "Sahara", "Rubicon", "Other"], engines: ["2.0L Turbo", "3.6L V6", "3.0L Diesel", "6.4L V8", "Other"] },
    Cherokee: { trims: ["Latitude", "Limited", "Trailhawk", "Other"], engines: ["2.0L Turbo", "2.4L", "3.2L V6", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Hyundai: {
    Elantra: { trims: ["SE", "SEL", "Limited", "N Line", "N", "Other"], engines: ["1.6L Turbo", "2.0L", "Other"] },
    Tucson: { trims: ["SE", "SEL", "XRT", "Limited", "Other"], engines: ["1.6L Hybrid", "2.0L", "2.5L", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Kia: {
    Optima: { trims: ["LX", "S", "EX", "SX", "Other"], engines: ["1.6L Turbo", "2.0L Turbo", "2.4L", "Other"] },
    Sorento: { trims: ["L", "LX", "S", "EX", "SX", "Other"], engines: ["2.0L Turbo", "2.4L", "2.5L", "3.3L V6", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Subaru: {
    WRX: { trims: ["Base", "Premium", "Limited", "GT", "STI", "Other"], engines: ["2.0L Turbo", "2.4L Turbo", "2.5L Turbo", "Other"] },
    Outback: { trims: ["Base", "Premium", "Onyx", "Wilderness", "Limited", "Touring", "Other"], engines: ["2.4L Turbo", "2.5L", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  "Mercedes-Benz": {
    Sprinter: { trims: ["Cargo", "Crew", "Passenger", "Cab Chassis", "Other"], engines: ["2.0L Diesel", "3.0L Diesel", "Other"] },
    "E-Class": { trims: ["E 350", "E 450", "AMG", "Other"], engines: ["2.0L Turbo", "3.0L Turbo", "3.5L V6", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  BMW: {
    "3 Series": { trims: ["320i", "328i", "330i", "M340i", "M3", "Other"], engines: ["2.0L Turbo", "3.0L Turbo", "Other"] },
    X3: { trims: ["sDrive30i", "xDrive30i", "M40i", "Other"], engines: ["2.0L Turbo", "3.0L Turbo", "Other"] },
    Other: { trims: ["Other"], engines: ["Other"] }
  },
  Other: {
    Other: { trims: ["Other"], engines: ["Other"] }
  }
};

const demoJobs = [
  {
    id: "job_demo_101",
    status: "diagnosing",
    customerName: "Michelle R.",
    phone: "(928) 555-0138",
    vehicle: { year: 2018, make: "GMC", model: "Acadia", trim: "Denali", engine: "3.6L V6", mileage: 112480 },
    complaint: "Long crank after driving 30–40 minutes. Sometimes takes two or three tries. Slight throttle helps and idle shakes briefly.",
    location: "Yuma, AZ",
    scheduled: "Today · 9:30 AM",
    codes: [],
    findings: ["Battery recently replaced", "Charging voltage reported 12.5–14V"],
    estimate: null
  },
  {
    id: "job_demo_102",
    status: "waiting_authorization",
    customerName: "Dan M.",
    phone: "(928) 555-0164",
    vehicle: { year: 2016, make: "Chevrolet", model: "Sonic", trim: "LT", engine: "1.8L", mileage: 138220 },
    complaint: "Coolant leak around thermostat housing. Customer also requested water-pump and timing-belt pricing.",
    location: "Yuma, AZ",
    scheduled: "Sep 11 · 11:00 AM",
    codes: [],
    findings: ["Visible coolant staining near housing"],
    estimate: { good: 468, better: 742, best: 986 }
  }
];

const demoWorkup = {
  sample: true,
  summary: "This is a labeled sample workup for interface testing. No AI request was made.",
  possibleCauses: [
    { cause: "EVAP purge valve leaking after heat soak", priority: "High", reason: "Can create a rich hot restart and improve with throttle." },
    { cause: "Fuel pressure bleeding down", priority: "High", reason: "Multiple hot-start attempts can follow rail-pressure loss." },
    { cause: "Dirty throttle body or airflow issue", priority: "Medium", reason: "Brief unstable idle and throttle assistance make airflow worth verifying." }
  ],
  diagnosticChecklist: [
    { step: "Capture codes, pending codes, fuel trims, and freeze-frame data before clearing anything." },
    { step: "Compare cold-start and heat-soak restart behavior with scan data recording." },
    { step: "Command or isolate the purge valve and check for vacuum flow when it should be closed." },
    { step: "Measure fuel pressure and residual pressure after shutdown against verified service information." },
    { step: "Inspect throttle body, intake ducting, grounds, and battery connections." }
  ],
  safetyConcerns: ["Perform fuel-pressure testing with approved equipment and fire precautions."],
  possibleParts: ["Purge valve only if testing confirms leakage", "Seals or line components only if a verified leak is found"],
  laborSuggestion: "Start with diagnostic time. Do not quote a major part until test results support it.",
  preliminaryEstimate: "Diagnostic fee plus confirmed repair. Technician sets final labor and price.",
  customerExplanation: "The vehicle may be getting the wrong fuel-and-air mixture during a hot restart. Testing will separate a vapor-control problem from pressure loss or an airflow issue.",
  disclaimer: "Advisory only. Verify diagnosis, procedure, specifications, parts, labor, and safety information."
};

const state = {
  authMode: "login",
  accepted: Boolean(localStorage.getItem("mmi_terms_acceptance")),
  demo: sessionStorage.getItem("mmi_demo") === "1",
  session: null,
  dashboardData: null,
  activeTab: "today",
  selectedJobId: null,
  aiResult: null,
  aiBusy: false,
  intakeShop: null,
  intakeStatus: "loading",
  intakeSubmitted: null,
  platformDemo: false
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCaseSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function formatStatus(status = "") {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yearsOptions(selected = "") {
  const years = [];
  for (let year = CURRENT_YEAR; year >= 1930; year -= 1) years.push(year);
  return ['<option value="">Select year</option>']
    .concat(years.map((year) => `<option value="${year}" ${String(selected) === String(year) ? "selected" : ""}>${year}</option>`))
    .concat('<option value="Other">Other</option>')
    .join("");
}

function options(values, placeholder, selected = "") {
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(value)}</option>`))
    .join("");
}

function brandLockup() {
  return `
    <div class="brand-lockup">
      <div class="brand-emblem" aria-hidden="true"><span>MM</span><b>AI</b></div>
      <div class="brand-copy">
        <strong>Mobile Mechanic AI</strong>
        <span>Work smarter · Fix faster</span>
      </div>
    </div>
  `;
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4200);
}

async function api(functionName, { method = "GET", body, query } = {}) {
  const queryString = query ? `?${new URLSearchParams(query)}` : "";
  const response = await fetch(`/.netlify/functions/${functionName}${queryString}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function route() {
  const intakeMatch = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/);
  const approvalMatch = window.location.pathname.match(/^\/approve\/([^/]+)\/?$/);
  if (intakeMatch) return { name: "intake", slug: decodeURIComponent(intakeMatch[1]) };
  if (approvalMatch) return { name: "approval", token: decodeURIComponent(approvalMatch[1]) };
  return { name: "mechanic" };
}

function mechanicTopbar(actions = "") {
  return `
    <header class="topbar">
      ${brandLockup()}
      <div class="topbar-actions">${actions}</div>
    </header>
  `;
}

function protectionScreen() {
  const protections = [
    ["AI provides suggestions, not final answers", "Treat every AI result as advisory and confirm it through professional testing."],
    ["Use professional judgment", "The technician and shop make every diagnosis, repair, and safety decision."],
    ["Verify the diagnosis", "Test the system and confirm the actual failure before replacing parts."],
    ["Verify procedures and parts", "Use appropriate service information and confirm fitment for the exact vehicle."],
    ["Verify labor times and specifications", "AI time, torque, capacity, and service-data suggestions are not authoritative."],
    ["Remain responsible for safety", "The technician and shop remain responsible for safe work practices and the vehicle."],
    ["Obtain customer authorization", "The shop is responsible for documenting approval, declined work, and changed scope."],
    ["Do not rely solely on AI for critical information", "Independently verify safety-critical, legal, technical, and manufacturer information."]
  ];
  return `
    <div class="app-shell">
      ${mechanicTopbar('<span class="badge">Mechanic protection</span>')}
      <section class="screen screen-narrow protection-hero">
        <div class="protection-seal"><span aria-hidden="true">◆</span> Professional-use protection</div>
        <p class="eyebrow">Before entering the shop workspace</p>
        <h1>The mechanic stays in control.</h1>
        <p class="lead">Mobile Mechanic AI sits beside the technician to organize information and challenge assumptions. It never replaces training, testing, service information, or professional judgment.</p>
        <div class="warning-box">
          <span aria-hidden="true">⚠</span>
          <span><strong>Important:</strong> Do not use AI output alone to approve a safety-critical repair, condemn an expensive component, or represent an unverified specification as fact.</span>
        </div>
        <form id="protection-form" class="stack-lg mt-18">
          <ul class="check-list">
            ${protections.map(([title, copy], index) => `
              <li>
                <label class="check-item">
                  <input type="checkbox" name="protection" value="${index + 1}" required />
                  <span><strong>${title}</strong><span>${copy}</span></span>
                </label>
              </li>
            `).join("")}
          </ul>
          <label class="check-item">
            <input type="checkbox" name="legal-terms" required />
            <span>
              <strong>I accept the required platform terms</strong>
              <span>Terms of Service, Privacy Policy, Data Collection & Use Policy, subscription terms, AI limitations, and intellectual-property terms. Version ${TERMS_VERSION}.</span>
            </span>
          </label>
          <button id="accept-protections" class="btn btn-primary btn-block" type="submit" disabled>Accept & Continue</button>
          <p class="micro muted">Acceptance time and terms version are stored with the authenticated account when the production backend is connected.</p>
        </form>
      </section>
    </div>
  `;
}

function authScreen(message = "") {
  const login = state.authMode === "login";
  return `
    <div class="app-shell">
      ${mechanicTopbar('<span class="badge">60-day free trial</span>')}
      <section class="screen screen-narrow auth-wrap">
        <div>
          <p class="eyebrow">${login ? "Welcome back" : "Create your shop workspace"}</p>
          <h1>${login ? "Get back to the work." : "Start working smarter."}</h1>
          <p class="lead">${login ? "Sign in to jobs, diagnostics, estimates, and service history." : "Your shop receives its own isolated workspace, permanent shop ID, and customer intake link."}</p>
        </div>
        <div class="card red-edge">
          <div class="card-body stack">
            <div class="auth-tabs" role="tablist" aria-label="Account action">
              <button class="auth-tab ${login ? "active" : ""}" data-action="auth-mode" data-mode="login" type="button">Sign in</button>
              <button class="auth-tab ${login ? "" : "active"}" data-action="auth-mode" data-mode="signup" type="button">Start free trial</button>
            </div>
            ${message ? `<p class="form-error" role="alert">${escapeHtml(message)}</p>` : ""}
            ${login ? loginForm() : signupForm()}
            <div class="warning-box">
              <span aria-hidden="true">🔒</span>
              <span>Production passwords are handled by secure backend authentication. They are never stored in browser JavaScript.</span>
            </div>
            <button class="btn btn-secondary btn-block" data-action="open-demo" type="button">Open clearly labeled local demo</button>
          </div>
        </div>
        <p class="small muted">Solo $29.99 · Shop $69.99 · Pro/Fleet $129.99 after the 60-day trial. Subscription billing is separate from your customers' repair payments.</p>
      </section>
    </div>
  `;
}

function loginForm() {
  return `
    <form id="login-form" class="stack">
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required /></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" minlength="8" required /></label>
      <button class="btn btn-primary btn-block" type="submit">Sign in securely</button>
    </form>
  `;
}

function signupForm() {
  return `
    <form id="signup-form" class="form-grid cols-2">
      <label class="field"><span>Business / shop name</span><input name="shopName" autocomplete="organization" required /></label>
      <label class="field"><span>Owner name</span><input name="ownerName" autocomplete="name" required /></label>
      <label class="field"><span>Owner email</span><input type="email" name="email" autocomplete="email" required /></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="new-password" minlength="10" required /></label>
      <label class="field"><span>Business phone</span><input type="tel" name="phone" autocomplete="tel" required /></label>
      <label class="field"><span>Readable shop slug</span><input name="slug" pattern="[a-z0-9-]{3,40}" placeholder="desert-auto" required /><small>Used in /intake/your-shop</small></label>
      <label class="field"><span>Address / base location</span><input name="address" autocomplete="street-address" required /></label>
      <label class="field"><span>Service area</span><input name="serviceArea" placeholder="Yuma County, AZ" required /></label>
      <label class="field"><span>Labor rate</span><input type="number" name="laborRate" min="0" step="0.01" value="75" required /></label>
      <label class="field"><span>Tax rate %</span><input type="number" name="taxRate" min="0" max="30" step="0.01" value="8.4" required /></label>
      <label class="field"><span>Service-call fee</span><input type="number" name="serviceCallFee" min="0" step="0.01" value="0" /></label>
      <label class="field"><span>Default parts markup %</span><input type="number" name="partsMarkup" min="0" step="0.01" value="25" /></label>
      <label class="field span-all"><span>Plan after trial</span>
        <select name="plan"><option value="solo">Solo · $29.99</option><option value="shop">Shop · $69.99</option><option value="pro">Pro / Fleet · $129.99</option></select>
      </label>
      <button class="btn btn-primary btn-block span-all" type="submit">Create shop & start 60 days free</button>
    </form>
  `;
}

function activeShop() {
  if (state.demo) {
    return { id: "shp_demo_yuma", name: "Desert Auto Mobile Service", slug: "desert-auto", role: "shop_owner", trialDaysRemaining: 52, plan: "shop" };
  }
  return state.session?.activeShop || state.session?.memberships?.[0]?.shop || null;
}

function currentJobs() {
  if (state.demo) return demoJobs;
  return state.dashboardData?.jobs || [];
}

function dashboardShell(content) {
  const shop = activeShop();
  const demoBadge = state.demo ? '<span class="badge demo">Sample data only</span>' : "";
  return `
    <div class="app-shell">
      ${mechanicTopbar(`
        ${demoBadge}
        <button class="icon-btn" data-action="copy-intake" aria-label="Copy customer intake link" title="Copy intake link">↗</button>
      `)}
      <section class="screen with-nav">
        ${state.demo ? '<div class="warning-box mb-14"><span>⚠</span><span><strong>Demo workspace:</strong> Nothing shown here came from a real customer or an AI request. Use it to test the interface only.</span></div>' : ""}
        ${shop ? `<div class="split-row mb-14"><div><p class="eyebrow">${escapeHtml(shop.name || "Shop workspace")}</p><span class="small muted">Shop ID: ${escapeHtml(shop.id || "pending")}</span></div><span class="status-pill green"><span class="status-dot"></span>${Number(shop.trialDaysRemaining ?? 60)} trial days</span></div>` : ""}
        ${content}
      </section>
      ${bottomNav()}
    </div>
  `;
}

function bottomNav() {
  const items = [
    ["today", "⌂", "Today"],
    ["jobs", "▣", "Jobs"],
    ["customers", "◎", "Customers"],
    ["ai", "◆", "AI"],
    ["more", "•••", "More"]
  ];
  return `
    <nav class="bottom-nav" aria-label="Main shop navigation">
      ${items.map(([id, icon, label]) => `
        <button class="nav-btn ${state.activeTab === id ? "active" : ""}" data-action="nav" data-tab="${id}" type="button">
          <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function todayView() {
  const jobs = currentJobs();
  const scheduled = jobs.filter((job) => job.status !== "completed").length;
  const waiting = jobs.filter((job) => job.status === "waiting_authorization").length;
  return dashboardShell(`
    <div class="dashboard-layout">
      <div>
        <p class="eyebrow">Your working surface</p>
        <h1 class="headline-large">What needs your attention?</h1>
        <div class="stat-grid">
          <div class="stat-card"><span>Today's jobs</span><strong>${scheduled}</strong></div>
          <div class="stat-card"><span>Waiting approval</span><strong>${waiting}</strong></div>
          <div class="stat-card"><span>Open estimates</span><strong>${state.demo ? 3 : state.dashboardData?.counts?.openEstimates || 0}</strong></div>
          <div class="stat-card"><span>Unreturned cores</span><strong>${state.demo ? 1 : state.dashboardData?.counts?.openCores || 0}</strong></div>
        </div>
        <div class="section-heading"><h2>Quick actions</h2></div>
        <div class="quick-grid">
          ${quickAction("share-intake", "↗", "Send Intake", "Shop-specific link")}
          ${quickAction("new-job", "+", "New Job", "Returning customer")}
          ${quickAction("nav-ai", "◆", "AI Workup", "Challenge the diagnosis")}
          ${quickAction("schedule", "□", "Schedule", "Confirm availability")}
        </div>
        <div class="section-heading"><h2>Active jobs</h2><button class="text-button" data-action="nav" data-tab="jobs">View all</button></div>
        <div class="stack">
          ${jobs.length ? jobs.slice(0, 4).map(jobCard).join("") : emptyState("No active jobs", "Share the shop intake link to receive a customer request.")}
        </div>
      </div>
      <aside>
        <div class="section-heading mt-0"><h2>Assistant status</h2></div>
        ${assistantStatusCard()}
        <div class="section-heading"><h2>Next steps</h2></div>
        <div class="card"><div class="card-body timeline">
          ${timelineItem("Customer intake", "Information received", "complete")}
          ${timelineItem("AI pre-workup", "Review before testing", "active")}
          ${timelineItem("Technician findings", "Enter actual test results", "")}
          ${timelineItem("Estimate & approval", "Customer authorization required", "")}
          ${timelineItem("Invoice & service record", "Complete after repair", "")}
        </div></div>
      </aside>
    </div>
  `);
}

function quickAction(action, icon, title, subtitle) {
  return `<button class="quick-action" data-action="${escapeHtml(action)}" type="button"><span class="quick-action-icon" aria-hidden="true">${escapeHtml(icon)}</span><span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></span></button>`;
}

function jobCard(job) {
  return `
    <button class="job-card" data-action="open-job" data-job-id="${escapeHtml(job.id)}" type="button">
      <div class="job-top"><span class="job-vehicle">${escapeHtml(job.vehicle.year)} ${escapeHtml(job.vehicle.make)} ${escapeHtml(job.vehicle.model)}</span><span class="status-pill ${job.status === "waiting_authorization" ? "amber" : ""}">${escapeHtml(formatStatus(job.status))}</span></div>
      <div class="job-meta"><span>${escapeHtml(job.customerName)}</span><span>•</span><span>${escapeHtml(job.location || "Location pending")}</span></div>
      <p class="job-complaint">“${escapeHtml(job.complaint)}”</p>
      <div class="job-footer"><span class="small muted">${escapeHtml(job.scheduled || "Unscheduled")}</span><span class="text-button">Open job →</span></div>
    </button>
  `;
}

function emptyState(title, copy) {
  return `<div class="card"><div class="card-body empty-card-body"><h3>${escapeHtml(title)}</h3><p class="small muted flush">${escapeHtml(copy)}</p></div></div>`;
}

function timelineItem(title, subtitle, className) {
  return `<div class="timeline-item ${escapeHtml(className)}"><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></div>`;
}

function assistantStatusCard() {
  const integrations = state.session?.integrations || {};
  const aiConnected = state.demo ? false : Boolean(integrations.openai);
  const supabaseConnected = state.demo ? false : Boolean(integrations.supabase);
  return `
    <div class="card red-edge">
      <div class="card-header"><div class="ai-title"><div class="ai-orb">AI</div><div><strong>Mobile Mechanic AI</strong><span>Advisory assistant</span></div></div><span class="status-pill ${aiConnected ? "green" : "amber"}"><span class="status-dot"></span>${aiConnected ? "Connected" : "Not connected"}</span></div>
      <div class="card-body integration-list">
        ${integrationRow("Secure data backend", "Supabase auth, database, and RLS", supabaseConnected)}
        ${integrationRow("Vehicle VIN decoding", "NHTSA vPIC public data", true)}
        ${integrationRow("CARFAX reporting", "Requires authorized shop connection", false)}
        ${integrationRow("Parts inventory", "No live supplier feed connected", false)}
      </div>
    </div>
  `;
}

function integrationRow(name, detail, connected) {
  return `<div class="integration-row"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(detail)}</span></div><span class="status-pill ${connected ? "green" : "amber"}"><span class="status-dot"></span>${connected ? "Ready" : "Not connected"}</span></div>`;
}

function jobsView() {
  const jobs = currentJobs();
  return dashboardShell(`
    <div class="section-heading mt-0"><div><p class="eyebrow">Jobs</p><h1 class="page-title">Shop work</h1></div><button class="btn btn-primary" data-action="copy-intake" type="button">Send intake</button></div>
    <div class="stack">${jobs.length ? jobs.map(jobCard).join("") : emptyState("No jobs yet", "Customer submissions will appear only inside the correct shop workspace.")}</div>
  `);
}

function customersView() {
  const customers = state.demo
    ? [
        { name: "Michelle R.", phone: "(928) 555-0138", vehicles: ["2018 GMC Acadia Denali"] },
        { name: "Dan M.", phone: "(928) 555-0164", vehicles: ["2016 Chevrolet Sonic LT"] }
      ]
    : state.dashboardData?.customers || [];
  return dashboardShell(`
    <div class="section-heading mt-0"><div><p class="eyebrow">Customers</p><h1 class="page-title">People & vehicles</h1></div><button class="btn btn-primary" data-action="copy-intake" type="button">Add by intake</button></div>
    <div class="grid-2">
      ${customers.length ? customers.map((customer) => `
        <div class="card"><div class="card-body stack"><div class="split-row"><div><h3>${escapeHtml(customer.name)}</h3><span class="small muted">${escapeHtml(customer.phone || "No phone")}</span></div><span class="badge">${customer.vehicles?.length || customer.vehicleCount || 0} vehicle${(customer.vehicles?.length || customer.vehicleCount) === 1 ? "" : "s"}</span></div><div class="small">${(customer.vehicles || []).map(escapeHtml).join("<br>") || "Vehicle records load from the shop workspace."}</div><button class="btn btn-secondary" data-action="new-job" type="button">New job / customer states</button></div></div>
      `).join("") : emptyState("No customer records", "Returning customers and multiple vehicles will stay grouped by shop.")}
    </div>
  `);
}

function aiView() {
  const jobs = currentJobs();
  const selected = jobs.find((job) => job.id === state.selectedJobId) || jobs[0];
  if (selected && !state.selectedJobId) state.selectedJobId = selected.id;
  return dashboardShell(`
    <div class="section-heading mt-0"><div><p class="eyebrow">Diagnostic assistant</p><h1 class="page-title">Ask about this vehicle</h1></div></div>
    ${selected ? `
      <div class="grid-2">
        <div class="stack">
          <div class="card"><div class="card-body stack">
            <label class="field"><span>Active job</span><select id="ai-job-select">${jobs.map((job) => `<option value="${escapeHtml(job.id)}" ${job.id === selected.id ? "selected" : ""}>${escapeHtml(job.vehicle.year)} ${escapeHtml(job.vehicle.make)} ${escapeHtml(job.vehicle.model)} · ${escapeHtml(job.customerName)}</option>`).join("")}</select></label>
            <div><p class="eyebrow">Customer states</p><p class="job-complaint">“${escapeHtml(selected.complaint)}”</p></div>
            <div class="form-grid cols-2">
              <label class="field"><span>Codes</span><input id="ai-codes" value="${escapeHtml((selected.codes || []).join(", "))}" placeholder="P0302, U0101" /></label>
              <label class="field"><span>Expensive part being considered</span><input id="major-component" placeholder="ECM, transmission, turbo…" /></label>
            </div>
            <label class="field"><span>Technician findings / measurements</span><textarea id="ai-findings" placeholder="Enter actual tests, pressures, voltages, scan results…">${escapeHtml((selected.findings || []).join("\\n"))}</textarea></label>
            <button class="btn btn-primary btn-block" data-action="run-ai" data-mode="workup" type="button" ${state.aiBusy ? "disabled" : ""}>${state.aiBusy ? "Preparing workup…" : "Run AI diagnostic workup"}</button>
            <div class="grid-2">
              <button class="btn btn-ghost" data-action="run-ai" data-mode="second_opinion" type="button" ${state.aiBusy ? "disabled" : ""}>AI Second Opinion</button>
              <button class="btn btn-secondary" data-action="run-ai" data-mode="before_replace" type="button" ${state.aiBusy ? "disabled" : ""}>Before You Replace It</button>
            </div>
            ${state.demo ? '<button class="btn btn-secondary" data-action="show-sample-workup" type="button">Show labeled sample output</button>' : ""}
          </div></div>
          <button class="btn btn-secondary" data-action="find-videos" type="button">Find Repair Videos ↗</button>
        </div>
        <div>${renderAiPanel(state.aiResult)}</div>
      </div>
      <div class="section-heading"><h2>Good / Better / Best</h2><span class="small muted">Mechanic controls final scope and price</span></div>
      ${estimateBuilder(selected)}
    ` : emptyState("Choose a job first", "AI receives the selected vehicle and job context so the technician does not repeat the history.")}
  `);
}

function renderAiPanel(result) {
  if (!result) {
    return `
      <div class="ai-panel">
        <div class="ai-panel-header"><div class="ai-title"><div class="ai-orb">AI</div><div><strong>Diagnostic workup</strong><span>Waiting for technician request</span></div></div><span class="status-pill amber">Advisory only</span></div>
        <div class="ai-output"><p class="small muted flush">Run a workup after reviewing the vehicle, customer complaint, codes, and known findings. Live results only appear when the secure AI function confirms a successful request.</p></div>
      </div>
    `;
  }
  const causes = (result.possibleCauses || []).map((item) => `<li><strong>${escapeHtml(item.cause || item)}</strong>${item.reason ? ` — ${escapeHtml(item.reason)}` : ""}</li>`).join("");
  const checklist = (result.diagnosticChecklist || []).map((item, index) => `
    <div class="diagnostic-check"><input type="checkbox" id="diag-${index}" /><label for="diag-${index}"><strong>Test ${index + 1}</strong><br>${escapeHtml(item.step || item.test || item)}</label></div>
  `).join("");
  return `
    <div class="ai-panel">
      <div class="ai-panel-header"><div class="ai-title"><div class="ai-orb">AI</div><div><strong>${result.sample ? "Sample diagnostic workup" : "AI diagnostic workup"}</strong><span>${result.sample ? "No AI request made" : "Review and edit before use"}</span></div></div><span class="status-pill ${result.sample ? "amber" : "green"}">${result.sample ? "Sample" : "Generated"}</span></div>
      <div class="ai-output">
        ${result.summary ? `<p class="small flush">${escapeHtml(result.summary)}</p>` : ""}
        <div class="ai-output-section"><h3>Possible causes</h3><ol>${causes || "<li>No causes returned.</li>"}</ol></div>
        <div class="ai-output-section"><h3>Ordered diagnostic checklist</h3>${checklist || '<p class="small muted">No checklist returned.</p>'}</div>
        <div class="ai-output-section"><h3>Safety / confirmation</h3><ul>${(result.safetyConcerns || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>Technician must identify job-specific hazards.</li>"}</ul></div>
        <div class="ai-output-section"><h3>Possible parts — not authorization</h3><ul>${(result.possibleParts || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>Confirm the failed part and exact fitment first.</li>"}</ul></div>
        <div class="ai-output-section"><h3>Labor / estimate note</h3><p class="small">${escapeHtml(result.laborSuggestion || result.preliminaryEstimate || "Technician sets final labor and price.")}</p></div>
        ${result.customerExplanation ? `<div class="ai-output-section"><h3>Plain-language draft</h3><p class="small">${escapeHtml(result.customerExplanation)}</p></div>` : ""}
        <p class="micro muted flush">${escapeHtml(result.disclaimer || "AI is advisory. Independently verify diagnosis, service information, specifications, parts, labor, and safety.")}</p>
      </div>
    </div>
  `;
}

function estimateBuilder(job) {
  const base = job.estimate || { good: 285, better: 468, best: 642 };
  const optionsData = [
    ["Good", base.good, ["Minimum appropriate confirmed repair", "Required labor and parts", "Shop warranty shown before sending"]],
    ["Better", base.better, ["Recommended complete repair", "Related wear items where justified", "Best balance of value and reliability"]],
    ["Best", base.best, ["More complete or preventive scope", "Premium or OEM-equivalent parts option", "Mechanic-approved additional service"]]
  ];
  return `
    <div class="estimate-grid">
      ${optionsData.map(([name, price, items], index) => `
        <div class="estimate-option ${index === 1 ? "recommended" : ""}">
          <p class="eyebrow">${name}</p>
          <h3>${index === 0 ? "Minimum appropriate" : index === 1 ? "Recommended repair" : "Complete / preventive"}</h3>
          <div class="estimate-price">${money(price)}</div>
          <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
          <button class="btn ${index === 1 ? "btn-primary" : "btn-secondary"} btn-block" data-action="estimate-option" data-option="${name.toLowerCase()}" type="button">Edit ${name} option</button>
        </div>
      `).join("")}
    </div>
    <div class="card mt-12"><div class="card-body split-row"><div><strong>Private profit check</strong><p class="small muted profit-copy">Parts cost, markup, labor revenue, and travel remain shop-only.</p></div><span class="status-pill red">Never shown to customer</span></div></div>
  `;
}

function moreView() {
  const shop = activeShop();
  return dashboardShell(`
    <div class="section-heading mt-0"><div><p class="eyebrow">Shop controls</p><h1 class="page-title">Settings & access</h1></div></div>
    <div class="grid-2">
      <div class="card"><div class="card-header"><div><h3>Shop identity</h3><p class="small muted">Permanent internal ID and editable public slug</p></div><span class="badge">${escapeHtml(shop?.plan || "trial")}</span></div><div class="card-body stack"><label class="field"><span>Shop ID</span><input value="${escapeHtml(shop?.id || "")}" readonly /></label><label class="field"><span>Customer intake URL</span><input value="${escapeHtml(intakeUrl())}" readonly /></label><button class="btn btn-primary" data-action="copy-intake" type="button">Copy intake link</button></div></div>
      <div class="card"><div class="card-header"><div><h3>Technician accounts</h3><p class="small muted">Each technician receives a real invited login</p></div><span class="status-pill amber">Backend required</span></div><div class="card-body stack"><div class="form-grid cols-2"><label class="field"><span>Name</span><input id="invite-name" placeholder="Technician name" /></label><label class="field"><span>Email</span><input id="invite-email" type="email" placeholder="tech@example.com" /></label></div><label class="field"><span>Role</span><select id="invite-role"><option value="technician">Technician</option><option value="manager">Manager</option><option value="service_writer">Service Writer</option></select></label><button class="btn btn-secondary" data-action="invite-tech" type="button">Send secure setup invite</button></div></div>
      <div class="card"><div class="card-header"><div><h3>Integration truth panel</h3><p class="small muted">Outside actions are never reported as complete without confirmation</p></div></div><div class="card-body integration-list">${integrationRow("CARFAX", "Ready / Submitted / Failed / Not Connected", false)}${integrationRow("Customer payments", "Square, PayPal, Venmo, Cash App, Zelle", false)}${integrationRow("Stripe subscriptions", "Platform billing only", false)}${integrationRow("SMS", "Secure customer messages", false)}</div></div>
      <div class="card red-edge"><div class="card-header"><div><h3>Platform administration</h3><p class="small muted">Owner, billing, support, operations, technical, and read-only roles</p></div><span class="status-pill red">Restricted</span></div><div class="card-body stack"><p class="small muted">Production access requires a platform-admin role, re-authentication for sensitive actions, and an activity-log entry.</p><button class="btn btn-ghost" data-action="platform-demo" type="button">View labeled admin layout demo</button></div></div>
    </div>
    <button class="btn btn-secondary btn-block mt-18" data-action="logout" type="button">${state.demo ? "Exit demo" : "Sign out"}</button>
  `);
}

function platformAdminDemo() {
  return dashboardShell(`
    <div class="warning-box mb-14"><span>⚠</span><span><strong>Layout demo only:</strong> These figures are sample data. No shop was suspended, changed, billed, or entered.</span></div>
    <div class="section-heading mt-0"><div><p class="eyebrow">Platform Owner</p><h1 class="page-title">Platform control</h1></div><button class="btn btn-secondary" data-action="close-platform-demo" type="button">Back to shop</button></div>
    <div class="stat-grid">
      <div class="stat-card"><span>Active shops</span><strong>18</strong></div>
      <div class="stat-card"><span>Trials ending</span><strong>4</strong></div>
      <div class="stat-card"><span>Failed payments</span><strong>2</strong></div>
      <div class="stat-card"><span>Sample MRR</span><strong>$1.2k</strong></div>
    </div>
    <div class="section-heading"><h2>Shop controls</h2><span class="status-pill amber">Re-auth required for sensitive actions</span></div>
    <div class="card"><div class="card-body stack">
      ${[
        ["shp_demo_001", "Desert Auto Mobile Service", "Shop", "Trial · 52 days"],
        ["shp_demo_002", "Foothills Roadside Repair", "Solo", "Active"],
        ["shp_demo_003", "Southwest Fleet Service", "Pro / Fleet", "Payment failed"]
      ].map(([id, name, plan, status]) => `<div class="integration-row"><div><strong>${name}</strong><span>${id} · ${plan}</span></div><span class="status-pill ${status.includes("failed") ? "red" : status.includes("Trial") ? "amber" : "green"}">${status}</span></div>`).join("")}
    </div></div>
    <div class="section-heading"><h2>Admin activity log</h2></div>
    <div class="card"><div class="card-body timeline">
      ${timelineItem("Support Admin entered a shop workspace", "Sample event · support purpose required", "complete")}
      ${timelineItem("Operations Admin extended a trial", "Sample event · 7 days", "complete")}
      ${timelineItem("Technical Admin checked integration status", "Sample event · no credentials exposed", "complete")}
    </div></div>
  `);
}

function jobDetailView() {
  const job = currentJobs().find((item) => item.id === state.selectedJobId);
  if (!job) {
    state.selectedJobId = null;
    return jobsView();
  }
  return dashboardShell(`
    <div class="section-heading mt-0"><div><p class="eyebrow">Job record</p><h1 class="page-title">${escapeHtml(job.vehicle.year)} ${escapeHtml(job.vehicle.make)} ${escapeHtml(job.vehicle.model)}</h1></div><button class="btn btn-secondary" data-action="close-job" type="button">Back</button></div>
    <div class="dashboard-layout">
      <div class="stack">
        <div class="card red-edge"><div class="card-header"><div><h3>Customer States</h3><p class="small muted">${escapeHtml(job.customerName)} · ${escapeHtml(job.phone || "")}</p></div><span class="status-pill">${escapeHtml(formatStatus(job.status))}</span></div><div class="card-body"><p class="job-complaint">“${escapeHtml(job.complaint)}”</p></div></div>
        <div class="card"><div class="card-header"><div><h3>Technician findings</h3><p class="small muted">Typed, voice, photos, videos, codes, tests, and measurements</p></div><button class="icon-btn" data-action="voice-findings" title="Dictate findings" type="button">🎙</button></div><div class="card-body stack"><textarea id="job-findings" placeholder="Record actual findings…">${escapeHtml((job.findings || []).join("\\n"))}</textarea><div class="form-grid cols-2"><input placeholder="Diagnostic code" /><input placeholder="Measurement / test result" /></div><button class="btn btn-secondary" type="button" data-action="save-demo-note">Save findings</button></div></div>
        <div class="grid-2">
          <button class="btn btn-primary" data-action="job-to-ai" type="button">Open AI Workup</button>
          <button class="btn btn-secondary" data-action="find-videos" type="button">Find Repair Videos ↗</button>
        </div>
      </div>
      <aside>
        <div class="card"><div class="card-header"><div><h3>Vehicle context</h3><p class="small muted">Automatically included with AI questions</p></div></div><div class="card-body stack">
          <div class="split-row"><span class="small muted">Engine</span><strong>${escapeHtml(job.vehicle.engine || "Not entered")}</strong></div>
          <div class="split-row"><span class="small muted">Trim</span><strong>${escapeHtml(job.vehicle.trim || "Not entered")}</strong></div>
          <div class="split-row"><span class="small muted">Mileage</span><strong>${Number(job.vehicle.mileage || 0).toLocaleString()}</strong></div>
          <div class="split-row"><span class="small muted">Location</span><strong>${escapeHtml(job.location || "Pending")}</strong></div>
        </div></div>
        <div class="section-heading"><h2>Vehicle timeline</h2></div>
        <div class="card"><div class="card-body timeline">${timelineItem("Intake received", job.scheduled || "Received", "complete")}${timelineItem("Diagnosis", "In progress", "active")}${timelineItem("Estimate", "Not authorized", "")}${timelineItem("Invoice", "Not created", "")}${timelineItem("CARFAX status", "Not connected", "")}</div></div>
      </aside>
    </div>
  `);
}

function intakeUrl() {
  const shop = activeShop();
  const slug = shop?.slug || "your-shop";
  const base = `${window.location.origin}/intake/${slug}`;
  return state.demo ? `${base}?demo=1` : base;
}

function intakeScreen(slug) {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const shop = state.intakeShop;
  const shopName = shop?.name || (demo ? "Desert Auto Mobile Service" : titleCaseSlug(slug) || "Shop intake");
  const ready = demo || state.intakeStatus === "ready";
  if (state.intakeSubmitted) return intakeSuccess(shopName, slug, demo);
  return `
    <div class="customer-shell">
      <header class="customer-topbar">
        <div class="customer-brand">
          <div class="customer-brand-mark" aria-hidden="true">MM AI</div>
          <div><strong>${escapeHtml(shopName)}</strong><span>${escapeHtml(shop?.phone || (demo ? "(928) 555-0100 · Demo" : "Customer service request"))}</span></div>
        </div>
      </header>
      <section class="customer-main">
        <p class="eyebrow">Mobile service intake</p>
        <h1>Tell the mechanic what is going on.</h1>
        <p class="lead">Enter the vehicle, location, complaint, and availability once. Your information is routed only to this shop when its secure backend confirms the connection.</p>
        ${demo ? '<div class="notice-light"><strong>Demo intake:</strong> This page saves only a labeled local sample and does not contact a real shop.</div>' : state.intakeStatus === "error" ? '<div class="notice-light"><strong>Intake unavailable:</strong> This shop link is not connected to its secure workspace yet. Nothing can be submitted.</div>' : state.intakeStatus === "loading" ? '<div class="notice-light">Confirming this shop’s secure intake connection…</div>' : ""}
        <form id="intake-form" class="customer-card" data-slug="${escapeHtml(slug)}" data-demo="${demo ? "1" : "0"}">
          <input class="sr-only" name="website" tabindex="-1" autocomplete="off" />
          <input type="hidden" name="formStartedAt" value="${Date.now()}" />
          <div class="customer-section">
            <div class="customer-section-title"><span class="customer-section-number">1</span><h2>Service needed</h2></div>
            <div class="service-type-grid">
              <label class="service-type"><input type="radio" name="serviceType" value="repair" checked /><span><strong>Repair / diagnosis</strong><span>Problem, warning light, maintenance, or repair request</span></span></label>
              <label class="service-type"><input type="radio" name="serviceType" value="pre_purchase" /><span><strong>Pre-purchase inspection</strong><span>Inspect a vehicle before buying it</span></span></label>
            </div>
          </div>
          <div class="customer-section">
            <div class="customer-section-title"><span class="customer-section-number">2</span><h2>Your information</h2></div>
            <div class="form-grid cols-2">
              <label class="field"><span>Name</span><input name="customerName" autocomplete="name" required /></label>
              <label class="field"><span>Phone</span><input type="tel" name="phone" autocomplete="tel" required /></label>
              <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" /></label>
              <label class="field"><span>Preferred contact</span><select name="preferredContact"><option value="text">Text</option><option value="call">Phone call</option><option value="email">Email</option></select></label>
              <label class="field span-all"><span>Service address</span><div class="input-row"><input name="address" autocomplete="street-address" required /><button class="icon-btn" data-action="current-location" type="button" aria-label="Use my current location" title="Use my current location">⌖</button></div><small id="location-status">Use the location button to attach coordinates with permission.</small></label>
              <input type="hidden" name="latitude" /><input type="hidden" name="longitude" />
            </div>
          </div>
          <div class="customer-section">
            <div class="customer-section-title"><span class="customer-section-number">3</span><h2>Vehicle</h2></div>
            <div class="form-grid cols-2">
              <label class="field"><span>VIN</span><div class="input-row"><input name="vin" maxlength="17" autocapitalize="characters" placeholder="Type or scan VIN" /><button class="icon-btn" data-action="vin-lookup" type="button" aria-label="Decode VIN" title="Decode VIN">⌕</button><button class="icon-btn" data-action="capture-vin" type="button" aria-label="Photograph VIN" title="Photograph VIN">▣</button></div><small id="vin-status">NHTSA decoding supports most 1981+ U.S.-market vehicles. Older vehicles may return limited data.</small><input id="vin-photo" class="sr-only" type="file" accept="image/*" capture="environment" /></label>
              <label class="field"><span>License plate</span><div class="input-row"><input name="plate" autocapitalize="characters" /><button class="icon-btn" data-action="plate-info" type="button" aria-label="Plate lookup status" title="Plate lookup status">▣</button></div><small>Plate lookup is clearly marked Not Connected until a legitimate provider is configured.</small></label>
              <label class="field"><span>Year</span><select name="year" id="vehicle-year" required>${yearsOptions()}</select></label>
              <label class="field"><span>Make</span><select name="make" id="vehicle-make" required>${options(Object.keys(vehicleCatalog), "Select make")}</select></label>
              <label class="field"><span>Model</span><select name="model" id="vehicle-model" required>${options(["Other"], "Select model")}</select></label>
              <label class="field"><span>Submodel / trim</span><select name="trim" id="vehicle-trim">${options(["Other"], "Select trim")}</select></label>
              <label class="field"><span>Engine</span><select name="engine" id="vehicle-engine">${options(["Other"], "Select engine")}</select></label>
              <label class="field"><span>Drivetrain</span><select name="drivetrain"><option value="">Select drivetrain</option><option>2WD</option><option>FWD</option><option>RWD</option><option>4WD</option><option>AWD</option><option>Other</option></select></label>
              <label class="field"><span>Mileage</span><input type="number" name="mileage" min="0" step="1" inputmode="numeric" /></label>
            </div>
          </div>
          <div id="seller-section" class="customer-section hidden">
            <div class="customer-section-title"><span class="customer-section-number">4</span><h2>Seller / vehicle owner</h2></div>
            <div class="form-grid cols-2">
              <label class="field"><span>Seller / owner name</span><input name="sellerName" /></label>
              <label class="field"><span>Seller / owner phone</span><input type="tel" name="sellerPhone" /></label>
              <label class="field span-all"><span>Vehicle location</span><input name="vehicleLocation" /></label>
            </div>
          </div>
          <div class="customer-section">
            <div class="customer-section-title"><span class="customer-section-number" id="complaint-number">4</span><h2>Customer States</h2></div>
            <label class="field"><span>Describe the concern in your own words</span><div class="input-row"><textarea name="customerStates" id="customer-states" placeholder="Example: It cranks normally but takes two or three tries to start after driving…" required></textarea><button class="icon-btn" data-action="voice-customer-states" type="button" aria-label="Speak customer complaint" title="Speak complaint">🎙</button></div><small id="voice-status">Voice transcription depends on browser support and microphone permission.</small></label>
          </div>
          <div class="customer-section">
            <div class="customer-section-title"><span class="customer-section-number" id="availability-number">5</span><h2>Availability</h2></div>
            <div class="form-grid cols-2">
              <label class="field"><span>Preferred date</span><input type="date" name="availabilityDate" required /></label>
              <label class="field"><span>Preferred time window</span><select name="availabilityWindow" required><option value="">Choose a window</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Any time</option></select></label>
            </div>
            <p class="small customer-helper">The shop confirms the final appointment. This request does not guarantee a time.</p>
          </div>
          <div class="customer-section stack">
            <label class="service-type"><input type="checkbox" name="customerAccuracy" required /><span><strong>I reviewed this information</strong><span>The information is accurate to the best of my knowledge. I understand AI may assist the shop, but the technician makes final decisions.</span></span></label>
            <p id="intake-error" class="form-error" role="alert"></p>
            <button class="btn btn-primary btn-block" type="submit" ${ready ? "" : "disabled"}>${demo ? "Save demo service request" : "Send securely to this shop"}</button>
            <p class="micro customer-fine-print">Powered by Mobile Mechanic AI · The receiving shop controls its customer records.</p>
          </div>
        </form>
      </section>
    </div>
  `;
}

function intakeSuccess(shopName, slug, demo) {
  return `
    <div class="customer-shell">
      <header class="customer-topbar"><div class="customer-brand"><div class="customer-brand-mark">MM AI</div><div><strong>${escapeHtml(shopName)}</strong><span>Service request</span></div></div></header>
      <section class="customer-main"><div class="customer-card success-panel"><div class="success-icon">✓</div><h1 class="success-title">${demo ? "Demo request saved locally." : "Your request was received."}</h1><p class="lead success-copy">${demo ? "No real shop was contacted and no AI request was made." : "The shop will review your information and contact you to confirm scheduling or next steps."}</p><div class="grid-2 mt-18"><button class="btn btn-light" data-action="add-vehicle" type="button">Add another vehicle</button><button class="btn btn-primary" data-action="new-intake" type="button">New job / Customer States</button></div><p class="micro success-reference">Reference: ${escapeHtml(state.intakeSubmitted?.reference || "pending")}</p></div></section>
    </div>
  `;
}

function approvalScreen() {
  return `
    <div class="customer-shell"><header class="customer-topbar"><div class="customer-brand"><div class="customer-brand-mark">MM AI</div><div><strong>Secure estimate authorization</strong><span>Mobile Mechanic AI</span></div></div></header><section class="customer-main"><div class="notice-light"><strong>Not connected:</strong> This approval token cannot be verified until the secure estimate backend is connected. No approval has been recorded.</div></section></div>
  `;
}

function render() {
  const currentRoute = route();
  if (currentRoute.name === "intake") {
    app.innerHTML = intakeScreen(currentRoute.slug);
    return;
  }
  if (currentRoute.name === "approval") {
    app.innerHTML = approvalScreen();
    return;
  }
  if (!state.accepted) {
    app.innerHTML = protectionScreen();
    return;
  }
  if (!state.demo && !state.session) {
    app.innerHTML = authScreen();
    return;
  }
  if (state.platformDemo) {
    app.innerHTML = platformAdminDemo();
    return;
  }
  if (state.selectedJobId && state.activeTab !== "ai") {
    app.innerHTML = jobDetailView();
    return;
  }
  const views = { today: todayView, jobs: jobsView, customers: customersView, ai: aiView, more: moreView };
  app.innerHTML = (views[state.activeTab] || todayView)();
}

async function loadSession() {
  if (state.demo || !state.accepted || route().name !== "mechanic") return;
  try {
    state.session = await api("session");
    state.dashboardData = await api("dashboard-data", { query: { shop_id: state.session.activeShop?.id || "" } }).catch(() => null);
  } catch {
    state.session = null;
  }
}

async function loadIntakeShop(slug) {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  if (demo) {
    state.intakeShop = { name: "Desert Auto Mobile Service", phone: "(928) 555-0100", slug };
    state.intakeStatus = "ready";
    render();
    return;
  }
  try {
    const result = await api("shop-public", { query: { slug } });
    state.intakeShop = result.shop;
    state.intakeStatus = "ready";
  } catch {
    state.intakeStatus = "error";
  }
  render();
}

async function runAi(mode) {
  const jobs = currentJobs();
  const job = jobs.find((item) => item.id === state.selectedJobId) || jobs[0];
  if (!job) return;
  if (state.demo) {
    toast("Live AI is not called from the demo. Use the labeled sample-output button.");
    return;
  }
  const shop = activeShop();
  const majorComponent = document.querySelector("#major-component")?.value.trim() || "";
  const codes = document.querySelector("#ai-codes")?.value || "";
  const findings = document.querySelector("#ai-findings")?.value || "";
  if (mode === "before_replace" && !majorComponent) {
    toast("Enter the expensive component being considered first.", "error");
    return;
  }
  state.aiBusy = true;
  render();
  try {
    const result = await api("ai-workup", {
      method: "POST",
      body: {
        shopId: shop.id,
        jobId: job.id,
        mode,
        vehicle: job.vehicle,
        complaint: job.complaint,
        codes,
        findings,
        previousRepairs: job.previousRepairs || [],
        majorComponent
      }
    });
    state.aiResult = result.workup;
    toast("AI workup received. Review every item before use.");
  } catch (error) {
    toast(error.message || "AI workup failed.", "error");
  } finally {
    state.aiBusy = false;
    render();
  }
}

function updateVehicleSelectors() {
  const makeSelect = document.querySelector("#vehicle-make");
  const modelSelect = document.querySelector("#vehicle-model");
  const trimSelect = document.querySelector("#vehicle-trim");
  const engineSelect = document.querySelector("#vehicle-engine");
  if (!makeSelect || !modelSelect || !trimSelect || !engineSelect) return;
  const make = makeSelect.value;
  const models = Object.keys(vehicleCatalog[make] || { Other: {} });
  modelSelect.innerHTML = options(models, "Select model");
  trimSelect.innerHTML = options(["Other"], "Select trim");
  engineSelect.innerHTML = options(["Other"], "Select engine");
}

function updateTrimEngine() {
  const make = document.querySelector("#vehicle-make")?.value;
  const model = document.querySelector("#vehicle-model")?.value;
  const data = vehicleCatalog[make]?.[model] || { trims: ["Other"], engines: ["Other"] };
  document.querySelector("#vehicle-trim").innerHTML = options(data.trims || ["Other"], "Select trim");
  document.querySelector("#vehicle-engine").innerHTML = options(data.engines || ["Other"], "Select engine");
}

function startSpeech(targetSelector, statusSelector) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = document.querySelector(statusSelector);
  if (!Recognition) {
    if (status) status.textContent = "Voice transcription is not supported in this browser. Please type the information.";
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  if (status) status.textContent = "Listening…";
  recognition.onresult = (event) => {
    const target = document.querySelector(targetSelector);
    const words = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    if (target) target.value = [target.value.trim(), words].filter(Boolean).join(" ");
    if (status) status.textContent = "Voice transcription added. Review it for accuracy.";
  };
  recognition.onerror = () => {
    if (status) status.textContent = "Voice transcription did not complete. Check microphone permission or type the information.";
  };
  recognition.start();
}

async function submitAuth(form, mode) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.termsVersion = TERMS_VERSION;
  payload.termsAcceptedAt = new Date().toISOString();
  try {
    const result = await api(mode === "login" ? "shop-login" : "shop-signup", { method: "POST", body: payload });
    if (result.requiresEmailConfirmation) {
      state.authMode = "login";
      app.innerHTML = authScreen("Check your email to confirm the account, then sign in to finish creating the shop.");
      return;
    }
    state.session = result.session || result;
    state.dashboardData = await api("dashboard-data", { query: { shop_id: state.session.activeShop?.id || "" } }).catch(() => null);
    render();
  } catch (error) {
    app.innerHTML = authScreen(error.status === 503 ? "Secure shop authentication is not connected yet. Configure Supabase in Netlify, or use the clearly labeled demo." : error.message);
  }
}

async function submitIntake(form) {
  const errorBox = form.querySelector("#intake-error");
  const button = form.querySelector('button[type="submit"]');
  errorBox.textContent = "";
  button.disabled = true;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.slug = form.dataset.slug;
  const demo = form.dataset.demo === "1";
  try {
    if (demo) {
      const queue = JSON.parse(localStorage.getItem("mmi_demo_intakes") || "[]");
      const reference = `DEMO-${Date.now().toString(36).toUpperCase()}`;
      queue.push({ ...payload, reference, demo: true, savedAt: new Date().toISOString() });
      localStorage.setItem("mmi_demo_intakes", JSON.stringify(queue.slice(-10)));
      state.intakeSubmitted = { reference };
    } else {
      const result = await api("customer-intake", { method: "POST", body: payload });
      state.intakeSubmitted = result;
    }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    errorBox.textContent = error.message || "The request was not sent. Please contact the shop directly.";
    button.disabled = false;
  }
}

document.addEventListener("change", (event) => {
  if (event.target.matches('#protection-form input[type="checkbox"]')) {
    const form = event.target.form;
    const all = [...form.querySelectorAll('input[type="checkbox"]')];
    form.querySelector("#accept-protections").disabled = !all.every((input) => input.checked);
  }
  if (event.target.id === "vehicle-make") updateVehicleSelectors();
  if (event.target.id === "vehicle-model") updateTrimEngine();
  if (event.target.name === "serviceType") {
    const ppi = event.target.value === "pre_purchase";
    document.querySelector("#seller-section")?.classList.toggle("hidden", !ppi);
    const number = document.querySelector("#complaint-number");
    if (number) number.textContent = ppi ? "5" : "4";
    const availabilityNumber = document.querySelector("#availability-number");
    if (availabilityNumber) availabilityNumber.textContent = ppi ? "6" : "5";
  }
  if (event.target.id === "ai-job-select") {
    state.selectedJobId = event.target.value;
    state.aiResult = null;
    render();
  }
  if (event.target.id === "vin-photo" && event.target.files?.length) {
    document.querySelector("#vin-status").textContent = "VIN photo captured. OCR is not connected yet; enter the VIN manually and tap decode.";
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "protection-form") {
    const acceptance = { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), localPreAuth: true };
    localStorage.setItem("mmi_terms_acceptance", JSON.stringify(acceptance));
    state.accepted = true;
    render();
    return;
  }
  if (event.target.id === "login-form") await submitAuth(event.target, "login");
  if (event.target.id === "signup-form") await submitAuth(event.target, "signup");
  if (event.target.id === "intake-form") await submitIntake(event.target);
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "auth-mode") {
    state.authMode = button.dataset.mode;
    render();
  }
  if (action === "open-demo") {
    sessionStorage.setItem("mmi_demo", "1");
    state.demo = true;
    state.activeTab = "today";
    render();
  }
  if (action === "nav") {
    state.activeTab = button.dataset.tab;
    state.selectedJobId = null;
    state.platformDemo = false;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (action === "nav-ai") {
    state.activeTab = "ai";
    state.selectedJobId = currentJobs()[0]?.id || null;
    render();
  }
  if (action === "open-job") {
    state.selectedJobId = button.dataset.jobId;
    render();
  }
  if (action === "close-job") {
    state.selectedJobId = null;
    state.activeTab = "jobs";
    render();
  }
  if (action === "job-to-ai") {
    state.activeTab = "ai";
    state.aiResult = null;
    render();
  }
  if (["copy-intake", "share-intake"].includes(action)) {
    const url = intakeUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast("Shop-specific intake link copied.");
    } catch {
      toast(url);
    }
  }
  if (action === "new-job") {
    toast("Use the customer record's New Job / Customer States action. The secure returning-customer endpoint is the next backend connection.");
  }
  if (action === "schedule") toast("Scheduling UI is ready for the next calendar-connection milestone.");
  if (action === "run-ai") await runAi(button.dataset.mode);
  if (action === "show-sample-workup") {
    state.aiResult = structuredClone(demoWorkup);
    render();
  }
  if (action === "find-videos") {
    const job = currentJobs().find((item) => item.id === state.selectedJobId) || currentJobs()[0];
    if (!job) return;
    const query = [job.vehicle.year, job.vehicle.make, job.vehicle.model, job.vehicle.engine, (job.codes || []).join(" "), job.complaint].filter(Boolean).join(" ");
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
  }
  if (action === "estimate-option") toast(`${formatStatus(button.dataset.option)} estimate editor is staged; customer authorization is not recorded from this demo.`);
  if (action === "platform-demo") {
    state.platformDemo = true;
    render();
  }
  if (action === "close-platform-demo") {
    state.platformDemo = false;
    render();
  }
  if (action === "invite-tech") {
    if (state.demo) toast("Demo only — no technician invite was sent.");
    else {
      const name = document.querySelector("#invite-name")?.value.trim();
      const email = document.querySelector("#invite-email")?.value.trim();
      const role = document.querySelector("#invite-role")?.value;
      try {
        await api("invite-technician", { method: "POST", body: { shopId: activeShop().id, name, email, role } });
        toast("Technician setup invite created.");
      } catch (error) {
        toast(error.message, "error");
      }
    }
  }
  if (action === "logout") {
    if (!state.demo) await api("logout", { method: "POST" }).catch(() => null);
    sessionStorage.removeItem("mmi_demo");
    state.demo = false;
    state.session = null;
    state.dashboardData = null;
    state.selectedJobId = null;
    state.activeTab = "today";
    render();
  }
  if (action === "current-location") {
    const status = document.querySelector("#location-status");
    if (!navigator.geolocation) {
      status.textContent = "Geolocation is not supported. Type the service address.";
      return;
    }
    status.textContent = "Requesting location permission…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        document.querySelector('[name="latitude"]').value = coords.latitude.toFixed(6);
        document.querySelector('[name="longitude"]').value = coords.longitude.toFixed(6);
        status.textContent = "Current coordinates attached. Add an address or location description for the technician.";
      },
      () => { status.textContent = "Location was not attached. Allow permission or type the address."; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }
  if (action === "voice-customer-states") startSpeech("#customer-states", "#voice-status");
  if (action === "voice-findings") startSpeech("#job-findings", "#findings-status");
  if (action === "capture-vin") document.querySelector("#vin-photo")?.click();
  if (action === "plate-info") toast("License-plate lookup is Not Connected. No lookup was performed.");
  if (action === "vin-lookup") {
    const vinInput = document.querySelector('[name="vin"]');
    const status = document.querySelector("#vin-status");
    const vin = vinInput.value.trim().toUpperCase();
    if (vin.length < 5) {
      status.textContent = "Enter a VIN before decoding.";
      return;
    }
    status.textContent = "Checking NHTSA vehicle data…";
    try {
      const result = await api("vin-decode", { query: { vin, year: document.querySelector("#vehicle-year")?.value || "" } });
      const vehicle = result.vehicle;
      const year = document.querySelector("#vehicle-year");
      const make = document.querySelector("#vehicle-make");
      if (vehicle.year && [...year.options].some((opt) => opt.value === String(vehicle.year))) year.value = String(vehicle.year);
      if (vehicle.make && [...make.options].some((opt) => opt.value.toLowerCase() === vehicle.make.toLowerCase())) {
        make.value = [...make.options].find((opt) => opt.value.toLowerCase() === vehicle.make.toLowerCase()).value;
        updateVehicleSelectors();
      }
      const model = document.querySelector("#vehicle-model");
      if (vehicle.model && [...model.options].some((opt) => opt.value.toLowerCase() === vehicle.model.toLowerCase())) {
        model.value = [...model.options].find((opt) => opt.value.toLowerCase() === vehicle.model.toLowerCase()).value;
        updateTrimEngine();
      } else if (vehicle.model) {
        model.innerHTML += `<option value="${escapeHtml(vehicle.model)}">${escapeHtml(vehicle.model)}</option>`;
        model.value = vehicle.model;
      }
      if (vehicle.engine) {
        const engine = document.querySelector("#vehicle-engine");
        engine.innerHTML += `<option value="${escapeHtml(vehicle.engine)}">${escapeHtml(vehicle.engine)}</option>`;
        engine.value = vehicle.engine;
      }
      status.textContent = result.message || "Vehicle data returned by NHTSA. Review every field for accuracy.";
    } catch (error) {
      status.textContent = error.message || "VIN lookup did not complete. Enter vehicle information manually.";
    }
  }
  if (["add-vehicle", "new-intake"].includes(action)) {
    state.intakeSubmitted = null;
    render();
  }
  if (action === "save-demo-note") toast(state.demo ? "Demo note saved only in this screen." : "Findings save endpoint is staged for the database milestone.");
});

window.addEventListener("online", () => { offlineBanner.hidden = true; toast("Connection restored."); });
window.addEventListener("offline", () => { offlineBanner.hidden = false; });

async function init() {
  offlineBanner.hidden = navigator.onLine;
  const currentRoute = route();
  if (currentRoute.name === "intake") {
    render();
    await loadIntakeShop(currentRoute.slug);
  } else {
    render();
    await loadSession();
    render();
  }
  if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => null);
  }
}

init();
