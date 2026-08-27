import { cleanText, json, methodNotAllowed, safeError } from "./_shared.mjs";

function pick(result, keys) {
  for (const key of keys) {
    const value = cleanText(result?.[key], 120);
    if (value && !["Not Applicable", "0", "N/A"].includes(value)) return value;
  }
  return "";
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  try {
    const vin = cleanText(event.queryStringParameters?.vin, 17).toUpperCase();
    const year = cleanText(event.queryStringParameters?.year, 4);
    if (!/^[A-HJ-NPR-Z0-9*]{5,17}$/.test(vin)) {
      return json(400, { error: "Enter a valid VIN using 5–17 letters or numbers. I, O, and Q are not used in standard VINs." });
    }
    const params = new URLSearchParams({ format: "json" });
    if (/^\d{4}$/.test(year)) params.set("modelyear", year);
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "Mobile-Mechanic-AI/1.0" }
    });
    if (!response.ok) throw Object.assign(new Error("NHTSA VIN service did not respond successfully."), { statusCode: 502 });
    const data = await response.json();
    const result = data?.Results?.[0];
    if (!result) throw Object.assign(new Error("No vehicle data was returned for that VIN."), { statusCode: 404 });
    const errorCode = cleanText(result.ErrorCode, 50);
    const decoded = {
      year: pick(result, ["ModelYear"]),
      make: pick(result, ["Make"]),
      model: pick(result, ["Model"]),
      trim: pick(result, ["Trim", "Series", "Series2"]),
      engine: [pick(result, ["DisplacementL"]), pick(result, ["EngineConfiguration"]), pick(result, ["FuelTypePrimary"])].filter(Boolean).join(" · "),
      driveType: pick(result, ["DriveType"]),
      bodyClass: pick(result, ["BodyClass"]),
      manufacturer: pick(result, ["Manufacturer"])
    };
    const useful = Object.values(decoded).some(Boolean);
    if (!useful) return json(404, { error: "NHTSA could not identify this VIN. Enter the vehicle information manually." });
    return json(200, {
      source: "NHTSA vPIC",
      vehicle: decoded,
      message: errorCode && errorCode !== "0"
        ? "NHTSA returned partial vehicle data. Review and correct every field."
        : "Vehicle data returned by NHTSA. Review every field before saving."
    });
  } catch (error) {
    return safeError(error);
  }
}
