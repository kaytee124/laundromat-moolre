# Backend guide: order sheet item add-ons

This document describes frontend order-sheet changes so the Bubblebytes API / backend can stay aligned.

The order create/update contract is **unchanged** (`order_items_data` with free-text `item_name`). What changed is the **set of `item_name` values** the UI now sends and expects to round-trip on list/detail.

Related: [frontend-order-sheet-changes.md](./frontend-order-sheet-changes.md) (sheet shape, `service_ids`, dirty/clean quantities).  
Add-on checkbox source of truth is now the shared catalog API — see [frontend-addon-catalog.md](./frontend-addon-catalog.md).

---

## Summary

| Area | Change | Backend action |
|------|--------|----------------|
| Core item label | `TOPS` renamed to `SHIRTS` | Accept `SHIRTS`; historical `TOPS` migrated to `SHIRTS` |
| Add-on items | New specialty `item_name` values | Accept any of the names below as normal order items (no enum) |
| API shape | Same as today | No new fields; do **not** require a separate “addons” resource |

---

## 1. Order item payload (unchanged shape)

Create / update still send:

```json
{
  "order_items_data": [
    {
      "item_name": "SHIRTS",
      "dirty_quantity": 5,
      "clean_quantity": 0,
      "unit_price": 12.5,
      "notes": ""
    },
    {
      "item_name": "KENTE CLOTH",
      "dirty_quantity": 1,
      "clean_quantity": 0,
      "unit_price": 40,
      "notes": "handle with care"
    }
  ]
}
```

Rules (same as existing sheet migration):

- Skip empty rows on the client (`dirty + clean === 0`).
- Billable qty = `dirty_quantity + clean_quantity`.
- Server recalculates `total_amount` / `balance` from items + discount.
- Prefer storing `item_name` **exactly** as sent (case and spaces matter for round-trip).

---

## 2. Core item names (always on the sheet)

| `item_name` | Notes |
|-------------|--------|
| `SHIRTS` | Replaces former `TOPS` (general shirts / tops) |
| `BOTTOMS` | Unchanged |
| `SOCKS` | Unchanged |
| `TOWELS` | Unchanged |
| `BEDSHEETS` | Unchanged |
| `DUVETS` | Unchanged |
| `CURTAINS` | Unchanged |
| `OTHERS` | Catch-all for unknown names on the FE |

### Legacy `TOPS`

- New creates send **`SHIRTS`**, not `TOPS`.
- Frontend maps `TOPS` → `SHIRTS` when loading old orders.
- Backend migration `20260807120001-tops-to-shirts` rewrites stored `TOPS` → `SHIRTS`.

---

## 3. Add-on item names (optional sheet rows)

Staff enable these via checkboxes; each checked add-on with quantity becomes a normal line item. There is **no** `is_addon` flag in the API.

**Preferred:** load checkbox options from `GET /api/addon-catalog/list/` (see [frontend-addon-catalog.md](./frontend-addon-catalog.md)). Seeded defaults match the names below.

Exact strings historically / initially seeded as `item_name`:

| Category | `item_name` |
|----------|-------------|
| Undergarments | `SINGLETS`, `BOXERS`, `UNDERWEAR`, `INNER`, `VEST` |
| Bedding extras | `BLANKETS`, `PILLOWCASE` |
| Garments | `SMOCK`, `JALABIA`, `NIGHTWEAR`, `KAFTAN` |
| Specialty | `KENTE CLOTH`, `KENTE SLIT AND KABA` |

**Do not** invent alternate spellings (`SMOK`, `JALABIYA`, etc.) when creating catalog rows unless the frontend will send the same string. Matching is exact (after trim on the FE for display keys).

---

## 4. What the backend should / should not do

### Do

- Persist `item_name` as a string (varchar / text), not a hard-coded enum of only the old eight core names.
- Return the same `item_name` on `GET /api/orders/list/` and `GET /api/orders/:id/` inside `order_items`.
- Allow multiple distinct add-on lines on one order (one row per `item_name` is typical; FE collapses by name on load).
- Keep totals based on `unit_price × (dirty_quantity + clean_quantity)` regardless of whether the name is core or add-on.

### Don’t

- Require a separate `addons` / `order_addons` endpoint for this UI.
- Reject create/update because `item_name` is not in the original TOPS/BOTTOMS list.
- Expect `TOPS` from new frontend creates.

---

## 5. Example create body (core + add-ons)

```json
{
  "customer_id": 1,
  "service_ids": [1],
  "discount_amount": 0,
  "delivery_date": "2026-08-10",
  "delivery_time": "14:30",
  "order_status": "pending",
  "payment_status": "pending",
  "order_items_data": [
    {
      "item_name": "SHIRTS",
      "dirty_quantity": 3,
      "clean_quantity": 0,
      "unit_price": 10,
      "notes": ""
    },
    {
      "item_name": "BOTTOMS",
      "dirty_quantity": 2,
      "clean_quantity": 0,
      "unit_price": 10,
      "notes": ""
    },
    {
      "item_name": "SMOCK",
      "dirty_quantity": 1,
      "clean_quantity": 0,
      "unit_price": 25,
      "notes": ""
    },
    {
      "item_name": "KENTE SLIT AND KABA",
      "dirty_quantity": 1,
      "clean_quantity": 0,
      "unit_price": 50,
      "notes": "press only"
    }
  ]
}
```

---

## 6. Backend checklist

- [x] `item_name` is free text (not a closed enum of only the old core names)
- [x] List/detail return `order_items[].item_name` unchanged for add-on rows
- [x] Migrate historical `TOPS` → `SHIRTS`
- [x] Seed sample sheet orders include an add-on line (`KENTE CLOTH`)
- [x] Shared add-on catalog CRUD (`/api/addon-catalog/`) — order create unchanged
- [x] Smoke-test: create with `SHIRTS` + add-on → list → detail → update quantities → totals/balance

---

## 7. Frontend source of truth

- Core sheet rows: local constants in `src/components/dashboard/orderSheetData.js` (`ITEM_ROWS`)
- Add-on checkboxes: **shared catalog** via `/api/addon-catalog/` — see [frontend-addon-catalog.md](./frontend-addon-catalog.md)

If the business renames an add-on, update the catalog (admin UI / API). Prefer soft-deactivate over deleting names that already appear on historical orders.
