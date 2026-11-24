import { BULLET_EMOJI } from './emojis.js';

/**
 * Athena Prime - OwO Style Global Commerce & Item Catalog
 * Supports Crates, Consumables/Boosters, Collectibles, and Server Role Perks.
 */

export const SHOP_CATEGORIES = [
  { id: 'crates', name: 'Mystery Crates', label: 'Crates & Boxes', description: 'Unbox surprise coin jackpots, charms, and rare loot' },
  { id: 'boosters', name: 'Boosters & Charms', label: 'Consumables & Boosters', description: 'Timed luck boosters, streak shields, and dividend elixirs' },
  { id: 'collectibles', name: 'Prestige Collectibles', label: 'Prestige & Rings', description: 'Rare rings, crowns, and high-roller trophies' },
  { id: 'roles', name: 'Server Role Perks', label: 'Server Roles', description: 'Custom server roles managed by administrators' }
];

export const BUILTIN_SHOP_ITEMS = [
  // --- CRATES & MYSTERY BOXES ---
  {
    id: 'crate_common',
    name: 'Common Crate',
    category: 'crates',
    price: 500,
    type: 'crate',
    description: 'Unbox 300 – 1,200 Athena coins or a chance at a Lucky Clover.',
    minCoins: 300,
    maxCoins: 1200,
    bonusDrop: { itemId: 'lucky_clover', chance: 0.15 }
  },
  {
    id: 'crate_rare',
    name: 'Rare Crate',
    category: 'crates',
    price: 1500,
    type: 'crate',
    description: 'Unbox 1,000 – 4,500 Athena coins plus chance for Streak Shields or Clovers.',
    minCoins: 1000,
    maxCoins: 4500,
    bonusDrop: { itemId: 'streak_shield', chance: 0.25 }
  },
  {
    id: 'crate_mythic',
    name: 'Mythic Chest',
    category: 'crates',
    price: 5000,
    type: 'crate',
    description: 'High-roller chest dropping 4,000 – 16,000 coins and rare charms or rings.',
    minCoins: 4000,
    maxCoins: 16000,
    bonusDrop: { itemId: 'gambler_charm', chance: 0.35 }
  },

  // --- CONSUMABLES & BOOSTERS ---
  {
    id: 'lucky_clover',
    name: 'Lucky Clover',
    category: 'boosters',
    price: 800,
    type: 'booster',
    durationMs: 60 * 60 * 1000, // 1 hour
    effect: 'luck',
    description: 'Increases gambling win probability (+12%) in Coinflip, Slots, and Blackjack for 1 hour.'
  },
  {
    id: 'streak_shield',
    name: 'Streak Shield',
    category: 'boosters',
    price: 1200,
    type: 'passive',
    description: 'Passive protection: automatically rescues your daily streak if you miss your 24-48h stipend window.'
  },
  {
    id: 'gambler_charm',
    name: 'Gambler\'s Charm',
    category: 'boosters',
    price: 2500,
    type: 'booster',
    durationMs: 2 * 60 * 60 * 1000, // 2 hours
    effect: 'payout',
    description: 'Grants +25% bonus coin payouts on all casino victories (Slots, Coinflip, Blackjack, Roulette) for 2 hours.'
  },
  {
    id: 'daily_potion',
    name: 'Dividend Elixir',
    category: 'boosters',
    price: 1800,
    type: 'booster',
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    effect: 'daily_double',
    description: 'Doubles your total payout on your next !daily stipend claim.'
  },

  // --- PRESTIGE & COLLECTIBLES ---
  {
    id: 'silver_ring',
    name: 'Silver Band Ring',
    category: 'collectibles',
    price: 3000,
    type: 'collectible',
    description: 'Elegant silver ring signifying seasoned server citizenship.'
  },
  {
    id: 'diamond_ring',
    name: 'Flawless Diamond Ring',
    category: 'collectibles',
    price: 10000,
    type: 'collectible',
    description: 'Dazzling gemstone ring proudly showcased on your portfolio.'
  },
  {
    id: 'athena_crown',
    name: 'Imperial Athena Crown',
    category: 'collectibles',
    price: 25000,
    type: 'collectible',
    description: 'Regal crown reserved for elite commerce magnates.'
  },
  {
    id: 'golden_trophy',
    name: 'Golden Athena Trophy',
    category: 'collectibles',
    price: 50000,
    type: 'collectible',
    description: 'The crowning achievement of server wealth and casino mastery.'
  }
];

export function getBuiltinItem(itemId) {
  if (!itemId) return null;
  const clean = itemId.toLowerCase().trim();
  return BUILTIN_SHOP_ITEMS.find(it => it.id === clean || it.name.toLowerCase() === clean);
}

export function getAllShopItems(guildId, db) {
  const customItems = db.getShopItems(guildId).map(it => ({
    ...it,
    category: 'roles',
    type: 'role'
  }));
  return [...BUILTIN_SHOP_ITEMS, ...customItems];
}
