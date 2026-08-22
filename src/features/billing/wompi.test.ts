import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Wompi", () => {
  it("firma el checkout en servidor con monto en centavos", async () => {
    vi.stubEnv("NEXT_PUBLIC_WOMPI_PUBLIC_KEY", "pub_test_public");
    vi.stubEnv("WOMPI_INTEGRITY_SECRET", "test_integrity_secret");
    const { buildWompiCheckoutUrl } = await import("./wompi");
    const reference = `cero_${"a".repeat(32)}`;
    const url = new URL(
      buildWompiCheckoutUrl({
        reference,
        amountInCents: 1_000_000,
        redirectUrl: "https://cero.example/suscripcion?pago=procesando",
        customerEmail: "cliente@example.com",
      }),
    );
    const expected = createHash("sha256")
      .update(`${reference}1000000COPtest_integrity_secret`)
      .digest("hex");

    expect(url.origin + url.pathname).toBe("https://checkout.wompi.co/p/");
    expect(url.searchParams.get("signature:integrity")).toBe(expected);
    expect(url.searchParams.get("amount-in-cents")).toBe("1000000");
  });

  it("valida las propiedades variables de un evento firmado", async () => {
    vi.stubEnv("WOMPI_EVENTS_SECRET", "test_events_secret");
    const { verifyWompiEvent, parseWompiTransaction } = await import("./wompi");
    const payload = {
      event: "transaction.updated",
      data: {
        transaction: {
          id: "tx-123",
          status: "APPROVED",
          amount_in_cents: 1_000_000,
          currency: "COP",
          reference: `cero_${"b".repeat(32)}`,
        },
      },
      environment: "test",
      timestamp: 1_777_000_000,
      signature: {
        properties: [
          "transaction.id",
          "transaction.status",
          "transaction.amount_in_cents",
        ],
        checksum: "",
      },
    };
    payload.signature.checksum = createHash("sha256")
      .update("tx-123APPROVED10000001777000000test_events_secret")
      .digest("hex");

    expect(verifyWompiEvent(payload)).toBe(true);
    expect(parseWompiTransaction(payload)).toMatchObject({
      id: "tx-123",
      status: "APPROVED",
      amountInCents: 1_000_000,
    });

    payload.data.transaction.amount_in_cents = 999;
    expect(verifyWompiEvent(payload)).toBe(false);
  });

  it("rechaza referencias no persistidas por CERO", async () => {
    const { parseWompiTransaction } = await import("./wompi");
    expect(
      parseWompiTransaction({
        data: {
          transaction: {
            id: "tx-1",
            status: "APPROVED",
            amount_in_cents: 1_000_000,
            currency: "COP",
            reference: "usuario__plan__monto",
          },
        },
      }),
    ).toBeNull();
  });
});
