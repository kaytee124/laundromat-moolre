const pickupNotificationService = require('../services/pickupNotificationService');

async function preview(req, res) {
  const data = await pickupNotificationService.previewPickupNotifications();
  res.json({ status: 'success', data });
}

async function list(req, res) {
  const data = await pickupNotificationService.paginatedPickupNotifications(req.query);
  res.json({ status: 'success', data });
}

module.exports = { preview, list };
