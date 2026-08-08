'use strict';

const PAPER_SPECIALTY_ADDONS = [
  { name: 'SLIT & KABA', category: 'Specialty', sort_order: 140 },
  { name: 'SLIT', category: 'Specialty', sort_order: 150 },
  { name: 'KABA', category: 'Specialty', sort_order: 160 },
  { name: 'KENTE DRESS', category: 'Specialty', sort_order: 170 },
  { name: 'JACKET', category: 'Specialty', sort_order: 180 },
  { name: 'BEADS DRESS', category: 'Specialty', sort_order: 190 },
  { name: 'SUIT UD', category: 'Specialty', sort_order: 200 },
  { name: 'SUIT TOP', category: 'Specialty', sort_order: 210 },
  { name: 'SKIRT & TOP', category: 'Specialty', sort_order: 220 },
  { name: 'LACE DRESS', category: 'Specialty', sort_order: 230 },
  { name: "MEN'S CLOTH", category: 'Specialty', sort_order: 240 },
  { name: 'SHORTS', category: 'Specialty', sort_order: 250 },
  { name: 'SKIRTS', category: 'Specialty', sort_order: 260 },
  { name: 'FACE TOWEL', category: 'Specialty', sort_order: 270 },
  { name: 'HANDKERCHIEF', category: 'Specialty', sort_order: 280 },
  { name: 'GRADUATION GOWN', category: 'Specialty', sort_order: 290 },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      'SELECT name FROM addon_catalog_items'
    );
    const existingNames = new Set(existing.map((row) => row.name));
    const now = new Date();
    const toInsert = PAPER_SPECIALTY_ADDONS.filter((row) => !existingNames.has(row.name)).map(
      (row) => ({
        ...row,
        is_active: true,
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
      })
    );

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('addon_catalog_items', toInsert);
    }
  },

  async down(queryInterface) {
    const names = PAPER_SPECIALTY_ADDONS.map((row) => row.name);
    await queryInterface.bulkDelete('addon_catalog_items', {
      name: names,
    });
  },
};
