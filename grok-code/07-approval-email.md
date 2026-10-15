# 07 — Approval, audit, email

## Goal

No money movement without approver. Full audit trail. Emails to admin@.

## Approver

```bash
APPROVER_EMAILS=admin@nirvanearth.com
NOTIFY_EMAIL=admin@nirvanearth.com
```

## Flow

```text
draft → submit → pending_approval → approve → approved → execute → transferred|failed
```

### Submit pack

- Only from `draft`  
- Status `pending_approval`  
- Audit `pack.submitted`  
- Email notify: month, vendor count, total net, link  

### Approve

- Actor email must be in `APPROVER_EMAILS`  
- Else reject 403  
- Prefer per `settlement_line`; pack-level approve all qualified lines OK for v1  
- Write `approvals` row  
- Status `approved`  
- Audit + email  

### Execute

- Only `approved` lines with `vendor_net_sum > 0` and `stripe_account_id`  
- Call Stripe Transfer (module 05)  
- Audit + email with transfer id or error  

## Email content (minimum)

- Action (submitted / approved / executed)  
- Status  
- Vendor name + amount when relevant  
- Actor email  
- Timestamp  

## Agent tasks

1. Auth middleware or trusted actor email header for internal tools.  
2. `submitPack`, `approveLine`/`approvePack`, `executePack`.  
3. Email provider integration (Resend/Postmark/SES) or console logger in dev.  
4. Always write `audit_events`.

## Done when

Non-approver cannot approve; approver can; three emails (or logged) for submit/approve/execute; audit rows exist.
