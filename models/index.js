const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

const User = require('./User')(sequelize);
const Customer = require('./Customer')(sequelize);
const Service = require('./Service')(sequelize);
const Order = require('./Order')(sequelize);
const OrderItem = require('./OrderItem')(sequelize);
const Payment = require('./Payment')(sequelize);
const RefreshToken = require('./RefreshToken')(sequelize);
const OrderStatusHistory = require('./OrderStatusHistory')(sequelize);

// User self-reference
User.belongsTo(User, { as: 'updater', foreignKey: 'updated_by' });

// Customer
Customer.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
Customer.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Customer.belongsTo(User, { as: 'customerUpdater', foreignKey: 'updated_by' });
User.hasOne(Customer, { as: 'customer_profile', foreignKey: 'user_id' });

// Service
Service.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Service.belongsTo(User, { as: 'updater', foreignKey: 'updated_by' });

// Order
Order.belongsTo(Customer, { as: 'customer', foreignKey: 'customer_id' });
Order.belongsTo(User, { as: 'assignee', foreignKey: 'assigned_to' });
Order.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Order.belongsTo(User, { as: 'updater', foreignKey: 'updated_by' });
Order.hasMany(OrderItem, { as: 'order_items', foreignKey: 'order_id' });
Customer.hasMany(Order, { as: 'orders', foreignKey: 'customer_id' });

// OrderItem
OrderItem.belongsTo(Order, { as: 'order', foreignKey: 'order_id' });
OrderItem.belongsTo(Service, { as: 'service', foreignKey: 'service_id' });

// Payment
Payment.belongsTo(Order, { as: 'order', foreignKey: 'order_id' });
Payment.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
Payment.belongsTo(User, { as: 'updater', foreignKey: 'updated_by' });
Order.hasMany(Payment, { as: 'payments', foreignKey: 'order_id' });

// RefreshToken
RefreshToken.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
User.hasMany(RefreshToken, { as: 'refresh_tokens', foreignKey: 'user_id' });

// OrderStatusHistory
OrderStatusHistory.belongsTo(Order, { as: 'order', foreignKey: 'order_id' });
OrderStatusHistory.belongsTo(User, { as: 'changer', foreignKey: 'changed_by' });
Order.hasMany(OrderStatusHistory, { as: 'status_history', foreignKey: 'order_id' });

module.exports = {
  sequelize,
  Sequelize,
  User,
  Customer,
  Service,
  Order,
  OrderItem,
  Payment,
  RefreshToken,
  OrderStatusHistory,
};
