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
  { name: 'SLIT & KABA', category: 'Specialty', sort_order: 140 },
  { name: 'SLIT', category: 'Specialty', sort_order: 150 },
  { name: 'KABA', category: 'Specialty', sort_order: 160 },
  { name: 'KENTE DRESS', category: 'Specialty', sort_order: 170 },
  { name: 'JACKET', category: 'Specialty', sort_order: 180 },
  { name: 'BEADS DRESS', category: 'Specialty', sort_order: 190 },
  { name: 'SUIT UD', category: 'Specialty', sort_order: 200 },
  { name: 'SUIT TOP', category: 'Specialty', sort_order: 210 },
  { name: 'SKIRT & TOP', category: 'Specialty', sort_order: 220 },
  { name: 'LACE DRESS', category: 'Specialty', sort_order: 230 },
  { name: "MEN'S CLOTH", category: 'Specialty', sort_order: 240 },
  { name: 'SHORTS', category: 'Specialty', sort_order: 250 },
  { name: 'SKIRTS', category: 'Specialty', sort_order: 260 },
  { name: 'FACE TOWEL', category: 'Specialty', sort_order: 270 },
  { name: 'HANDKERCHIEF', category: 'Specialty', sort_order: 280 },
  { name: 'GRADUATION GOWN', category: 'Specialty', sort_order: 290 },
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
