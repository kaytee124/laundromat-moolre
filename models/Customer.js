const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Customer extends Model {}

  Customer.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.BIGINT, allowNull: false, unique: true },
      phone_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      whatsapp_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      address: { type: DataTypes.TEXT, allowNull: false },
      preferred_contact_method: { type: DataTypes.STRING(20), allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      total_orders: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_spent: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      last_order_date: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Customer',
      tableName: 'customers',
      timestamps: false,
    }
  );

  return Customer;
};
