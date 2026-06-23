const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Service extends Model {}

  Service.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      unit: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
      category: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
      estimated_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'Service',
      tableName: 'services',
      timestamps: false,
    }
  );

  return Service;
};
