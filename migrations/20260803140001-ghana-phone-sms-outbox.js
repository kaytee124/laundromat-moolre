'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'phone_needs_correction', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.createTable('sms_outbox', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      recipient: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      ref: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      purpose: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      related_type: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      related_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      last_attempt_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('sms_outbox', ['status'], {
      name: 'sms_outbox_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('sms_outbox', 'sms_outbox_status_idx');
    await queryInterface.dropTable('sms_outbox');
    await queryInterface.removeColumn('customers', 'phone_needs_correction');
  },
};
