'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const orders = await queryInterface.describeTable('orders');
    const orderItems = await queryInterface.describeTable('order_items');

    if (!orders.delivery_time) {
      await queryInterface.addColumn('orders', 'delivery_time', {
        type: Sequelize.TIME,
        allowNull: true,
      });
    }
    if (!orders.picked_up) {
      await queryInterface.addColumn('orders', 'picked_up', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!orders.picked_up_at) {
      await queryInterface.addColumn('orders', 'picked_up_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (!tableNames.includes('order_services')) {
      await queryInterface.createTable('order_services', {
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
      });
      await queryInterface.addConstraint('order_services', {
        fields: ['order_id', 'service_id'],
        type: 'unique',
        name: 'order_services_order_id_service_id_unique',
      });
    }

    if (!orderItems.dirty_quantity) {
      await queryInterface.addColumn('order_items', 'dirty_quantity', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!orderItems.clean_quantity) {
      await queryInterface.addColumn('order_items', 'clean_quantity', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (orderItems.quantity) {
      await queryInterface.sequelize.query(
        'UPDATE order_items SET dirty_quantity = quantity WHERE dirty_quantity = 0 AND quantity > 0'
      );
    }

    await queryInterface.sequelize.query(`
      INSERT IGNORE INTO order_services (order_id, service_id)
      SELECT DISTINCT order_id, service_id
      FROM order_items
      WHERE service_id IS NOT NULL
    `);

    if (orderItems.service_id && orderItems.service_id.allowNull === false) {
      await queryInterface.changeColumn('order_items', 'service_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }

    const itemsAfter = await queryInterface.describeTable('order_items');
    if (itemsAfter.quantity) {
      await queryInterface.removeColumn('order_items', 'quantity');
    }
  },

  async down(queryInterface, Sequelize) {
    const orderItems = await queryInterface.describeTable('order_items');

    if (!orderItems.quantity) {
      await queryInterface.addColumn('order_items', 'quantity', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
      await queryInterface.sequelize.query(
        'UPDATE order_items SET quantity = GREATEST(dirty_quantity + clean_quantity, 1)'
      );
    }

    if (orderItems.service_id) {
      await queryInterface.changeColumn('order_items', 'service_id', {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'services', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      });
    }

    if (orderItems.clean_quantity) {
      await queryInterface.removeColumn('order_items', 'clean_quantity');
    }
    if (orderItems.dirty_quantity) {
      await queryInterface.removeColumn('order_items', 'dirty_quantity');
    }

    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((t) => (typeof t === 'string' ? t : t.tableName || t.name));
    if (tableNames.includes('order_services')) {
      await queryInterface.dropTable('order_services');
    }

    const orders = await queryInterface.describeTable('orders');
    if (orders.picked_up_at) {
      await queryInterface.removeColumn('orders', 'picked_up_at');
    }
    if (orders.picked_up) {
      await queryInterface.removeColumn('orders', 'picked_up');
    }
    if (orders.delivery_time) {
      await queryInterface.removeColumn('orders', 'delivery_time');
    }
  },
};
