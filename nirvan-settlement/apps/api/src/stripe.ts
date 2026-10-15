import type { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import type { AppConfig } from "./config.ts";
import type { TransferGateway, TransferRequest } from "./types.ts";

export function createStripeGateway(config: AppConfig): TransferGateway {
  if (!config.stripeSecretKey) {
    return new SimulatedGateway();
  }
  if (!config.stripeSecretKey.startsWith("sk_test_") && !config.stripeSecretKey.startsWith("rk_test_")) {
    throw new Error("Stripe gateway refuses a non-test key.");
  }
  const stripe = new Stripe(config.stripeSecretKey);
  return {
    mode: "stripe-test",
    async availableAed() {
      const balance = await stripe.balance.retrieve();
      const aed = balance.available.find((entry) => entry.currency === "aed");
      return aed ? aed.amount / 100 : 0;
    },
    async createTransfer(input: TransferRequest) {
      const transfer = await stripe.transfers.create(
        {
          amount: input.amountFils,
          currency: input.currency,
          destination: input.destination,
          transfer_group: input.transferGroup,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: transfer.id };
    },
  };
}

export class SimulatedGateway implements TransferGateway {
  mode = "simulated" as const;
  calls: TransferRequest[] = [];
  failNext = false;
  balance = 1_000_000;
  private results = new Map<string, { id: string }>();

  async availableAed(): Promise<number | null> {
    return this.balance;
  }

  async createTransfer(input: TransferRequest): Promise<{ id: string }> {
    if (this.failNext || input.destination.includes("invalid")) {
      this.failNext = false;
      throw new Error("invalid_destination");
    }
    const existing = this.results.get(input.idempotencyKey);
    if (existing) return existing;
    const result = { id: `tr_sim_${input.idempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}` };
    this.results.set(input.idempotencyKey, result);
    this.calls.push(input);
    this.balance = Math.round((this.balance - input.amountFils / 100) * 100) / 100;
    return result;
  }
}

export async function pingStripe(config: AppConfig): Promise<{ mode: string; availableAed: number | null }> {
  const gateway = createStripeGateway(config);
  const availableAed = await gateway.availableAed();
  return { mode: gateway.mode, availableAed };
}

export async function createTestConnectedAccount(
  config: AppConfig,
  db?: PrismaClient,
  vendorId?: string,
): Promise<string> {
  if (!config.stripeSecretKey.startsWith("sk_test_") && !config.stripeSecretKey.startsWith("rk_test_")) {
    throw new Error("Custom accounts are created only with a Stripe test key.");
  }
  const stripe = new Stripe(config.stripeSecretKey);
  const account = await stripe.accounts.create({
    type: "custom",
    country: "AE",
    business_type: "company",
    capabilities: { transfers: { requested: true } },
  });
  if (db && vendorId) {
    await db.vendor.update({ where: { id: vendorId }, data: { stripeAccountId: account.id } });
  }
  return account.id;
}

export async function createTestCustomAccount(config: AppConfig): Promise<string> {
  return createTestConnectedAccount(config);
}
