const { AppError } = require('./errors');

const USSD_NETWORK_TO_CHANNEL = {
  3: '13',
  5: '7',
  6: '6',
};

function mapUssdNetworkToChannel(network) {
  const key = Number(network);
  const channel = USSD_NETWORK_TO_CHANNEL[key];
  if (!channel) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Unknown mobile network. Expected Moolre USSD network code 3 (MTN), 5 (AT), or 6 (Telecel).',
      400
    );
  }
  return channel;
}

module.exports = {
  mapUssdNetworkToChannel,
  USSD_NETWORK_TO_CHANNEL,
};
