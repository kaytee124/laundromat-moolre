const reportService = require('../services/reportService');

async function transactions(req, res) {
  const format = String(req.query.format || 'json').toLowerCase();
  const data = await reportService.listTransactions(req.query);

  if (format === 'csv') {
    const csv = reportService.transactionsToCsv(data.results);
    const start = req.query.start_date || req.query.date || 'all';
    const end = req.query.end_date || req.query.date || start;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions-${start}_to_${end}.csv"`
    );
    return res.status(200).send(csv);
  }

  res.json({ status: 'success', data });
}

async function summary(req, res) {
  const format = String(req.query.format || 'json').toLowerCase();
  const data = await reportService.getSummaryReport(req.query);

  if (format === 'csv') {
    const csv = reportService.summaryToCsv(data);
    const filename = reportService.summaryFilename(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  }

  res.json({ status: 'success', data });
}

module.exports = { transactions, summary };
