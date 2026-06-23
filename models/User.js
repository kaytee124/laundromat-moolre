const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class User extends Model {
    toSafeJSON() {
      const values = { ...this.get() };
      delete values.password_hash;
      return values;
    }
  }

  User.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(128), allowNull: false },
      first_name: { type: DataTypes.STRING(150), allowNull: false, defaultValue: '' },
      last_name: { type: DataTypes.STRING(150), allowNull: false, defaultValue: '' },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'client',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_staff: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_superuser: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      last_login: { type: DataTypes.DATE, allowNull: true },
      date_joined: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: false,
    }
  );

  return User;
};
