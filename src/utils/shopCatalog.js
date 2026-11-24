import { BULLET_EMOJI } from './emojis.js';

/**
 * Athena Prime - OwO Style Comprehensive Global Commerce & Item Catalog
 * Features 52+ unique items across 7 distinct departments:
 * 1. Mystery Crates & Ancient Relic Vaults
 * 2. Consumables, Charms & Boosters
 * 3. Adventure, Hunting & Gathering Gear
 * 4. Rare Gems, Minerals & Ores
 * 5. Prestige & Luxury Flex Assets
 * 6. Mythical Eggs & Companions
 * 7. Server Role Perks
 */

export const SHOP_CATEGORIES = [
  { id: 'crates', name: 'Mystery Crates & Relic Vaults', label: 'Crates & Boxes', description: 'Crack open surprise coin jackpots, charms, and rare loot' },
  { id: 'boosters', name: 'Boosters, Potions & Charms', label: 'Boosters & Buffs', description: 'Timed luck boosters, streak shields, and casino payout charms' },
  { id: 'gear', name: 'Adventure & Gathering Gear', label: 'Gear & Tools', description: 'Fishing rods, hunter bows, mining drills, and enchanted bait' },
  { id: 'gems', name: 'Gems, Minerals & Ores', label: 'Gems & Ores', description: 'Rare cut rubies, sapphires, emeralds, bullion, and cosmic prism' },
  { id: 'collectibles', name: 'Prestige & Luxury Flex', label: 'Prestige & Flex', description: 'Rings, iced watches, golden supercars, and space stations' },
  { id: 'pets', name: 'Mythical Eggs & Companions', label: 'Pets & Eggs', description: 'Incubate dragon and phoenix eggs, feed gourmet treats' },
  { id: 'roles', name: 'Server Role Perks', label: 'Server Roles', description: 'Custom server roles managed by administrators' }
];

