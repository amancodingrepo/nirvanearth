# Stripe Connect Custom — UAE vendor onboarding

Preparation only. This task does not create live connected accounts and does not put live keys in the settlement app. `liveTransfersBlocked` stays true until `admin@nirvanearth.com` writes a go-live approval.

Stripe's UAE requirements change. Use the current Stripe Dashboard prompts and these Stripe pages as the source of truth:

- [UAE account activation requirements](https://support.stripe.com/questions/uae-account-activation-requirements)
- [UAE business verification requirements](https://support.stripe.com/questions/uae-business-verification-requirements)

Do not use another person's documents, a licence issued outside the UAE, or an expired licence. Stripe rejects those.

## What Stripe usually asks for in the UAE

The exact list depends on business type. Stripe collects it in the hosted onboarding flow.

Businesses (sole establishment, free zone establishment, branch of a sole establishment):

- A valid trade licence or freelancer permit issued in the UAE
- The licence must match the legal name and the emirate on the account
- Proof of an active bank account when Stripe asks for it (statement or bank letter dated within the last six months, in the name Stripe requires for that business type)

LLCs, free zone LLCs, and branches of LLCs also need:

- A memorandum of association, or an equivalent document, that shows the business name, the owners, and how the shares are split
- The same style of document for a holding company that owns 25% or more, when Stripe asks

People on the account (the representative, and owners with 25% or more):

- Colour copy of passport and Emirates ID for UAE nationals and GCC nationals living in the UAE
- Passport, Emirates ID, and residence visa for other nationalities living in the UAE. Stripe says the residence visa is optional for Emirates IDs issued on or after 11 April 2022
- The representative should be the person named on the trade licence (the owner, or the manager when the licence names only a manager)

Bank account:

- A UAE bank account at a bank Stripe supports for payouts
- Sole establishments may use a personal account in the owner's name
- A multi-member LLC needs a business account in the business name
- A single-member LLC may use a personal or business account, in the business name or the owner's name, as Stripe's current table states
- The settlement app stores a bank label and the last 4 digits only for manual-bank vendors. It does not store a full IBAN

Stripe may ask for more (address, tax id, website, product description). Complete the prompts. There is no shortcut in this app.

## Who does what

Nirvan Earth (the platform):

1. Uses the **test** platform while this app is in test mode. Live Custom accounts wait for written go-live approval and a live secret that the app is allowed to boot.
2. Creates a Custom connected account for the vendor: country `AE`, business type matching the trade licence, capability `transfers` requested. Card payments on the connected account are not required for this settlement design. The platform charges the customer and later creates a Transfer to the connected account.
3. Creates an Account Link (`account_onboarding`) and sends that URL to the vendor. The link expires. Create a new one if the vendor does not finish in time.
4. After Stripe enables `transfers`, copies the `acct_` id onto the vendor in this app.
5. Sets VAT registered or not, from the vendor's own confirmation. Shopify tax lines do not prove VAT registration.
6. Leaves payout method as Stripe Connect when `acct_` is present. Uses **manual bank** only when there is no Connect account yet. Manual bank keeps a label and last 4 digits, not the full IBAN.
7. Does not execute a live transfer from this task.

The vendor:

1. Opens the Account Link and completes Stripe's form.
2. Uploads the licence, ownership documents, and identity documents Stripe asks for.
3. Adds the UAE bank account in Stripe (or confirms the details the platform is allowed to attach).
4. Answers any further Stripe request until `transfers` is active.
5. Tells Nirvan Earth the email address that should receive payment advice. That address is stored on the vendor row. It is not taken from the customer order.

## How this app stores the result

| Field | Where | Use |
|-------|--------|-----|
| `acct_…` | `vendors.stripe_account_id` | Destination of a Connect transfer. Execute refuses a Connect line with no account id. |
| VAT | `vendors.vat_registered` | VAT-registered: vendor VAT is excluded from the commission base and added back to vendor net. Not registered: vendor VAT is 0. |
| Payout method | `vendors.payout_method` | `stripe_connect` or `manual_bank`. Copied onto the settlement line when the pack is generated. |
| Bank label and last 4 | `vendors.bank_label`, `vendors.bank_last4` | Manual-bank display only. |
| Vendor email | `vendors.email` | Payment-advice copy after a successful transfer or a recorded manual payment. |

Test connected accounts can be created with the existing script `apps/api/scripts/create-test-vendor.ts` against a test key. That script is not a live onboarding path, and there is no HTTP route that creates accounts.

## Settlement path after onboarding

1. Qualify payable lines for the month.
2. Generate the pack, submit, and approve as `admin@nirvanearth.com`.
3. Execute. Connect lines transfer to `acct_` with idempotency key `transfer:<settlement line id>`. A retry after a failed attempt uses a new key. A line that already transferred is skipped.
4. Manual-bank lines stay at awaiting manual payment. Mark paid records the bank reference and does not call Stripe.
5. Payment advice is created after the transfer or the manual mark-paid. Fees in the advice are platform-borne.

## Explicit limit

This guide is live-onboarding preparation. It is not acceptance of live keys, live Custom accounts, or live transfers. The running app must keep a test secret until the written go-live note in `RAILWAY_HANDOVER.md`.
