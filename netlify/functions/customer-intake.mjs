import {
  cleanEmail,
  cleanSlug,
  cleanText,
  json,
  methodNotAllowed,
  parseBody,
  safeError,
  supabaseRequest
} from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed(["POST"]);
  try {
    const body = parseBody(event);
    if (cleanText(body.website, 20)) return json(202, { received: true });
    const startedAt = Number(body.formStartedAt || 0);
    if (!startedAt || Date.now() - startedAt < 1500) return json(400, { error: "Please review the form before sending." });

    const slug = cleanSlug(body.slug);
    const customerName = cleanText(body.customerName, 120);
    const phone = cleanText(body.phone, 40);
    const complaint = cleanText(body.customerStates, 4000);
    const year = cleanText(body.year, 10);
    const make = cleanText(body.make, 80);
    const model = cleanText(body.model, 100);
    if (!slug || !customerName || !phone || !complaint || !year || !make || !model) {
      return json(400, { error: "Complete the customer, vehicle, and Customer States fields." });
    }

    const payload = {
      service_type: body.serviceType === "pre_purchase" ? "pre_purchase" : "repair",
      customer: {
        name: customerName,
        phone,
        email: cleanEmail(body.email) || null,
        address: cleanText(body.address, 240),
        preferred_contact: ["text", "call", "email"].includes(body.preferredContact) ? body.preferredContact : "text"
      },
      vehicle: {
        year,
        make,
        model,
        trim: cleanText(body.trim, 100),
        engine: cleanText(body.engine, 100),
        drivetrain: cleanText(body.drivetrain, 30),
        vin: cleanText(body.vin, 17).toUpperCase(),
        plate: cleanText(body.plate, 20).toUpperCase(),
        mileage: Math.max(0, Number(body.mileage || 0))
      },
      request: {
        customer_states: complaint,
        address: cleanText(body.address, 240),
        latitude: Number(body.latitude) || null,
        longitude: Number(body.longitude) || null,
        availability_date: cleanText(body.availabilityDate, 20),
        availability_window: cleanText(body.availabilityWindow, 40),
        seller_name: cleanText(body.sellerName, 120),
        seller_phone: cleanText(body.sellerPhone, 40),
        vehicle_location: cleanText(body.vehicleLocation, 240)
      }
    };

    const result = await supabaseRequest("/rest/v1/rpc/create_public_intake", {
      method: "POST",
      service: true,
      body: { p_shop_slug: slug, p_payload: payload }
    });
    const created = Array.isArray(result) ? result[0] : result;
    return json(201, { received: true, reference: created?.reference, jobId: created?.job_id });
  } catch (error) {
    return safeError(error);
  }
}