export const BUILTIN_SHOP_ITEMS = [
  // ==========================================
  // 1. CRATES & MYSTERY BOXES
  // ==========================================
  {
    id: 'box_lucky',
    name: 'Lucky Surprise Box',
    category: 'crates',
    price: 250,
    sellPrice: 125,
    type: 'crate',
    description: 'High-volatility gamble box: drops between 10 to 3,000 coins or surprise charms.',
    minCoins: 10,
    maxCoins: 3000,
    bonusDrop: { itemId: 'lucky_clover', chance: 0.10 }
  },
  {
    id: 'crate_common',
    name: 'Common Crate',
    category: 'crates',
    price: 500,
    sellPrice: 250,
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
    sellPrice: 750,
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
    sellPrice: 2500,
    type: 'crate',
    description: 'High-roller chest dropping 4,000 – 16,000 coins and rare charms or rings.',
    minCoins: 4000,
    maxCoins: 16000,
    bonusDrop: { itemId: 'gambler_charm', chance: 0.35 }
  },
  {
    id: 'crate_celestial',
    name: 'Celestial Vault',
    category: 'crates',
    price: 15000,
    sellPrice: 7500,
    type: 'crate',
    description: 'Legendary vault unsealing 12,000 – 45,000 coins + chance for Diamonds or Gem Geodes.',
    minCoins: 12000,
    maxCoins: 45000,
    bonusDrop: { itemId: 'diamond_ring', chance: 0.15 }
  },
  {
    id: 'geode_gem',
    name: 'Crystalline Geode',
    category: 'crates',
    price: 2000,
    sellPrice: 1000,
    type: 'crate',
    description: 'Crack open to discover 800 – 2,500 coins and guaranteed rare gemstone drops.',
    minCoins: 800,
    maxCoins: 2500,
    bonusDrop: { itemId: 'gem_ruby', chance: 0.50 }
  },
  {
    id: 'urn_ancient',
    name: 'Ancient Relic Urn',
    category: 'crates',
    price: 8000,
    sellPrice: 4000,
    type: 'crate',
    description: 'Unseal ancient Egyptian relic urn: drops 6,000 – 24,000 coins + chance for Void Amethyst.',
    minCoins: 6000,
    maxCoins: 24000,
    bonusDrop: { itemId: 'gem_amethyst', chance: 0.30 }
  },
  {
    id: 'vault_dragon',
    name: 'Dragon Hoard Cache',
    category: 'crates',
    price: 25000,
    sellPrice: 12500,
    type: 'crate',
    description: 'Epic dragon hoard: 20,000 – 75,000 coins + chance for Dragon Egg or Royal Scepter.',
    minCoins: 20000,
    maxCoins: 75000,
    bonusDrop: { itemId: 'egg_dragon', chance: 0.20 }
  },

  // ==========================================
  // 2. CONSUMABLES & BOOSTERS
  // ==========================================
  {
    id: 'lucky_clover',
    name: 'Lucky Clover',
    category: 'boosters',
    price: 800,
    sellPrice: 400,
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
    sellPrice: 600,
    type: 'passive',
    description: 'Passive protection: automatically rescues your daily streak if you miss your 24-48h window.'
  },
  {
    id: 'daily_potion',
    name: 'Dividend Elixir',
    category: 'boosters',
    price: 1800,
    sellPrice: 900,
    type: 'booster',
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    effect: 'daily_double',
    description: 'Doubles your total payout on your next !daily stipend claim.'
  },
  {
    id: 'gambler_charm',
    name: 'Gambler\'s Charm',
    category: 'boosters',
    price: 2500,
    sellPrice: 1250,
    type: 'booster',
    durationMs: 2 * 60 * 60 * 1000, // 2 hours
    effect: 'payout',
    description: 'Grants +25% bonus coin payouts on all casino victories (Slots, Coinflip, Blackjack) for 2 hours.'
  },
  {
    id: 'coin_magnet',
    name: 'Coin Magnet',
    category: 'boosters',
    price: 2200,
    sellPrice: 1100,
    type: 'booster',
    durationMs: 2 * 60 * 60 * 1000, // 2 hours
    effect: 'coin_magnet',
    description: 'Magnetizes +35 extra bonus coins on every casino game, hunt, fish, or mine activity for 2 hours.'
  },
  {
    id: 'golden_horseshoe',
    name: 'Golden Horseshoe',
    category: 'boosters',
    price: 3500,
    sellPrice: 1750,
    type: 'booster',
    durationMs: 30 * 60 * 1000, // 30 mins
    effect: 'super_luck',
    description: 'Extreme fortune: grants +20% win chance across all casino games for 30 minutes.'
  },
  {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    category: 'boosters',
    price: 3000,
    sellPrice: 1500,
    type: 'passive',
    effect: 'loss_insurance',
    description: 'Passive loss insurance: automatically refunds 50% of your lost wager on your next casino defeat.'
  },
  {
    id: 'energy_drink',
    name: 'Coffee Energizer',
    category: 'boosters',
    price: 1000,
    sellPrice: 500,
    type: 'instant',
    effect: 'cooldown_cut',
    description: 'Drink to instantly reduce your !daily stipend cooldown by 6 hours.'
  },
  {
    id: 'loaded_dice',
    name: 'Loaded Casino Dice',
    category: 'boosters',
    price: 2800,
    sellPrice: 1400,
    type: 'booster',
    durationMs: 60 * 60 * 1000, // 1 hour
    effect: 'dice_luck',
    description: 'Rigged lucky dice: grants +15% bonus payout in Blackjack and Slots for 1 hour.'
  },
  {
    id: 'chronos_hourglass',
    name: 'Hourglass of Chronos',
    category: 'boosters',
    price: 3200,
    sellPrice: 1600,
    type: 'instant',
    effect: 'reset_cooldowns',
    description: 'Turn back time: instantly clears all cooldowns for !hunt, !fish, and !mine.'
  },
  {
    id: 'banker_vault_key',
    name: 'Swiss Vault Key',
    category: 'boosters',
    price: 5000,
    sellPrice: 2500,
    type: 'passive',
    effect: 'bank_interest',
    description: 'Passive banking privilege: boosts interest earnings on banked savings by +5%.'
  },

  // ==========================================
  // 3. HUNTING, FISHING & MINING GEAR
  // ==========================================
  {
    id: 'fishing_rod',
    name: 'Sturdy Fishing Rod',
    category: 'gear',
    price: 1500,
    sellPrice: 750,
    type: 'tool',
    description: 'Permanent tool: equips you to cast line in !fish to catch sea creatures and sunken treasure.'
  },
  {
    id: 'hunting_bow',
    name: 'Hunter\'s Longbow',
    category: 'gear',
    price: 2000,
    sellPrice: 1000,
    type: 'tool',
    description: 'Permanent tool: equips you to track & hunt animals in !hunt for coin bounties.'
  },
  {
    id: 'golden_net',
    name: 'Golden Net',
    category: 'gear',
    price: 4000,
    sellPrice: 2000,
    type: 'tool',
    description: 'Permanent luxury net: doubles the probability of capturing mythical creatures in !hunt and !fish.'
  },
  {
    id: 'enchanted_bait',
    name: 'Enchanted Bait',
    category: 'gear',
    price: 600,
    sellPrice: 300,
    type: 'consumable_charges',
    charges: 5,
    description: '5-pack magic bait: guarantees high-tier exotic creature catches on your next 5 hunts/casts.'
  },
  {
    id: 'titan_harpoon',
    name: 'Titan Harpoon',
    category: 'gear',
    price: 5500,
    sellPrice: 2750,
    type: 'tool',
    description: 'Epic deep-sea harpoon: unlocks massive deep ocean sharks, krakens and +75% fishing bounties.'
  },
  {
    id: 'recurve_crossbow',
    name: 'Dragon Hunter Crossbow',
    category: 'gear',
    price: 6000,
    sellPrice: 3000,
    type: 'tool',
    description: 'Elite heavy crossbow: unlocks apex mythical beasts and +75% hunting bounties in !hunt.'
  },
  {
    id: 'iron_pickaxe',
    name: 'Sturdy Iron Pickaxe',
    category: 'gear',
    price: 1800,
    sellPrice: 900,
    type: 'tool',
    description: 'Essential mining tool: excavates underground stone, coal, iron, and gold ores in !mine.'
  },
  {
    id: 'diamond_drill',
    name: 'Diamond Core Drill',
    category: 'gear',
    price: 7500,
    sellPrice: 3750,
    type: 'tool',
    description: 'High-tech drill: triples rare gemstone extraction probability in !mine.'
  },
  {
    id: 'mining_dynamite',
    name: 'Mining Dynamite',
    category: 'gear',
    price: 1200,
    sellPrice: 600,
    type: 'consumable_charges',
    charges: 3,
    description: '3-pack explosive dynamite: blasts 3x ore chunks on your next 3 mining excavations in !mine.'
  },

  // ==========================================
  // 4. GEMS, MINERALS & ORES
  // ==========================================
  {
    id: 'ore_iron',
    name: 'Refined Iron Ingot',
    category: 'gems',
    price: 400,
    sellPrice: 300,
    type: 'gem',
    description: 'Smelted industrial iron ingot excavated from mining shafts.'
  },
  {
    id: 'ore_gold',
    name: 'Pure Gold Bullion',
    category: 'gems',
    price: 1500,
    sellPrice: 1200,
    type: 'gem',
    description: 'Solid 24-karat investment grade gold bullion bar.'
  },
  {
    id: 'gem_ruby',
    name: 'Blood Ruby',
    category: 'gems',
    price: 3500,
    sellPrice: 2800,
    type: 'gem',
    description: 'A radiant deep crimson gemstone cut by master jewelers.'
  },
  {
    id: 'gem_sapphire',
    name: 'Star Sapphire',
    category: 'gems',
    price: 4500,
    sellPrice: 3600,
    type: 'gem',
    description: 'A cosmic blue crystal reflecting distant starlight.'
  },
  {
    id: 'gem_emerald',
    name: 'Deep Emerald',
    category: 'gems',
    price: 5500,
    sellPrice: 4400,
    type: 'gem',
    description: 'A glowing forest-green jewel imbued with ancient earth essence.'
  },
  {
    id: 'gem_amethyst',
    name: 'Void Amethyst',
    category: 'gems',
    price: 7000,
    sellPrice: 5600,
    type: 'gem',
    description: 'A mystic violet crystal pulsating with arcane energy.'
  },
  {
    id: 'rainbow_prism',
    name: 'Rainbow Prism',
    category: 'gems',
    price: 15000,
    sellPrice: 12000,
    type: 'gem',
    description: 'A legendary prismatic artifact that refracts pure spectrum light.'
  },
  {
    id: 'cosmic_netherite',
    name: 'Cosmic Netherite',
    category: 'gems',
    price: 25000,
    sellPrice: 20000,
    type: 'gem',
    description: 'Ultra-dense extraterrestrial meteorite metal forged in the heart of a dying star.'
  },
  {
    id: 'star_of_athena',
    name: 'The Star of Athena',
    category: 'gems',
    price: 50000,
    sellPrice: 40000,
    type: 'gem',
    description: 'Mythical 500-carat flawless diamond, the most coveted natural mineral in existence.'
  },

  // ==========================================
  // 5. PRESTIGE & LUXURY FLEX
  // ==========================================
  {
    id: 'silver_ring',
    name: 'Silver Band Ring',
    category: 'collectibles',
    price: 3000,
    sellPrice: 2100,
    type: 'collectible',
    description: 'Elegant silver ring signifying seasoned server citizenship.'
  },
  {
    id: 'promise_ring',
    name: 'Oath Promise Ring',
    category: 'collectibles',
    price: 6000,
    sellPrice: 4200,
    type: 'collectible',
    description: 'Sentimental promise ring crafted for cherished partner duos.'
  },
  {
    id: 'diamond_ring',
    name: 'Flawless Diamond Ring',
    category: 'collectibles',
    price: 12000,
    sellPrice: 8400,
    type: 'collectible',
    description: 'Dazzling gemstone ring proudly showcased on your portfolio.'
  },
  {
    id: 'diamond_rolex',
    name: 'Iced-Out Diamond Watch',
    category: 'collectibles',
    price: 18000,
    sellPrice: 12600,
    type: 'collectible',
    description: 'Heavy platinum timepiece iced out with VS1 pavé diamonds.'
  },
  {
    id: 'royal_scepter',
    name: 'Royal Jeweled Scepter',
    category: 'collectibles',
    price: 25000,
    sellPrice: 17500,
    type: 'collectible',
    description: 'Golden scepter of authority embedded with ruby and sapphire accents.'
  },
  {
    id: 'athena_crown',
    name: 'Imperial Athena Crown',
    category: 'collectibles',
    price: 40000,
    sellPrice: 28000,
    type: 'collectible',
    description: 'Regal crown reserved for elite commerce magnates.'
  },
  {
    id: 'golden_trophy',
    name: 'Golden Athena Trophy',
    category: 'collectibles',
    price: 60000,
    sellPrice: 42000,
    type: 'collectible',
    description: 'The crowning achievement of server wealth and casino mastery.'
  },
  {
    id: 'supercar_gold',
    name: 'Golden Hypercar',
    category: 'collectibles',
    price: 100000,
    sellPrice: 70000,
    type: 'collectible',
    description: 'Ultra-luxurious 24K gold hypercar displayed on your financial portfolio.'
  },
  {
    id: 'luxury_yacht',
    name: '150ft Luxury Superyacht',
    category: 'collectibles',
    price: 175000,
    sellPrice: 122500,
    type: 'collectible',
    description: 'Ocean-going luxury cruiser equipped with dual helipads and infinity jacuzzi.'
  },
  {
    id: 'royal_mansion',
    name: 'Beverly Hills Royal Villa',
    category: 'collectibles',
    price: 250000,
    sellPrice: 175000,
    type: 'collectible',
    description: 'Gated 12-bedroom architectural mansion for prime real estate tycoons.'
  },
  {
    id: 'island_deed',
    name: 'Private Island Deed',
    category: 'collectibles',
    price: 400000,
    sellPrice: 280000,
    type: 'collectible',
    description: 'The ultimate tycoon flex: ownership deed to an exclusive tropical haven.'
  },
  {
    id: 'space_station',
    name: 'Orbital Space Station',
    category: 'collectibles',
    price: 1000000,
    sellPrice: 700000,
    type: 'collectible',
    description: 'Private research satellite in low Earth orbit — the peak pinnacle of global wealth.'
  },

  // ==========================================
  // 6. MYTHICAL PETS & COMPANIONS
  // ==========================================
  {
    id: 'pet_treats',
    name: 'Gourmet Pet Treats',
    category: 'pets',
    price: 500,
    sellPrice: 250,
    type: 'consumable_charges',
    charges: 5,
    description: '5-pack nutritious gourmet treats to nurture and bond with animal companions.'
  },
  {
    id: 'egg_mystery',
    name: 'Mystery Beast Egg',
    category: 'pets',
    price: 3000,
    sellPrice: 1500,
    type: 'egg',
    description: 'Warm speckled egg that incubates into a loyal woodland or sea creature.'
  },
  {
    id: 'egg_dragon',
    name: 'Golden Dragon Egg',
    category: 'pets',
    price: 15000,
    sellPrice: 7500,
    type: 'egg',
    description: 'Ancient draconic egg pulsating with warm golden embers and flame.'
  },
  {
    id: 'egg_phoenix',
    name: 'Celestial Phoenix Egg',
    category: 'pets',
    price: 25000,
    sellPrice: 12500,
    type: 'egg',
    description: 'Perpetual flame egg radiating soothing celestial solar warmth.'
  }
];

