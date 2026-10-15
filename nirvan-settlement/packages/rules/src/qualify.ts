export type LineStatus = "open" | "blocked" | "qualified" | "packed";

export interface QualifyInput {
  isPlatformOwn: boolean;
  vendorId: string | null;
  fulfilledAt: Date | null;
  returnWindowEndsAt: Date | null;
  hasOpenAdjustment: boolean;
  now: Date;
}

export interface QualifyResult {
  qualified: boolean;
  status: Exclude<LineStatus, "packed">;
  reason: string;
}

/**
 * Qualified only after fulfilment, after the return window, with a vendor,
 * and with no open refund / chargeback / dispute.
 * Comparison is strict: `now > returnWindowEndsAt`.
 */
export function qualifyLine(input: QualifyInput): QualifyResult {
  if (input.isPlatformOwn) {
    return { qualified: false, status: "blocked", reason: "platform_own" };
  }
  if (!input.vendorId) {
    return { qualified: false, status: "blocked", reason: "no_vendor" };
  }
  if (!input.fulfilledAt) {
    return { qualified: false, status: "open", reason: "not_fulfilled" };
  }
  if (!input.returnWindowEndsAt || input.now.getTime() <= input.returnWindowEndsAt.getTime()) {
    return { qualified: false, status: "blocked", reason: "return_window" };
  }
  if (input.hasOpenAdjustment) {
    return { qualified: false, status: "blocked", reason: "open_adjustment" };
  }
  return { qualified: true, status: "qualified", reason: "ok" };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function returnWindowEndsAt(fulfilledAt: Date, returnWindowDays = 14): Date {
  return addDays(fulfilledAt, returnWindowDays);
}

/** True only when the line can enter a payable settlement pack. */
export function isQualified(input: QualifyInput): boolean {
  return qualifyLine(input).qualified;
}
