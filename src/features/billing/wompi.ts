import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { billingConfig } from "@/features/billing/config";

const CHECKOUT_URL = "https://checkout.wompi.co/p/";
const CURRENCY = "COP";

export interface WompiEventPayload {
  event?: unknown;
  data?: { transaction?: Record<string, unknown> };
  environment?: unknown;
  signature?: { properties?: unknown; checksum?: unknown };
  timestamp?: unknown;
  sent_at?: unknown;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function valueAtPath(value: unknown, path: string): string {
  let current = value;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  return current == null ? "" : String(current);
}

export function buildWompiReference(): string {
  return `cero_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function buildWompiCheckoutUrl(input: {
  reference: string;
  amountInCents: number;
  redirectUrl: string;
  customerEmail?: string;
}): string {
  const signature = sha256(
    `${input.reference}${input.amountInCents}${CURRENCY}${billingConfig.wompiIntegritySecret}`,
  );
  const query = new URLSearchParams({
    "public-key": billingConfig.wompiPublicKey,
    currency: CURRENCY,
    "amount-in-cents": String(input.amountInCents),
    reference: input.reference,
    "signature:integrity": signature,
    "redirect-url": input.redirectUrl,
  });
  if (input.customerEmail) {
    query.set("customer-data:email", input.customerEmail);
  }
  return `${CHECKOUT_URL}?${query.toString()}`;
}

export function verifyWompiEvent(payload: WompiEventPayload): boolean {
  const properties = payload.signature?.properties;
  const supplied = payload.signature?.checksum;
  if (
    !Array.isArray(properties) ||
    properties.length === 0 ||
    properties.length > 20 ||
    properties.some((item) => typeof item !== "string" || item.length > 100) ||
    typeof supplied !== "string" ||
    !/^[0-9a-f]{64}$/i.test(supplied) ||
    !billingConfig.wompiEventsSecret
  ) {
    return false;
  }

  const material =
    properties.map((path) => valueAtPath(payload.data, path)).join("") +
    String(payload.timestamp ?? "") +
    billingConfig.wompiEventsSecret;
  const calculated = Buffer.from(sha256(material), "hex");
  const expected = Buffer.from(supplied, "hex");
  return calculated.length === expected.length && timingSafeEqual(calculated, expected);
}

export function parseWompiTransaction(payload: WompiEventPayload) {
  const transaction = payload.data?.transaction;
  if (!transaction) return null;

  const id = String(transaction.id ?? "");
  const reference = String(transaction.reference ?? "");
  const status = String(transaction.status ?? "").toUpperCase();
  const currency = String(transaction.currency ?? "").toUpperCase();
  const amountInCents = Number(transaction.amount_in_cents);
  if (
    id.length < 2 ||
    id.length > 200 ||
    !/^cero_[a-f0-9]{32}$/.test(reference) ||
    !Number.isSafeInteger(amountInCents) ||
    amountInCents <= 0 ||
    currency !== CURRENCY
  ) {
    return null;
  }

  return { id, reference, status, currency, amountInCents };
}

export function wompiEventIdentity(rawBody: string): {
  eventId: string;
  payloadSha256: string;
} {
  const payloadSha256 = sha256(rawBody);
  return { eventId: payloadSha256, payloadSha256 };
}
