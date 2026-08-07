'use strict';

const SEED_ADDONS = [
  { name: 'SINGLETS', category: 'Undergarments', sort_order: 10 },
  { name: 'BOXERS', category: 'Undergarments', sort_order: 20 },
  { name: 'UNDERWEAR', category: 'Undergarments', sort_order: 30 },
  { name: 'INNER', category: 'Undergarments', sort_order: 40 },
  { name: 'VEST', category: 'Undergarments', sort_order: 50 },
  { name: 'BLANKETS', category: 'Bedding extras', sort_order: 60 },
  { name: 'PILLOWCASE', category: 'Bedding extras', sort_order: 70 },
  { name: 'SMOCK', category: 'Garments', sort_order: 80 },
  { name: 'JALABIA', category: 'Garments', sort_order: 90 },
  { name: 'NIGHTWEAR', category: 'Garments', sort_order: 100 },
  { name: 'KAFTAN', category: 'Garments', sort_order: 110 },
  { name: 'KENTE CLOTH', category: 'Specialty', sort_order: 120 },
  { name: 'KENTE SLIT AND KABA', category: 'Specialty', sort_order: 130 },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('addon_catalog_items', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    const now = new Date();
    await queryInterface.bulkInsert(
      'addon_catalog_items',
      SEED_ADDONS.map((row) => ({
        ...row,
        is_active: true,
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('addon_catalog_items');
  },
};
