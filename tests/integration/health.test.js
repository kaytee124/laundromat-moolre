const request = require('supertest');
const app = require('../../app');
const { sequelize } = require('../../models');

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns degraded when the database check fails', async () => {
    const originalQuery = sequelize.query.bind(sequelize);
    sequelize.query = jest.fn().mockRejectedValue(new Error('connection refused'));

    try {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'degraded', database: 'unavailable' });
    } finally {
      sequelize.query = originalQuery;
    }
  });
});
