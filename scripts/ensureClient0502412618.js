/**
 * One-shot: ensure client phone 0502412618 exists and send welcome SMS.
 * Usage: node scripts/ensureClient0502412618.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const { User, Customer, sequelize } = require('../models');
const { hashPassword } = require('../services/authService');
const { buildDefaultPassword } = require('../utils/passwords');
const { normalizeMsisdn, getMsisdnLookupVariants } = require('../utils/phone');
const { sendWelcomeSms } = require('../services/customerNotificationService');
const { createWelcomeLoginToken } = require('../services/welcomeLoginTokenService');

const PHONE = '0502412618';
const USERNAME = 'client_0502412618';

async function main() {
  const phone = normalizeMsisdn(PHONE);
  const variants = getMsisdnLookupVariants(phone);

  let customer = await Customer.findOne({
    where: {
      [Op.or]: [
        { phone_number: { [Op.in]: variants } },
        { whatsapp_number: { [Op.in]: variants } },
      ],
    },
    include: [{ model: User, as: 'user' }],
  });

  let username = USERNAME;
  let created = false;

  if (!customer) {
    const existingUser = await User.findOne({ where: { username: USERNAME } });
    if (existingUser) {
      throw new Error(`Username ${USERNAME} already exists without matching customer phone`);
    }

    const password_hash = await hashPassword(buildDefaultPassword(USERNAME));
    const now = new Date();

    await sequelize.transaction(async (t) => {
      const user = await User.create(
        {
          username: USERNAME,
          password_hash,
          first_name: 'Client',
          last_name: '0502412618',
          role: 'client',
          is_active: true,
          is_staff: false,
          is_superuser: false,
          date_joined: now,
          updated_at: now,
        },
        { transaction: t }
      );

      customer = await Customer.create(
        {
          user_id: user.id,
          phone_number: phone,
          whatsapp_number: phone,
          address: 'Seeded for welcome SMS',
          preferred_contact_method: 'phone',
          notes: 'Created by ensureClient0502412618 script',
          created_at: now,
          updated_at: now,
        },
        { transaction: t }
      );
      customer.user = user;
    });

    created = true;
    console.log(`Created client ${USERNAME} with phone ${phone}`);
  } else {
    username = customer.user?.username || USERNAME;
    console.log(`Client already exists (customer_id ${customer.id}, username ${username})`);
  }

  const welcomeToken = await createWelcomeLoginToken(
    customer.user?.id || (await User.findOne({ where: { username } })).id
  );
  await sendWelcomeSms({ phoneNumber: phone, username, welcomeToken });
  console.log(`Welcome SMS sent to ${phone} (international recipient via formatSmsRecipient)`);
  console.log(JSON.stringify({ created, username, phone }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
