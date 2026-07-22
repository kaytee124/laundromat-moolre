const moolreService = require('./moolreService');
const { formatSmsRecipient } = require('../utils/phone');
const { DEFAULT_CUSTOMER_PASSWORD, CUSTOMER_APP_URL } = require('../utils/constants');

function buildWelcomeMessage(username) {
  return (
    `Welcome to Bubblebytes Laundry. Log in at ${CUSTOMER_APP_URL} with username ${username} ` +
    `and temporary password ${DEFAULT_CUSTOMER_PASSWORD}. ` +
    `Please change your password after you log in to keep your details secure.`
  );
}

async function sendWelcomeSms({ phoneNumber, username }) {
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

  try {
    await moolreService.sendSms({
      recipient: formatSmsRecipient(phoneNumber),
      message: buildWelcomeMessage(username),
      ref: `welcome-${username}`,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'welcome_sms_failed',
        username,
        error: err.message,
        code: err.code,
      })
    );
  }
}

function notifyWelcomeSms(payload) {
  setImmediate(() => {
    sendWelcomeSms(payload).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'welcome_sms_failed',
          username: payload?.username,
          error: err.message,
        })
      );
    });
  });
}

module.exports = {
  buildWelcomeMessage,
  sendWelcomeSms,
  notifyWelcomeSms,
};
