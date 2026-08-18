# Frontend: partial payment status (`partially_paid`)

Order `payment_status` can be **`partially_paid`** when the customer has paid something but still has a balance. The API already stores and returns this string — treat it as a first-class status in list, detail, filters, and badges.

Related:

- [frontend-portal-links-and-cash-payments.md](./frontend-portal-links-and-cash-payments.md) — staff cash pay
- [payment-and-sms-flow.md](./payment-and-sms-flow.md) — Moolre + SMS overview
- [frontend-balance-and-welcome-sms.md](./frontend-balance-and-welcome-sms.md) — `balance` / `amount_paid` fields

---

## Summary

| Area | Backend | Frontend |
|------|---------|----------|
| Status value | `partially_paid` on the order | Label as **Partial** (or “Partially paid”) |
| How it is set | Server only, after cash or confirmed MoMo | Never send `payment_status` on create/update |
| Money fields | `amount_paid` > 0 and `balance` > 0 | Show all three: total, paid, balance |
| Fully paid | `payment_status: paid`, `balance: "0.00"` | Clear partial badge; show paid |

---

## 1. Exact values (read-only)

`orders.payment_status` is a string. Allowed values:

| API value | Suggested UI label | Meaning |
|-----------|--------------------|---------|
| `pending` | Pending / Unpaid | `amount_paid` is `0` |
| `partially_paid` | **Partial** | Some payment(s) applied; balance remains |
| `paid` | Paid | Fully covered |

Do **not** expect or send `partial` — the API value is always **`partially_paid`**.

Staff order create/update **ignore** any client-sent `payment_status`. Status is recomputed from Payment rows with `status: paid`.

---

## 2. Where it appears

On order list and detail (and cash/payment responses):

```json
{
  "id": 22,
  "order_number": "ORD-32420EB8",
  "total_amount": "90.00",
  "amount_paid": "40.00",
  "balance": "50.00",
  "payment_status": "partially_paid",
  "order_status": "pending"
}
```

| Field | Use |
|-------|-----|
| `payment_status` | Badge / filter chip |
| `amount_paid` | “Paid so far” |
| `balance` | “Still owed” (prefer this over local math) |

After another payment that clears the balance:

```json
{
  "total_amount": "90.00",
  "amount_paid": "90.00",
  "balance": "0.00",
  "payment_status": "paid"
}
```

---

## 3. Cash and portal flows

### Staff cash

```http
POST /api/payments/cash/
Authorization: Bearer <staff access>
```

```json
{
  "order_id": 22,
  "amount": 40.00,
  "paid_at": "2026-08-09T10:00:00.000Z"
}
```

Success `201` includes updated order money fields. If amount &lt; remaining balance → `payment_status: "partially_paid"`.

### Client MoMo / portal

After Moolre confirms a partial amount, the same status sync applies. Refetch list/detail (or use returned order fields) so the UI does not stay on `pending`.

### Filters

If the UI filters by payment status, include `partially_paid` as its own option (not lumped only under “unpaid” unless product wants a combined “not fully paid” = `pending` + `partially_paid`).

USSD and pay-remaining flows treat both `pending` and `partially_paid` as payable.

---

## 4. SMS (side effects — no FE call)

On **full pay only** (`payment_status: paid`) the server SMS:

- **Cash:** active **superadmins** only (customer name + who received the cash). The customer is not SMS’d.
- **MoMo / USSD:** customer + active superadmins.
- Partial payments send **no** receipt SMS. Due-reminder and **in-progress** SMS are **off**.

The frontend does not trigger these; just refresh order state after payment succeeds.

---

## 5. Do / don’t

**Do**

- Map `partially_paid` → clear “Partial” badge on list and detail
- Refetch (or apply response) after cash / portal payment success
- Display `balance` from the API next to total and paid
- Allow further payments while status is `pending` or `partially_paid`

**Don’t**

- Send `payment_status` (or `amount_paid` / `balance`) on `POST /orders/create/` or order update to fake payment state
- Treat unknown statuses as `pending` without logging — only the three values above are produced by the server
- Use the label string `partial` as the API value

---

## 6. Frontend checklist

- [ ] Badge / chip supports `partially_paid` → “Partial”
- [ ] Order list + detail show `payment_status`, `amount_paid`, `balance`
- [ ] Payment status filter includes Partial (if filters exist)
- [ ] After `POST /api/payments/cash/` success, UI updates from response (expect Partial when balance &gt; 0)
- [ ] After portal/MoMo success + refetch, same
- [ ] Create/update order payloads omit `payment_status`
