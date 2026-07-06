const { formatMoolrePaymentPayer } = require('../../utils/phone');

describe('formatMoolrePaymentPayer', () => {
  it('converts international msisdn to local 0… format', () => {
    expect(formatMoolrePaymentPayer('233502412618')).toBe('0502412618');
  });

  it('keeps local 0… format unchanged', () => {
    expect(formatMoolrePaymentPayer('0502412618')).toBe('0502412618');
  });
});
