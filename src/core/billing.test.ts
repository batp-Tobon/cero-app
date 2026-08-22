import { describe, expect, it } from "vitest";
import {
  planAllows,
  resolveBillingEntitlement,
  type EntitlementPlan,
} from "./billing";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const free: EntitlementPlan = {
  code: "free",
  features: { credits: 2, csv_export: false },
};
const pro: EntitlementPlan = {
  code: "pro",
  features: { credits: -1, csv_export: true },
};

describe("resolveBillingEntitlement", () => {
  it("mantiene lectura pero no nuevas escrituras si falta la prueba", () => {
    const result = resolveBillingEntitlement({ isAdmin: false, freePlan: free, now: NOW });
    expect(result).toMatchObject({ tier: "free", canRead: true, canWrite: false, reason: "trial_expired" });
  });

  it("da acceso total al administrador", () => {
    const result = resolveBillingEntitlement({ isAdmin: true, freePlan: free, now: NOW });
    expect(result).toMatchObject({ canRead: true, canWrite: true, reason: "administrator" });
  });

  it("activa una prueba vigente", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: {
        status: "trialing",
        plan: pro,
        trialEndsAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({ tier: "pro", canWrite: true, reason: "trial_active" });
  });

  it("deja lectura y exportación al vencer una prueba", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: {
        status: "trialing",
        plan: pro,
        trialEndsAt: "2026-08-20T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({ canRead: true, canExport: true, canWrite: false });
  });

  it("mantiene activa una suscripción dentro de su periodo", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: {
        status: "active",
        plan: pro,
        currentPeriodEnd: "2026-09-22T00:00:00.000Z",
      },
    });
    expect(result.reason).toBe("subscription_active");
    expect(result.canWrite).toBe(true);
  });

  it("no considera ilimitada una suscripción paga sin periodo", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: { status: "active", plan: pro },
    });
    expect(result).toMatchObject({ canWrite: false, reason: "subscription_missing_period" });
  });

  it("respeta la gracia de un pago vencido", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: {
        status: "past_due",
        plan: pro,
        graceEndsAt: "2026-08-25T00:00:00.000Z",
      },
    });
    expect(result).toMatchObject({ canWrite: true, reason: "payment_grace" });
  });

  it("conserva acceso hasta el final de una cancelación programada", () => {
    const result = resolveBillingEntitlement({
      isAdmin: false,
      freePlan: free,
      now: NOW,
      subscription: {
        status: "canceled",
        plan: pro,
        currentPeriodEnd: "2026-08-31T00:00:00.000Z",
      },
    });
    expect(result.reason).toBe("cancellation_scheduled");
  });
});

describe("planAllows", () => {
  it("entiende límites, ilimitado y banderas", () => {
    const result = resolveBillingEntitlement({ isAdmin: true, freePlan: pro, now: NOW });
    expect(planAllows(result, "credits")).toBe(true);
    expect(planAllows(result, "csv_export")).toBe(true);
    expect(planAllows(result, "missing")).toBe(false);
  });
});
