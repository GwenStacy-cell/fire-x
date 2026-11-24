import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, CMD_FISH_EMOJI, CMD_HUNT_EMOJI, CMD_MINE_EMOJI, CMD_SELL_EMOJI, SLOT_EMOJIS } from '../utils/emojis.js';
import { PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync, isExtraOwnerOrHigher, formatUserLink } from '../utils/helpers.js';
import { BUILTIN_SHOP_ITEMS, SHOP_CATEGORIES, getBuiltinItem, getAllShopItems, getItemEmoji, getItemSellPrice } from '../utils/shopCatalog.js';

// ==========================================
// SHOP PANEL BUILDER (COMPONENTS V2)
// ==========================================
export function buildShopPanel(guildId, currentCategory = 'crates', page = 0) {
  const allItems = getAllShopItems(guildId, db);
  const categoryItems = allItems.filter(it => it.category === currentCategory);
  const catMeta = SHOP_CATEGORIES.find(c => c.id === currentCategory) || SHOP_CATEGORIES[0];

  let itemsText = '';
  if (categoryItems.length === 0) {
    if (currentCategory === 'roles') {
      itemsText =
        `-# **The server role shop is currently empty.**\n` +
        `-# Administrators can list purchasable server roles using:\n` +
        `-# \`!shop add <name> <price> <@role> [description]\``;
    } else {
      itemsText = `-# No items currently available in this category.`;
    }
  } else {
    itemsText = categoryItems.map((it, idx) => {
      const priceStr = `\`${Number(it.price).toLocaleString()}\` Athena Coins`;
      const emoji = getItemEmoji(it.id);
      const prefix = emoji ? `${emoji} ` : '';
      let metaLine = `-# ${BULLET_EMOJI} **ID:** \`${it.id}\` • **Price:** ${priceStr}`;
      if (it.sellPrice) {
        metaLine += ` • **Sell:** \`${it.sellPrice.toLocaleString()}\``;
      }
      if (it.type === 'role' && it.roleId) {
        metaLine += ` • **Role:** <@&${it.roleId}>`;
      }
      return (
        `**${idx + 1}. ${prefix}${it.name}**\n` +
        `${metaLine}\n` +
        `-# *${it.description || 'Exclusive commerce perk'}*`
      );
    }).join('\n\n');
  }

  const categoryButtons = SHOP_CATEGORIES.map(cat =>
    new ButtonBuilder()
      .setCustomId(`shop_tab_${cat.id}`)
      .setLabel(cat.label)
      .setStyle(cat.id === currentCategory ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row1Buttons = categoryButtons.slice(0, 5);
  const row2Buttons = [
    ...categoryButtons.slice(5),
    new ButtonBuilder().setCustomId('shop_btn_inv').setLabel('My Backpack').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_btn_daily').setLabel('Claim Daily').setStyle(ButtonStyle.Secondary)
  ];

  const row1 = new ActionRowBuilder().addComponents(row1Buttons);
  const row2 = new ActionRowBuilder().addComponents(row2Buttons);

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **Athena Global Market | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Department:** **${catMeta.name}** — *${catMeta.description}*\n` +
          `-# **• How to Buy:** Use \`!shop buy <id> [qty]\` (e.g. \`!shop buy crate_common 3\`)\n` +
          `-# **• How to Sell:** Use \`!sell <id> [qty]\` or \`!shop sell <id> [qty]\`\n` +
          `-# **• How to Open/Use:** Use \`!open <crate>\` or \`!use <booster>\`\n` +
          `-# **• Action Games:** \`!hunt\` · \`!fish\` · \`!mine\`\n\n` +
          itemsText
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!inv\` to check your backpack or \`!daily\` to collect coins.**`
      },
      row1.toJSON(),
      row2.toJSON()
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ==========================================
// INVENTORY PANEL BUILDER (COMPONENTS V2)
// ==========================================
export function buildInventoryPanel(guildId, userId, member) {
  const inv = db.getUserInventory(guildId, userId);
  const eco = db.getUserEconomy(guildId, userId);
  const activeBoosters = db.getUserActiveBoosters(guildId, userId);

  // Active boosters display
  let boosterText = '';
  const activeKeys = Object.keys(activeBoosters);
  if (activeKeys.length > 0) {
    boosterText = activeKeys.map(k => {
      const it = getBuiltinItem(k);
      const name = it ? it.name : k;
      const emoji = getItemEmoji(k);
      const prefix = emoji ? `${emoji} ` : '';
      const ts = Math.floor(activeBoosters[k] / 1000);
      return `-# ${BULLET_EMOJI} **${prefix}${name}:** Expires <t:${ts}:R>`;
    }).join('\n');
  } else {
    boosterText = `-# *No active booster buffs. Visit \`!shop\` to purchase Lucky Clovers or Charms!*`;
  }

  // Inventory items
  const ownedItems = Object.entries(inv.items || {}).filter(([_, count]) => count > 0);
  let inventoryText = '';

  if (ownedItems.length === 0) {
    inventoryText =
      `-# **Your inventory is currently empty.**\n` +
      `-# Earn coins with \`!daily\`, \`!hunt\`, \`!fish\`, \`!mine\`, or casino, then explore \`!shop\`!`;
  } else {
    const crates = [];
    const boosters = [];
    const gear = [];
    const gems = [];
    const collectibles = [];
    const pets = [];
    const others = [];

    for (const [itemId, count] of ownedItems) {
      const it = getBuiltinItem(itemId);
      const emoji = getItemEmoji(itemId);
      const prefix = emoji ? `${emoji} ` : '';

      if (!it) {
        others.push(`-# ${BULLET_EMOJI} **${itemId}:** \`x${count}\``);
        continue;
      }
      if (it.type === 'crate') {
        crates.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • *Use \`!open ${it.id}\`*`);
      } else if (it.type === 'booster' || it.type === 'instant' || it.type === 'passive') {
        let hint = it.type === 'passive' ? '*Passive protection*' : `*Use \`!use ${it.id}\`*`;
        boosters.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • ${hint}`);
      } else if (it.type === 'tool' || it.category === 'gear') {
        gear.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • *Action gear*`);
      } else if (it.type === 'gem' || it.category === 'gems') {
        gems.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • *Sell: \`${getItemSellPrice(it.id).toLocaleString()}\` ea*`);
      } else if (it.category === 'pets' || it.type === 'egg') {
        pets.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • *Companion*`);
      } else if (it.category === 'collectibles' || it.type === 'collectible') {
        collectibles.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\` • *Prestige piece*`);
      } else {
        others.push(`-# ${BULLET_EMOJI} **${prefix}${it.name}:** \`x${count}\``);
      }
    }

    const sections = [];
    if (crates.length > 0) sections.push(`**Mystery Crates & Vaults:**\n${crates.join('\n')}`);
    if (boosters.length > 0) sections.push(`**Consumables & Boosters:**\n${boosters.join('\n')}`);
    if (gear.length > 0) sections.push(`**Adventure & Gathering Gear:**\n${gear.join('\n')}`);
    if (gems.length > 0) sections.push(`**Gems, Minerals & Ores:**\n${gems.join('\n')}`);
    if (collectibles.length > 0) sections.push(`**Prestige & Luxury Collectibles:**\n${collectibles.join('\n')}`);
    if (pets.length > 0) sections.push(`**Mythical Pets & Companions:**\n${pets.join('\n')}`);
    if (others.length > 0) sections.push(`**Other Items:**\n${others.join('\n')}`);

    inventoryText = sections.join('\n\n');
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('inv_btn_shop').setLabel('Open Shop').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('inv_btn_daily').setLabel('Claim Daily').setStyle(ButtonStyle.Secondary)
  );

  const userLink = formatUserLink(member || userId, member?.guild);

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **Member Inventory & Backpack | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Account Holder:** ${userLink}\n` +
          `-# **• Wallet Balance:** \`${(eco.wallet || 0).toLocaleString()}\` Athena Coins\n\n` +
          `**Active Status Buffs:**\n` +
          `${boosterText}\n\n` +
          `${inventoryText}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!open <crate>\` to unbox loot, \`!use <item>\` to activate boosters, or \`!sell <item>\` to liquidate goods.**`
      },
      row.toJSON()
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ==========================================
// INTERACTION HANDLERS FOR BUTTONS
// ==========================================
export async function handleShopInteraction(interaction) {
  const cid = interaction.customId;
  const guildId = interaction.guild.id;

  if (cid.startsWith('shop_tab_')) {
    const category = cid.replace('shop_tab_', '');
    const panel = buildShopPanel(guildId, category);
    return interaction.update(panel);
  }

  if (cid === 'shop_btn_inv' || cid === 'inv_btn_shop') {
    if (cid === 'shop_btn_inv') {
      const panel = buildInventoryPanel(guildId, interaction.user.id, interaction.member);
      return interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
    } else {
      const panel = buildShopPanel(guildId, 'crates');
      return interaction.update(panel);
    }
  }

  if (cid === 'shop_btn_daily' || cid === 'inv_btn_daily') {
    // Route to daily check
    const eco = db.getUserEconomy(guildId, interaction.user.id);
    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const elapsed = now - (eco.lastDaily || 0);

    if (elapsed < cooldownMs) {
      const remaining = cooldownMs - elapsed;
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      return interaction.reply({
        components: [
          cv2.buildContainer(
            'Stipend Cooldown Active | <a:exclamation_outline1:1565666739356827759>',
            `You have already claimed your daily stipend.\n\n> -# <a:target_blink:1565667466984554588> **Time Remaining:** \`${hours}h ${minutes}m\`\n> -# <a:target_blink:1565667466984554588> **Streak Protected:** \`${eco.streak || 0} days\`\n\n-# 💡 **Use \`!shop\` to purchase mystery crates, streak shields, or luck boosters!**`
          )
        ],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
    }

    const streak = (elapsed < 48 * 60 * 60 * 1000) ? (eco.streak || 0) + 1 : 1;
    const baseReward = 300;
    const streakBonus = Math.min(streak * 30, 600);
    let totalClaim = baseReward + streakBonus;

    if (db.isUserBoosterActive(guildId, interaction.user.id, 'daily_potion')) {
      totalClaim *= 2;
    }

    db.updateUserEconomy(guildId, interaction.user.id, {
      wallet: (eco.wallet || 0) + totalClaim,
      lastDaily: now,
      streak
    });

    return interaction.reply({
      components: [
        cv2.buildContainer(
          'Daily Stipend Disbursed | <a:03_tick_circle:1565665642084827206>',
          `Successfully claimed **\`+${totalClaim.toLocaleString()}\` Athena Coins**!\n\n-# ${BULLET_EMOJI} **Day ${streak} Streak**\n-# ${BULLET_EMOJI} **New Wallet Balance:** \`${((eco.wallet || 0) + totalClaim).toLocaleString()}\` coins\n\n-# 💡 **Use \`!shop\` to explore crates, luck charms, or server perks!**`
        )
      ],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
  }
}

export async function handleInventoryInteraction(interaction) {
  return handleShopInteraction(interaction);
}

export const commands = [
  // --- BALANCE COMMAND ---
  {
    name: 'balance',
    description: 'Check your wallet, bank, and total net worth in Athena coins.',
    category: 'community',
    aliases: ['bal', 'coins', 'money'],
    options: [
      {
        name: 'user',
        description: 'User to view balance for (defaults to you)',
        type: 6, // USER
        required: false
      }
    ],
    async executePrefix(message, args) {
      const targetUser = message.mentions.users.first()
        || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
        || message.author;
      const eco = db.getUserEconomy(message.guild.id, targetUser.id);
      const wallet = eco.wallet || 0;
      const bank = eco.bank || 0;
      const netWorth = wallet + bank;

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Financial Portfolio** | <a:03_tick_circle:1565665642084827206>\n` +
              `-# **• Account Holder:** <@${targetUser.id}> \`(${targetUser.id})\`\n\n` +
              `-# **• Wallet Balance:** \`${wallet.toLocaleString()}\` coins\n` +
              `-# **• Vault Reserve:** \`${bank.toLocaleString()}\` coins\n` +
              `-# ${BULLET_EMOJI} **Net Worth:** **\`${netWorth.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **Daily Streak:** \`${eco.streak || 0}\` days`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`!shop\` to purchase mystery crates & luck charms, or \`!inv\` to view items.**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const eco = db.getUserEconomy(interaction.guild.id, targetUser.id);
      const wallet = eco.wallet || 0;
      const bank = eco.bank || 0;
      const netWorth = wallet + bank;

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Financial Portfolio** | <a:03_tick_circle:1565665642084827206>\n` +
              `-# **• Account Holder:** <@${targetUser.id}> \`(${targetUser.id})\`\n\n` +
              `-# **• Wallet Balance:** \`${wallet.toLocaleString()}\` coins\n` +
              `-# **• Vault Reserve:** \`${bank.toLocaleString()}\` coins\n` +
              `-# ${BULLET_EMOJI} **Net Worth:** **\`${netWorth.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **Daily Streak:** \`${eco.streak || 0}\` days`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`/shop\` to explore mystery crates & charms, or \`/daily\` to claim stipend.**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- DAILY COMMAND ---
  {
    name: 'daily',
    description: 'Claim your daily Athena coin stipend with streak multiplier bonuses.',
    category: 'community',
    aliases: ['claimdaily'],
    async executePrefix(message) {
      const guildId = message.guild.id;
      const userId = message.author.id;
      const eco = db.getUserEconomy(guildId, userId);
      const now = Date.now();
      const cooldownMs = 24 * 60 * 60 * 1000;
      const elapsed = now - (eco.lastDaily || 0);

      if (elapsed < cooldownMs) {
        const remaining = cooldownMs - elapsed;
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        return message.reply({
          components: [
            cv2.buildContainer(
              'Stipend Cooldown Active | <a:exclamation_outline1:1565666739356827759>',
              `You have already claimed your daily stipend.\n\n> -# <a:target_blink:1565667466984554588> **Time Remaining:** \`${hours}h ${minutes}m\`\n> -# <a:target_blink:1565667466984554588> **Streak Protected:** \`${eco.streak || 0} days\`\n\n-# 💡 **Use \`!shop\` to purchase mystery crates, streak shields, or luck boosters!**`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Check streak rescue via Streak Shield if > 48h elapsed
      let streak = 1;
      let shieldUsed = false;
      if (elapsed < 48 * 60 * 60 * 1000) {
        streak = (eco.streak || 0) + 1;
      } else if (db.getUserItemCount(guildId, userId, 'streak_shield') > 0) {
        db.removeUserItem(guildId, userId, 'streak_shield', 1);
        streak = (eco.streak || 0) + 1;
        shieldUsed = true;
      }

      const baseReward = 300;
      const streakBonus = Math.min(streak * 30, 600);
      let totalClaim = baseReward + streakBonus;

      // Check if Dividend Elixir booster is active
      let elixirUsed = false;
      if (db.isUserBoosterActive(guildId, userId, 'daily_potion')) {
        totalClaim *= 2;
        elixirUsed = true;
      }

      db.updateUserEconomy(guildId, userId, {
        wallet: (eco.wallet || 0) + totalClaim,
        lastDaily: now,
        streak
      });

      let bonusNotes = '';
      if (shieldUsed) {
        bonusNotes += `\n-# 🛡️ **Streak Shield Consumed:** Your Day ${streak} streak was saved from resetting!`;
      }
      if (elixirUsed) {
        bonusNotes += `\n-# ✨ **Dividend Elixir Applied:** Payout doubled (+100% boost)!`;
      }

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Daily Stipend Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Recipient:** <@${userId}>\n\n` +
              `-# ${BULLET_EMOJI} **Base Stipend:** \`+${baseReward}\` coins\n` +
              `-# ${BULLET_EMOJI} **Streak Multiplier (Day ${streak}):** \`+${streakBonus}\` bonus coins\n` +
              `-# ${BULLET_EMOJI} **Total Deposited:** **\`+${totalClaim.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **New Wallet Balance:** \`${((eco.wallet || 0) + totalClaim).toLocaleString()}\` coins` +
              bonusNotes
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`!shop\` to purchase mystery crates, streak shields, or luck boosters!**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const eco = db.getUserEconomy(guildId, userId);
      const now = Date.now();
      const cooldownMs = 24 * 60 * 60 * 1000;
      const elapsed = now - (eco.lastDaily || 0);

      if (elapsed < cooldownMs) {
        const remaining = cooldownMs - elapsed;
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Stipend Cooldown Active | <a:exclamation_outline1:1565666739356827759>',
              `You have already claimed your daily stipend.\n\n> -# <a:target_blink:1565667466984554588> **Time Remaining:** \`${hours}h ${minutes}m\`\n> -# <a:target_blink:1565667466984554588> **Streak Protected:** \`${eco.streak || 0} days\`\n\n-# 💡 **Use \`!shop\` to purchase mystery crates, streak shields, or luck boosters!**`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      let streak = 1;
      let shieldUsed = false;
      if (elapsed < 48 * 60 * 60 * 1000) {
        streak = (eco.streak || 0) + 1;
      } else if (db.getUserItemCount(guildId, userId, 'streak_shield') > 0) {
        db.removeUserItem(guildId, userId, 'streak_shield', 1);
        streak = (eco.streak || 0) + 1;
        shieldUsed = true;
      }

      const baseReward = 300;
      const streakBonus = Math.min(streak * 30, 600);
      let totalClaim = baseReward + streakBonus;

      let elixirUsed = false;
      if (db.isUserBoosterActive(guildId, userId, 'daily_potion')) {
        totalClaim *= 2;
        elixirUsed = true;
      }

      db.updateUserEconomy(guildId, userId, {
        wallet: (eco.wallet || 0) + totalClaim,
        lastDaily: now,
        streak
      });

      let bonusNotes = '';
      if (shieldUsed) {
        bonusNotes += `\n-# 🛡️ **Streak Shield Consumed:** Your Day ${streak} streak was saved from resetting!`;
      }
      if (elixirUsed) {
        bonusNotes += `\n-# ✨ **Dividend Elixir Applied:** Payout doubled (+100% boost)!`;
      }

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Daily Stipend Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Recipient:** <@${userId}>\n\n` +
              `-# ${BULLET_EMOJI} **Base Stipend:** \`+${baseReward}\` coins\n` +
              `-# ${BULLET_EMOJI} **Streak Multiplier (Day ${streak}):** \`+${streakBonus}\` bonus coins\n` +
              `-# ${BULLET_EMOJI} **Total Deposited:** **\`+${totalClaim.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **New Wallet Balance:** \`${((eco.wallet || 0) + totalClaim).toLocaleString()}\` coins` +
              bonusNotes
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`/shop\` to explore crates, luck charms, or server perks!**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- PAY COMMAND ---
  {
    name: 'pay',
    description: 'Transfer Athena coins to another member.',
    category: 'community',
    aliases: ['transfer', 'give'],
    options: [
      {
        name: 'user',
        description: 'Member to pay',
        type: 6, // USER
        required: true
      },
      {
        name: 'amount',
        description: 'Amount of coins to send',
        type: 4, // INTEGER
        required: true
      }
    ],
    async executePrefix(message, args) {
      const targetUser = message.mentions.users.first()
        || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null);
      const amount = parseInt(args[1]);

      if (!targetUser || targetUser.id === message.author.id || targetUser.bot) {
        return message.reply({
          components: [cv2.buildContainer('Transaction Refused', 'Please mention a valid, non-bot member to transfer coins.')],
          flags: MessageFlags.IsComponentsV2
        });
      }
      if (isNaN(amount) || amount <= 0) {
        return message.reply({
          components: [cv2.buildContainer('Invalid Amount', 'Please specify a positive integer amount to transfer.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = message.guild.id;
      const success = db.removeWallet(guildId, message.author.id, amount);
      if (!success) {
        const eco = db.getUserEconomy(guildId, message.author.id);
        return message.reply({
          components: [
            cv2.buildContainer(
              'Insufficient Funds',
              `You do not have enough coins in your wallet.\n-# **Wallet Balance:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      db.addWallet(guildId, targetUser.id, amount);
      const senderLink = formatUserLink(message.author, message.guild);
      const recipientLink = formatUserLink(targetUser, message.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Funds Transferred | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Sender:** ${senderLink}\n` +
              `-# ${BULLET_EMOJI} **Recipient:** ${recipientLink}\n` +
              `-# ${BULLET_EMOJI} **Amount:** \`${amount.toLocaleString()}\` Athena Coins\n` +
              `-# ${BULLET_EMOJI} **Status:** \`Settled instantly on local ledger\``
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      if (!targetUser || targetUser.id === interaction.user.id || targetUser.bot) {
        return interaction.reply({
          components: [cv2.buildContainer('Transaction Refused', 'Please specify a valid, non-bot member to transfer coins.')],
          flags: MessageFlags.IsComponentsV2
        });
      }
      if (amount <= 0) {
        return interaction.reply({
          components: [cv2.buildContainer('Invalid Amount', 'Please specify a positive integer amount.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = interaction.guild.id;
      const success = db.removeWallet(guildId, interaction.user.id, amount);
      if (!success) {
        const eco = db.getUserEconomy(guildId, interaction.user.id);
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Insufficient Funds',
              `You do not have enough coins in your wallet.\n-# **Wallet Balance:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      db.addWallet(guildId, targetUser.id, amount);
      const senderLink = formatUserLink(interaction.user, interaction.guild);
      const recipientLink = formatUserLink(targetUser, interaction.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Funds Transferred | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Sender:** ${senderLink}\n` +
              `-# ${BULLET_EMOJI} **Recipient:** ${recipientLink}\n` +
              `-# ${BULLET_EMOJI} **Amount:** \`${amount.toLocaleString()}\` Athena Coins\n` +
              `-# ${BULLET_EMOJI} **Status:** \`Settled instantly on local ledger\``
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- GIVE COINS (ADMIN / OWNER MANAGEMENT) ---
  {
    name: 'givecoins',
    aliases: ['addcoins', 'ecoadd', 'spawncoins'],
    description: 'Grant Athena coins to a user or to your own wallet (Bot Owner only).',
    category: 'community',
    options: [
      {
        name: 'amount',
        description: 'Amount of Athena coins to grant',
        type: 4,
        required: true
      },
      {
        name: 'user',
        description: 'Target member to credit (defaults to you)',
        type: 6,
        required: false
      }
    ],
    async executePrefix(message, args) {
      if (!isBotOwnerSync(message.author.id)) {
        return message.reply({
          components: [cv2.buildContainer('Permission Denied', 'This command is strictly reserved for the Bot Developer / Owner.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      let targetUser = message.mentions.users.first();
      let amountArg = args[0];

      if (targetUser) {
        amountArg = args[1];
      } else if (args[0] && isNaN(parseInt(args[0]))) {
        targetUser = await message.client.users.fetch(args[0]).catch(() => null);
        amountArg = args[1];
      }

      if (!targetUser) targetUser = message.author;
      const amount = parseInt(amountArg);

      if (isNaN(amount) || amount <= 0) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Give Coins Usage',
              'Specify an amount of coins to grant:\n\n-# **Format:** `!givecoins <amount>` or `!givecoins <@user> <amount>`\n-# **Examples:**\n-# `!givecoins 100000` *(adds 100k to your wallet)*\n-# `!givecoins @user 50000`'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = message.guild.id;
      const newBal = db.addWallet(guildId, targetUser.id, amount);
      const recipientLink = formatUserLink(targetUser, message.guild);
      const adminLink = formatUserLink(message.author, message.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coins Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Authorized By:** ${adminLink}\n` +
              `-# ${BULLET_EMOJI} **Recipient:** ${recipientLink}\n` +
              `-# ${BULLET_EMOJI} **Amount Granted:** **\`+${amount.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${newBal.toLocaleString()}\` coins\n\n` +
              `-# 💡 **Use \`!shop\` to explore 52 catalog items or \`!inv\` to check your backpack.**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply({
          components: [cv2.buildContainer('Permission Denied', 'This command is strictly reserved for the Bot Developer / Owner.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const amount = interaction.options.getInteger('amount');
      const targetUser = interaction.options.getUser('user') || interaction.user;

      if (!amount || amount <= 0) {
        return interaction.reply({
          components: [cv2.buildContainer('Invalid Amount', 'Please specify a positive coin amount.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = interaction.guild.id;
      const newBal = db.addWallet(guildId, targetUser.id, amount);
      const recipientLink = formatUserLink(targetUser, interaction.guild);
      const adminLink = formatUserLink(interaction.user, interaction.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coins Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Authorized By:** ${adminLink}\n` +
              `-# ${BULLET_EMOJI} **Recipient:** ${recipientLink}\n` +
              `-# ${BULLET_EMOJI} **Amount Granted:** **\`+${amount.toLocaleString()}\` Athena Coins**\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${newBal.toLocaleString()}\` coins\n\n` +
              `-# 💡 **Use \`/shop\` to explore 52 catalog items or \`/inventory\` to check your backpack.**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- COINFLIP COMMAND ---
  {
    name: 'coinflip',
    description: 'Wager your coins on a 50/50 heads or tails coinflip.',
    category: 'community',
    aliases: ['cf', 'flip'],
    options: [
      {
        name: 'choice',
        description: 'Choose heads or tails',
        type: 3,
        required: true,
        choices: [
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' }
        ]
      },
      {
        name: 'bet',
        description: 'Amount of coins to wager',
        type: 4,
        required: true
      }
    ],
    async executePrefix(message, args) {
      const choice = (args[0] || '').toLowerCase();
      const bet = parseInt(args[1]);

      if (choice !== 'heads' && choice !== 'tails' && choice !== 'h' && choice !== 't') {
        return message.reply({
          components: [cv2.buildContainer('Coinflip Usage', 'Please specify `heads` or `tails` followed by your bet amount.\n\n-# **Example:** `!coinflip heads 50`\n\n-# 💡 **Use \`!shop\` to purchase Lucky Clovers (+12% win rate) or Mystery Crates!**')],
          flags: MessageFlags.IsComponentsV2
        });
      }
      if (isNaN(bet) || bet <= 0) {
        return message.reply({
          components: [cv2.buildContainer('Invalid Wager', 'Please enter a valid positive bet amount.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = message.guild.id;
      const success = db.removeWallet(guildId, message.author.id, bet);
      if (!success) {
        const eco = db.getUserEconomy(guildId, message.author.id);
        return message.reply({
          components: [
            cv2.buildContainer('Insufficient Funds', `You need \`${bet}\` coins in your wallet. Current wallet: \`${eco.wallet || 0}\`.\n\n-# 💡 **Use \`!daily\` to collect coins or \`!shop\` to explore items!**`)
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const normalizedChoice = (choice === 'h' || choice === 'heads') ? 'heads' : 'tails';
      const hasClover = db.isUserBoosterActive(guildId, message.author.id, 'lucky_clover');
      const hasHorseshoe = db.isUserBoosterActive(guildId, message.author.id, 'golden_horseshoe');
      const hasCharm = db.isUserBoosterActive(guildId, message.author.id, 'gambler_charm');
      const hasMagnet = db.isUserBoosterActive(guildId, message.author.id, 'coin_magnet');

      let winChance = 0.50;
      if (hasClover) winChance += 0.12;
      if (hasHorseshoe) winChance += 0.20;
      if (winChance > 0.85) winChance = 0.85;

      const won = Math.random() < winChance;
      const outcome = won ? normalizedChoice : (normalizedChoice === 'heads' ? 'tails' : 'heads');

      let winnings = 0;
      let buffNote = '';

      if (won) {
        const multiplier = hasCharm ? 2.25 : 2;
        winnings = Math.floor(bet * multiplier);
        if (hasMagnet) winnings += 35;
        db.addWallet(guildId, message.author.id, winnings);
      } else {
        // Check Phoenix Feather salvage
        const featherCount = db.getUserItemCount(guildId, message.author.id, 'phoenix_feather');
        if (featherCount > 0) {
          db.removeUserItem(guildId, message.author.id, 'phoenix_feather', 1);
          const salvaged = Math.floor(bet * 0.5);
          db.addWallet(guildId, message.author.id, salvaged);
          buffNote += `\n-# 🔥 **Phoenix Feather Consumed:** Salvaged 50% (+\`${salvaged.toLocaleString()}\` coins) of lost wager!`;
        }
        if (hasMagnet) {
          db.addWallet(guildId, message.author.id, 35);
          buffNote += `\n-# 🧲 **Coin Magnet Active:** Recovered +35 bonus coins!`;
        }
      }

      const eco = db.getUserEconomy(guildId, message.author.id);
      if (hasClover) buffNote += `\n-# 🍀 **Lucky Clover Buff:** +12% win probability active!`;
      if (hasHorseshoe) buffNote += `\n-# 🧲 **Golden Horseshoe Active:** +20% extreme luck bonus!`;
      if (won && hasCharm) buffNote += `\n-# ✨ **Gambler's Charm Buff:** +25% bonus payout applied!`;
      if (won && hasMagnet) buffNote += `\n-# 🧲 **Coin Magnet Active:** +35 bonus coins collected!`;

      const playerLink = formatUserLink(message.author, message.guild);
      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coinflip ${won ? 'Victory | <a:03_tick_circle:1565665642084827206>' : 'Defeat | <a:04_cross_circle:1565665644806934639>'}**\n` +
              `-# **• Player:** ${playerLink}\n` +
              `-# ${BULLET_EMOJI} **Your Call:** \`${normalizedChoice.toUpperCase()}\` · **Coin Landed:** **\`${outcome.toUpperCase()}\`**\n\n` +
              `-# ${BULLET_EMOJI} **Result:** ${won ? `**WON \`+${winnings - bet}\` coins (Payout: \`${winnings}\`)**` : `**LOST \`-${bet}\` coins**`}\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
              buffNote
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`!shop\` to purchase Lucky Clovers, Mystery Crates, or server perks!**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const choice = interaction.options.getString('choice');
      const bet = interaction.options.getInteger('bet');

      if (bet <= 0) {
        return interaction.reply({
          components: [cv2.buildContainer('Invalid Wager', 'Please enter a positive bet amount.')],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const guildId = interaction.guild.id;
      const success = db.removeWallet(guildId, interaction.user.id, bet);
      if (!success) {
        const eco = db.getUserEconomy(guildId, interaction.user.id);
        return interaction.reply({
          components: [
            cv2.buildContainer('Insufficient Funds', `You need \`${bet}\` coins in your wallet. Current wallet: \`${eco.wallet || 0}\`.\n\n-# 💡 **Use \`/daily\` to claim stipend or \`/shop\` to explore catalog!**`)
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const hasClover = db.isUserBoosterActive(guildId, interaction.user.id, 'lucky_clover');
      const hasHorseshoe = db.isUserBoosterActive(guildId, interaction.user.id, 'golden_horseshoe');
      const hasCharm = db.isUserBoosterActive(guildId, interaction.user.id, 'gambler_charm');
      const hasMagnet = db.isUserBoosterActive(guildId, interaction.user.id, 'coin_magnet');

      let winChance = 0.50;
      if (hasClover) winChance += 0.12;
      if (hasHorseshoe) winChance += 0.20;
      if (winChance > 0.85) winChance = 0.85;

      const won = Math.random() < winChance;
      const outcome = won ? choice : (choice === 'heads' ? 'tails' : 'heads');

      let winnings = 0;
      let buffNote = '';

      if (won) {
        const multiplier = hasCharm ? 2.25 : 2;
        winnings = Math.floor(bet * multiplier);
        if (hasMagnet) winnings += 35;
        db.addWallet(guildId, interaction.user.id, winnings);
      } else {
        const featherCount = db.getUserItemCount(guildId, interaction.user.id, 'phoenix_feather');
        if (featherCount > 0) {
          db.removeUserItem(guildId, interaction.user.id, 'phoenix_feather', 1);
          const salvaged = Math.floor(bet * 0.5);
          db.addWallet(guildId, interaction.user.id, salvaged);
          buffNote += `\n-# 🔥 **Phoenix Feather Consumed:** Salvaged 50% (+\`${salvaged.toLocaleString()}\` coins) of lost wager!`;
        }
        if (hasMagnet) {
          db.addWallet(guildId, interaction.user.id, 35);
          buffNote += `\n-# 🧲 **Coin Magnet Active:** Recovered +35 bonus coins!`;
        }
      }

      const eco = db.getUserEconomy(guildId, interaction.user.id);
      if (hasClover) buffNote += `\n-# 🍀 **Lucky Clover Buff:** +12% win probability active!`;
      if (hasHorseshoe) buffNote += `\n-# 🧲 **Golden Horseshoe Active:** +20% extreme luck bonus!`;
      if (won && hasCharm) buffNote += `\n-# ✨ **Gambler's Charm Buff:** +25% bonus payout applied!`;
      if (won && hasMagnet) buffNote += `\n-# 🧲 **Coin Magnet Active:** +35 bonus coins collected!`;

      const playerLink = formatUserLink(interaction.user, interaction.guild);
      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coinflip ${won ? 'Victory | <a:03_tick_circle:1565665642084827206>' : 'Defeat | <a:04_cross_circle:1565665644806934639>'}**\n` +
              `-# **• Player:** ${playerLink}\n` +
              `-# ${BULLET_EMOJI} **Your Call:** \`${choice.toUpperCase()}\` · **Coin Landed:** **\`${outcome.toUpperCase()}\`**\n\n` +
              `-# ${BULLET_EMOJI} **Result:** ${won ? `**WON \`+${winnings - bet}\` coins (Payout: \`${winnings}\`)**` : `**LOST \`-${bet}\` coins**`}\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
              buffNote
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`/shop\` to explore crates, luck charms, or server perks!**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- SHOP COMMAND ---
  {
    name: 'shop',
    aliases: ['market', 'store'],
    description: 'Browse the global item catalog, purchase crates, charms, or server roles.',
    category: 'community',
    options: [
      {
        name: 'department',
        description: 'Shop department to view (crates, boosters, collectibles, roles)',
        type: 3,
        required: false,
        choices: [
          { name: 'Mystery Crates', value: 'crates' },
          { name: 'Boosters & Charms', value: 'boosters' },
          { name: 'Prestige Collectibles', value: 'collectibles' },
          { name: 'Server Role Perks', value: 'roles' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const sub = (args[0] || '').toLowerCase();

      // EXTRA OWNER: ADD ROLE ITEM
      if (sub === 'add') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply({ components: [cv2.buildContainer('Permission Denied', 'Only Extra Owners or the Server Owner can manage the shop.')], flags: MessageFlags.IsComponentsV2 });
        }
        const name = args[1];
        const price = parseInt(args[2]);
        const role = message.mentions.roles.first() || (args[3] ? message.guild.roles.cache.get(args[3]) : null);

        if (!name || isNaN(price) || price <= 0 || !role) {
          return message.reply({
            components: [
              cv2.buildContainer(
                'Shop Add Usage',
                'Format: `!shop add <name> <price> <@role> [description]`\n-# Example: `!shop add VIP 5000 @VIP Exclusive VIP privileges`'
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const description = args.slice(4).join(' ') || `Grants the @${role.name} role`;
        const item = db.addShopItem(guildId, { name, price, roleId: role.id, description });

        return message.reply({
          components: [
            cv2.buildContainer(
              'Shop Item Created | <a:03_tick_circle:1565665642084827206>',
              `Item **${item.name}** registered successfully in Server Roles!\n\n` +
              `-# ${BULLET_EMOJI} **Item ID:** \`${item.id}\`\n` +
              `-# ${BULLET_EMOJI} **Price:** \`${item.price.toLocaleString()}\` coins\n` +
              `-# ${BULLET_EMOJI} **Role:** <@&${item.roleId}>\n` +
              `-# ${BULLET_EMOJI} **Description:** ${item.description}\n\n` +
              `-# 💡 **View all items in \`!shop roles\`**`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // EXTRA OWNER: REMOVE ITEM
      if (sub === 'remove' || sub === 'delete') {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply({ components: [cv2.buildContainer('Permission Denied', 'Only Extra Owners or the Server Owner can remove items.')], flags: MessageFlags.IsComponentsV2 });
        }
        const itemId = args[1];
        if (!itemId) {
          return message.reply({ components: [cv2.buildContainer('Missing ID', 'Usage: `!shop remove <item_id>`')], flags: MessageFlags.IsComponentsV2 });
        }
        const removed = db.removeShopItem(guildId, itemId);
        return message.reply({
          components: [
            cv2.buildContainer(
              removed ? 'Shop Item Removed | <a:03_tick_circle:1565665642084827206>' : 'Item Not Found',
              removed ? `Custom item \`${itemId}\` was purged from the shop.` : `No custom role item matching ID \`${itemId}\` was found.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // BUY ITEM
      if (sub === 'buy') {
        const itemId = (args[1] || '').toLowerCase();
        let quantity = parseInt(args[2]) || 1;
        if (isNaN(quantity) || quantity <= 0) quantity = 1;
        if (quantity > 50) quantity = 50;

        if (!itemId) {
          return message.reply({
            components: [
              cv2.buildContainer(
                'Missing Item ID',
                'Usage: `!shop buy <item_id> [quantity]`\n\n-# **Examples:**\n-# `!shop buy crate_common 3`\n-# `!shop buy lucky_clover`\n\n-# 💡 **Use \`!shop\` to browse all item IDs and departments.**'
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        // Check built-in items first
        const builtin = getBuiltinItem(itemId);
        if (builtin) {
          const totalCost = builtin.price * quantity;
          const success = db.removeWallet(guildId, message.author.id, totalCost);
          if (!success) {
            const eco = db.getUserEconomy(guildId, message.author.id);
            return message.reply({
              components: [
                cv2.buildContainer(
                  'Insufficient Funds',
                  `You need \`${totalCost.toLocaleString()}\` Athena coins to purchase **${quantity}x ${builtin.name}**.\n-# **Your Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins\n\n-# 💡 **Claim \`!daily\` or win coins in \`!slots\` to boost your balance!**`
                )
              ],
              flags: MessageFlags.IsComponentsV2
            });
          }

          const newTotal = db.addUserItem(guildId, message.author.id, builtin.id, quantity);
          let nextStepHint = '';
          if (builtin.type === 'crate') {
            nextStepHint = `Use \`!open ${builtin.id}\` to unbox your mystery rewards!`;
          } else if (builtin.type === 'booster' || builtin.type === 'instant') {
            nextStepHint = `Use \`!use ${builtin.id}\` to activate your booster buff!`;
          } else if (builtin.type === 'tool') {
            nextStepHint = `Permanent tool equipped! Use \`!hunt\`, \`!fish\`, or \`!mine\`.`;
          } else if (builtin.type === 'gem') {
            nextStepHint = `Rare mineral added to backpack! Hold or sell with \`!sell ${builtin.id}\`.`;
          } else if (builtin.type === 'egg') {
            nextStepHint = `Companion egg safely incubating! Care for it with \`pet_treats\`.`;
          } else if (builtin.type === 'passive') {
            nextStepHint = `This item stays in your backpack and automatically protects you.`;
          } else {
            nextStepHint = `This prestige collectible is now proudly in your \`!inv\`.`;
          }

          const buyerLink = formatUserLink(message.author, message.guild);
          const container = {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  `### **Purchase Complete | <a:03_tick_circle:1565665642084827206>**\n` +
                  `-# **• Buyer:** ${buyerLink}\n` +
                  `-# ${BULLET_EMOJI} **Purchased:** **${quantity}x ${builtin.name}**\n` +
                  `-# ${BULLET_EMOJI} **Total Cost:** \`${totalCost.toLocaleString()}\` Athena Coins\n` +
                  `-# ${BULLET_EMOJI} **Backpack Total:** \`${newTotal}\` in inventory\n\n` +
                  `-# ${BULLET_EMOJI} **Action:** *${nextStepHint}*`
              },
              { type: 14, divider: true },
              {
                type: 10,
                content: `-# 💡 **Check your backpack anytime with \`!inv\` or explore more in \`!shop\`.**`
              }
            ]
          };

          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Check custom server role items
        const customItems = db.getShopItems(guildId);
        const roleItem = customItems.find(it => it.id === itemId || it.name.toLowerCase() === itemId);
        if (roleItem) {
          const role = message.guild.roles.cache.get(roleItem.roleId);
          if (!role) {
            return message.reply({ components: [cv2.buildContainer('Role Missing', 'The role bound to this item no longer exists in the server.')], flags: MessageFlags.IsComponentsV2 });
          }
          if (message.member.roles.cache.has(role.id)) {
            return message.reply({ components: [cv2.buildContainer('Already Owned', `You already possess the <@&${role.id}> role.`)], flags: MessageFlags.IsComponentsV2 });
          }

          const success = db.removeWallet(guildId, message.author.id, roleItem.price);
          if (!success) {
            const eco = db.getUserEconomy(guildId, message.author.id);
            return message.reply({
              components: [
                cv2.buildContainer(
                  'Insufficient Funds',
                  `You need \`${roleItem.price.toLocaleString()}\` coins to purchase **${roleItem.name}**.\n-# **Your Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
                )
              ],
              flags: MessageFlags.IsComponentsV2
            });
          }

          await message.member.roles.add(role).catch(err => {
            console.error('[Shop] Failed to assign purchased role:', err);
          });

          const buyerLink = formatUserLink(message.author, message.guild);
          const container = {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  `### **Role Purchased | <a:03_tick_circle:1565665642084827206>**\n` +
                  `-# **• Buyer:** ${buyerLink}\n` +
                  `-# ${BULLET_EMOJI} **Item:** **${roleItem.name}**\n` +
                  `-# ${BULLET_EMOJI} **Role Granted:** <@&${role.id}>\n` +
                  `-# ${BULLET_EMOJI} **Price Paid:** \`${roleItem.price.toLocaleString()}\` Athena Coins`
              }
            ]
          };

          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        return message.reply({
          components: [
            cv2.buildContainer(
              'Item Not Found',
              `Could not find any item matching \`${itemId}\` in the global catalog or server roles.\n\n-# 💡 **Use \`!shop\` to browse all valid item IDs.**`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // SELL ITEM
      if (sub === 'sell') {
        const itemId = (args[1] || '').toLowerCase();
        let quantity = parseInt(args[2]) || 1;
        if (isNaN(quantity) || quantity <= 0) quantity = 1;

        if (!itemId) {
          return message.reply({
            components: [
              cv2.buildContainer(
                'Missing Item ID',
                'Usage: `!shop sell <item_id> [quantity]`\n\n-# **Example:** `!shop sell gem_ruby 1`\n-# 💡 **Use \`!inv\` to see items you own.**'
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const builtin = getBuiltinItem(itemId);
        if (!builtin) {
          return message.reply({
            components: [cv2.buildContainer('Item Not Found', `\`${itemId}\` was not recognized in the shop catalog.`)],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const ownedCount = db.getUserItemCount(guildId, message.author.id, builtin.id);
        if (ownedCount < quantity) {
          return message.reply({
            components: [
              cv2.buildContainer(
                'Insufficient Items',
                `You only have \`${ownedCount}\`x **${builtin.name}** in your backpack (attempted to sell \`${quantity}\`).`
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const unitSellPrice = getItemSellPrice(builtin.id);
        const totalEarnings = unitSellPrice * quantity;

        db.removeUserItem(guildId, message.author.id, builtin.id, quantity);
        db.addWallet(guildId, message.author.id, totalEarnings);

        const remaining = db.getUserItemCount(guildId, message.author.id, builtin.id);
        const eco = db.getUserEconomy(guildId, message.author.id);
        const sellerLink = formatUserLink(message.author, message.guild);

        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `### **${CMD_SELL_EMOJI} Item Sale Finalized | <a:03_tick_circle:1565665642084827206>**\n` +
                `-# **• Seller:** ${sellerLink}\n` +
                `-# ${BULLET_EMOJI} **Sold:** **${quantity}x ${builtin.name}**\n` +
                `-# ${BULLET_EMOJI} **Earnings:** \`+${totalEarnings.toLocaleString()}\` Athena Coins (\`${unitSellPrice.toLocaleString()}\`/ea)\n` +
                `-# ${BULLET_EMOJI} **Remaining:** \`${remaining}\` in backpack\n` +
                `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# 💡 **Use \`!shop\` to purchase items, or \`!inv\` to view your backpack.**`
            }
          ]
        };

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      // DEFAULT: BROWSE SHOP
      const validCategories = SHOP_CATEGORIES.map(c => c.id);
      const targetCat = validCategories.includes(sub) ? sub : 'crates';
      return message.reply(buildShopPanel(guildId, targetCat));
    },
    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const dept = interaction.options.getString('department') || 'crates';
      return interaction.reply(buildShopPanel(guildId, dept));
    }
  },

  // --- INVENTORY COMMAND ---
  {
    name: 'inventory',
    aliases: ['inv', 'bag'],
    description: 'Inspect your owned mystery crates, active luck boosters, and prestige collectibles.',
    category: 'community',
    options: [
      {
        name: 'user',
        description: 'Member to inspect inventory for (defaults to you)',
        type: 6,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const targetUser = message.mentions.users.first()
        || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
        || message.author;
      const member = message.guild.members.cache.get(targetUser.id);
      const panel = buildInventoryPanel(message.guild.id, targetUser.id, member);
      return message.reply(panel);
    },
    async executeSlash(interaction) {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const member = interaction.guild.members.cache.get(targetUser.id);
      const panel = buildInventoryPanel(interaction.guild.id, targetUser.id, member);
      return interaction.reply(panel);
    }
  },

  // --- OPEN / UNBOX CRATE COMMAND ---
  {
    name: 'open',
    aliases: ['unbox', 'crate'],
    description: 'Unbox a mystery crate from your inventory to reveal surprise coin jackpots and loot.',
    category: 'community',
    options: [
      {
        name: 'crate',
        description: 'The crate ID to unbox (e.g. crate_common, crate_rare, crate_mythic)',
        type: 3,
        required: true,
        choices: [
          { name: 'Common Crate', value: 'crate_common' },
          { name: 'Rare Crate', value: 'crate_rare' },
          { name: 'Mythic Chest', value: 'crate_mythic' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const rawId = (args[0] || '').toLowerCase().trim();
      let crateId = rawId;
      if (rawId === 'common') crateId = 'crate_common';
      if (rawId === 'rare') crateId = 'crate_rare';
      if (rawId === 'mythic' || rawId === 'chest') crateId = 'crate_mythic';

      if (!crateId) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Unbox Usage',
              'Please specify which crate to open from your inventory:\n\n-# **Format:** `!open <crate_id>`\n-# **Examples:** `!open crate_common` • `!open crate_rare` • `!open crate_mythic`\n\n-# 💡 **Use \`!inv\` to check your backpack or \`!shop\` to purchase crates!**'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      return handleCrateOpen(message, message.author, crateId);
    },
    async executeSlash(interaction) {
      const crateId = interaction.options.getString('crate');
      return handleCrateOpen(interaction, interaction.user, crateId);
    }
  },

  // --- USE ITEM COMMAND ---
  {
    name: 'use',
    aliases: ['consume', 'activate'],
    description: 'Activate a consumable booster or charm from your inventory.',
    category: 'community',
    options: [
      {
        name: 'item',
        description: 'The item ID to activate (e.g. lucky_clover, gambler_charm, daily_potion)',
        type: 3,
        required: true,
        choices: [
          { name: 'Lucky Clover (1h Luck Boost)', value: 'lucky_clover' },
          { name: 'Gambler\'s Charm (2h +25% Payout)', value: 'gambler_charm' },
          { name: 'Dividend Elixir (2x Daily)', value: 'daily_potion' }
        ]
      }
    ],
    async executePrefix(message, args) {
      const rawId = (args[0] || '').toLowerCase().trim();
      let itemId = rawId;
      if (rawId === 'clover' || rawId === 'lucky') itemId = 'lucky_clover';
      if (rawId === 'charm' || rawId === 'gambler') itemId = 'gambler_charm';
      if (rawId === 'elixir' || rawId === 'potion') itemId = 'daily_potion';
      if (rawId === 'shield') itemId = 'streak_shield';

      if (!itemId) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Item Activation Usage',
              'Please specify which booster to activate from your inventory:\n\n-# **Format:** `!use <item_id>`\n-# **Examples:** `!use lucky_clover` • `!use gambler_charm` • `!use daily_potion`\n\n-# 💡 **Use \`!inv\` to view your owned boosters or \`!shop\` to purchase.**'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      return handleItemUse(message, message.author, itemId);
    },
    async executeSlash(interaction) {
      const itemId = interaction.options.getString('item');
      return handleItemUse(interaction, interaction.user, itemId);
    }
  },

  // --- SLOTS COMMAND (OwO STYLE CASINO GAME) ---
  {
    name: 'slots',
    aliases: ['s', 'slot'],
    description: 'Wager your coins on a 3-reel casino slot machine with jackpot multipliers.',
    category: 'community',
    options: [
      {
        name: 'bet',
        description: 'Amount of Athena coins to wager',
        type: 4,
        required: true
      }
    ],
    async executePrefix(message, args) {
      const bet = parseInt(args[0]);
      if (isNaN(bet) || bet <= 0) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Slots Usage',
              'Please specify a positive coin wager:\n\n-# **Format:** `!slots <bet>` (or `!s <bet>`)\n-# **Example:** `!slots 100`\n\n-# 💡 **Active Lucky Clovers enhance match probabilities!**'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
      return runSlotsGame(message, message.author, bet);
    },
    async executeSlash(interaction) {
      const bet = interaction.options.getInteger('bet');
      if (bet <= 0) {
        return interaction.reply({
          components: [cv2.buildContainer('Invalid Wager', 'Please enter a positive coin wager.')],
          flags: MessageFlags.IsComponentsV2
        });
      }
      return runSlotsGame(interaction, interaction.user, bet);
    }
  },

  // --- SELL COMMAND (OwO STYLE COMMERCE) ---
  {
    name: 'sell',
    aliases: ['market-sell'],
    description: 'Sell items, gems, or fish from your backpack for coins.',
    category: 'community',
    options: [
      {
        name: 'item',
        description: 'Item ID to sell',
        type: 3,
        required: true
      },
      {
        name: 'quantity',
        description: 'Quantity to liquidate (defaults to 1)',
        type: 4,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const itemId = (args[0] || '').toLowerCase();
      let quantity = parseInt(args[1]) || 1;
      if (isNaN(quantity) || quantity <= 0) quantity = 1;

      if (!itemId) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Sell Command Usage',
              'Specify an item ID and optional quantity to sell:\n\n-# **Format:** `!sell <item_id> [quantity]`\n-# **Examples:** `!sell gem_ruby 1` • `!sell ore_gold 3`\n\n-# 💡 **Use \`!inv\` to view items you own.**'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const builtin = getBuiltinItem(itemId);
      if (!builtin) {
        return message.reply({
          components: [cv2.buildContainer('Item Not Found', `\`${itemId}\` was not recognized in the shop catalog.`)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const ownedCount = db.getUserItemCount(guildId, message.author.id, builtin.id);
      if (ownedCount < quantity) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Insufficient Items',
              `You only own \`${ownedCount}\`x **${builtin.name}** in your backpack (attempted to sell \`${quantity}\`).`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const unitSellPrice = getItemSellPrice(builtin.id);
      const totalEarnings = unitSellPrice * quantity;

      db.removeUserItem(guildId, message.author.id, builtin.id, quantity);
      db.addWallet(guildId, message.author.id, totalEarnings);

      const remaining = db.getUserItemCount(guildId, message.author.id, builtin.id);
      const eco = db.getUserEconomy(guildId, message.author.id);
      const sellerLink = formatUserLink(message.author, message.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **${CMD_SELL_EMOJI} Item Sale Finalized | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Seller:** ${sellerLink}\n` +
              `-# ${BULLET_EMOJI} **Sold:** **${quantity}x ${builtin.name}**\n` +
              `-# ${BULLET_EMOJI} **Earnings:** \`+${totalEarnings.toLocaleString()}\` Athena Coins (\`${unitSellPrice.toLocaleString()}\`/ea)\n` +
              `-# ${BULLET_EMOJI} **Remaining:** \`${remaining}\` in backpack\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`!shop\` to purchase items, or \`!inv\` to view your backpack.**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const itemId = interaction.options.getString('item');
      let quantity = interaction.options.getInteger('quantity') || 1;
      if (quantity <= 0) quantity = 1;

      const builtin = getBuiltinItem(itemId);
      if (!builtin) {
        return interaction.reply({
          components: [cv2.buildContainer('Item Not Found', `\`${itemId}\` was not recognized in the shop catalog.`)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const ownedCount = db.getUserItemCount(guildId, interaction.user.id, builtin.id);
      if (ownedCount < quantity) {
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Insufficient Items',
              `You only own \`${ownedCount}\`x **${builtin.name}** in your backpack (attempted to sell \`${quantity}\`).`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const unitSellPrice = getItemSellPrice(builtin.id);
      const totalEarnings = unitSellPrice * quantity;

      db.removeUserItem(guildId, interaction.user.id, builtin.id, quantity);
      db.addWallet(guildId, interaction.user.id, totalEarnings);

      const remaining = db.getUserItemCount(guildId, interaction.user.id, builtin.id);
      const eco = db.getUserEconomy(guildId, interaction.user.id);
      const sellerLink = formatUserLink(interaction.user, interaction.guild);

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **${CMD_SELL_EMOJI} Item Sale Finalized | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Seller:** ${sellerLink}\n` +
              `-# ${BULLET_EMOJI} **Sold:** **${quantity}x ${builtin.name}**\n` +
              `-# ${BULLET_EMOJI} **Earnings:** \`+${totalEarnings.toLocaleString()}\` Athena Coins (\`${unitSellPrice.toLocaleString()}\`/ea)\n` +
              `-# ${BULLET_EMOJI} **Remaining:** \`${remaining}\` in backpack\n` +
              `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# 💡 **Use \`!shop\` to purchase items, or \`!inv\` to view your backpack.**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- HUNT COMMAND (OwO STYLE ACTION GAME) ---
  {
    name: 'hunt',
    aliases: ['h'],
    description: 'Track and hunt forest wildlife for coin bounties and rare trophies.',
    category: 'community',
    async executePrefix(message) {
      return runHuntGame(message, message.author);
    },
    async executeSlash(interaction) {
      return runHuntGame(interaction, interaction.user);
    }
  },

  // --- FISH COMMAND (OwO STYLE ACTION GAME) ---
  {
    name: 'fish',
    aliases: ['f'],
    description: 'Cast your line into deep ocean waters for aquatic bounties and sunken treasure.',
    category: 'community',
    async executePrefix(message) {
      return runFishGame(message, message.author);
    },
    async executeSlash(interaction) {
      return runFishGame(interaction, interaction.user);
    }
  },

  // --- MINE COMMAND (OwO STYLE EXCAVATION GAME) ---
  {
    name: 'mine',
    aliases: ['dig', 'm'],
    description: 'Excavate underground shafts for stone, iron, gold, and rare gemstone formations.',
    category: 'community',
    async executePrefix(message) {
      return runMineGame(message, message.author);
    },
    async executeSlash(interaction) {
      return runMineGame(interaction, interaction.user);
    }
  }
];

// Cooldown Trackers for Action Mini-Games
const huntCooldowns = new Map();
const fishCooldowns = new Map();
const mineCooldowns = new Map();

// ==========================================
// HANDLER: CRATE UNBOXING
// ==========================================
async function handleCrateOpen(ctx, user, crateId) {
  const guildId = ctx.guild.id;
  const crate = getBuiltinItem(crateId);

  if (!crate || crate.type !== 'crate') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Invalid Crate',
          `\`${crateId}\` is not a valid mystery crate.\n\n-# Available Crates: \`box_lucky\`, \`crate_common\`, \`crate_rare\`, \`crate_mythic\`, \`crate_celestial\`, \`geode_gem\`, \`urn_ancient\`, \`vault_dragon\`\n-# 💡 **Use \`!shop crates\` to browse all mystery boxes.**`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const ownedCount = db.getUserItemCount(guildId, user.id, crate.id);
  if (ownedCount <= 0) {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'No Crates Found',
          `You do not own any **${crate.name}** in your backpack.\n\n` +
          `-# **Price:** \`${crate.price.toLocaleString()}\` Athena Coins\n` +
          `-# **Buy Command:** \`!shop buy ${crate.id}\`\n\n` +
          `-# 💡 **Use \`!shop\` to purchase crates, or \`!inv\` to see what you own.**`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // Deduct 1 crate
  db.removeUserItem(guildId, user.id, crate.id, 1);

  // Roll coins
  const min = crate.minCoins || 300;
  const max = crate.maxCoins || 1200;
  let coinsWon = Math.floor(Math.random() * (max - min + 1)) + min;

  // Check Gambler's Charm booster (+25% payout)
  const hasCharm = db.isUserBoosterActive(guildId, user.id, 'gambler_charm');
  if (hasCharm) {
    coinsWon = Math.floor(coinsWon * 1.25);
  }

  db.addWallet(guildId, user.id, coinsWon);

  // Roll bonus loot
  let bonusItem = null;
  if (crate.id === 'geode_gem') {
    const gems = ['gem_ruby', 'gem_sapphire', 'gem_emerald', 'gem_amethyst'];
    const chosenGem = gems[Math.floor(Math.random() * gems.length)];
    bonusItem = getBuiltinItem(chosenGem);
    if (bonusItem) db.addUserItem(guildId, user.id, bonusItem.id, 1);
  } else if (crate.bonusDrop && Math.random() < crate.bonusDrop.chance) {
    bonusItem = getBuiltinItem(crate.bonusDrop.itemId);
    if (bonusItem) {
      db.addUserItem(guildId, user.id, bonusItem.id, 1);
    }
  }

  const remaining = db.getUserItemCount(guildId, user.id, crate.id);
  const eco = db.getUserEconomy(guildId, user.id);

  let lootDetails = `-# ${BULLET_EMOJI} **Currency Payout:** **\`+${coinsWon.toLocaleString()}\` Athena Coins**`;
  if (hasCharm) {
    lootDetails += ` *(+25% Charm Bonus applied!)*`;
  }
  if (bonusItem) {
    lootDetails += `\n-# ✨ **LUCKY BONUS DROP:** **1x ${bonusItem.name}** added to your backpack!`;
  }

  const unboxerLink = formatUserLink(user, ctx.guild);
  const crateEmoji = getItemEmoji(crate.id);
  const cratePrefix = crateEmoji ? `${crateEmoji} ` : '';
  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **${cratePrefix}Mystery Crate Unboxed | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Opened By:** ${unboxerLink}\n` +
          `-# **• Unboxed:** **1x ${crate.name}**\n` +
          `-# **• Crates Remaining:** \`${remaining}\` in backpack\n\n` +
          `${lootDetails}\n\n` +
          `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!inv\` to inspect items, or \`!shop\` to purchase more crates!**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ==========================================
// HANDLER: ITEM USE / CONSUME
// ==========================================
async function handleItemUse(ctx, user, itemId) {
  const guildId = ctx.guild.id;

  const item = getBuiltinItem(itemId);
  if (!item) {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Item Not Found',
          `\`${itemId}\` was not recognized in the item catalog.\n\n-# 💡 **Use \`!inv\` to check your backpack or \`!shop\` to browse items.**`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // If user passed a crate, redirect to crate opening
  if (item.type === 'crate') {
    return handleCrateOpen(ctx, user, item.id);
  }

  if (item.type === 'tool') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Adventure Tool Equipped',
          `**${item.name}** is a permanent action tool in your backpack!\n\n` +
          `-# ${BULLET_EMOJI} It is automatically equipped when you embark on activities.\n` +
          `-# ${BULLET_EMOJI} Use \`!hunt\` to track wildlife, \`!fish\` to cast your line, or \`!mine\` to excavate ores!\n\n` +
          `-# 💡 **Owned:** \`${db.getUserItemCount(guildId, user.id, item.id)}\` in backpack.`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (item.type === 'gem') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Precious Gemstone',
          `**${item.name}** is a rare trade mineral and collectible!\n\n` +
          `-# ${BULLET_EMOJI} Hold it in your \`!inv\` to showcase wealth.\n` +
          `-# ${BULLET_EMOJI} Or sell it for instant cash with \`!sell ${item.id}\` (Sell Value: \`${getItemSellPrice(item.id).toLocaleString()}\` coins).\n\n` +
          `-# 💡 **Owned:** \`${db.getUserItemCount(guildId, user.id, item.id)}\` in backpack.`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (item.type === 'egg') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Incubating Egg',
          `**${item.name}** is safely incubating in your backpack!\n\n` +
          `-# ${BULLET_EMOJI} Nurture it with \`pet_treats\` to bond with your future companion.`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (item.type === 'passive') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Passive Protection Item',
          `**${item.name}** is a passive protection safeguard!\n\n` +
          `-# It does not need to be manually activated.\n` +
          `-# As long as it rests in your \`!inv\`, it will automatically trigger its protection when needed.\n\n` +
          `-# 💡 **Owned:** \`${db.getUserItemCount(guildId, user.id, item.id)}\` in inventory.`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (item.type === 'collectible') {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Prestige Collectible',
          `**${item.name}** is a permanent prestige piece that showcases on your \`!inv\` and profile.\n\n-# It is permanently preserved in your collection.`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const owned = db.getUserItemCount(guildId, user.id, item.id);
  if (owned <= 0) {
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Item Not Owned',
          `You do not have any **${item.name}** in your inventory.\n\n-# Price: \`${item.price.toLocaleString()}\` coins\n-# Purchase: \`!shop buy ${item.id}\`\n\n-# 💡 **Explore \`!shop\` to purchase boosters and charms!**`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // Handle instant items
  if (item.id === 'energy_drink') {
    db.removeUserItem(guildId, user.id, item.id, 1);
    const eco = db.getUserEconomy(guildId, user.id);
    eco.lastDaily = Math.max(0, (eco.lastDaily || 0) - (6 * 3600 * 1000));
    db.save();

    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Energizer Consumed | <a:03_tick_circle:1565665642084827206>',
          `You downed a **Coffee Energizer**!\n\n` +
          `-# ${BULLET_EMOJI} **Effect:** Your \`!daily\` cooldown was reduced by **6 Hours**!\n` +
          `-# ${BULLET_EMOJI} Check \`!daily\` now to see if your stipend is ready!`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (item.id === 'chronos_hourglass') {
    db.removeUserItem(guildId, user.id, item.id, 1);
    huntCooldowns.delete(user.id);
    fishCooldowns.delete(user.id);
    mineCooldowns.delete(user.id);

    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Time Warped | <a:03_tick_circle:1565665642084827206>',
          `You inverted the **Hourglass of Chronos**!\n\n` +
          `-# ${BULLET_EMOJI} **Effect:** All action cooldowns for \`!hunt\`, \`!fish\`, and \`!mine\` were instantly reset to zero!`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  // Deduct 1 item and activate booster
  db.removeUserItem(guildId, user.id, item.id, 1);
  const expiresAt = db.activateUserBooster(guildId, user.id, item.id, item.durationMs || 3600000);
  const ts = Math.floor(expiresAt / 1000);
  const userLink = formatUserLink(user, ctx.guild);
  const itemEmoji = getItemEmoji(item.id);
  const itemPrefix = itemEmoji ? `${itemEmoji} ` : '';

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **${itemPrefix}Booster Buff Activated | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• User:** ${userLink}\n` +
          `-# ${BULLET_EMOJI} **Activated:** **${item.name}**\n` +
          `-# ${BULLET_EMOJI} **Effect:** ${item.description}\n` +
          `-# ${BULLET_EMOJI} **Buff Active Until:** <t:${ts}:R> *(<t:${ts}:f>)*\n` +
          `-# ${BULLET_EMOJI} **Remaining In Bag:** \`${db.getUserItemCount(guildId, user.id, item.id)}\``
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Play \`!slots\`, \`!coinflip\`, or \`!daily\` now to maximize your active buff!**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ==========================================
// HANDLER: SLOTS CASINO GAME
// ==========================================
async function runSlotsGame(ctx, user, bet) {
  const guildId = ctx.guild.id;

  const success = db.removeWallet(guildId, user.id, bet);
  if (!success) {
    const eco = db.getUserEconomy(guildId, user.id);
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Insufficient Funds',
          `You need \`${bet.toLocaleString()}\` Athena coins to play slots.\n-# **Your Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins\n\n-# 💡 **Use \`!daily\` to collect your free stipend!**`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const SYMBOLS = [
    { glyph: SLOT_EMOJIS.CROWN, name: 'Crown', mult: 20 },
    { glyph: SLOT_EMOJIS.DIAMOND, name: 'Diamond', mult: 12 },
    { glyph: SLOT_EMOJIS.BELL, name: 'Bell', mult: 7 },
    { glyph: SLOT_EMOJIS.GRAPES, name: 'Grapes', mult: 5 },
    { glyph: SLOT_EMOJIS.CHERRY, name: 'Cherry', mult: 3 }
  ];

  const hasClover = db.isUserBoosterActive(guildId, user.id, 'lucky_clover');
  const hasHorseshoe = db.isUserBoosterActive(guildId, user.id, 'golden_horseshoe');
  const hasCharm = db.isUserBoosterActive(guildId, user.id, 'gambler_charm');
  const hasDice = db.isUserBoosterActive(guildId, user.id, 'loaded_dice');
  const hasMagnet = db.isUserBoosterActive(guildId, user.id, 'coin_magnet');

  // Reel spin logic
  let s1, s2, s3;
  let matchBoost = 0;
  if (hasClover) matchBoost += 0.35;
  if (hasHorseshoe) matchBoost += 0.25;

  if (matchBoost > 0 && Math.random() < matchBoost) {
    const picked = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    s1 = picked;
    s2 = picked;
    s3 = Math.random() < 0.45 ? picked : SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  } else {
    s1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    s3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  let won = false;
  let multiplier = 0;
  let outcomeTitle = 'Defeat | <a:04_cross_circle:1565665644806934639>';

  if (s1.glyph === s2.glyph && s2.glyph === s3.glyph) {
    won = true;
    multiplier = s1.mult;
    outcomeTitle = s1.mult >= 12 ? 'JACKPOT VICTORY | <a:03_tick_circle:1565665642084827206>' : 'Match Victory | <a:03_tick_circle:1565665642084827206>';
  } else if (s1.glyph === s2.glyph || s2.glyph === s3.glyph || s1.glyph === s3.glyph) {
    won = true;
    multiplier = 1.5;
    outcomeTitle = 'Pair Victory | <a:03_tick_circle:1565665642084827206>';
  }

  let totalPayout = 0;
  let buffNote = '';

  if (won) {
    let rawWin = Math.floor(bet * multiplier);
    if (hasCharm) rawWin = Math.floor(rawWin * 1.25);
    if (hasDice) rawWin = Math.floor(rawWin * 1.15);
    totalPayout = rawWin;
    if (hasMagnet) totalPayout += 35;
    db.addWallet(guildId, user.id, totalPayout);
  } else {
    const featherCount = db.getUserItemCount(guildId, user.id, 'phoenix_feather');
    if (featherCount > 0) {
      db.removeUserItem(guildId, user.id, 'phoenix_feather', 1);
      const salvaged = Math.floor(bet * 0.5);
      db.addWallet(guildId, user.id, salvaged);
      buffNote += `\n-# 🔥 **Phoenix Feather Consumed:** Salvaged 50% (+\`${salvaged.toLocaleString()}\` coins) of lost wager!`;
    }
    if (hasMagnet) {
      db.addWallet(guildId, user.id, 35);
      buffNote += `\n-# 🧲 **Coin Magnet Active:** Recovered +35 bonus coins!`;
    }
  }

  const eco = db.getUserEconomy(guildId, user.id);

  if (hasClover) buffNote += `\n-# 🍀 **Lucky Clover Active:** Match frequency enhanced!`;
  if (hasHorseshoe) buffNote += `\n-# 🧲 **Golden Horseshoe Active:** Extreme jackpot luck active!`;
  if (won && hasCharm) buffNote += `\n-# ✨ **Gambler's Charm Active:** +25% payout bonus applied!`;
  if (won && hasDice) buffNote += `\n-# 🎲 **Loaded Dice Active:** +15% casino payout bonus applied!`;
  if (won && hasMagnet) buffNote += `\n-# 🧲 **Coin Magnet Active:** +35 bonus coins collected!`;

  const slotDisplay = `## ${s1.glyph} ┆ ${s2.glyph} ┆ ${s3.glyph}\n-# **Reels:** \`${s1.name}\` ┆ \`${s2.name}\` ┆ \`${s3.name}\``;

  const resultLine = won
    ? `**WON \`+${totalPayout - bet}\` coins (Payout: \`${totalPayout.toLocaleString()}\` — ${multiplier}x)**`
    : `**LOST \`-${bet.toLocaleString()}\` coins**`;

  const playerLink = formatUserLink(user, ctx.guild);
  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **Slot Machine ${outcomeTitle}**\n` +
          `-# **• Player:** ${playerLink}\n\n` +
          `${slotDisplay}\n\n` +
          `-# ${BULLET_EMOJI} **Outcome:** ${resultLine}\n` +
          `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
          buffNote
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!shop\` to purchase Lucky Clovers, Mystery Crates, or server perks!**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ==========================================
// HANDLER: HUNT GAME (FOREST WILDLIFE)
// ==========================================
async function runHuntGame(ctx, user) {
  const guildId = ctx.guild.id;
  const now = Date.now();
  const cd = 15000; // 15 seconds
  const lastTime = huntCooldowns.get(user.id) || 0;
  if (now - lastTime < cd) {
    const remainSec = Math.ceil((cd - (now - lastTime)) / 1000);
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Hunting Cooldown | <a:exclamation_outline1:1565666739356827759>',
          `Your hunting party is catching their breath!\n\n` +
          `-# Please wait **${remainSec}s** before tracking wildlife again.\n` +
          `-# 💡 **Tip:** Use an **Hourglass of Chronos** (\`!use chronos_hourglass\`) to instantly reset all cooldowns!`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  huntCooldowns.set(user.id, now);

  const hasBow = db.getUserItemCount(guildId, user.id, 'hunting_bow') > 0;
  const hasCrossbow = db.getUserItemCount(guildId, user.id, 'recurve_crossbow') > 0;
  const hasNet = db.getUserItemCount(guildId, user.id, 'golden_net') > 0;
  const hasBait = db.getUserItemCount(guildId, user.id, 'enchanted_bait') > 0;
  const hasMagnet = db.isUserBoosterActive(guildId, user.id, 'coin_magnet');

  if (hasBait) {
    db.removeUserItem(guildId, user.id, 'enchanted_bait', 1);
  }

  const roll = Math.random();
  let prey, baseBounty, tier;

  if (hasCrossbow && (roll < 0.20 || (hasBait && roll < 0.60))) {
    tier = 'Mythical Apex';
    const mythicalPrey = [
      { name: 'Celestial Kirin', coins: 6500 },
      { name: 'Ancient Griffin', coins: 3800 },
      { name: 'Draconic Wyvern', coins: 4800 },
      { name: 'Shadow Phoenix', coins: 5500 }
    ];
    prey = mythicalPrey[Math.floor(Math.random() * mythicalPrey.length)];
    baseBounty = prey.coins;
  } else if ((hasBow || hasCrossbow) && (roll < 0.50 || hasBait)) {
    tier = 'Rare Wildlife';
    const rarePrey = [
      { name: 'White Royal Stag', coins: 950 },
      { name: 'Golden Eagle', coins: 750 },
      { name: 'Shadow Panther', coins: 600 },
      { name: 'Silver Dire Wolf', coins: 500 }
    ];
    prey = rarePrey[Math.floor(Math.random() * rarePrey.length)];
    baseBounty = prey.coins;
  } else if (roll < 0.75) {
    tier = 'Uncommon Game';
    const uncomPrey = [
      { name: 'Timber Wolf', coins: 280 },
      { name: 'Grizzly Bear', coins: 340 },
      { name: 'Silver Fox', coins: 220 }
    ];
    prey = uncomPrey[Math.floor(Math.random() * uncomPrey.length)];
    baseBounty = prey.coins;
  } else {
    tier = 'Common Game';
    const comPrey = [
      { name: 'Forest Rabbit', coins: 65 },
      { name: 'Wild Boar', coins: 110 },
      { name: 'Woodland Deer', coins: 140 }
    ];
    prey = comPrey[Math.floor(Math.random() * comPrey.length)];
    baseBounty = prey.coins;
  }

  let multiplier = 1.0;
  if (hasCrossbow) multiplier += 0.75;
  else if (hasBow) multiplier += 0.30;
  if (hasNet) multiplier += 0.25;

  let totalBounty = Math.floor(baseBounty * multiplier);
  if (hasMagnet) totalBounty += 35;

  db.addWallet(guildId, user.id, totalBounty);
  const eco = db.getUserEconomy(guildId, user.id);

  let gearNotes = [];
  if (hasCrossbow) gearNotes.push('Dragon Crossbow (+75%)');
  else if (hasBow) gearNotes.push('Hunter Bow (+30%)');
  if (hasNet) gearNotes.push('Golden Net (+25%)');
  if (hasBait) gearNotes.push('Enchanted Bait (Guaranteed Tier)');
  if (hasMagnet) gearNotes.push('Coin Magnet (+35)');

  const gearText = gearNotes.length > 0 ? `\n-# 🏹 **Gear Buffs:** *${gearNotes.join(' · ')}*` : `\n-# 💡 **Equip a Hunter's Longbow in \`!shop gear\` for bigger game!**`;
  const hunterLink = formatUserLink(user, ctx.guild);

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **${CMD_HUNT_EMOJI} Forest Hunt Successful | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Hunter:** ${hunterLink}\n` +
          `-# **• Prey Captured:** **${prey.name}** (\`${tier}\`)\n` +
          `-# ${BULLET_EMOJI} **Bounty Claimed:** **\`+${totalBounty.toLocaleString()}\` Athena Coins**\n` +
          `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
          gearText
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!fish\` to cast your rod, \`!mine\` to dig for ores, or \`!shop\` to upgrade gear.**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ==========================================
// HANDLER: FISH GAME (DEEP SEA AQUATICS)
// ==========================================
async function runFishGame(ctx, user) {
  const guildId = ctx.guild.id;
  const now = Date.now();
  const cd = 15000; // 15 seconds
  const lastTime = fishCooldowns.get(user.id) || 0;
  if (now - lastTime < cd) {
    const remainSec = Math.ceil((cd - (now - lastTime)) / 1000);
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Fishing Cooldown | <a:exclamation_outline1:1565666739356827759>',
          `Your fishing line is drying out!\n\n` +
          `-# Please wait **${remainSec}s** before casting line into deep waters again.\n` +
          `-# 💡 **Tip:** Use an **Hourglass of Chronos** (\`!use chronos_hourglass\`) to instantly reset all cooldowns!`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  fishCooldowns.set(user.id, now);

  const hasRod = db.getUserItemCount(guildId, user.id, 'fishing_rod') > 0;
  const hasHarpoon = db.getUserItemCount(guildId, user.id, 'titan_harpoon') > 0;
  const hasNet = db.getUserItemCount(guildId, user.id, 'golden_net') > 0;
  const hasBait = db.getUserItemCount(guildId, user.id, 'enchanted_bait') > 0;
  const hasMagnet = db.isUserBoosterActive(guildId, user.id, 'coin_magnet');

  if (hasBait) {
    db.removeUserItem(guildId, user.id, 'enchanted_bait', 1);
  }

  const roll = Math.random();
  let catchData, baseBounty, tier;
  let bonusItem = null;

  if (hasHarpoon && (roll < 0.20 || (hasBait && roll < 0.60))) {
    tier = 'Mythical Ocean Leviathan';
    const leviathans = [
      { name: 'Abyssal Megalodon', coins: 6000 },
      { name: 'Deep Sea Kraken', coins: 4500 },
      { name: 'Poseidon\'s Sunken Galleon', coins: 5200 },
      { name: 'Spectral Sea Serpent', coins: 4000 }
    ];
    catchData = leviathans[Math.floor(Math.random() * leviathans.length)];
    baseBounty = catchData.coins;
  } else if ((hasRod || hasHarpoon) && (roll < 0.50 || hasBait)) {
    tier = 'Rare Aquatic Trophy';
    const rareFish = [
      { name: 'Great White Shark', coins: 850 },
      { name: 'Sunken Pirate Chest', coins: 1100, item: 'gem_ruby' },
      { name: 'Mermaid Oyster Pearl', coins: 700, item: 'gem_sapphire' },
      { name: 'Giant Blue Marlin', coins: 650 }
    ];
    catchData = rareFish[Math.floor(Math.random() * rareFish.length)];
    baseBounty = catchData.coins;
    if (catchData.item && Math.random() < 0.40) {
      bonusItem = getBuiltinItem(catchData.item);
      if (bonusItem) db.addUserItem(guildId, user.id, bonusItem.id, 1);
    }
  } else if (roll < 0.75) {
    tier = 'Uncommon Catch';
    const uncomFish = [
      { name: 'Electric Eel', coins: 240 },
      { name: 'Giant Squid', coins: 320 },
      { name: 'Swordfish', coins: 210 }
    ];
    catchData = uncomFish[Math.floor(Math.random() * uncomFish.length)];
    baseBounty = catchData.coins;
  } else {
    tier = 'Common Catch';
    const comFish = [
      { name: 'Golden Carp', coins: 60 },
      { name: 'Silver Trout', coins: 95 },
      { name: 'Atlantic Salmon', coins: 130 }
    ];
    catchData = comFish[Math.floor(Math.random() * comFish.length)];
    baseBounty = catchData.coins;
  }

  let multiplier = 1.0;
  if (hasHarpoon) multiplier += 0.75;
  else if (hasRod) multiplier += 0.25;
  if (hasNet) multiplier += 0.25;

  let totalBounty = Math.floor(baseBounty * multiplier);
  if (hasMagnet) totalBounty += 35;

  db.addWallet(guildId, user.id, totalBounty);
  const eco = db.getUserEconomy(guildId, user.id);

  let gearNotes = [];
  if (hasHarpoon) gearNotes.push('Titan Harpoon (+75%)');
  else if (hasRod) gearNotes.push('Sturdy Rod (+25%)');
  if (hasNet) gearNotes.push('Golden Net (+25%)');
  if (hasBait) gearNotes.push('Enchanted Bait (Guaranteed Tier)');
  if (hasMagnet) gearNotes.push('Coin Magnet (+35)');

  let bonusNote = '';
  if (bonusItem) {
    bonusNote = `\n-# ✨ **TREASURE SALVAGED:** Found **1x ${bonusItem.name}** inside the catch! Added to your backpack.`;
  }

  const gearText = gearNotes.length > 0 ? `\n-# 🎣 **Gear Buffs:** *${gearNotes.join(' · ')}*` : `\n-# 💡 **Equip a Sturdy Fishing Rod in \`!shop gear\` for deep ocean catches!**`;
  const anglerLink = formatUserLink(user, ctx.guild);

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **${CMD_FISH_EMOJI} Deep-Sea Catch Landed | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Angler:** ${anglerLink}\n` +
          `-# **• Reeled In:** **${catchData.name}** (\`${tier}\`)\n` +
          `-# ${BULLET_EMOJI} **Bounty Paid:** **\`+${totalBounty.toLocaleString()}\` Athena Coins**\n` +
          `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
          bonusNote +
          gearText
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!hunt\` to track game, \`!mine\` to dig for ores, or \`!shop\` to explore gear.**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ==========================================
// HANDLER: MINE GAME (EXCAVATION & GEMS)
// ==========================================
async function runMineGame(ctx, user) {
  const guildId = ctx.guild.id;
  const now = Date.now();
  const cd = 15000; // 15 seconds
  const lastTime = mineCooldowns.get(user.id) || 0;
  if (now - lastTime < cd) {
    const remainSec = Math.ceil((cd - (now - lastTime)) / 1000);
    return ctx.reply({
      components: [
        cv2.buildContainer(
          'Mining Cooldown | <a:exclamation_outline1:1565666739356827759>',
          `Your mining drill is cooling down!\n\n` +
          `-# Please wait **${remainSec}s** before excavating subterranean shafts again.\n` +
          `-# 💡 **Tip:** Use an **Hourglass of Chronos** (\`!use chronos_hourglass\`) to instantly reset all cooldowns!`
        )
      ],
      flags: MessageFlags.IsComponentsV2
    });
  }

  mineCooldowns.set(user.id, now);

  const hasPickaxe = db.getUserItemCount(guildId, user.id, 'iron_pickaxe') > 0;
  const hasDrill = db.getUserItemCount(guildId, user.id, 'diamond_drill') > 0;
  const hasDynamite = db.getUserItemCount(guildId, user.id, 'mining_dynamite') > 0;
  const hasMagnet = db.isUserBoosterActive(guildId, user.id, 'coin_magnet');

  if (hasDynamite) {
    db.removeUserItem(guildId, user.id, 'mining_dynamite', 1);
  }

  const roll = Math.random();
  let excavationData, coinReward, tier;
  let minedItem = null;

  if (hasDrill && (roll < 0.25 || hasDynamite)) {
    tier = 'Mythical Gem Vein';
    const mythicGems = [
      { name: 'Blood Ruby Vein', coins: 1500, item: 'gem_ruby' },
      { name: 'Star Sapphire Cluster', coins: 1800, item: 'gem_sapphire' },
      { name: 'Deep Emerald Geode', coins: 2200, item: 'gem_emerald' },
      { name: 'Void Amethyst Formation', coins: 2800, item: 'gem_amethyst' }
    ];
    excavationData = mythicGems[Math.floor(Math.random() * mythicGems.length)];
    coinReward = excavationData.coins;
    minedItem = getBuiltinItem(excavationData.item);
    if (minedItem) db.addUserItem(guildId, user.id, minedItem.id, 1);
  } else if ((hasPickaxe || hasDrill) && (roll < 0.60 || hasDynamite)) {
    tier = 'Precious Ore Seam';
    const oreSeams = [
      { name: 'Pure Gold Vein', coins: 450, item: 'ore_gold' },
      { name: 'Rich Iron Deposit', coins: 250, item: 'ore_iron' },
      { name: 'Silver Ore Pocket', coins: 350 }
    ];
    excavationData = oreSeams[Math.floor(Math.random() * oreSeams.length)];
    coinReward = excavationData.coins;
    if (excavationData.item) {
      minedItem = getBuiltinItem(excavationData.item);
      if (minedItem) db.addUserItem(guildId, user.id, minedItem.id, 1);
    }
  } else {
    tier = 'Subterranean Stone';
    const commonStones = [
      { name: 'Dense Coal Seam', coins: 85 },
      { name: 'Granite Bedrock Pocket', coins: 120 },
      { name: 'Limestone Gravel Deposit', coins: 65 }
    ];
    excavationData = commonStones[Math.floor(Math.random() * commonStones.length)];
    coinReward = excavationData.coins;
  }

  let multiplier = 1.0;
  if (hasDrill) multiplier += 0.60;
  else if (hasPickaxe) multiplier += 0.25;
  if (hasDynamite) multiplier += 1.0;

  let totalCoins = Math.floor(coinReward * multiplier);
  if (hasMagnet) totalCoins += 35;

  db.addWallet(guildId, user.id, totalCoins);
  const eco = db.getUserEconomy(guildId, user.id);

  let gearNotes = [];
  if (hasDrill) gearNotes.push('Diamond Drill (+60% / 3x Gems)');
  else if (hasPickaxe) gearNotes.push('Iron Pickaxe (+25%)');
  if (hasDynamite) gearNotes.push('Dynamite Blast (2x Yield)');
  if (hasMagnet) gearNotes.push('Coin Magnet (+35)');

  let itemFoundNote = '';
  if (minedItem) {
    itemFoundNote = `\n-# 💎 **ORE EXTRACTED:** **1x ${minedItem.name}** added to your backpack! (Sell value: \`${getItemSellPrice(minedItem.id).toLocaleString()}\` coins via \`!sell ${minedItem.id}\`)`;
  }

  const gearText = gearNotes.length > 0 ? `\n-# ⛏️ **Mining Rig:** *${gearNotes.join(' · ')}*` : `\n-# 💡 **Equip a Sturdy Iron Pickaxe in \`!shop gear\` to extract iron and gold!**`;
  const minerLink = formatUserLink(user, ctx.guild);

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `### **${CMD_MINE_EMOJI} Excavation Strike | <a:03_tick_circle:1565665642084827206>**\n` +
          `-# **• Miner:** ${minerLink}\n` +
          `-# **• Excavated:** **${excavationData.name}** (\`${tier}\`)\n` +
          `-# ${BULLET_EMOJI} **Gold Nuggets Uncovered:** **\`+${totalCoins.toLocaleString()}\` Athena Coins**\n` +
          `-# ${BULLET_EMOJI} **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins` +
          itemFoundNote +
          gearText
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# 💡 **Use \`!sell\` to liquidate gems and ores, or explore \`!shop\`!**`
      }
    ]
  };

  return ctx.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

export default commands;
