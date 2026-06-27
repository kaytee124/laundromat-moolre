'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ussd_sessions', {
      session_id: { type: Sequelize.STRING(100), primaryKey: true },
      step: { type: Sequelize.STRING(30), allowNull: false },
      data: { type: Sequelize.JSON, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ussd_sessions');
  },
};
