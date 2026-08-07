'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE order_items
      SET item_name = 'SHIRTS'
      WHERE UPPER(TRIM(item_name)) = 'TOPS'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE order_items
      SET item_name = 'TOPS'
      WHERE UPPER(TRIM(item_name)) = 'SHIRTS'
    `);
  },
};
