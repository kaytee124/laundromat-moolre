# Frontend: shared add-on catalog

Staff order sheets still use **local constants** for core rows (`SHIRTS`, `BOTTOMS`, …). Optional add-on checkboxes should load from the **shared add-on catalog API** so Helen (admin) can add, rename, reorder, or deactivate names without a frontend deploy.

Order create/update is **unchanged**: checked add-ons are still normal lines in `order_items_data` with free-text `item_name` and staff-entered `unit_price`.

Related:

- [frontend-order-sheet-addons.md](./frontend-order-sheet-addons.md) — payload shape and core vs add-on names
- [frontend-order-sheet-changes.md](./frontend-order-sheet-changes.md) — sheet / services / dirty-clean

---

## Summary

| Piece | Source |
|-------|--------|
| Core sheet rows | FE constants (`ITEM_ROWS`) — not in this catalog |
| Add-on checkboxes | `GET /api/addon-catalog/list/` (active items) |
| Order create/update | Same `order_items_data[]` as today |
| Detect add-on on read | `item_name` matches a catalog name (active or inactive) |
| Manage catalog | Admin UI → create / patch / soft-delete |

---

## 1. List catalog (order sheet)

```http
GET /api/addon-catalog/list/
Authorization: Bearer <staff access token>
```

Default: **active only**, ordered by `sort_order`, then `name`.

Managers editing the catalog:

```http
GET /api/addon-catalog/list/?include_inactive=1
```

Example item:

```json
{
  "id": 1,
  "name": "SINGLETS",
  "category": "Undergarments",
  "is_active": true,
  "sort_order": 10,
  "created_at": "2026-08-07T12:00:00.000Z",
  "updated_at": "2026-08-07T12:00:00.000Z"
}
```

Use `name` as the checkbox key and as `item_name` when the line is included in the order payload. Group by `category` in the UI if useful. Do **not** send catalog `id` on order create.

---

## 2. Order payload (unchanged)

When staff checks an add-on and enters qty/price, append a normal line:

```json
{
  "item_name": "KENTE CLOTH",
  "dirty_quantity": 1,
  "clean_quantity": 0,
  "unit_price": 40,
  "notes": ""
}
```

Same rules as core rows: skip empty qty; server totals from lines + discount. Catalog does **not** supply `unit_price`.

---

## 3. Displaying saved orders

1. Load active catalog (and optionally inactive if you need historical labels).
2. Build a `Set` of catalog `name` values.
3. For each `order_items[].item_name`:
   - if in the set → treat as add-on (checkbox / add-on section)
   - else if in core `ITEM_ROWS` → core row
   - else → `OTHERS` / custom

Historical lines keep working after soft-delete because the order stores the string, not a catalog FK. A deactivated name may still appear on old orders; keep it visible on detail even if it is missing from the default checkbox list.

---

## 4. Admin: manage catalog

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/api/addon-catalog/create/` | admin, superadmin |
| `PATCH` | `/api/addon-catalog/:id/` | admin, superadmin |
| `DELETE` | `/api/addon-catalog/:id/` | admin, superadmin (soft: `is_active=false`) |

Create body:

```json
{
  "name": "HEADSCARF",
  "category": "Garments",
  "sort_order": 140,
  "is_active": true
}
```

`name` must be unique (exact, case-sensitive). Duplicate → `409 ADDON_EXISTS`.

Prefer **soft-delete** over hard delete so old orders still round-trip the same `item_name`. Reactivate with `PATCH` `{ "is_active": true }`.

Employees can **list** but cannot create/update/delete.

---

## 5. FE checklist

- [ ] Replace hard-coded `ADDON_ITEM_ROWS` fetch with catalog list (fallback to cached/seeded names if offline is required)
- [ ] Keep core `ITEM_ROWS` local
- [ ] Order create still only sends `order_items_data` (no catalog ids)
- [ ] Admin screen: list with `include_inactive`, create, rename, reorder, deactivate
- [ ] On order detail, match add-ons by `item_name` string equality
