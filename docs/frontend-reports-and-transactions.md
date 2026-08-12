# Frontend: superadmin transactions & reports

Superadmin-only finance endpoints: list all payments (cash / MoMo / USSD) and download day / month / year summary reports (new customers, revenue, owed).

Related: [payment-and-sms-flow.md](./payment-and-sms-flow.md), [frontend-partial-payment-status.md](./frontend-partial-payment-status.md).

---

## Auth

Both routes require:

```http
Authorization: Bearer <superadmin access token>
```

`admin`, `employee`, and `client` receive **`403 PERMISSION_DENIED`**.

---

## 1. Transactions — `GET /api/reports/transactions/`

Paginated list of Payment rows (all methods).

### Query

| Param | Notes |
|-------|--------|
| `page`, `page_size` | Default page 1, size ≤ **200** (JSON). CSV export uses up to 5000 rows. |

| `start_date`, `end_date` | `YYYY-MM-DD` inclusive (filters on `COALESCE(paid_at, created_at)`) |
| `period` + `date` / `year` / `month` | Same period helpers as summary (optional instead of start/end) |
| `payment_method` | `cash` \| `moolre` \| `ussd` |
| `status` | `paid` \| `pending` \| `failed` |
| `format` | `json` (default) or `csv` |

### JSON response

```json
{
  "status": "success",
  "data": {
    "count": 40,
    "page": 1,
    "page_size": 20,
    "total_pages": 2,
    "results": [
      {
        "id": 10,
        "externalref": "PAY-22-ABC",
        "amount": "90.00",
        "status": "paid",
        "payment_method": "cash",
        "provider": null,
        "payer_phone": null,
        "paid_at": "2026-08-08T13:31:00.000Z",
        "created_at": "2026-08-08T13:31:38.000Z",
        "created_by": 2,
        "created_by_username": "vera",
        "order_id": 22,
        "order_number": "ORD-32420EB8",
        "customer_id": 17,
        "customer_username": "Klenam",
        "customer_name": "Klenam Klenam"
      }
    ]
  }
}
```

### CSV download

```http
GET /api/reports/transactions/?start_date=2026-08-01&end_date=2026-08-31&format=csv
```

- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="transactions-….csv"`
- Exports up to 5000 matching rows (not limited to one JSON page)

---

## 2. Summary report — `GET /api/reports/summary/`

### Period (pick one mode)

| Mode | Query |
|------|--------|
| Daily | `period=daily&date=2026-08-08` |
| Monthly | `period=monthly&year=2026&month=8` |
| Yearly | `period=yearly&year=2026` |
| Custom | `start_date=2026-08-01&end_date=2026-08-31` (max 366 days) |

### Metrics

| Field | Meaning |
|-------|---------|
| `new_customers` | Customers with `created_at` in the period |
| `revenue` | **Paid only** — sum of payment amounts with `status=paid` and effective date (`COALESCE(paid_at, created_at)`) in the period. Unpaid ticket totals are never counted as revenue. |
| `revenue_by_method` | Split: `cash`, `moolre`, `ussd` |
| `transaction_count` | Count of those paid payments |
| `owed` | **Unpaid balances** — sum of `(total_amount − amount_paid)` for orders **created in the period** that are not fully `paid` |
| `orders_with_balance` | Count of those orders |

Dashboard metrics follow the same rule: `total_revenue` / `my_revenue` / `today_revenue` are cash actually received (`amount_paid` or paid payments); outstanding stays in `total_outstanding` / report `owed`.

### JSON example

```http
GET /api/reports/summary/?period=monthly&year=2026&month=8
```

```json
{
  "status": "success",
  "data": {
    "period": { "mode": "monthly", "start": "2026-08-01", "end": "2026-08-31" },
    "new_customers": 12,
    "revenue": "4500.00",
    "revenue_by_method": {
      "cash": "2000.00",
      "moolre": "2500.00",
      "ussd": "0.00"
    },
    "transaction_count": 40,
    "owed": "890.00",
    "orders_with_balance": 7
  }
}
```

### CSV download

```http
GET /api/reports/summary/?period=monthly&year=2026&month=8&format=csv
```

- Filename like `report-2026-08.csv`
- One data row with the metrics above

---

## Clients list pagination

`GET /api/accounts/clients/` (and other shared list endpoints) accept `page_size` up to **200**. Results are sorted **alphabetically by name** (`first_name`, then `last_name`). To load the full client roster in one request when possible:

```http
GET /api/accounts/clients/?page=1&page_size=200
```

If `count` > 200, keep paging with `page` / `total_pages`. Values above 200 are capped at 200.

---

## FE checklist

- [ ] Gate UI to **superadmin** only
- [ ] Transactions table with method/status/date filters + pagination (`page_size` ≤ 200)
- [ ] “Download CSV” uses `format=csv` (blob + filename from `Content-Disposition`)
- [ ] Report picker: Daily / Monthly / Yearly → call summary
- [ ] Show new customers, **revenue (paid only)** + by method, **owed (unpaid)**, transaction count
- [ ] Clients list: request `?page_size=200` and still page if `count` > 200
- [ ] Do not use `/api/dashboard/revenue-report/` for this SA screen (that endpoint remains admin+SA day/week/month breakdown)
