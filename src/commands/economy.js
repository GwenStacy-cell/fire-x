import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

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
              `### **Financial Portfolio** | <a:uptime:1552608831060844575>\n` +
              `-# **• Account Holder:** <@${targetUser.id}> \`(${targetUser.id})\`\n\n` +
              `-# **• Wallet Balance:** \`${wallet.toLocaleString()}\` coins\n` +
              `-# **• Vault Reserve:** \`${bank.toLocaleString()}\` coins\n` +
              `-# • **Net Worth:** **\`${netWorth.toLocaleString()}\` Athena Coins**\n` +
              `-# • **Daily Streak:** \`${eco.streak || 0}\` days`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Commerce Grid \u00b7 Use \`!daily\` to claim daily dividend**`
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
              `### **Financial Portfolio** | <a:uptime:1552608831060844575>\n` +
              `-# **• Account Holder:** <@${targetUser.id}> \`(${targetUser.id})\`\n\n` +
              `-# **• Wallet Balance:** \`${wallet.toLocaleString()}\` coins\n` +
              `-# **• Vault Reserve:** \`${bank.toLocaleString()}\` coins\n` +
              `-# • **Net Worth:** **\`${netWorth.toLocaleString()}\` Athena Coins**\n` +
              `-# • **Daily Streak:** \`${eco.streak || 0}\` days`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Commerce Grid \u00b7 Use \`/daily\` to claim daily dividend**`
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
              'Stipend Cooldown Active | <a:uptime:1552608831060844575>',
              `You have already claimed your daily stipend.\n\n-# **Time Remaining:** \`${hours}h ${minutes}m\`\n-# **Streak Protected:** \`${eco.streak || 0} days\``
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // Check streak (within 48 hours keeps streak, else resets)
      const streak = (elapsed < 48 * 60 * 60 * 1000) ? (eco.streak || 0) + 1 : 1;
      const baseReward = 300;
      const streakBonus = Math.min(streak * 30, 600);
      const totalClaim = baseReward + streakBonus;

      db.updateUserEconomy(guildId, userId, {
        wallet: (eco.wallet || 0) + totalClaim,
        lastDaily: now,
        streak
      });

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Daily Stipend Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Recipient:** <@${userId}>\n\n` +
              `-# • **Base Stipend:** \`+${baseReward}\` coins\n` +
              `-# • **Streak Multiplier (Day ${streak}):** \`+${streakBonus}\` bonus coins\n` +
              `-# • **Total Deposited:** **\`+${totalClaim}\` Athena Coins**\n` +
              `-# • **New Wallet Balance:** \`${((eco.wallet || 0) + totalClaim).toLocaleString()}\` coins`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Return in 24 hours to preserve your Day ${streak} streak streak!**`
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
              'Stipend Cooldown Active | <a:uptime:1552608831060844575>',
              `You have already claimed your daily stipend.\n\n-# **Time Remaining:** \`${hours}h ${minutes}m\`\n-# **Streak Protected:** \`${eco.streak || 0} days\``
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const streak = (elapsed < 48 * 60 * 60 * 1000) ? (eco.streak || 0) + 1 : 1;
      const baseReward = 300;
      const streakBonus = Math.min(streak * 30, 600);
      const totalClaim = baseReward + streakBonus;

      db.updateUserEconomy(guildId, userId, {
        wallet: (eco.wallet || 0) + totalClaim,
        lastDaily: now,
        streak
      });

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Daily Stipend Disbursed | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Recipient:** <@${userId}>\n\n` +
              `-# • **Base Stipend:** \`+${baseReward}\` coins\n` +
              `-# • **Streak Multiplier (Day ${streak}):** \`+${streakBonus}\` bonus coins\n` +
              `-# • **Total Deposited:** **\`+${totalClaim}\` Athena Coins**\n` +
              `-# • **New Wallet Balance:** \`${((eco.wallet || 0) + totalClaim).toLocaleString()}\` coins`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Return in 24 hours to preserve your Day ${streak} streak!**`
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

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Funds Transferred | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Sender:** <@${message.author.id}>\n` +
              `-# • **Recipient:** <@${targetUser.id}>\n` +
              `-# • **Amount:** \`${amount.toLocaleString()}\` Athena Coins\n` +
              `-# • **Status:** \`Settled instantly on local ledger\``
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

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Funds Transferred | <a:03_tick_circle:1565665642084827206>**\n` +
              `-# **• Sender:** <@${interaction.user.id}>\n` +
              `-# • **Recipient:** <@${targetUser.id}>\n` +
              `-# • **Amount:** \`${amount.toLocaleString()}\` Athena Coins\n` +
              `-# • **Status:** \`Settled instantly on local ledger\``
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
          components: [cv2.buildContainer('Coinflip Usage', 'Please specify `heads` or `tails` followed by your bet amount.\n\n-# **Example:** `!coinflip heads 50`')],
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
            cv2.buildContainer('Insufficient Funds', `You need \`${bet}\` coins in your wallet. Current wallet: \`${eco.wallet || 0}\`.`)
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const normalizedChoice = (choice === 'h' || choice === 'heads') ? 'heads' : 'tails';
      const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = normalizedChoice === outcome;

      if (won) {
        const winnings = bet * 2;
        db.addWallet(guildId, message.author.id, winnings);
      }

      const eco = db.getUserEconomy(guildId, message.author.id);
      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coinflip ${won ? 'Victory | <a:03_tick_circle:1565665642084827206>' : 'Defeat | <a:uptime:1552608831060844575>'}**\n` +
              `-# **• Player:** <@${message.author.id}>\n` +
              `-# • **Your Call:** \`${normalizedChoice.toUpperCase()}\` \u00b7 **Coin Landed:** **\`${outcome.toUpperCase()}\`**\n\n` +
              `-# • **Result:** ${won ? `**WON \`+${bet}\` coins (Payout: \`${bet * 2}\`)**` : `**LOST \`-${bet}\` coins**`}\n` +
              `-# • **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
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
            cv2.buildContainer('Insufficient Funds', `You need \`${bet}\` coins in your wallet. Current wallet: \`${eco.wallet || 0}\`.`)
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = choice === outcome;

      if (won) {
        db.addWallet(guildId, interaction.user.id, bet * 2);
      }

      const eco = db.getUserEconomy(guildId, interaction.user.id);
      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Coinflip ${won ? 'Victory | <a:03_tick_circle:1565665642084827206>' : 'Defeat | <a:uptime:1552608831060844575>'}**\n` +
              `-# **• Player:** <@${interaction.user.id}>\n` +
              `-# • **Your Call:** \`${choice.toUpperCase()}\` \u00b7 **Coin Landed:** **\`${outcome.toUpperCase()}\`**\n\n` +
              `-# • **Result:** ${won ? `**WON \`+${bet}\` coins (Payout: \`${bet * 2}\`)**` : `**LOST \`-${bet}\` coins**`}\n` +
              `-# • **Updated Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  // --- SHOP COMMAND ---
  {
    name: 'shop',
    description: 'Browse the server role shop, purchase perks, or manage items.',
    category: 'community',
    options: [
      {
        name: 'view',
        description: 'View all purchasable items in the server shop',
        type: 1
      },
      {
        name: 'buy',
        description: 'Purchase an item by its ID',
        type: 1,
        options: [
          {
            name: 'item_id',
            description: 'The ID of the item to purchase',
            type: 3,
            required: true
          }
        ]
      },
      {
        name: 'add',
        description: 'Add a role or perk to the shop (Admin)',
        type: 1,
        options: [
          {
            name: 'name',
            description: 'Item display name',
            type: 3,
            required: true
          },
          {
            name: 'price',
            description: 'Price in Athena coins',
            type: 4,
            required: true
          },
          {
            name: 'role',
            description: 'Role granted upon purchase',
            type: 8, // ROLE
            required: true
          },
          {
            name: 'description',
            description: 'Short description of the item',
            type: 3,
            required: false
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove an item from the shop (Admin)',
        type: 1,
        options: [
          {
            name: 'item_id',
            description: 'The ID of the item to delete',
            type: 3,
            required: true
          }
        ]
      }
    ],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const sub = (args[0] || '').toLowerCase();

      // EXTRA OWNER: ADD ITEM
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
              `Item **${item.name}** registered successfully!\n\n` +
              `-# • **Item ID:** \`${item.id}\`\n` +
              `-# • **Price:** \`${item.price.toLocaleString()}\` coins\n` +
              `-# • **Role:** <@&${item.roleId}>\n` +
              `-# • **Description:** ${item.description}`
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
              removed ? `Item \`${itemId}\` was purged from the shop.` : `No item matching ID \`${itemId}\` was found.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      // BUY ITEM
      if (sub === 'buy') {
        const itemId = args[1];
        if (!itemId) {
          return message.reply({ components: [cv2.buildContainer('Missing Item ID', 'Usage: `!shop buy <item_id>`\nUse `!shop` to view item IDs.')], flags: MessageFlags.IsComponentsV2 });
        }

        const items = db.getShopItems(guildId);
        const item = items.find(it => it.id === itemId || it.name.toLowerCase() === itemId.toLowerCase());
        if (!item) {
          return message.reply({ components: [cv2.buildContainer('Item Not Found', `No item matching \`${itemId}\` exists in the shop.`)], flags: MessageFlags.IsComponentsV2 });
        }

        const role = message.guild.roles.cache.get(item.roleId);
        if (!role) {
          return message.reply({ components: [cv2.buildContainer('Role Missing', 'The role bound to this item no longer exists.')], flags: MessageFlags.IsComponentsV2 });
        }

        if (message.member.roles.cache.has(role.id)) {
          return message.reply({ components: [cv2.buildContainer('Already Owned', `You already possess the <@&${role.id}> role.`)], flags: MessageFlags.IsComponentsV2 });
        }

        const success = db.removeWallet(guildId, message.author.id, item.price);
        if (!success) {
          const eco = db.getUserEconomy(guildId, message.author.id);
          return message.reply({
            components: [
              cv2.buildContainer(
                'Insufficient Funds',
                `You need \`${item.price.toLocaleString()}\` coins to purchase **${item.name}**.\n-# **Your Wallet:** \`${(eco.wallet || 0).toLocaleString()}\` coins`
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        await message.member.roles.add(role).catch(err => {
          console.error('[Shop] Failed to assign purchased role:', err);
        });

        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `### **Item Purchased | <a:03_tick_circle:1565665642084827206>**\n` +
                `-# **• Buyer:** <@${message.author.id}>\n` +
                `-# • **Item:** **${item.name}**\n` +
                `-# • **Role Granted:** <@&${role.id}>\n` +
                `-# • **Price Paid:** \`${item.price.toLocaleString()}\` Athena Coins`
            }
          ]
        };

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      // DEFAULT: VIEW SHOP
      const items = db.getShopItems(guildId);
      if (items.length === 0) {
        return message.reply({
          components: [
            cv2.buildContainer(
              'Server Commerce Catalog | <a:uptime:1552608831060844575>',
              'The server shop is currently empty.\n\n-# **Administrators:** Add items with `!shop add <name> <price> <@role>`'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      let itemList = items.map((it, idx) =>
        `**${idx + 1}. ${it.name}** \u2014 \`${it.price.toLocaleString()}\` coins\n` +
        `-# • **Role:** <@&${it.roleId}> \u00b7 **ID:** \`${it.id}\`\n` +
        `-# • *${it.description || 'Exclusive server role perk'}*`
      ).join('\n\n');

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Server Commerce Catalog | <a:uptime:1552608831060844575>**\n` +
              `-# **Use \`!shop buy <item_id>\` to purchase an item.**\n\n` +
              itemList
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Prime Secure Role Fulfillment Matrix**`
          }
        ]
      };

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      const guildId = interaction.guild.id;
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const role = interaction.options.getRole('role');
        const desc = interaction.options.getString('description') || `Grants the @${role.name} role`;

        const item = db.addShopItem(guildId, { name, price, roleId: role.id, description: desc });
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Shop Item Created | <a:03_tick_circle:1565665642084827206>',
              `Item **${item.name}** added for \`${item.price.toLocaleString()}\` coins.\n-# **ID:** \`${item.id}\``
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'remove') {
        const itemId = interaction.options.getString('item_id');
        const removed = db.removeShopItem(guildId, itemId);
        return interaction.reply({
          components: [
            cv2.buildContainer(
              removed ? 'Shop Item Removed | <a:03_tick_circle:1565665642084827206>' : 'Item Not Found',
              removed ? `Item \`${itemId}\` removed from catalog.` : `Could not find item with ID \`${itemId}\`.`
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'buy') {
        const itemId = interaction.options.getString('item_id');
        const items = db.getShopItems(guildId);
        const item = items.find(it => it.id === itemId || it.name.toLowerCase() === itemId.toLowerCase());

        if (!item) {
          return interaction.reply({
            components: [cv2.buildContainer('Item Not Found', `No item matching \`${itemId}\` was found.`)],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const role = interaction.guild.roles.cache.get(item.roleId);
        if (!role) {
          return interaction.reply({
            components: [cv2.buildContainer('Role Missing', 'The role bound to this item no longer exists.')],
            flags: MessageFlags.IsComponentsV2
          });
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({
            components: [cv2.buildContainer('Already Owned', `You already possess the <@&${role.id}> role.`)],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const success = db.removeWallet(guildId, interaction.user.id, item.price);
        if (!success) {
          const eco = db.getUserEconomy(guildId, interaction.user.id);
          return interaction.reply({
            components: [
              cv2.buildContainer(
                'Insufficient Funds',
                `You need \`${item.price.toLocaleString()}\` coins. Current wallet: \`${eco.wallet || 0}\`.`
              )
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        await interaction.member.roles.add(role).catch(() => null);

        const container = {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `### **Item Purchased | <a:03_tick_circle:1565665642084827206>**\n` +
                `-# **• Buyer:** <@${interaction.user.id}>\n` +
                `-# • **Item:** **${item.name}**\n` +
                `-# • **Role Granted:** <@&${role.id}>\n` +
                `-# • **Price Paid:** \`${item.price.toLocaleString()}\` coins`
            }
          ]
        };

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      // VIEW
      const items = db.getShopItems(guildId);
      if (items.length === 0) {
        return interaction.reply({
          components: [
            cv2.buildContainer(
              'Server Commerce Catalog | <a:uptime:1552608831060844575>',
              'The server shop is currently empty.\n\n-# **Administrators:** Use `/shop add` to list items.'
            )
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      let itemList = items.map((it, idx) =>
        `**${idx + 1}. ${it.name}** \u2014 \`${it.price.toLocaleString()}\` coins\n` +
        `-# • **Role:** <@&${it.roleId}> \u00b7 **ID:** \`${it.id}\`\n` +
        `-# • *${it.description || 'Exclusive server role perk'}*`
      ).join('\n\n');

      const container = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **Server Commerce Catalog | <a:uptime:1552608831060844575>**\n` +
              `-# **Use \`/shop buy <item_id>\` to purchase an item.**\n\n` +
              itemList
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Prime Secure Role Fulfillment Matrix**`
          }
        ]
      };

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  }
];

export default commands;
