import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { handler as aiWorkup } from "../netlify/functions/ai-workup.mjs";
import { handler as customerIntake } from "../netlify/functions/customer-intake.mjs";
import { handler as logout } from "../netlify/functions/logout.mjs";
import { handler as session } from "../netlify/functions/session.mjs";
import { handler as shopSignup } from "../netlify/functions/shop-signup.mjs";
import { handler as vinDecode } from "../netlify/functions/vin-decode.mjs";

for (const key of ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  delete process.env[key];
}

function bodyOf(response) {
  return JSON.parse(response.body);
}

const netlifyConfig = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");

assert.match(netlifyConfig, /publish\s*=\s*"public"/);
assert.match(gitignore, /^\.env\.\*$/m);
assert.match(appSource, /Mechanic protection/i);
assert.match(appSource, /AI Second Opinion/);
assert.match(appSource, /Before You Replace It/);
assert.match(appSource, /Good \/ Better \/ Best/);
assert.match(schema, /enable row level security/);
assert.match(schema, /vehicles_customer_tenant_fk/);
assert.match(schema, /valid_invitation\.id is null/);

const invalidVin = await vinDecode({ httpMethod: "GET", queryStringParameters: { vin: "IOQ" } });
assert.equal(invalidVin.statusCode, 400);
assert.match(bodyOf(invalidVin).error, /valid VIN/i);

const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  async json() {
    return {
      Results: [{
        ErrorCode: "0",
        ModelYear: "2016",
        Make: "CHEVROLET",
        Model: "Sonic",
        Trim: "LT",
        DisplacementL: "1.8",
        EngineConfiguration: "In-Line",
        FuelTypePrimary: "Gasoline",
        DriveType: "FWD"
      }]
    };
  }
});
const decodedVin = await vinDecode({
  httpMethod: "GET",
  queryStringParameters: { vin: "1G1JC5244R7252367" }
});
assert.equal(decodedVin.statusCode, 200);
assert.equal(bodyOf(decodedVin).source, "NHTSA vPIC");
assert.equal(bodyOf(decodedVin).vehicle.model, "Sonic");
globalThis.fetch = nativeFetch;

const disconnectedAi = await aiWorkup({ httpMethod: "POST", headers: {}, body: "{}" });
assert.equal(disconnectedAi.statusCode, 503);
assert.match(bodyOf(disconnectedAi).error, /Not Connected/);

const tooFast = await customerIntake({
  httpMethod: "POST",
  body: JSON.stringify({ formStartedAt: Date.now() })
});
assert.equal(tooFast.statusCode, 400);

const anonymousSession = await session({ httpMethod: "GET", headers: {} });
assert.equal(anonymousSession.statusCode, 401);

const signedOut = await logout({ httpMethod: "POST" });
assert.equal(signedOut.statusCode, 200);
assert.equal(bodyOf(signedOut).signedOut, true);
assert.ok(signedOut.multiValueHeaders?.["Set-Cookie"]?.every((value) => value.includes("Max-Age=0")));

const wrongMethod = await shopSignup({ httpMethod: "GET" });
assert.equal(wrongMethod.statusCode, 405);

process.env.OPENAI_API_KEY = "test-openai-key";
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
let persistedWorkup = null;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  let data;
  if (target.endsWith("/auth/v1/user")) {
    data = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", user_metadata: {} };
  } else if (target.includes("/rest/v1/shop_members?")) {
    data = [{
      shop_id: "shp_testshop001",
      role: "shop_owner",
      status: "active",
      shops: { id: "shp_testshop001", name: "Test Shop", slug: "test-shop", plan: "solo" }
    }];
  } else if (target === "https://api.openai.com/v1/responses") {
    data = {
      model: "gpt-test",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            summary: "Test the circuit before replacing parts.",
            possibleCauses: [{ cause: "Connection fault", priority: "High", reason: "Needs testing" }],
            diagnosticChecklist: [{ step: "Inspect and measure", expectedResult: "Verified result", meaning: "Continue diagnosis" }],
            safetyConcerns: [],
            possibleParts: [],
            confirmationTests: ["Confirm power and ground"],
            commonlyMisdiagnosed: [],
            laborSuggestion: "Technician sets labor.",
            preliminaryEstimate: "Diagnosis first.",
            customerExplanation: "Testing is needed.",
            disclaimer: "Advisory only."
          })
        }]
      }]
    };
  } else if (target.endsWith("/rest/v1/ai_workups")) {
    persistedWorkup = JSON.parse(options.body);
    data = null;
  } else {
    throw new Error(`Unexpected mocked request: ${target}`);
  }
  return {
    ok: true,
    status: 200,
    async json() { return data; },
    async text() { return data === null ? "" : JSON.stringify(data); }
  };
};

const liveAi = await aiWorkup({
  httpMethod: "POST",
  headers: { cookie: "mmi_at=access-token" },
  body: JSON.stringify({
    shopId: "shp_testshop001",
    jobId: "22222222-2222-4222-8222-222222222222",
    mode: "workup",
    vehicle: { year: "2016", make: "Chevrolet", model: "Sonic", engine: "1.8L", mileage: 120000 },
    complaint: "Cranks but does not start."
  })
});
assert.equal(liveAi.statusCode, 200);
assert.equal(bodyOf(liveAi).model, "gpt-test");
assert.equal(persistedWorkup.shop_id, "shp_testshop001");
assert.equal(persistedWorkup.job_id, "22222222-2222-4222-8222-222222222222");
assert.equal(persistedWorkup.requested_by, "11111111-1111-4111-8111-111111111111");

globalThis.fetch = nativeFetch;
for (const key of ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_ANON_KEY"]) delete process.env[key];

console.log("Mobile Mechanic AI smoke checks passed.");
