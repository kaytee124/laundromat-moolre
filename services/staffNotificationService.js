const { formatSmsRecipient } = require('../utils/phone');
const { buildDefaultPassword } = require('../utils/passwords');
const { enqueueSms } = require('./smsOutboxService');

function buildStaffCredentialsMessage(username, role) {
  const password = buildDefaultPassword(username);
  const roleLabel = role || 'staff';
  return (
    `Bubblebytes: Your ${roleLabel} account is ready. ` +
    `Username: ${username}. Temporary password: ${password}. ` +
    `Please change your password after you log in and keep your credentials secret.`
  );
}

async function sendStaffCredentialsSms({ phoneNumber, username, role, userId }) {
  if (!phoneNumber) {
    console.error(
      JSON.stringify({
        event: 'staff_credentials_sms_skipped',
        username,
        reason: 'phone_missing',
      })
    );
    return;
  }

  await enqueueSms({
    recipient: formatSmsRecipient(phoneNumber),
    message: buildStaffCredentialsMessage(username, role),
    ref: `staff-creds-${username}-${Date.now()}`,
    purpose: 'staff_credentials',
    relatedType: userId ? 'user' : null,
    relatedId: userId || null,
  });
}

function notifyStaffCredentialsSms(payload) {
  sendStaffCredentialsSms(payload).catch((err) => {
    console.error(
      JSON.stringify({
        event: 'staff_credentials_sms_failed',
        username: payload?.username,
        error: err.message,
      })
    );
  });
}

module.exports = {
  buildStaffCredentialsMessage,
  sendStaffCredentialsSms,
  notifyStaffCredentialsSms,
};
