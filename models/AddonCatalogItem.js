const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class AddonCatalogItem extends Model {}

  AddonCatalogItem.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      category: { type: DataTypes.STRING(50), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'AddonCatalogItem',
      tableName: 'addon_catalog_items',
      timestamps: false,
    }
  );

  return AddonCatalogItem;
};
