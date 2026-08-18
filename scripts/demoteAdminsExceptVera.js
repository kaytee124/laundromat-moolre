/**
 * Demote all admin users to employee except username "vera".
 *
 * Usage:
 *   node scripts/demoteAdminsExceptVera.js --dry-run
 *   node scripts/demoteAdminsExceptVera.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const { User, sequelize } = require('../models');

const KEEP_ADMIN_USERNAME = 'vera';
const dryRun = process.argv.includes('--dry-run');

async function main() {
  await sequelize.authenticate();

  const targets = await User.findAll({
    where: {
      role: 'admin',
      username: { [Op.ne]: KEEP_ADMIN_USERNAME },
    },
    attributes: ['id', 'username', 'role', 'is_active', 'is_staff', 'is_superuser'],
    order: [['username', 'ASC']],
  });

  if (!targets.length) {
    console.log(
      JSON.stringify(
        {
          event: 'demote_admins_except_vera',
          dry_run: dryRun,
          changed: 0,
          message: 'No admin users to demote (vera is the only admin or none exist).',
        },
        null,
        2
      )
    );
    return;
  }

  const preview = targets.map((u) => ({
    id: u.id,
    username: u.username,
    from_role: u.role,
    to_role: 'employee',
  }));

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          event: 'demote_admins_except_vera',
          dry_run: true,
          would_change: preview.length,
          users: preview,
        },
        null,
        2
      )
    );
    return;
  }

  const now = new Date();
  for (const user of targets) {
    user.role = 'employee';
    user.is_staff = true;
    user.is_superuser = false;
    user.updated_at = now;
    await user.save();
  }

  console.log(
    JSON.stringify(
      {
        event: 'demote_admins_except_vera',
        dry_run: false,
        changed: targets.length,
        kept_admin: KEEP_ADMIN_USERNAME,
        users: preview,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
