const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class OrderStatusHistory extends Model {}

  OrderStatusHistory.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.BIGINT, allowNull: false },
      old_status: { type: DataTypes.STRING(20), allowNull: true },
      new_status: { type: DataTypes.STRING(20), allowNull: false },
      changed_by: { type: DataTypes.BIGINT, allowNull: true },
      changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'OrderStatusHistory',
      tableName: 'order_status_history',
      timestamps: false,
    }
  );

  return OrderStatusHistory;
};
