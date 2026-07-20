# Frontend order sheet migration guide

This document describes how the React Order Management UI should change to match the updated Bubblebytes API and the new order sheet screens (create sheet, services checkboxes, update modal).

The backend is the source of truth. Prefer server totals and IDs over client-only calculations when conflicting.

## Local data (server start)

In `development`, or when `SEED_ORDER_SHEET_ON_START=true`, the API on startup:

1. **Backfills** legacy orders (adds missing `order_services`, fixes empty item names).
2. **Seeds** one sample sheet-style order per client customer (`special_instructions: SEED_ORDER_SHEET`) if they do not already have one.

## Accounts / profile (email removed)

- Do **not** collect or send `email` on register, staff create, or profile update. The API no longer stores or returns user email.
- `last_name` is optional (omit or send empty string).
- Moolre web payments use a server-side merchant email (`MOOLRE_MERCHANT_EMAIL`); the frontend does not supply payment email.

---

## Summary of breaking changes

| Old frontend assumption | New behavior |
|-------------------------|--------------|
| Each line item has `service_id` + `quantity` | Order has `service_ids[]`; items have `dirty_quantity`, `clean_quantity`, `unit_price`, `notes` |
| Line price from service catalog `price` | Worker enters `unit_price` per item row |
| Load checkboxes (ONE/TWO/THREE/MORE LOADS) | **Remove** — not in API |
| Service list returns `price`, `unit`, `estimated_days`, `is_active` | Slim service: `id`, `name`, `description`, `category`, `status` (`active` \| `inactive`) |
| No pickup flag | Update can set `picked_up: true` → SMS + `picked_up_at` |
| Completion schedule silent | Changing `estimated_completion_date` sends customer SMS (earlier vs later copy) |
| User `email` required; `last_name` required | **No user email** — do not collect or send it; `last_name` optional |

---

## 1. Remove loads

Delete the load size checkbox group entirely from the order sheet.

Do **not** send load-related fields to create/update. There is no backend field for loads.

---

## 2. Multi-select services (SERVICES REQUIRED)

UI: checkboxes for catalog services (e.g. Wash Dry & Fold, Wash Only, Dry Only, Wash Dry & Iron, Ironing Only, Self-Wash).

### Load options

```
GET /api/services/list/
```

Use each result’s:

- `id` — for payload
- `name` — checkbox label
- `description`, `category` — optional UI help
- `status` — only offer `status === "active"` for new selection

Do **not** expect `price`, `unit`, `estimated_days`, or `is_active` on the response.

### Submit

Send selected IDs as:

```json
"service_ids": [1, 3]
```

- Create: **required**, at least one.
- Update: optional; when sent, **replaces** the full set of order services.

On GET order (list or detail), bind checkboxes from `service_ids` / `services`.

Nested order `services[]` shape:

```json
{
  "id": 1,
  "name": "Wash, Dry & Fold",
  "description": "...",
  "category": "wash",
  "status": "active"
}
```

---

## 3. Items table

Columns on the sheet:

| UI column | API field |
|-----------|-----------|
| ITEM | `item_name` (e.g. `TOPS`, `BOTTOMS`, `SOCKS`, …) |
| NUMBER OF DIRTY ITEMS | `dirty_quantity` |
| NUMBER OF CLEANED ITEMS | `clean_quantity` |
| Unit price (add this column) | `unit_price` — **manual entry**, not from service price |
| REMARKS | `notes` |

Rules:

- Skip empty rows (both quantities 0) or don’t send them.
- At least one billable row is required on create (`dirty + clean > 0`).
- Clean items are charged too (iron/fold): billable qty = `dirty_quantity + clean_quantity`.

GET order items no longer include `service_id`, `service_name`, `quantity`, or `description`.

---

## 4. Totals and discount

Display helper (optional UX):

```text
line_subtotal = unit_price × (dirty_quantity + clean_quantity)
order_total   = sum(line_subtotals) − discount_amount
```

Server recalculates `total_amount` on create and when items/discount change. Prefer `data.total_amount` from the API response after save.

Discount remains the existing **Discount (GHS)** control → `discount_amount`.

---

## 5. Dates and times

| UI | API field | Notes |
|----|-----------|--------|
| Order Date / Time | `created_at` (read-only on update) | Set by server on create |
| Delivery Date | `delivery_date` (`YYYY-MM-DD`) | |
| Delivery Time | `delivery_time` (`HH:MM` or `HH:MM:SS`) | |
| Estimated completion (if shown) | `estimated_completion_date` | Changing it triggers SMS |
| Pickup date (if still used) | `pickup_date` | Still supported |

Statuses stay as today: `order_status`, `payment_status`, Assign To (`assigned_to`).

---

## 6. Picked up

On **Update Order**, add a control for pickup:

- Field: `picked_up` (boolean)
- When set `true`, API sets `picked_up_at` and sends thank-you SMS
- When set `false`, clears `picked_up_at`
- Show `picked_up_at` read-only when present

---

## 7. API payloads

### Create — `POST /api/orders/create/`

```json
{
  "customer_id": 1,
  "service_ids": [1, 3],
  "assigned_to": null,
  "discount_amount": 0,
  "delivery_date": "2026-07-22",
  "delivery_time": "14:30",
  "estimated_completion_date": "2026-07-21",
  "order_status": "pending",
  "payment_status": "pending",
  "order_items_data": [
    {
      "item_name": "TOPS",
      "dirty_quantity": 5,
      "clean_quantity": 0,
      "unit_price": 12.5,
      "notes": ""
    },
    {
      "item_name": "BOTTOMS",
      "dirty_quantity": 0,
      "clean_quantity": 4,
      "unit_price": 8,
      "notes": "press only"
    }
  ]
}
```

### Update — `PUT /api/orders/:id/update/`

Can include any of:

- Status / payment / assign / discount (unchanged)
- `delivery_date`, `delivery_time`, `estimated_completion_date`
- `picked_up`
- `service_ids` (full replace)
- `order_items_data` (full replace of line items)

Example pickup:

```json
{ "picked_up": true }
```

Example schedule change:

```json
{ "estimated_completion_date": "2026-07-28" }
```

### List / detail — `GET /api/orders/list/`, `GET /api/orders/:id/`

Expect the same sheet fields on every order in the list and on detail: `service_ids`, `services`, dirty/clean items, `delivery_time`, `picked_up`, `picked_up_at`, `total_amount`, etc.

---

## 8. Services admin UI (if any)

Create/update service body:

```json
{
  "name": "Wash, Dry & Fold",
  "description": "...",
  "category": "wash",
  "status": "active"
}
```

`price` / `unit` / `estimated_days` are no longer expected by the API.

---

## 9. Frontend checklist

- [ ] Remove LOADS section from create/update sheets
- [ ] Wire services multi-select → `service_ids`
- [ ] Load services from slim list; filter `status === "active"`
- [ ] Add unit price column; stop using catalog price for lines
- [ ] Use `dirty_quantity` / `clean_quantity` / `notes` instead of `quantity` / per-item `service_id`
- [ ] Send `delivery_date` + `delivery_time`
- [ ] Add picked-up control on update; display `picked_up_at`
- [ ] Bind GET list/detail to new response shape
- [ ] Update TypeScript types / forms for slim `Service` and new `Order` / `OrderItem`
- [ ] Smoke-test create → list → update items/services → mark picked up