/**
 * Custom Emoji Registry for Global Shop Items
 * When the user provides custom emojis, their Discord emoji tags/IDs are registered here.
 */
export const ITEM_EMOJIS = {
  // Mystery Crates & Relic Vaults
  box_lucky: '<a:color_box_lucky:1574746542588436580>',
  crate_common: '<a:color_crate_common:1574746642593091674>',
  crate_rare: '<a:color_crate_rare:1574746659433484318>',
  crate_mythic: '<a:color_crate_mythic:1574746654517633186>',
  crate_celestial: '<a:color_crate_celestial:1574746638046593114>',
  geode_gem: '<a:color_geode_gem:1574747027810812026>',
  urn_ancient: '<a:color_urn_ancient:1574747684475117628>',
  vault_dragon: '<a:color_vault_dragon:1574747690439417856>',

  // Boosters, Potions & Charms
  lucky_clover: '<a:color_lucky_clover:1574747145620164718>',
  streak_shield: '<a:color_streak_shield:1574747628858642482>',
  daily_potion: '<a:color_daily_potion:1574746678303400029>',
  gambler_charm: '<a:color_gambler_charm:1574747001063612508>',
  coin_magnet: '<a:color_coin_magnet:1574746596757872792>',
  golden_horseshoe: '<a:color_golden_horseshoe:1574747032864821360>',
  phoenix_feather: '<a:color_phoenix_feather:1574747265648693288>',
  energy_drink: '<a:color_energy_drink:1574746983510442024>',
  loaded_dice: '<a:color_loaded_dice:1574747131208663040>',
  chronos_hourglass: '<a:color_chronos_hourglass:1574746547369807912>',
  banker_vault_key: '<a:color_banker_vault_key:1574746531314139216>',

  // Adventure, Hunting & Gathering Gear
  fishing_rod: '<a:color_fishing_rod:1574746992817733682>',
  hunting_bow: '<a:color_hunting_bow:1574747088502399126>',
  golden_net: '<a:color_golden_net:1574747039093235712>',
  enchanted_bait: '<a:color_enchanted_bait:1574746979723124756>',
  titan_harpoon: '<a:color_titan_harpoon:1574747669841186898>',
  recurve_crossbow: '<a:color_recurve_crossbow:1574747290663522434>',
  iron_pickaxe: '<a:color_iron_pickaxe:1574747102154588232>',
  diamond_drill: '<a:color_diamond_drill:1574746693616926790>',
  mining_dynamite: '<a:color_mining_dynamite:1574747164717092914>',

  // Gems, Minerals & Ores
  ore_iron: '<a:color_ore_iron:1574747180650995753>',
  ore_gold: '<a:color_ore_gold:1574747174288490607>',
  gem_ruby: '<a:color_gem_ruby:1574747017362673685>',
  gem_sapphire: '<a:color_gem_sapphire:1574747022609883277>',
  gem_emerald: '<a:color_gem_emerald:1574747012891410463>',
  gem_amethyst: '<a:color_gem_amethyst:1574747005341667328>',
  rainbow_prism: '<a:color_rainbow_prism:1574747284858470490>',
  cosmic_netherite: '<a:color_cosmic_netherite:1574746612998213674>',
  star_of_athena: '<a:color_star_of_athena:1574747607912288326>',

  // Prestige & Luxury Flex
  silver_ring: '<a:color_silver_ring:1574747258073653368>',
  promise_ring: '<a:color_promise_ring:1574747271910658191>',
  diamond_ring: '<a:color_diamond_ring:1574746703330807908>',
  diamond_rolex: '<a:color_diamond_rolex:1574746710079447050>',
  royal_scepter: '<a:color_royal_scepter:1574747298162810880>',
  athena_crown: '<a:color_athena_crown:1574746332579500083>',
  golden_trophy: '<a:color_golden_trophy:1574747060056367268>',
  supercar_gold: '<a:color_supercar_gold:1574747664266952724>',
  luxury_yacht: '<a:color_luxury_yacht:1574747156353523763>',
  royal_mansion: '<a:color_royal_mansion:1574747294702637117>',
  island_deed: '<a:color_island_deed:1574747108983177366>',
  space_station: '<a:color_space_station:1574747601083830343>',

  // Mythical Pets & Companions
  pet_treats: '<a:color_pet_treats:1574746938031476836>',
  egg_mystery: '<a:color_egg_mystery:1574746962379669566>',
  egg_dragon: '<a:color_egg_dragon:1574746958420246578>',
  egg_phoenix: '<a:color_egg_phoenix:1574746972617838672>'
};

export function getItemEmoji(itemId) {
  if (!itemId) return '';
  return ITEM_EMOJIS[itemId.toLowerCase().trim()] || '';
}

export function getBuiltinItem(itemId) {
  if (!itemId) return null;
  const clean = itemId.toLowerCase().trim();
  return BUILTIN_SHOP_ITEMS.find(it => it.id === clean || it.name.toLowerCase() === clean);
}

export function getItemSellPrice(itemId) {
  const item = getBuiltinItem(itemId);
  if (!item) return 0;
  if (item.sellPrice) return item.sellPrice;
  return Math.floor((item.price || 0) * 0.5);
}

export function getAllShopItems(guildId, db) {
  const customItems = db.getShopItems(guildId).map(it => ({
    ...it,
    category: 'roles',
    type: 'role'
  }));
  return [...BUILTIN_SHOP_ITEMS, ...customItems];
}
