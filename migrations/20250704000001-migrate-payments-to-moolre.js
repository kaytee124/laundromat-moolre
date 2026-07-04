'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('payments');

    if (table.reference && !table.externalref) {
      await queryInterface.renameColumn('payments', 'reference', 'externalref');
    }

    if (!table.moolre_reference) {
      await queryInterface.addColumn('payments', 'moolre_reference', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!table.provider) {
      await queryInterface.addColumn('payments', 'provider', {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
    if (!table.thirdparty_ref) {
      await queryInterface.addColumn('payments', 'thirdparty_ref', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!table.payer) {
      await queryInterface.addColumn('payments', 'payer', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
    if (!table.value) {
      await queryInterface.addColumn('payments', 'value', {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      });
    }
    if (!table.last_checked_at) {
      await queryInterface.addColumn('payments', 'last_checked_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (table.verified_at && !table.paid_at) {
      await queryInterface.renameColumn('payments', 'verified_at', 'paid_at');
    }

    await queryInterface.changeColumn('payments', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.sequelize.query(
      "UPDATE payments SET status = 'paid' WHERE status = 'success'"
    );
    await queryInterface.sequelize.query(
      "UPDATE payments SET status = 'failed' WHERE status = 'abandoned'"
    );
    await queryInterface.sequelize.query(
      "UPDATE payments SET provider = 'paystack' WHERE payment_method = 'paystack' AND provider IS NULL"
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('payments', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.sequelize.query(
      "UPDATE payments SET status = 'success' WHERE status = 'paid'"
    );

    const table = await queryInterface.describeTable('payments');

    if (table.paid_at && !table.verified_at) {
      await queryInterface.renameColumn('payments', 'paid_at', 'verified_at');
    }
    if (table.last_checked_at) {
      await queryInterface.removeColumn('payments', 'last_checked_at');
    }
    if (table.value) {
      await queryInterface.removeColumn('payments', 'value');
    }
    if (table.payer) {
      await queryInterface.removeColumn('payments', 'payer');
    }
    if (table.thirdparty_ref) {
      await queryInterface.removeColumn('payments', 'thirdparty_ref');
    }
    if (table.provider) {
      await queryInterface.removeColumn('payments', 'provider');
    }
    if (table.moolre_reference) {
      await queryInterface.removeColumn('payments', 'moolre_reference');
    }
    if (table.externalref && !table.reference) {
      await queryInterface.renameColumn('payments', 'externalref', 'reference');
    }
  },
};
