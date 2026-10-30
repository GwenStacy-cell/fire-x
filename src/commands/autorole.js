import { MessageFlags, ActionRowBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import db from '../database.js';
import { hasCriticalOnboardingPerms } from '../utils/onboardingGuard.js';

const TICK = '<a:black_dot:1544740123403620422>';
const ARROW = '<a:z_arrow_pink1:1523082728004653138>';

function formatRoles(roleData) {
  if (!roleData) return '`None`';
  if (Array.isArray(roleData)) {
    if (roleData.length === 0) return '`None`';
    return roleData.map(id => `<@&${id}>`).join(' ');
  }
  return `<@&${roleData}>`;
}

export function getAutoRolePanel(guildId, client) {
  const config = db.getGuildConfig(guildId) || {};
  
  const humanRole = formatRoles(config.autoroleHuman);
  const botRole = formatRoles(config.autoroleBot);
  
  const vanityStr = config.vanityString ? `**${config.vanityString}**` : '`None`';
  const vanityRole = formatRoles(config.vanityRole);

  const row1 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('autorole_human_select')
      .setPlaceholder('Select Human AutoRoles (Max 5)')
      .setMinValues(1)
      .setMaxValues(5)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('autorole_bot_select')
      .setPlaceholder('Select Bot AutoRoles (Max 5)')
      .setMinValues(1)
      .setMaxValues(5)
  );
  
  const row3 = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('autorole_vanity_select')
      .setPlaceholder('Select Vanity Reward Roles (Max 5)')
      .setMinValues(1)
      .setMaxValues(5)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('autorole_set_vanity').setLabel('Set Vanity String').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('autorole_clear').setLabel('Wipe Config').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('autorole_close').setLabel('Close').setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 9,
        components: [
          {
            type: 10,
            content: `> # **AutoRole & Vanity Engine**\n\n-# **Automatically assign roles to new members, and reward users who promote your server vanity.**\n\n-# **${TICK} Use the dropdowns below to configure roles.**`
          }
        ],
        accessory: {
          type: 11,
          media: { url: client?.guilds.cache.get(guildId)?.members.me?.displayAvatarURL({ extension: 'png' }) || client?.user?.displayAvatarURL({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png' }
        }
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **${TICK} System Documentation:**\n-# \u2022 **Human AutoRole:** Assigned instantly to real users when they join the server.\n-# \u2022 **Bot AutoRole:** Assigned instantly to integration bots when they are invited.\n-# \u2022 **Vanity String:** A custom text (like \`.gg/server\`) you want members to put in their Discord status.\n-# \u2022 **Vanity Reward:** The special role granted to members while they have the string in their status (automatically removed if they delete it).`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **${TICK} Join Auto-Roles:**\n-# **\u2022 Humans:**  ${ARROW}  ${humanRole}\n-# **\u2022 Bots:**  ${ARROW}  ${botRole}\n\n-# **${TICK} Vanity Status Rewards:**\n-# **\u2022 Target String:**  ${ARROW}  ${vanityStr}\n-# **\u2022 Reward Roles:**  ${ARROW}  ${vanityRole}`
      },
      { type: 14, divider: true },
      row1.toJSON(),
      row2.toJSON(),
      row3.toJSON(),
      row4.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Bulletproof Security !!!**`
      }
    ]
  };

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function handleAutoRoleMenu(interaction) {
  const roleIds = interaction.values; // Now an array of role IDs!
  const guildId = interaction.guild.id;
  
  // Guard: Reject roles with Administrator, Manage Server, Manage Roles, or moderation permissions
  const dangerousRoles = [];
  const authRoles = db.getAuthRoles(guildId);
  for (const rId of roleIds) {
    const role = interaction.guild.roles.cache.get(rId) || await interaction.guild.roles.fetch(rId).catch(() => null);
    if (role && (hasCriticalOnboardingPerms(role.permissions) || (authRoles?.admin && authRoles.admin.includes(role.id)))) {
      dangerousRoles.push(`\`${role.name}\` (\`${role.id}\`)`);
    }
  }

  if (dangerousRoles.length > 0) {
    return interaction.reply({
      content: `-# **Security Violation | <a:03_tick_circle:1565665642084827206>**\n-# **Rejected Dangerous Role(s):** ${dangerousRoles.join(', ')}\n-# **Athena Security Policy:** Roles with \`Administrator\`, \`Manage Server\`, \`Manage Roles\`, or moderation permissions cannot be bound to AutoRole or Vanity rewards.`,
      flags: 64
    });
  }

  if (interaction.customId === 'autorole_human_select') {
    db.updateGuildConfig(guildId, { autoroleHuman: roleIds });
  } else if (interaction.customId === 'autorole_bot_select') {
    db.updateGuildConfig(guildId, { autoroleBot: roleIds });
  } else if (interaction.customId === 'autorole_vanity_select') {
    db.updateGuildConfig(guildId, { vanityRole: roleIds });
  }
  
  return interaction.update(getAutoRolePanel(guildId, interaction.client));
}

export async function handleAutoRoleButton(interaction) {
  if (interaction.customId === 'autorole_close') {
    return interaction.message.delete().catch(() => null);
  }
  
  if (interaction.customId === 'autorole_clear') {
    db.updateGuildConfig(interaction.guild.id, { 
      autoroleHuman: null,
      autoroleBot: null,
      vanityRole: null,
      vanityString: null
    });
    return interaction.update(getAutoRolePanel(interaction.guild.id, interaction.client));
  }
  
  if (interaction.customId === 'autorole_set_vanity') {
    const config = db.getGuildConfig(interaction.guild.id) || {};
    const modal = new ModalBuilder().setCustomId('autorole_vanity_modal').setTitle('Configure Vanity String');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('vanity_str')
          .setLabel('Vanity String (e.g. .gg/athena)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Leave blank to disable')
          .setValue(config.vanityString || '')
      )
    );
    return interaction.showModal(modal);
  }
}

export async function handleAutoRoleModal(interaction) {
  if (interaction.customId === 'autorole_vanity_modal') {
    const str = interaction.fields.getTextInputValue('vanity_str') || null;
    db.updateGuildConfig(interaction.guild.id, { vanityString: str });
    return interaction.update(getAutoRolePanel(interaction.guild.id, interaction.client));
  }
}

export default {
  name: 'autorole',
  aliases: ['joinrole'],
  description: 'Manage AutoRole and Vanity configurations',
  type: 1, // CHAT_INPUT
  async executePrefix(message) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (message.guild.ownerId !== message.author.id && !isBotOwnerSync(message.author.id) && !isExtraOwner(message.guild.id, message.author.id)) {
      return message.reply({ content: '-# **You do not have permission to manage this system.**', flags: 64 });
    }
    await message.reply(getAutoRolePanel(message.guild.id, message.client));
  },
  async executeSlash(interaction) {
    const { isExtraOwner, isBotOwnerSync } = await import('../utils/helpers.js');
    if (interaction.guild.ownerId !== interaction.user.id && !isBotOwnerSync(interaction.user.id) && !isExtraOwner(interaction.guild.id, interaction.user.id)) {
      return interaction.reply({ content: '-# **You do not have permission to manage this system.**', flags: 64 });
    }
    await interaction.reply(getAutoRolePanel(interaction.guild.id, interaction.client));
  }
};
