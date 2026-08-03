const moolreService = require('../../services/moolreService');
const { Customer, SmsOutbox } = require('../../models');
const {
  enqueueSms,
  processPendingSms,
  isPermanentPhoneError,
} = require('../../services/smsOutboxService');
const { uniquePhone } = require('../helpers/fixtures');

describe('SMS outbox', () => {
  let sendSmsSpy;

  afterEach(async () => {
    if (sendSmsSpy) sendSmsSpy.mockRestore();
    await SmsOutbox.destroy({ where: {} });
  });

  it('marks sent on success', async () => {
    sendSmsSpy = jest.spyOn(moolreService, 'sendSms').mockResolvedValue({ status: 1, message: 'ok' });
    const result = await enqueueSms({
      recipient: uniquePhone(),
      message: 'hello',
      purpose: 'test',
      ref: 'test-ok',
    });
    expect(result.ok).toBe(true);
    expect(result.row.status).toBe('sent');
  });

  it('leaves pending on transient failure and worker sends later', async () => {
    sendSmsSpy = jest
      .spyOn(moolreService, 'sendSms')
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      .mockResolvedValueOnce({ status: 1, message: 'ok' });

    const first = await enqueueSms({
      recipient: uniquePhone(),
      message: 'retry me',
      purpose: 'test',
    });
    expect(first.ok).toBe(false);
    expect(first.row.status).toBe('pending');

    const processed = await processPendingSms();
    expect(processed.sent).toBe(1);
    const row = await SmsOutbox.findByPk(first.row.id);
    expect(row.status).toBe('sent');
  });

  it('marks failed_permanent and sets phone_needs_correction for customers', async () => {
    const ctx = global.testContext;
    sendSmsSpy = jest.spyOn(moolreService, 'sendSms').mockRejectedValue(
      Object.assign(new Error('Invalid phone number'), { code: 'INVALID' })
    );

    const result = await enqueueSms({
      recipient: ctx.customer.phone_number,
      message: 'bad number',
      purpose: 'welcome',
      relatedType: 'customer',
      relatedId: ctx.customer.id,
    });
    expect(result.permanent).toBe(true);
    expect(result.row.status).toBe('failed_permanent');

    const customer = await Customer.findByPk(ctx.customer.id);
    expect(customer.phone_needs_correction).toBe(true);

    await customer.update({ phone_needs_correction: false });
  });

  it('classifies permanent phone errors', () => {
    expect(isPermanentPhoneError({ message: 'Phone number does not exist' })).toBe(true);
    expect(isPermanentPhoneError({ message: 'timeout' })).toBe(false);
  });
});
