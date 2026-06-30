require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const apiRoutes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { tokenRefreshMiddleware } = require('./middleware/auth');
const { mountSwagger, isSwaggerEnabled } = require('./config/swagger');
const { sequelize } = require('./models');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({ origin: true, credentials: true }));
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'benchmark') {
  app.use(morgan('dev'));
}
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(tokenRefreshMiddleware);

if (isSwaggerEnabled()) {
  mountSwagger(app);
}

app.get('/health', async (req, res) => {
  try {
    await sequelize.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch {
    res.json({ status: 'degraded', database: 'unavailable' });
  }
});

app.use('/api', apiRoutes);

app.use(errorHandler);

module.exports = app;
