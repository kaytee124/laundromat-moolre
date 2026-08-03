const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class WelcomeLoginToken extends Model {}

  WelcomeLoginToken.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'WelcomeLoginToken',
      tableName: 'welcome_login_tokens',
      timestamps: false,
    }
  );

  return WelcomeLoginToken;
};
