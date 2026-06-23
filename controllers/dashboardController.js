const dashboardService = require('../services/dashboardService');
const { AppError } = require('../utils/errors');

async function metrics(req, res) {
  const data = await dashboardService.getMetrics(req.user);
  res.json({ status: 'success', data });
}

async function revenueReport(req, res) {
  const { start_date, end_date, group_by } = req.query;

  if (!start_date || !end_date) {
    throw new AppError('MISSING_DATES', 'Start date and end date are required', 400);
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
    throw new AppError('INVALID_DATE_FORMAT', 'Dates must be in YYYY-MM-DD format', 422);
  }

  if (end_date < start_date) {
    throw new AppError('INVALID_DATE_RANGE', 'End date must be after start date', 400);
  }

  const start = new Date(`${start_date}T00:00:00.000Z`);
  const end = new Date(`${end_date}T00:00:00.000Z`);
  const rangeDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  if (rangeDays > 366) {
    throw new AppError('DATE_RANGE_TOO_LARGE', 'Date range cannot exceed 366 days', 400);
  }

  const data = await dashboardService.getRevenueReport(start_date, end_date, group_by || 'day');
  res.json({ status: 'success', data });
}

module.exports = { metrics, revenueReport };
