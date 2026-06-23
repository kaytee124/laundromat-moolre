'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('orders', ['order_status', 'created_at'], {
      name: 'idx_orders_status_created_at',
    });
    await queryInterface.addIndex('orders', ['customer_id', 'created_at'], {
      name: 'idx_orders_customer_created_at',
    });
    await queryInterface.addIndex('orders', ['payment_status'], {
      name: 'idx_orders_payment_status',
    });
    await queryInterface.addIndex('orders', ['created_at'], {
      name: 'idx_orders_created_at',
    });
    await queryInterface.addIndex('users', ['role'], {
      name: 'idx_users_role',
    });
    await queryInterface.addIndex('payments', ['status', 'created_at'], {
      name: 'idx_payments_status_created_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'idx_payments_status_created_at');
    await queryInterface.removeIndex('users', 'idx_users_role');
    await queryInterface.removeIndex('orders', 'idx_orders_created_at');
    await queryInterface.removeIndex('orders', 'idx_orders_payment_status');
    await queryInterface.removeIndex('orders', 'idx_orders_customer_created_at');
    await queryInterface.removeIndex('orders', 'idx_orders_status_created_at');
  },
};
