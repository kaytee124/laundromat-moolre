const { formatSmsRecipient } = require('../utils/phone');
const { CUSTOMER_APP_URL } = require('../utils/constants');
const { buildDefaultPassword } = require('../utils/passwords');
const { enqueueSms } = require('./smsOutboxService');

function buildWelcomeMagicLink(welcomeToken, nextPath) {
  const params = new URLSearchParams({ token: welcomeToken });
  if (nextPath) params.set('next', nextPath);
  return `${CUSTOMER_APP_URL}/welcome?${params.toString()}`;
}

function buildWelcomeMessage(username, welcomeToken) {
  const magicLink = buildWelcomeMagicLink(welcomeToken);
  const tempPassword = buildDefaultPassword(username);
  return (
    `Welcome to Bubblebytes Laundry. Tap to open your portal: ${magicLink} ` +
    `If the link expires, log in with username ${username} and temporary password ${tempPassword}. ` +
    `Please change your password after you log in to keep your details secure.`
  );
}

async function sendWelcomeSms({ phoneNumber, username, welcomeToken, customerId }) {
  if (!phoneNumber) {
    console.error(
      JSON.stringify({
        event: 'welcome_sms_skipped',
        username,
        reason: 'phone_missing',
      })
    );
    return;
  }

  if (!welcomeToken) {
    console.error(
      JSON.stringify({
        event: 'welcome_sms_skipped',
        username,
        reason: 'welcome_token_missing',
      })
    );
    return;
  }

  await enqueueSms({
    recipient: formatSmsRecipient(phoneNumber),
    message: buildWelcomeMessage(username, welcomeToken),
    ref: `welcome-${username}-${Date.now()}`,
    purpose: 'welcome',
    relatedType: customerId ? 'customer' : null,
    relatedId: customerId || null,
  });
}

function notifyWelcomeSms(payload) {
  sendWelcomeSms(payload).catch((err) => {
    console.error(
      JSON.stringify({
        event: 'welcome_sms_failed',
        username: payload?.username,
        error: err.message,
      })
    );
  });
}

module.exports = {
  buildWelcomeMessage,
  buildWelcomeMagicLink,
  sendWelcomeSms,
  notifyWelcomeSms,
};
