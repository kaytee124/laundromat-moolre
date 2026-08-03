const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class SmsOutbox extends Model {}

  SmsOutbox.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      recipient: { type: DataTypes.STRING(20), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      ref: { type: DataTypes.STRING(100), allowNull: true },
      purpose: { type: DataTypes.STRING(50), allowNull: false },
      related_type: { type: DataTypes.STRING(20), allowNull: true },
      related_id: { type: DataTypes.BIGINT, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_error: { type: DataTypes.TEXT, allowNull: true },
      last_attempt_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      sent_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'SmsOutbox',
      tableName: 'sms_outbox',
      timestamps: false,
    }
  );

  return SmsOutbox;
};
