'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(150), allowNull: false, unique: true },
      email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(128), allowNull: false },
      first_name: { type: Sequelize.STRING(150), allowNull: false, defaultValue: '' },
      last_name: { type: Sequelize.STRING(150), allowNull: false, defaultValue: '' },
      role: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'client' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_staff: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_superuser: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_login: { type: Sequelize.DATE, allowNull: true },
      date_joined: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
    });

    await queryInterface.createTable('customers', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      phone_number: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      whatsapp_number: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      address: { type: Sequelize.TEXT, allowNull: false },
      preferred_contact_method: { type: Sequelize.STRING(20), allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      total_orders: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      total_spent: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      last_order_date: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
    });

    await queryInterface.createTable('services', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      unit: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
      category: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
      estimated_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('orders', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      order_number: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      customer_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      assigned_to: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      order_status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      payment_status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      amount_paid: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      delivery_notes: { type: Sequelize.TEXT, allowNull: true },
      special_instructions: { type: Sequelize.TEXT, allowNull: true },
      pickup_date: { type: Sequelize.DATEONLY, allowNull: true },
      delivery_date: { type: Sequelize.DATEONLY, allowNull: true },
      estimated_completion_date: { type: Sequelize.DATEONLY, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
    });

    await queryInterface.createTable('order_items', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      service_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'services', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      item_name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      unit_price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      subtotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('payments', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      reference: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      payment_method: { type: Sequelize.STRING(20), allowNull: false },
      transaction_id: { type: Sequelize.STRING(100), allowNull: true },
      payer_phone: { type: Sequelize.STRING(20), allowNull: true },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'GHS' },
      fees: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      metadata: { type: Sequelize.JSON, allowNull: true },
      verified_at: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
    });

    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_jti: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      blacklisted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('order_status_history', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      old_status: { type: Sequelize.STRING(20), allowNull: true },
      new_status: { type: Sequelize.STRING(20), allowNull: false },
      changed_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      changed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_status_history');
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
    await queryInterface.dropTable('services');
    await queryInterface.dropTable('customers');
    await queryInterface.dropTable('users');
  },
};
