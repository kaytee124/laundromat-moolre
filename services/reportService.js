const { Op, fn, col, where, literal } = require('sequelize');
const {
  Payment,
  Order,
  Customer,
  User,
  sequelize,
} = require('../models');
const { AppError } = require('../utils/errors');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function parseDateStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEndExclusive(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function daysInclusive(startStr, endStr) {
  const start = parseDateStart(startStr);
  const end = parseDateStart(endStr);
  if (!start || !end) return null;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function lastDayOfMonth(year, month) {
  // month 1-12; day 0 of next month = last day of this month
  const d = new Date(Date.UTC(year, month, 0));
  return d.getUTCDate();
}

function formatMoney(value) {
  return parseFloat(value || 0).toFixed(2);
}

function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Resolve report period from query into inclusive start/end date strings + Date bounds.
 */
function resolvePeriod(query) {
  const period = query.period ? String(query.period).toLowerCase() : null;

  if (period === 'daily') {
    const date = query.date;
    if (!date || !DATE_RE.test(date)) {
      throw new AppError('MISSING_FIELDS', 'period=daily requires date=YYYY-MM-DD', 400);
    }
    return {
      mode: 'daily',
      start: date,
      end: date,
      rangeStart: parseDateStart(date),
      rangeEndExclusive: parseDateEndExclusive(date),
    };
  }

  if (period === 'monthly') {
    const year = parseInt(query.year, 10);
    const month = parseInt(query.month, 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new AppError('VALIDATION_ERROR', 'year must be a valid number', 400);
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      throw new AppError('VALIDATION_ERROR', 'month must be 1-12', 400);
    }
    const mm = String(month).padStart(2, '0');
    const start = `${year}-${mm}-01`;
    const end = `${year}-${mm}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`;
    return {
      mode: 'monthly',
      start,
      end,
      rangeStart: parseDateStart(start),
      rangeEndExclusive: parseDateEndExclusive(end),
    };
  }

  if (period === 'yearly') {
    const year = parseInt(query.year, 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new AppError('VALIDATION_ERROR', 'year must be a valid number', 400);
    }
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return {
      mode: 'yearly',
      start,
      end,
      rangeStart: parseDateStart(start),
      rangeEndExclusive: parseDateEndExclusive(end),
    };
  }

  // Custom range (or legacy-style start_date/end_date without period)
  const startDate = query.start_date;
  const endDate = query.end_date;
  if (!startDate || !endDate) {
    throw new AppError(
      'MISSING_FIELDS',
      'Provide period=daily|monthly|yearly (with date/year/month) or start_date and end_date',
      400
    );
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new AppError('INVALID_DATE_FORMAT', 'Dates must be in YYYY-MM-DD format', 422);
  }
  if (endDate < startDate) {
    throw new AppError('INVALID_DATE_RANGE', 'End date must be after start date', 400);
  }
  const rangeDays = daysInclusive(startDate, endDate);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new AppError('DATE_RANGE_TOO_LARGE', 'Date range cannot exceed 366 days', 400);
  }

  return {
    mode: 'custom',
    start: startDate,
    end: endDate,
    rangeStart: parseDateStart(startDate),
    rangeEndExclusive: parseDateEndExclusive(endDate),
  };
}

function paymentEffectiveDateWhere(rangeStart, rangeEndExclusive) {
  return where(fn('COALESCE', col('Payment.paid_at'), col('Payment.created_at')), {
    [Op.gte]: rangeStart,
    [Op.lt]: rangeEndExclusive,
  });
}

function formatTransaction(payment) {
  const order = payment.order;
  const customerUser = order?.customer?.user;
  const customerName = customerUser
    ? [customerUser.first_name, customerUser.last_name].filter(Boolean).join(' ').trim() ||
      customerUser.username
    : null;
  const creator = payment.creator;

  return {
    id: payment.id,
    externalref: payment.externalref,
    amount: formatMoney(payment.amount),
    status: payment.status,
    payment_method: payment.payment_method,
    provider: payment.provider,
    payer_phone: payment.payer_phone,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    created_by: payment.created_by,
    created_by_username: creator?.username || null,
    order_id: order?.id || payment.order_id,
    order_number: order?.order_number || null,
    customer_id: order?.customer_id || null,
    customer_username: customerUser?.username || null,
    customer_name: customerName,
  };
}

async function listTransactions(query = {}) {
  const forCsv = String(query.format || '').toLowerCase() === 'csv';
  const { page, pageSize, offset, limit } = forCsv
    ? { page: 1, pageSize: 5000, offset: 0, limit: 5000 }
    : parsePagination(query);
  const whereClause = {};

  if (query.payment_method) {
    const method = String(query.payment_method).toLowerCase();
    if (!['cash', 'moolre', 'ussd'].includes(method)) {
      throw new AppError('VALIDATION_ERROR', 'payment_method must be cash, moolre, or ussd', 400);
    }
    whereClause.payment_method = method;
  }

  if (query.status) {
    const status = String(query.status).toLowerCase();
    if (!['paid', 'pending', 'failed'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'status must be paid, pending, or failed', 400);
    }
    whereClause.status = status;
  }

  let dateFilter = null;
  if (query.period || query.date || query.year || query.month) {
    const period = resolvePeriod(query);
    dateFilter = paymentEffectiveDateWhere(period.rangeStart, period.rangeEndExclusive);
  } else if (query.start_date || query.end_date) {
    if (!query.start_date || !query.end_date) {
      throw new AppError('MISSING_FIELDS', 'Both start_date and end_date are required', 400);
    }
    const period = resolvePeriod({
      start_date: query.start_date,
      end_date: query.end_date,
    });
    dateFilter = paymentEffectiveDateWhere(period.rangeStart, period.rangeEndExclusive);
  }

  const andParts = [];
  if (Object.keys(whereClause).length) andParts.push(whereClause);
  if (dateFilter) andParts.push(dateFilter);

  const finalWhere = andParts.length ? { [Op.and]: andParts } : {};

  const { count, rows } = await Payment.findAndCountAll({
    where: finalWhere,
    include: [
      {
        model: Order,
        as: 'order',
        attributes: ['id', 'order_number', 'customer_id'],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'user_id'],
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'first_name', 'last_name'],
                required: false,
              },
            ],
          },
        ],
      },
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'username'],
        required: false,
      },
    ],
    order: [
      [fn('COALESCE', col('Payment.paid_at'), col('Payment.created_at')), 'DESC'],
      ['id', 'DESC'],
    ],
    offset,
    limit,
    distinct: true,
  });

  const results = rows.map(formatTransaction);
  return paginatedResponse({ count, page, pageSize, results });
}

