import { json, methodNotAllowed, requireShopMember, safeError, supabaseRequest } from "./_shared.mjs";

export async function handler(event) {
  if (event.httpMethod !== "GET") return methodNotAllowed(["GET"]);
  try {
    const shopId = String(event.queryStringParameters?.shop_id || "");
    if (!shopId) return json(400, { error: "Shop is required." });
    const session = await requireShopMember(event, shopId);
    const encodedShop = encodeURIComponent(shopId);
    const [jobs, customers, estimates, cores] = await Promise.all([
      supabaseRequest(`/rest/v1/jobs?select=id,status,customer_states,location_text,scheduled_start,created_at,customers(name,phone),vehicles(year,make,model,trim,engine,mileage)&shop_id=eq.${encodedShop}&status=neq.completed&order=created_at.desc&limit=50`, { token: session.accessToken }),
      supabaseRequest(`/rest/v1/customers?select=id,name,phone,email,vehicles(id,year,make,model,trim)&shop_id=eq.${encodedShop}&order=updated_at.desc&limit=50`, { token: session.accessToken }),
      supabaseRequest(`/rest/v1/estimates?select=id&shop_id=eq.${encodedShop}&status=in.(draft,sent,viewed)&limit=100`, { token: session.accessToken }),
      supabaseRequest(`/rest/v1/core_charges?select=id&shop_id=eq.${encodedShop}&status=eq.pending&limit=100`, { token: session.accessToken })
    ]);

    return json(200, {
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        customerName: job.customers?.name || "Customer",
        phone: job.customers?.phone || "",
        vehicle: job.vehicles || {},
        complaint: job.customer_states || "",
        location: job.location_text || "",
        scheduled: job.scheduled_start ? new Date(job.scheduled_start).toLocaleString("en-US") : "Unscheduled",
        codes: [],
        findings: []
      })),
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        vehicleCount: customer.vehicles?.length || 0,
        vehicles: (customer.vehicles || []).map((vehicle) => [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "))
      })),
      counts: { openEstimates: estimates.length, openCores: cores.length }
    }, { cookies: session.responseCookies });
  } catch (error) {
    return safeError(error);
  }
}
