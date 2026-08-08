'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'reminder_24h_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('orders', 'reminder_1h_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'reminder_1h_sent_at');
    await queryInterface.removeColumn('orders', 'reminder_24h_sent_at');
  },
};