function transactionsToCsv(results) {
  const headers = [
    'id',
    'externalref',
    'amount',
    'status',
    'payment_method',
    'provider',
    'payer_phone',
    'paid_at',
    'created_at',
    'created_by',
    'created_by_username',
    'order_id',
    'order_number',
    'customer_id',
    'customer_username',
    'customer_name',
  ];
  const rows = results.map((r) => ({
    ...r,
    paid_at: r.paid_at ? new Date(r.paid_at).toISOString() : '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));
  return rowsToCsv(headers, rows);
}

async function getSummaryReport(query = {}) {
  const period = resolvePeriod(query);
  const { rangeStart, rangeEndExclusive, mode, start, end } = period;

  const [newCustomers, revenueRows, owedRow] = await Promise.all([
    Customer.count({
      where: {
        created_at: { [Op.gte]: rangeStart, [Op.lt]: rangeEndExclusive },
      },
    }),
    sequelize.query(
      `
      SELECT
        payment_method,
        COUNT(*) AS transaction_count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM payments
      WHERE status = 'paid'
        AND COALESCE(paid_at, created_at) >= :rangeStart
        AND COALESCE(paid_at, created_at) < :rangeEndExclusive
      GROUP BY payment_method
      `,
      {
        replacements: { rangeStart, rangeEndExclusive },
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    Order.findOne({
      attributes: [
        [literal('COALESCE(SUM(total_amount - amount_paid), 0)'), 'owed'],
        [literal('COUNT(*)'), 'orders_with_balance'],
      ],
      where: {
        created_at: { [Op.gte]: rangeStart, [Op.lt]: rangeEndExclusive },
        payment_status: { [Op.ne]: 'paid' },
      },
      raw: true,
    }),
  ]);

  const revenueByMethod = { cash: '0.00', moolre: '0.00', ussd: '0.00' };
  let revenueTotal = 0;
  let transactionCount = 0;

  for (const row of revenueRows) {
    const method = String(row.payment_method || '').toLowerCase();
    const amount = parseFloat(row.total_amount || 0);
    const count = parseInt(row.transaction_count || 0, 10);
    revenueTotal += amount;
    transactionCount += count;
    if (Object.prototype.hasOwnProperty.call(revenueByMethod, method)) {
      revenueByMethod[method] = formatMoney(amount);
    }
  }

  return {
    period: { mode, start, end },
    new_customers: newCustomers,
    revenue: formatMoney(revenueTotal),
    revenue_by_method: revenueByMethod,
    transaction_count: transactionCount,
    owed: formatMoney(owedRow?.owed || 0),
    orders_with_balance: parseInt(owedRow?.orders_with_balance || 0, 10),
  };
}

function summaryToCsv(summary) {
  const headers = [
    'period_mode',
    'period_start',
    'period_end',
    'new_customers',
    'revenue',
    'revenue_cash',
    'revenue_moolre',
    'revenue_ussd',
    'transaction_count',
    'owed',
    'orders_with_balance',
  ];
  const row = {
    period_mode: summary.period.mode,
    period_start: summary.period.start,
    period_end: summary.period.end,
    new_customers: summary.new_customers,
    revenue: summary.revenue,
    revenue_cash: summary.revenue_by_method.cash,
    revenue_moolre: summary.revenue_by_method.moolre,
    revenue_ussd: summary.revenue_by_method.ussd,
    transaction_count: summary.transaction_count,
    owed: summary.owed,
    orders_with_balance: summary.orders_with_balance,
  };
  return rowsToCsv(headers, [row]);
}

function summaryFilename(summary) {
  const { mode, start, end } = summary.period;
  if (mode === 'daily') return `report-${start}.csv`;
  if (mode === 'monthly') return `report-${start.slice(0, 7)}.csv`;
  if (mode === 'yearly') return `report-${start.slice(0, 4)}.csv`;
  return `report-${start}_to_${end}.csv`;
}

module.exports = {
  resolvePeriod,
  listTransactions,
  transactionsToCsv,
  getSummaryReport,
  summaryToCsv,
  summaryFilename,
  formatMoney,
};
