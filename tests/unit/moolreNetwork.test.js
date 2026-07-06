const { mapUssdNetworkToChannel } = require('../../utils/moolreNetwork');
const { AppError } = require('../../utils/errors');

describe('mapUssdNetworkToChannel', () => {
  it('maps Moolre USSD network codes to payment channels', () => {
    expect(mapUssdNetworkToChannel(3)).toBe('13');
    expect(mapUssdNetworkToChannel(5)).toBe('7');
    expect(mapUssdNetworkToChannel(6)).toBe('6');
    expect(mapUssdNetworkToChannel('3')).toBe('13');
  });

  it('rejects unknown network codes', () => {
    expect(() => mapUssdNetworkToChannel(99)).toThrow(AppError);
  });
});
