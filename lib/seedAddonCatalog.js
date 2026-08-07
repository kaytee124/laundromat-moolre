const { AddonCatalogItem } = require('../models');

const DEFAULT_ADDONS = [
  { name: 'SINGLETS', category: 'Undergarments', sort_order: 10 },
  { name: 'BOXERS', category: 'Undergarments', sort_order: 20 },
  { name: 'UNDERWEAR', category: 'Undergarments', sort_order: 30 },
  { name: 'INNER', category: 'Undergarments', sort_order: 40 },
  { name: 'VEST', category: 'Undergarments', sort_order: 50 },
  { name: 'BLANKETS', category: 'Bedding extras', sort_order: 60 },
  { name: 'PILLOWCASE', category: 'Bedding extras', sort_order: 70 },
  { name: 'SMOCK', category: 'Garments', sort_order: 80 },
  { name: 'JALABIA', category: 'Garments', sort_order: 90 },
  { name: 'NIGHTWEAR', category: 'Garments', sort_order: 100 },
  { name: 'KAFTAN', category: 'Garments', sort_order: 110 },
  { name: 'KENTE CLOTH', category: 'Specialty', sort_order: 120 },
  { name: 'KENTE SLIT AND KABA', category: 'Specialty', sort_order: 130 },
];

async function seedAddonCatalogDefaults() {
  const now = new Date();
  const count = await AddonCatalogItem.count();
  if (count > 0) return { created: 0 };

  await AddonCatalogItem.bulkCreate(
    DEFAULT_ADDONS.map((row) => ({
      ...row,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
  );
  return { created: DEFAULT_ADDONS.length };
}

module.exports = {
  DEFAULT_ADDONS,
  seedAddonCatalogDefaults,
};
