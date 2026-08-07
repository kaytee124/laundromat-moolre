const request = require('supertest');
const app = require('../../app');
const { getTokensForRoles } = require('../helpers/auth');
const { createService, uniquePhone, uniqueUsername } = require('../helpers/fixtures');
const { Customer } = require('../../models');

describe('Order create phone_needs_correction gate', () => {
  let tokens;
  let ctx;
  let service;

  beforeAll(async () => {
    ctx = global.testContext;
    tokens = await getTokensForRoles(ctx);
    service = await createService(ctx.admin);
  });

  afterEach(async () => {
    await Customer.update(
      { phone_needs_correction: false },
      { where: { id: ctx.customer.id } }
    );
  });

  it('rejects order create when phone_needs_correction is true', async () => {
    await ctx.customer.update({ phone_needs_correction: true });

    const res = await request(app)
      .post('/api/orders/create/')
      .set(tokens.employee.headers)
      .send({
        customer_id: ctx.customer.id,
        service_ids: [service.id],
        order_items_data: [
          { item_name: 'SHIRTS', dirty_quantity: 1, clean_quantity: 0, unit_price: 10 },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe('PHONE_NEEDS_CORRECTION');
  });

  it('allows order create after phone is corrected via staff update', async () => {
    await ctx.customer.update({ phone_needs_correction: true });
    const phone = uniquePhone();
    const wa = uniquePhone();

    const updateRes = await request(app)
      .patch(`/api/accounts/staff/client/${ctx.client.id}/update/`)
      .set(tokens.employee.headers)
      .send({
        phone_number: phone,
        whatsapp_number: wa,
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.phone_needs_correction).toBe(false);

    const createRes = await request(app)
      .post('/api/orders/create/')
      .set(tokens.employee.headers)
      .send({
        customer_id: ctx.customer.id,
        service_ids: [service.id],
        order_items_data: [
          { item_name: 'SHIRTS', dirty_quantity: 1, clean_quantity: 0, unit_price: 10 },
        ],
      });
    expect(createRes.status).toBe(201);
  });

  it('rejects customer create with invalid Ghana phone', async () => {
    const res = await request(app)
      .post('/api/customers/create/')
      .set(tokens.employee.headers)
      .send({
        username: uniqueUsername('badphone'),
        first_name: 'Bad',
        phone_number: '233502412618',
        whatsapp_number: uniquePhone(),
        address: '1 Test St',
        preferred_contact_method: 'phone',
      });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('VALIDATION_ERROR');
  });

  it('accepts +233 phone on customer create', async () => {
    const localTail = String(Date.now()).slice(-9);
    const intl = `+233${localTail}`;
    const wa = uniquePhone();
    const res = await request(app)
      .post('/api/customers/create/')
      .set(tokens.employee.headers)
      .send({
        username: uniqueUsername('intlphone'),
        first_name: 'Intl',
        phone_number: intl,
        whatsapp_number: wa,
        address: '1 Test St',
        preferred_contact_method: 'phone',
      });
    expect(res.status).toBe(201);
  });
});
