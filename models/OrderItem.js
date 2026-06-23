const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class OrderItem extends Model {}

  OrderItem.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.BIGINT, allowNull: false },
      service_id: { type: DataTypes.BIGINT, allowNull: false },
      item_name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'OrderItem',
      tableName: 'order_items',
      timestamps: false,
    }
  );

  return OrderItem;
};
