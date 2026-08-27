import {
  cleanText,
  json,
  methodNotAllowed,
  parseBody,
  requireShopMember,
  safeError,
  supabaseRequest
} from "./_shared.mjs";

const allowedModes = new Set(["workup", "second_opinion", "before_replace", "customer_explanation", "inspection_summary"]);

function extractOutputText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function parseWorkup(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  const arrayFields = ["possibleCauses", "diagnosticChecklist", "safetyConcerns", "possibleParts", "confirmationTests", "commonlyMisdiagnosed"];
  for (const field of arrayFields) {
    if (!Array.isArray(parsed[field])) parsed[field] = [];
    parsed[field] = parsed[field].slice(0, 12);
  }
  parsed.summary = cleanText(parsed.summary, 1600);
  parsed.laborSuggestion = cleanText(parsed.laborSuggestion, 1000);
  parsed.preliminaryEstimate = cleanText(parsed.preliminaryEstimate, 1000);
  parsed.customerExplanation = cleanText(parsed.customerExplanation, 1800);
  parsed.disclaimer = cleanText(parsed.disclaimer, 700) || "Advisory only. The technician must verify the diagnosis, procedure, parts, labor, specifications, and safety information.";
  return parsed;
}

function modeInstruction(mode, component) {
  if (mode === "second_opinion") {
    return "Challenge the current thinking. Identify overlooked causes, misleading evidence, common misdiagnoses, and the tests that should happen before any part is replaced.";
  }
  if (mode === "before_replace") {
    return `Focus on confirmation tests required before condemning or quoting this expensive component: ${component}. Explain what could mimic its failure.`;
  }
  if (mode === "customer_explanation") {
    return "Translate the verified technician findings into plain language. Do not add unverified facts or claim the repair is approved.";
  }
  if (mode === "inspection_summary") {
    return "Organize the technician's findings into GOOD, MONITOR, NEEDS ATTENTION, and SAFETY CONCERN categories. Do not invent findings.";
  }
  return "Prepare an ordered diagnostic pre-workup that starts with information gathering and confirmation tests, not parts replacement.";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  try {
    if (!process.env.OPENAI_API_KEY) return json(503, { error: "AI provider is Not Connected." });
    const body = parseBody(event);
    const shopId = cleanText(body.shopId, 80);
    const jobId = cleanText(body.jobId, 80);
    const mode = allowedModes.has(body.mode) ? body.mode : "workup";
    const session = await requireShopMember(event, shopId, ["shop_owner", "manager", "technician", "service_writer"]);
    const vehicle = {
      year: cleanText(body.vehicle?.year, 10),
      make: cleanText(body.vehicle?.make, 80),
      model: cleanText(body.vehicle?.model, 100),
      trim: cleanText(body.vehicle?.trim, 100),
      engine: cleanText(body.vehicle?.engine, 100),
      mileage: Math.max(0, Number(body.vehicle?.mileage || 0))
    };
    const complaint = cleanText(body.complaint, 5000);
    const codes = cleanText(body.codes, 1200);
    const findings = cleanText(body.findings, 7000);
    const majorComponent = cleanText(body.majorComponent, 160);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      return json(400, { error: "A valid shop job is required for an AI workup." });
    }
    if (!vehicle.make || !vehicle.model || !complaint) return json(400, { error: "Vehicle and Customer States are required for an AI workup." });
    if (mode === "before_replace" && !majorComponent) return json(400, { error: "Enter the major component being considered." });

    const instructions = [
      "You are Mobile Mechanic AI, an advisory assistant for a professional automotive technician.",
      "Never claim certainty, customer authorization, parts fitment, live inventory, CARFAX submission, or an outside action.",
      "Do not provide an unverified torque value, fluid capacity, refrigerant amount, labor time, or safety specification as authoritative.",
      "Separate known facts from hypotheses. Prefer tests that reduce unnecessary parts replacement.",
      "Flag safety issues, but do not claim authority to hold a vehicle.",
      modeInstruction(mode, majorComponent),
      "Return JSON only with these keys: summary, possibleCauses (array of objects with cause, priority, reason), diagnosticChecklist (array of objects with step, expectedResult, meaning), safetyConcerns (array of strings), possibleParts (array of strings), confirmationTests (array of strings), commonlyMisdiagnosed (array of strings), laborSuggestion, preliminaryEstimate, customerExplanation, disclaimer."
    ].join(" ");

    const context = {
      requestMode: mode,
      vehicle,
      customerStates: complaint,
      diagnosticCodes: codes || "None entered",
      technicianFindings: findings || "None entered",
      previousRepairs: Array.isArray(body.previousRepairs) ? body.previousRepairs.slice(0, 20) : [],
      majorComponentBeingConsidered: majorComponent || null,
      shopContext: { shopId, requestingUserRole: session.membership.role }
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        reasoning: { effort: "low" },
        instructions,
        input: JSON.stringify(context),
        max_output_tokens: 3500,
        store: false
      })
    });
    const result = await response.json();
    if (!response.ok) {
      const message = response.status === 429
        ? "AI usage limit reached. Try again shortly or check the platform account."
        : "The AI provider could not complete this workup.";
      throw Object.assign(new Error(message), { statusCode: response.status === 429 ? 429 : 502 });
    }
    const outputText = extractOutputText(result);
    if (!outputText) throw Object.assign(new Error("The AI provider returned no usable workup."), { statusCode: 502 });
    let workup;
    try {
      workup = parseWorkup(outputText);
    } catch {
      throw Object.assign(new Error("The AI workup could not be validated. Run it again."), { statusCode: 502 });
    }
    await supabaseRequest("/rest/v1/ai_workups", {
      method: "POST",
      token: session.accessToken,
      headers: { Prefer: "return=minimal" },
      body: {
        shop_id: shopId,
        job_id: jobId,
        requested_by: session.user.id,
        mode,
        model: result.model || process.env.OPENAI_MODEL || "configured",
        input_snapshot: context,
        output: workup,
        advisory_acknowledged: false
      }
    });
    return json(200, { workup, model: result.model || process.env.OPENAI_MODEL || "configured" }, { cookies: session.responseCookies });
  } catch (error) {
    return safeError(error);
  }
}
