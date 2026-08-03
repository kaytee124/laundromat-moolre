'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('welcome_login_tokens', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('welcome_login_tokens', ['user_id'], {
      name: 'welcome_login_tokens_user_id',
    });
    await queryInterface.addIndex('welcome_login_tokens', ['expires_at'], {
      name: 'welcome_login_tokens_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('welcome_login_tokens');
  },
};
