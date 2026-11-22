import {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  EmbedBuilder
} from 'discord.js';
import cv2 from '../cv2.js';
import { BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';
import db from '../database.js';
import { isAuthorized, isBotOwnerSync } from '../utils/helpers.js';

export const ROLE_COLOR_PRESETS = [
  { label: 'Reset Default (Transparent)', value: 'color_default', desc: 'Clear custom color to Discord theme default' },
  { label: 'Crimson Red (#FF0055)', value: 'color_#FF0055', desc: 'Vibrant punchy crimson' },
  { label: 'Ruby Red (#E74C3C)', value: 'color_#E74C3C', desc: 'Deep elegant scarlet red' },
  { label: 'Discord Blurple (#5865F2)', value: 'color_#5865F2', desc: 'Official Discord brand blurple' },
  { label: 'Electric Blue (#00A8FF)', value: 'color_#00A8FF', desc: 'Bright glowing cyan-blue' },
  { label: 'Emerald Green (#2ECC71)', value: 'color_#2ECC71', desc: 'Lush vibrant emerald green' },
  { label: 'Neon Mint (#00FF88)', value: 'color_#00FF88', desc: 'High-visibility fluorescent neon' },
  { label: 'Amber Gold (#F1C40F)', value: 'color_#F1C40F', desc: 'Warm bright golden yellow' },
  { label: 'Sunset Orange (#E67E22)', value: 'color_#E67E22', desc: 'Rich glowing dusk orange' },
  { label: 'Violet Amethyst (#9B59B6)', value: 'color_#9B59B6', desc: 'Regal royal purple' },
  { label: 'Cyber Pink (#E056FD)', value: 'color_#E056FD', desc: 'Vivid futuristic magenta' },
  { label: 'Obsidian Night (#2C3E50)', value: 'color_#2C3E50', desc: 'Sleek dark matte charcoal' },
  { label: 'Glacier White (#FFFFFF)', value: 'color_#FFFFFF', desc: 'Pure ultra-bright white' }
];

export const CORE_ROLE_PERMISSIONS = [
  { flag: 'Administrator', label: 'Administrator', desc: 'Bypass all permissions and restrictions' },
  { flag: 'ManageGuild', label: 'Manage Server', desc: 'Edit server name, region, settings' },
  { flag: 'ManageRoles', label: 'Manage Roles', desc: 'Create, edit, and delete lower roles' },
  { flag: 'ManageChannels', label: 'Manage Channels', desc: 'Create, edit, or delete channels' },
  { flag: 'KickMembers', label: 'Kick Members', desc: 'Kick members with lower roles' },
  { flag: 'BanMembers', label: 'Ban Members', desc: 'Ban members with lower roles' },
  { flag: 'ManageMessages', label: 'Manage Messages', desc: 'Delete and pin messages from any user' },
  { flag: 'MentionEveryone', label: 'Mention Everyone', desc: 'Ping @everyone and @here' },
  { flag: 'ViewAuditLog', label: 'View Audit Log', desc: 'View server audit logs' },
  { flag: 'ManageWebhooks', label: 'Manage Webhooks', desc: 'Create and delete webhooks' },
  { flag: 'AttachFiles', label: 'Attach Files', desc: 'Upload media, files, and attachments' },
  { flag: 'EmbedLinks', label: 'Embed Links', desc: 'Generate rich link previews in chat' },
  { flag: 'MoveMembers', label: 'Move Members', desc: 'Move members between voice channels' },
  { flag: 'MuteMembers', label: 'Mute Members', desc: 'Server mute voice channel participants' },
  { flag: 'DeafenMembers', label: 'Deafen Members', desc: 'Server deafen voice channel participants' },
  { flag: 'ViewChannel', label: 'View Channels', desc: 'Read and view server text/voice channels' },
  { flag: 'SendMessages', label: 'Send Messages', desc: 'Send messages in text channels' },
  { flag: 'Connect', label: 'Connect Voice', desc: 'Join and speak in voice channels' },
  { flag: 'Speak', label: 'Speak Voice', desc: 'Transmit audio in voice channels' },
  { flag: 'UseApplicationCommands', label: 'Slash Commands', desc: 'Use bot slash and context commands' }
];

export function buildRolePickerPanel(guild) {
  const glyph = getRandomHeadingGlyph();
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${glyph} Role Manager | Select Role`)
    .setDescription(
      `${BULLET_EMOJI} **Select a role** from the menu below to launch its interactive management dashboard.\n` +
      `${BULLET_EMOJI} **Live Capabilities:** Modify name, hex color, hoist status, mentionability, position, permissions, clone, or view members in real-time.`
    )
    .setFooter({ text: `${guild.name} • Athena Role Management Suite`, iconURL: guild.iconURL() || undefined });

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId('rm_picker')
    .setPlaceholder('Select a role to configure...')
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder().addComponents(roleSelect);
  return { embeds: [embed], components: [row] };
}

export function buildRoleManagerPanel(role, guild) {
  const glyph = getRandomHeadingGlyph();
  const hex = role.hexColor.toUpperCase();
  const isDefaultColor = role.color === 0;
  const colorDisplay = isDefaultColor ? 'Default (#000000)' : hex;
  const totalRoles = guild.roles.cache.size;

  const botHighest = guild.members.me?.roles.highest.position ?? 0;
  const canBotManage = botHighest > role.position && !role.managed && role.id !== guild.id;
  const hierarchyText = role.id === guild.id 
    ? 'Server Default (@everyone)'
    : role.managed 
      ? 'Bot / Integration Managed'
      : canBotManage
        ? `Manageable by Athena (Bot Highest: #${botHighest})`
        : `Hierarchy Blocked (Bot Highest: #${botHighest} <= Role: #${role.position})`;

  const permCount = role.permissions.toArray().length;
  const keyPermsList = [];
  if (role.permissions.has(PermissionFlagsBits.Administrator)) keyPermsList.push('Admin');
  if (role.permissions.has(PermissionFlagsBits.ManageGuild)) keyPermsList.push('Manage Server');
  if (role.permissions.has(PermissionFlagsBits.ManageRoles)) keyPermsList.push('Manage Roles');
  if (role.permissions.has(PermissionFlagsBits.ManageChannels)) keyPermsList.push('Manage Channels');
  if (role.permissions.has(PermissionFlagsBits.BanMembers)) keyPermsList.push('Ban');
  if (role.permissions.has(PermissionFlagsBits.KickMembers)) keyPermsList.push('Kick');
  if (role.permissions.has(PermissionFlagsBits.MentionEveryone)) keyPermsList.push('Mention All');
  if (role.permissions.has(PermissionFlagsBits.ManageMessages)) keyPermsList.push('Manage Msgs');

  const keyPermsSummary = keyPermsList.length > 0 ? keyPermsList.join(', ') : 'None';

  const embed = new EmbedBuilder()
    .setColor(role.color || 0x2b2d31)
    .setTitle(`${glyph} Role Manager | ${role.name}`)
    .setDescription(
      `**Role:** ${role} (\`${role.id}\`)\n` +
      `**Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:R>\n\n` +
      `${BULLET_EMOJI} **Color:** \`${colorDisplay}\`\n` +
      `${BULLET_EMOJI} **Position:** \`#${role.position}\` of ${totalRoles}\n` +
      `${BULLET_EMOJI} **Hoist (Separated):** ${role.hoist ? '`ENABLED`' : '`DISABLED`'}\n` +
      `${BULLET_EMOJI} **Mentionable:** ${role.mentionable ? '`ENABLED`' : '`DISABLED`'}\n` +
      `${BULLET_EMOJI} **Members Assigned:** \`${role.members.size}\`\n` +
      `${BULLET_EMOJI} **Active Permissions:** \`${permCount}\` flags (${keyPermsSummary})\n` +
      `${BULLET_EMOJI} **Hierarchy:** ${hierarchyText}`
    )
    .setFooter({ text: `${guild.name} • Athena Role Management Suite`, iconURL: guild.iconURL() || undefined });

  // Row 1: Quick Modals & Toggles
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rm_btn_name:${role.id}`)
      .setLabel('Rename')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canBotManage),
    new ButtonBuilder()
      .setCustomId(`rm_btn_color:${role.id}`)
      .setLabel('Set Hex')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canBotManage),
    new ButtonBuilder()
      .setCustomId(`rm_btn_pos:${role.id}`)
      .setLabel('Position')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canBotManage),
    new ButtonBuilder()
      .setCustomId(`rm_toggle_hoist:${role.id}`)
      .setLabel(`Hoist: ${role.hoist ? 'ON' : 'OFF'}`)
      .setStyle(role.hoist ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canBotManage),
    new ButtonBuilder()
      .setCustomId(`rm_toggle_mention:${role.id}`)
      .setLabel(`Mention: ${role.mentionable ? 'ON' : 'OFF'}`)
      .setStyle(role.mentionable ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canBotManage)
  );

  // Row 2: Preset Color Dropdown
  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId(`rm_sel_color:${role.id}`)
    .setPlaceholder('Quick Palette: Select Color Preset...')
    .setDisabled(!canBotManage)
    .addOptions(
      ROLE_COLOR_PRESETS.map(c => ({
        label: c.label,
        value: c.value,
        description: c.desc.slice(0, 100)
      }))
    );
  const row2 = new ActionRowBuilder().addComponents(colorSelect);

  // Row 3: Key Permissions Toggler Dropdown
  const permSelect = new StringSelectMenuBuilder()
    .setCustomId(`rm_sel_perm:${role.id}`)
    .setPlaceholder('Core Permissions: Toggle Permission...')
    .setDisabled(!canBotManage)
    .addOptions(
      CORE_ROLE_PERMISSIONS.slice(0, 25).map(p => {
        const has = role.permissions.has(PermissionFlagsBits[p.flag]);
        return {
          label: `${has ? '[GRANTED]' : '[DISABLED]'} ${p.label}`,
          value: `perm_${p.flag}`,
          description: `${has ? 'Currently active • Click to revoke' : 'Currently inactive • Click to grant'}`.slice(0, 100)
        };
      })
    );
  const row3 = new ActionRowBuilder().addComponents(permSelect);

  // Row 4: Secondary Actions
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rm_btn_clone:${role.id}`)
      .setLabel('Clone Role')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rm_btn_members:${role.id}`)
      .setLabel(`Members (${role.members.size})`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rm_btn_refresh:${role.id}`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rm_btn_delete:${role.id}`)
      .setLabel('Delete Role')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canBotManage),
    new ButtonBuilder()
      .setCustomId('rm_btn_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1567037365547962449')
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function handleRoleManagerInteraction(interaction) {
  const guild = interaction.guild;
  if (!guild) return;

  // Role Picker Menu
  if (interaction.isRoleSelectMenu() && interaction.customId === 'rm_picker') {
    if (!(await isAuthorized(interaction.user, guild))) {
      return interaction.reply({ content: `Access Denied | ${WRONG_EMOJI}\nYou lack authorization to manage roles.`, flags: MessageFlags.Ephemeral });
    }
    const roleId = interaction.values[0];
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });
    }
    return interaction.update(buildRoleManagerPanel(role, guild));
  }

  // Close Button
  if (interaction.isButton() && interaction.customId === 'rm_btn_close') {
    return interaction.message.delete().catch(() => null);
  }

  // Action Buttons
  if (interaction.isButton()) {
    const [action, roleId] = interaction.customId.split(':');
    if (!(await isAuthorized(interaction.user, guild))) {
      return interaction.reply({ content: `Access Denied | ${WRONG_EMOJI}\nYou lack authorization to manage roles.`, flags: MessageFlags.Ephemeral });
    }
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.reply({ content: `Role no longer exists | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'rm_btn_refresh') {
      const freshRole = await guild.roles.fetch(role.id).catch(() => null);
      if (!freshRole) return interaction.reply({ content: `Role no longer exists | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });
      return interaction.update(buildRoleManagerPanel(freshRole, guild));
    }

    if (action === 'rm_btn_members') {
      const memberList = role.members.map(m => `\`${m.user.tag}\``);
      const sample = memberList.slice(0, 40).join(', ');
      const more = memberList.length > 40 ? `\n...and ${memberList.length - 40} more members.` : '';
      return interaction.reply({
        content: `**Members with ${role.name} (${role.members.size}):**\n${sample || 'None assigned.'}${more}`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Check hierarchy for modifications
    const botHighest = guild.members.me?.roles.highest.position ?? 0;
    const userHighest = interaction.member?.roles.highest.position ?? 0;
    if (role.position >= botHighest) {
      return interaction.reply({ content: `Hierarchy Error | ${WRONG_EMOJI}\nMy highest role must be above ${role.name} to modify it.`, flags: MessageFlags.Ephemeral });
    }
    if (!isBotOwnerSync(interaction.user.id) && guild.ownerId !== interaction.user.id && role.position >= userHighest) {
      return interaction.reply({ content: `Hierarchy Error | ${WRONG_EMOJI}\nYour highest role must be above ${role.name} to modify it.`, flags: MessageFlags.Ephemeral });
    }
    if (role.managed) {
      return interaction.reply({ content: `Integration Error | ${WRONG_EMOJI}\nThis role is managed by an integration/bot and cannot be altered.`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'rm_btn_name') {
      const modal = new ModalBuilder()
        .setCustomId(`rm_modal_name:${role.id}`)
        .setTitle(`Rename Role: ${role.name.slice(0, 20)}`);
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_name')
          .setLabel('Role Name')
          .setStyle(TextInputStyle.Short)
          .setValue(role.name)
          .setRequired(true)
          .setMaxLength(100)
      ));
      return interaction.showModal(modal);
    }

    if (action === 'rm_btn_color') {
      const modal = new ModalBuilder()
        .setCustomId(`rm_modal_color:${role.id}`)
        .setTitle(`Set Hex Color: ${role.name.slice(0, 20)}`);
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_color')
          .setLabel('Hex Code (#RRGGBB) or "default"')
          .setStyle(TextInputStyle.Short)
          .setValue(role.hexColor === '#000000' ? '' : role.hexColor)
          .setPlaceholder('#5865F2')
          .setRequired(true)
          .setMaxLength(9)
      ));
      return interaction.showModal(modal);
    }

    if (action === 'rm_btn_pos') {
      const modal = new ModalBuilder()
        .setCustomId(`rm_modal_pos:${role.id}`)
        .setTitle(`Set Position: ${role.name.slice(0, 20)}`);
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_pos')
          .setLabel(`New Position (1 to ${guild.roles.cache.size - 1})`)
          .setStyle(TextInputStyle.Short)
          .setValue(String(role.position))
          .setRequired(true)
          .setMaxLength(4)
      ));
      return interaction.showModal(modal);
    }

    if (action === 'rm_toggle_hoist') {
      try {
        await role.setHoist(!role.hoist, `Hoist toggled by ${interaction.user.tag}`);
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to update hoist: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (action === 'rm_toggle_mention') {
      try {
        await role.setMentionable(!role.mentionable, `Mentionable toggled by ${interaction.user.tag}`);
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to update mentionable: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (action === 'rm_btn_clone') {
      try {
        const cloned = await guild.roles.create({
          name: `${role.name} (Copy)`,
          color: role.color,
          permissions: role.permissions,
          hoist: role.hoist,
          mentionable: role.mentionable,
          reason: `Cloned from ${role.name} by ${interaction.user.tag}`
        });
        return interaction.reply({
          content: `Role Cloned | ${TICK_EMOJI}\nSuccessfully cloned role into ${cloned} (\`${cloned.id}\`).`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        return interaction.reply({ content: `Failed to clone role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (action === 'rm_btn_delete') {
      if (role.id === guild.id) {
        return interaction.reply({ content: `Cannot delete @everyone role | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });
      }
      try {
        const roleName = role.name;
        const roleIdDeleted = role.id;
        await role.delete(`Role deleted via Role Manager by ${interaction.user.tag}`);
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle(`Role Deleted | ${TICK_EMOJI}`)
              .setDescription(`Role **${roleName}** (\`${roleIdDeleted}\`) was successfully removed from the server.`)
          ],
          components: []
        });
      } catch (err) {
        return interaction.reply({ content: `Failed to delete role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // Select Menus
  if (interaction.isStringSelectMenu()) {
    if (!(await isAuthorized(interaction.user, guild))) {
      return interaction.reply({ content: `Access Denied | ${WRONG_EMOJI}\nYou lack authorization to manage roles.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('rm_sel_color:')) {
      const roleId = interaction.customId.replace('rm_sel_color:', '');
      const role = guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });

      const val = interaction.values[0];
      const hex = val === 'color_default' ? 0 : val.replace('color_', '');
      try {
        await role.setColor(hex, `Color updated by ${interaction.user.tag}`);
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to set color: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.customId.startsWith('rm_sel_perm:')) {
      const roleId = interaction.customId.replace('rm_sel_perm:', '');
      const role = guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });

      const permKey = interaction.values[0].replace('perm_', '');
      const flagBit = PermissionFlagsBits[permKey];
      if (!flagBit) return interaction.reply({ content: `Invalid permission flag.`, flags: MessageFlags.Ephemeral });

      try {
        const has = role.permissions.has(flagBit);
        const updated = has ? role.permissions.remove(flagBit) : role.permissions.add(flagBit);
        await role.setPermissions(updated, `Permission ${permKey} toggled by ${interaction.user.tag}`);
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to toggle permission: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  // Modal Submissions
  if (interaction.isModalSubmit()) {
    if (!(await isAuthorized(interaction.user, guild))) {
      return interaction.reply({ content: `Access Denied | ${WRONG_EMOJI}\nYou lack authorization to manage roles.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('rm_modal_name:')) {
      const roleId = interaction.customId.replace('rm_modal_name:', '');
      const role = guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });

      const newName = interaction.fields.getTextInputValue('new_name').trim();
      try {
        await role.setName(newName, `Renamed by ${interaction.user.tag}`);
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to rename role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.customId.startsWith('rm_modal_color:')) {
      const roleId = interaction.customId.replace('rm_modal_color:', '');
      const role = guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });

      let input = interaction.fields.getTextInputValue('new_color').trim().toLowerCase();
      try {
        if (input === 'default' || input === '0' || input === 'none' || input === 'reset') {
          await role.setColor(0, `Color reset by ${interaction.user.tag}`);
        } else {
          if (!input.startsWith('#')) input = '#' + input;
          if (!/^#[0-9a-f]{6}$/i.test(input)) {
            return interaction.reply({ content: `Invalid Hex | ${WRONG_EMOJI}\nHex code must be in format #RRGGBB (e.g. #FF5500) or 'default'.`, flags: MessageFlags.Ephemeral });
          }
          await role.setColor(input, `Color set to ${input} by ${interaction.user.tag}`);
        }
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to update color: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.customId.startsWith('rm_modal_pos:')) {
      const roleId = interaction.customId.replace('rm_modal_pos:', '');
      const role = guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: `Role not found | ${WRONG_EMOJI}`, flags: MessageFlags.Ephemeral });

      const pos = parseInt(interaction.fields.getTextInputValue('new_pos').trim(), 10);
      if (isNaN(pos) || pos < 1 || pos >= guild.roles.cache.size) {
        return interaction.reply({ content: `Invalid Position | ${WRONG_EMOJI}\nMust be a number between 1 and ${guild.roles.cache.size - 1}.`, flags: MessageFlags.Ephemeral });
      }

      const botHighest = guild.members.me?.roles.highest.position ?? 0;
      if (pos >= botHighest) {
        return interaction.reply({ content: `Hierarchy Error | ${WRONG_EMOJI}\nCannot move role above or equal to Athena's highest role (#${botHighest}).`, flags: MessageFlags.Ephemeral });
      }

      try {
        await role.setPosition(pos, { reason: `Position changed to ${pos} by ${interaction.user.tag}` });
        return interaction.update(buildRoleManagerPanel(role, guild));
      } catch (err) {
        return interaction.reply({ content: `Failed to move role: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }
  }
}

async function handleMassRole(context, role, action) {
  const guild = context.guild;
  const executor = context.author || context.user;
  
  const highestBotRole = guild.members.me.roles.highest.position;
  const highestUserRole = context.member?.roles.highest.position;

  if (role.position >= highestBotRole) {
    const reply = cv2.danger('Hierarchy Error', 'My highest role must be above the role you are trying to manage.');
    return context.reply ? await context.reply(reply) : await context.editReply(reply);
  }
  
  if (!isBotOwnerSync(executor.id) && guild.ownerId !== executor.id && role.position >= highestUserRole) {
    const reply = cv2.danger('Hierarchy Error', 'Your highest role must be above the role you are trying to manage.');
    return context.reply ? await context.reply(reply) : await context.editReply(reply);
  }

  const isSlash = !!context.commandName;
  
  
  const actionName = action === 'add' ? 'Add' : action === 'remove' ? 'Remove' : action === 'strip' ? 'Strip' : 'Restore';
  
  const initialReply = cv2.success(`Mass ${actionName} Started`, `Processing \`${role.name}\`...`);
  let statusMessage;
  if (isSlash) {
    statusMessage = await context.reply({ ...initialReply, withResponse: true });
    
  } else {
    statusMessage = await context.reply(initialReply);
  }

  try {
    const members = await guild.members.fetch();
    let successCount = 0;
    let failCount = 0;
    
    let targets;
    if (action === 'add') {
      targets = members.filter(m => !m.roles.cache.has(role.id));
    } else if (action === 'remove') {
      targets = members.filter(m => m.roles.cache.has(role.id));
    } else if (action === 'strip') {
      targets = members.filter(m => m.roles.cache.has(role.id));
      const targetIds = Array.from(targets.keys());
      db.saveMassRole(guild.id, role.id, targetIds);
    } else if (action === 'restore') {
      const savedIds = db.getMassRole(guild.id, role.id) || [];
      if (savedIds.length === 0) {
        return statusMessage.edit(cv2.warn('No Backup', `No backup found for \`${role.name}\`. Nothing to restore.`)).catch(() => null);
      }
      targets = members.filter(m => savedIds.includes(m.id) && !m.roles.cache.has(role.id));
    }
    
    if (targets.size === 0) {
      const finishEmbed = cv2.success(`Mass ${actionName} Completed`, `Nobody needed the role changed!`);
      return statusMessage.edit(finishEmbed).catch(() => null);
    }
    
    const targetArray = Array.from(targets.values());
    
    for (let i = 0; i < targetArray.length; i += 50) {
      const chunk = targetArray.slice(i, i + 50);
      await Promise.allSettled(chunk.map(async m => {
        try {
          if (action === 'add' || action === 'restore') await m.roles.add(role);
          else await m.roles.remove(role);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }));
    }
    
    const finishEmbed = cv2.success(
      `Mass ${actionName} Completed`, 
      `Successfully processed ${action === 'add' || action === 'restore' ? 'addition' : 'removal'} for **${successCount}** members.\nFailed: **${failCount}**`
    );
    await statusMessage.edit(finishEmbed).catch(() => null);
  } catch (err) {
    console.error(err);
    const errEmbed = cv2.danger('Execution Error', 'Something went wrong during mass role assignment.');
    await statusMessage.edit(errEmbed).catch(() => null);
  }
}



// ==========================================
// CREATEROLE INTERACTIVE PANEL
// ==========================================

const ALL_PERMISSIONS = [
  ['Administrator', 'Administrator'],
  ['ManageGuild', 'Manage Server'],
  ['ManageRoles', 'Manage Roles'],
  ['ManageChannels', 'Manage Channels'],
  ['KickMembers', 'Kick Members'],
  ['BanMembers', 'Ban Members'],
  ['MuteMembers', 'Mute Members'],
  ['DeafenMembers', 'Deafen Members'],
  ['MoveMembers', 'Move Members'],
  ['ManageMessages', 'Manage Messages'],
  ['ManageNicknames', 'Manage Nicknames'],
  ['ManageWebhooks', 'Manage Webhooks'],
  ['ManageEmojisAndStickers', 'Manage Emojis'],
  ['ViewAuditLog', 'View Audit Log'],
  ['MentionEveryone', 'Mention Everyone'],
  ['SendMessages', 'Send Messages'],
  ['ReadMessageHistory', 'Read History'],
  ['EmbedLinks', 'Embed Links'],
  ['AttachFiles', 'Attach Files'],
  ['UseExternalEmojis', 'External Emojis'],
  ['AddReactions', 'Add Reactions'],
  ['Connect', 'Connect VC'],
  ['Speak', 'Speak VC'],
  ['Stream', 'Stream'],
  ['SetVoiceChannelStatus', 'Set VC Status'],
  ['UseApplicationCommands', 'Use Slash Cmds'],
];

const PERM_PAGE_SIZE = 15;
export const createRoleStates = new Map();

export function buildCreateRolePanel(state) {
  const { name, color, perms, page, position } = state;
  const totalPages = Math.ceil(ALL_PERMISSIONS.length / PERM_PAGE_SIZE);
  const start = page * PERM_PAGE_SIZE;
  const pagePerms = ALL_PERMISSIONS.slice(start, start + PERM_PAGE_SIZE);

  const permLines = pagePerms.map(([key, label]) =>
    `${perms.includes(key) ? '<:on:1533844867191406672>' : '<:off:1533844858983157851>'} **${label}**`
  ).join('\n');

  const makeButtons = (slice) => slice.map(([key, label]) => ({
    type: 2, style: perms.includes(key) ? 3 : 2,
    custom_id: `cr_perm_${key}`, label: label.substring(0, 25)
  }));

  const rows = [];
  for (let i = 0; i < pagePerms.length; i += 5) {
    rows.push({ type: 1, components: makeButtons(pagePerms.slice(i, i + 5)) });
  }

  const container = {
    type: 17,
    components: [
      { type: 10, content: `## Create Role — Builder\n**Name:** ${name || '_Not set_'} | **Color:** ${color || '_None_'} | **Position:** ${position != null ? `#${position}` : '_Bottom_'}` },
      { type: 14, divider: true },
      { type: 10, content: `### Permissions — Page ${page + 1}/${totalPages}\n${permLines}` },
      { type: 14, divider: true },
      ...rows,
      { type: 14, divider: true },
      { type: 1, components: [
        { type: 2, style: 1, custom_id: 'cr_setname', label: 'Set Name' },
        { type: 2, style: 1, custom_id: 'cr_setcolor', label: 'Set Color' },
        { type: 2, style: 1, custom_id: 'cr_setposition', label: 'Set Position' },
        { type: 2, style: 2, custom_id: 'cr_prev', label: '← Prev' },
        { type: 2, style: 2, custom_id: 'cr_next', label: 'Next →' },
      ]},
      { type: 1, components: [
        { type: 2, style: 4, custom_id: 'cr_alloff', label: 'Clear All Perms' },
        { type: 2, style: 3, custom_id: 'cr_allon', label: 'Grant All Perms' },
        { type: 2, style: 3, custom_id: 'cr_confirm', label: 'Create Role' },
      ]},
      { type: 10, content: `-# Athena Bulletproof Security System · V1.0.0` }
    ]
  };
  return { components: [container], flags: 32768 };
}

export const commands = [
  {
    name: 'addrole',
    aliases: ['roleadd', 'giverole'],
    description: 'Adds one or more roles to a user.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      { name: 'user', description: 'The user to add roles to', type: 6, required: true },
      { name: 'role1', description: 'First role to add', type: 8, required: true },
      { name: 'role2', description: 'Second role to add', type: 8, required: false },
      { name: 'role3', description: 'Third role to add', type: 8, required: false },
      { name: 'role4', description: 'Fourth role to add', type: 8, required: false },
      { name: 'role5', description: 'Fifth role to add', type: 8, required: false }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      const roles = message.mentions.roles;
      
      if (!target || roles.size === 0) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!addrole <@user> <@role1> [@role2...]`'));
      }
      
      const addedRoles = [];
      const failedRoles = [];
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;

      for (const [id, role] of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        
        try {
          await target.roles.add(role);
          addedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = addedRoles.length === 1 ? 'Role Added' : 'Roles Added';
      let replyDesc = '';
      if (addedRoles.length > 0) {
        db.removeExploitTaint(message.guild.id, target.id);
        const qRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'quarantined');
        if (qRole && target.roles.cache.has(qRole.id)) {
          await target.roles.remove(qRole, 'Quarantine role cleared via authorized role grant').catch(() => null);
          db.removeQuarantine(message.guild.id, target.id);
        }
        replyDesc += `${BULLET_EMOJI} ${message.author} has given **${addedRoles.join(', ')}** to ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await message.reply(cv2.success(replyTitle, replyDesc.trim()));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission to use this command.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const roles = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) roles.push(role);
      }
      
      const addedRoles = [];
      const failedRoles = [];
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;

      for (const role of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        try {
          await target.roles.add(role);
          addedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = addedRoles.length === 1 ? 'Role Added' : 'Roles Added';
      let replyDesc = '';
      if (addedRoles.length > 0) {
        db.removeExploitTaint(interaction.guild.id, target.id);
        const qRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'quarantined');
        if (qRole && target.roles.cache.has(qRole.id)) {
          await target.roles.remove(qRole, 'Quarantine role cleared via authorized role grant').catch(() => null);
          db.removeQuarantine(interaction.guild.id, target.id);
        }
        replyDesc += `${BULLET_EMOJI} ${interaction.user} has given **${addedRoles.join(', ')}** to ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await interaction.reply(cv2.success(replyTitle, replyDesc.trim()));
    }
  },
  {
    name: 'removerole',
    aliases: ['roledel', 'takerole'],
    description: 'Removes one or more roles from a user.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      { name: 'user', description: 'The user to remove roles from', type: 6, required: true },
      { name: 'role1', description: 'First role to remove', type: 8, required: true },
      { name: 'role2', description: 'Second role to remove', type: 8, required: false },
      { name: 'role3', description: 'Third role to remove', type: 8, required: false },
      { name: 'role4', description: 'Fourth role to remove', type: 8, required: false },
      { name: 'role5', description: 'Fifth role to remove', type: 8, required: false }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      const roles = message.mentions.roles;
      
      if (!target || roles.size === 0) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!removerole <@user> <@role1> [@role2...]`'));
      }
      
      const removedRoles = [];
      const failedRoles = [];
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;

      for (const [id, role] of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        
        try {
          await target.roles.remove(role);
          removedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = removedRoles.length === 1 ? 'Role Removed' : 'Roles Removed';
      let replyDesc = '';
      if (removedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${message.author} has removed **${removedRoles.join(', ')}** from ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await message.reply(cv2.success(replyTitle, replyDesc.trim()));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const roles = [];
      for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) roles.push(role);
      }
      
      const removedRoles = [];
      const failedRoles = [];
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;

      for (const role of roles) {
        if (role.position >= highestBotRole) {
          failedRoles.push(`${role.name} (Bot hierarchy too low)`);
          continue;
        }
        if (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole) {
          failedRoles.push(`${role.name} (Your hierarchy too low)`);
          continue;
        }
        try {
          await target.roles.remove(role);
          removedRoles.push(role.name);
        } catch (err) {
          failedRoles.push(`${role.name} (Error)`);
        }
      }
      
      let replyTitle = removedRoles.length === 1 ? 'Role Removed' : 'Roles Removed';
      let replyDesc = '';
      if (removedRoles.length > 0) {
        replyDesc += `${BULLET_EMOJI} ${interaction.user} has removed **${removedRoles.join(', ')}** from ${target}\n`;
      }
      if (failedRoles.length > 0) {
        replyDesc += `**Failed:** ${failedRoles.join(', ')}\n`;
      }
      
      await interaction.reply(cv2.success(replyTitle, replyDesc.trim()));
    }
  },
  {
    name: 'striproles',
    aliases: ['strip', 'wipeuserroles'],
    description: 'Removes ALL roles from a user (except @everyone and managed roles).',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const target = message.mentions.members.first();
      if (!target) {
        return message.reply(cv2.warn('Command Error', 'Usage: `!striproles <@user>`'));
      }
      
      const highestBotRole = message.guild.members.me.roles.highest.position;
      const highestUserRole = message.member.roles.highest.position;
      
      let count = 0;
      let failedCount = 0;

      const rolesToRemove = target.roles.cache.filter(role => 
        role.id !== message.guild.id && !role.managed
      );

      for (const [id, role] of rolesToRemove) {
        if (role.position >= highestBotRole || (!isBotOwnerSync(message.author.id) && message.guild.ownerId !== message.author.id && role.position >= highestUserRole)) {
          failedCount++;
          continue;
        }
        try {
          await target.roles.remove(role);
          count++;
        } catch (e) {
          failedCount++;
        }
      }
      
      await message.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles (hierarchy/permissions).`));
      await message.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles (hierarchy/permissions).`));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      
      const targetUser = interaction.options.getUser('user');
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      if (!target) {
        return interaction.reply(cv2.warn('Command Error', 'User not found.'));
      }
      
      const highestBotRole = interaction.guild.members.me.roles.highest.position;
      const highestUserRole = interaction.member.roles.highest.position;
      
      let count = 0;
      let failedCount = 0;

      const rolesToRemove = target.roles.cache.filter(role => 
        role.id !== interaction.guild.id && !role.managed
      );

      for (const [id, role] of rolesToRemove) {
        if (role.position >= highestBotRole || (!isBotOwnerSync(interaction.user.id) && interaction.guild.ownerId !== interaction.user.id && role.position >= highestUserRole)) {
          failedCount++;
          continue;
        }
        try {
          await target.roles.remove(role);
          count++;
        } catch (e) {
          failedCount++;
        }
      }
      
      await interaction.reply(cv2.success('Roles Stripped', `Successfully stripped **${count}** roles from ${target}. Failed to remove **${failedCount}** roles.`));
    }
  },
  {
    name: 'massaddrole',
    aliases: ['mar', 'massroleadd'],
    slashHidden: true,
    description: 'Adds a role to all members in the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to add to everyone', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massaddrole <@role>`'));
      
      await handleMassRole(message, role, 'add');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'add');
    }
  },
  {
    name: 'massremoverole',
    aliases: ['mrr', 'massroleremove'],
    slashHidden: true,
    description: 'Removes a role from all members in the server.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to remove from everyone', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massremoverole <@role>`'));
      
      await handleMassRole(message, role, 'remove');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'remove');
    }
  },
  {
    name: 'massstrip',
    aliases: ['ms', 'stripall'],
    slashHidden: true,
    description: 'Removes a role from all members and saves the list to restore later.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to strip', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massstrip <@role>`'));
      await handleMassRole(message, role, 'strip');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'strip');
    }
  },
  {
    name: 'massrestore',
    aliases: ['mrestore', 'restoreroles'],
    slashHidden: true,
    description: 'Restores a role to members who had it stripped via massstrip.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.Administrator],
    options: [
      { name: 'role', description: 'The role to restore', type: 8, required: true }
    ],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply(cv2.warn('Command Error', 'Usage: `!massrestore <@role>`'));
      await handleMassRole(message, role, 'restore');
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      await handleMassRole(interaction, role, 'restore');
    }
  },

  {
    name: 'createrole',
    aliases: ['cr', 'newrole', 'rolecreate', 'makerole'],
    slashHidden: true,
    description: 'Create a role with custom permissions, color, and position interactively.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    async executePrefix(message) {
      if (!(await isAuthorized(message.author, message.guild))) return;
      const state = { name: '', color: null, perms: [], page: 0, position: null, guildId: message.guild.id };
      createRoleStates.set(message.author.id, state);
      const panel = buildCreateRolePanel(state);
      await message.reply(panel);
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const state = { name: '', color: null, perms: [], page: 0, position: null, guildId: interaction.guild.id };
      createRoleStates.set(interaction.user.id, state);
      const panel = buildCreateRolePanel(state);
      await interaction.reply(panel);
    }
  },
  {
    name: 'editrole',
    aliases: ['er', 'roleedit', 'roledit', 'editr', 'rolemanage', 'rmanage', 'rolemanager', 'rolecolor', 'rcolor', 'rolename', 'rname'],
    slashHidden: false,
    description: 'Interactive Role Manager: configure colors, permissions, hoist, name, position & more.',
    category: 'moderation',
    permissions: [PermissionFlagsBits.ManageRoles],
    options: [
      { name: 'role', description: 'The role to manage or configure', type: 8, required: false }
    ],
    async executePrefix(message, args) {
      if (!(await isAuthorized(message.author, message.guild))) return;

      const roleIdOrMention = args[0]?.replace(/<@&|>/g, '');
      if (!roleIdOrMention) {
        return message.reply(buildRolePickerPanel(message.guild));
      }

      const role = message.guild.roles.cache.get(roleIdOrMention) || message.mentions.roles.first();
      if (!role) return message.reply(cv2.danger('Not Found', 'Could not find that role in this server.'));

      if (!args[1]) {
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      const property = args[1]?.toLowerCase();
      const value = args.slice(2).join(' ');

      // Backwards compat: !rolecolor @role #hex
      const isLegacyColorCall = !property || property.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(property);
      if (isLegacyColorCall) {
        const hex = args[1];
        if (!hex) return message.reply(cv2.warn('Usage', '`!rolecolor <@role|id> <#hex>`'));
        const hexClean = hex.startsWith('#') ? hex : '#' + hex;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hexClean)) return message.reply(cv2.warn('Invalid Color', 'Use a valid hex. Example: `#FF5733`'));
        await role.setColor(hexClean, `Color changed by ${message.author.tag}`).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      if (property === 'color' || property === 'colour') {
        const hexClean = value.startsWith('#') ? value : '#' + value;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hexClean)) return message.reply(cv2.warn('Invalid Color', 'Use a valid hex. Example: `#FF5733`'));
        await role.setColor(hexClean, `Color changed by ${message.author.tag}`).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      if (property === 'name') {
        if (!value) return message.reply(cv2.warn('Usage', '`!editrole <@role|id> name <new name>`'));
        await role.setName(value, `Name changed by ${message.author.tag}`).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      if (property === 'hoist') {
        const on = value === 'on' || value === 'true' || value === '1';
        await role.setHoist(on, `Hoist changed by ${message.author.tag}`).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      if (property === 'mentionable') {
        const on = value === 'on' || value === 'true' || value === '1';
        await role.setMentionable(on, `Mentionable changed by ${message.author.tag}`).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      if (property === 'position' || property === 'pos') {
        const pos = parseInt(value);
        if (isNaN(pos) || pos < 1) return message.reply(cv2.warn('Invalid Position', 'Provide a number >= 1.'));
        await role.setPosition(pos, { reason: `Position changed by ${message.author.tag}` }).catch(() => null);
        return message.reply(buildRoleManagerPanel(role, message.guild));
      }

      return message.reply(cv2.warn('Unknown Property', 'Valid properties: `color`, `name`, `hoist`, `mentionable`, `position`'));
    },
    async executeSlash(interaction) {
      if (!(await isAuthorized(interaction.user, interaction.guild))) {
        return interaction.reply(cv2.danger('Unauthorized', 'You do not have permission.'));
      }
      const role = interaction.options.getRole('role');
      if (role) {
        return interaction.reply(buildRoleManagerPanel(role, interaction.guild));
      }
      return interaction.reply(buildRolePickerPanel(interaction.guild));
    }
  }

];