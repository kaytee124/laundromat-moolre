const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Payment extends Model {}

  Payment.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: { type: DataTypes.BIGINT, allowNull: false },
      externalref: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
      payment_method: { type: DataTypes.STRING(20), allowNull: false },
      provider: { type: DataTypes.STRING(20), allowNull: true },
      moolre_reference: { type: DataTypes.STRING(100), allowNull: true },
      transaction_id: { type: DataTypes.STRING(100), allowNull: true },
      thirdparty_ref: { type: DataTypes.STRING(100), allowNull: true },
      payer: { type: DataTypes.STRING(255), allowNull: true },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      payer_phone: { type: DataTypes.STRING(20), allowNull: true },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'GHS' },
      fees: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      metadata: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
      paid_at: { type: DataTypes.DATE, allowNull: true },
      last_checked_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Payment',
      tableName: 'payments',
      timestamps: false,
    }
  );

  return Payment;
};
