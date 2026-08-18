const { buildStaffPaymentMessage } = require('../../services/paymentNotificationService');

describe('buildStaffPaymentMessage', () => {
  const base = {
    orderNumber: 'ORD-ABC123',
    customerName: 'John Doe',
    amount: 50,
    amountPaid: 50,
    balance: 0,
    paymentStatus: 'paid',
  };

  it('includes customer name and cash taker for cash payments', () => {
    const msg = buildStaffPaymentMessage({
      ...base,
      method: 'cash',
      receivedByName: 'Vera Yeboah',
    });
    expect(msg).toContain('from John Doe');
    expect(msg).toContain('ORD-ABC123');
    expect(msg).toContain('Received by Vera Yeboah');
    expect(msg).toContain('cash');
  });

  it('includes customer name only for MoMo payments', () => {
    const msg = buildStaffPaymentMessage({
      ...base,
      method: 'moolre',
      receivedByName: null,
    });
    expect(msg).toContain('from John Doe');
    expect(msg).toContain('MoMo');
    expect(msg).not.toContain('Received by');
  });

  it('falls back to Customer when name is missing', () => {
    const msg = buildStaffPaymentMessage({
      ...base,
      customerName: null,
      method: 'cash',
      receivedByName: 'employee1',
    });
    expect(msg).toContain('from Customer');
  });
});
