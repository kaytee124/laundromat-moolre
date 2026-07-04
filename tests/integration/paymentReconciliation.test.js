const axios = require('axios');
const paymentService = require('../../services/paymentService');
const { Payment } = require('../../models');
const { createService, createOrder } = require('../helpers/fixtures');

jest.mock('axios');

describe('Payment reconciliation', () => {
  let ctx;
  let order;

  beforeAll(async () => {
    ctx = global.testContext;
    const service = await createService(ctx.admin);
    order = await createOrder(ctx.employee, ctx.customer, service);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function createPendingPayment(externalref, overrides = {}) {
    const createdAt = overrides.created_at || new Date(Date.now() - 3 * 60 * 1000);
    return Payment.create({
      order_id: order.id,
      externalref,
      amount: 20,
      status: 'pending',
      payment_method: 'moolre',
      provider: 'moolre',
      moolre_reference: 'MOOLRE-REF-STATUS',
      currency: 'GHS',
      metadata: {},
      created_at: createdAt,
      updated_at: createdAt,
      ...overrides,
    });
  }

  it('marks payment paid via idtype 1 status check', async () => {
    const payment = await createPendingPayment('PAY-RECON-001');

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          txstatus: 1,
          transactionid: 'TXN-RECON',
          thirdpartyref: 'TP-RECON',
          amount: '20.00',
          value: '20.00',
        },
      },
    });

    const result = await paymentService.reconcilePayment(payment);
    expect(result.idtypeUsed).toBe('1');

    await payment.reload();
    expect(payment.status).toBe('paid');
  });

  it('falls back to idtype 2 when idtype 1 fails', async () => {
    const payment = await createPendingPayment('PAY-RECON-002');

    axios.post
      .mockRejectedValueOnce(new Error('idtype 1 failed'))
      .mockResolvedValueOnce({
        data: {
          data: {
            txstatus: 1,
            transactionid: 'TXN-RECON-2',
            amount: '20.00',
            value: '20.00',
          },
        },
      });

    const result = await paymentService.reconcilePayment(payment);
    expect(result.idtypeUsed).toBe('2');
    await payment.reload();
    expect(payment.status).toBe('paid');
  });

  it('marks expired pending payments as failed after 24 hours', async () => {
    const payment = await createPendingPayment('PAY-RECON-EXPIRED', {
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const result = await paymentService.reconcilePayment(payment);
    expect(result.expired).toBe(true);

    await payment.reload();
    expect(payment.status).toBe('failed');
    expect(payment.metadata.expired).toBe(true);
  });

  it('skips already paid payments', async () => {
    const payment = await createPendingPayment('PAY-RECON-PAID', { status: 'paid' });
    const result = await paymentService.reconcilePayment(payment);
    expect(result.skipped).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
