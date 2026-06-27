const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class UssdSession extends Model {}

  UssdSession.init(
    {
      session_id: { type: DataTypes.STRING(100), primaryKey: true },
      step: { type: DataTypes.STRING(30), allowNull: false },
      data: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'UssdSession',
      tableName: 'ussd_sessions',
      timestamps: false,
    }
  );

  return UssdSession;
};
