const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class OrderService extends Model {}

  OrderService.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.BIGINT, allowNull: false },
      service_id: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'OrderService',
      tableName: 'order_services',
      timestamps: false,
    }
  );

  return OrderService;
};
