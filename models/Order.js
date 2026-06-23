const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Order extends Model {}

  Order.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      customer_id: { type: DataTypes.BIGINT, allowNull: false },
      assigned_to: { type: DataTypes.BIGINT, allowNull: true },
      order_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      payment_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      amount_paid: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      delivery_notes: { type: DataTypes.TEXT, allowNull: true },
      special_instructions: { type: DataTypes.TEXT, allowNull: true },
      pickup_date: { type: DataTypes.DATEONLY, allowNull: true },
      delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
      estimated_completion_date: { type: DataTypes.DATEONLY, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Order',
      tableName: 'orders',
      timestamps: false,
    }
  );

  return Order;
};
