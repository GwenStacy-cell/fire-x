import { 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags,
  AuditLogEvent 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

// Map audit log action numbers to readable names
const AUDIT_ACTION_MAP = {
  [AuditLogEvent.GuildUpdate]: 'Guild Updated',
  [AuditLogEvent.ChannelCreate]: 'Channel Created',
  [AuditLogEvent.ChannelUpdate]: 'Channel Updated',
  [AuditLogEvent.ChannelDelete]: 'Channel Deleted',
  [AuditLogEvent.ChannelOverwriteCreate]: 'Channel Permission Created',
  [AuditLogEvent.ChannelOverwriteUpdate]: 'Channel Permission Updated',
  [AuditLogEvent.ChannelOverwriteDelete]: 'Channel Permission Deleted',
  [AuditLogEvent.MemberKick]: 'Member Kicked',
  [AuditLogEvent.MemberPrune]: 'Members Pruned',
  [AuditLogEvent.MemberBanAdd]: 'Member Banned',
  [AuditLogEvent.MemberBanRemove]: 'Member Unbanned',
  [AuditLogEvent.MemberUpdate]: 'Member Updated',
  [AuditLogEvent.MemberRoleUpdate]: 'Member Roles Changed',
  [AuditLogEvent.RoleCreate]: 'Role Created',
  [AuditLogEvent.RoleUpdate]: 'Role Updated',
  [AuditLogEvent.RoleDelete]: 'Role Deleted',
  [AuditLogEvent.InviteCreate]: 'Invite Created',
  [AuditLogEvent.InviteDelete]: 'Invite Deleted',
  [AuditLogEvent.WebhookCreate]: 'Webhook Created',
  [AuditLogEvent.WebhookUpdate]: 'Webhook Updated',
  [AuditLogEvent.WebhookDelete]: 'Webhook Deleted',
  [AuditLogEvent.EmojiCreate]: 'Emoji Created',
  [AuditLogEvent.EmojiUpdate]: 'Emoji Updated',
  [AuditLogEvent.EmojiDelete]: 'Emoji Deleted',
  [AuditLogEvent.MessageDelete]: 'Message Deleted',
  [AuditLogEvent.MessageBulkDelete]: 'Messages Bulk Deleted',
  [AuditLogEvent.MessagePin]: 'Message Pinned',
  [AuditLogEvent.MessageUnpin]: 'Message Unpinned'
};

export const commands = [
  // --- CONTAINER & EMBED STUDIO ---
  {
    name: 'studio',
    aliases: ['embedstudio', 'containerstudio'],
    description: 'Interactive container, embed & announcement builder studio with template saving',
    category: 'admin',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'action',
        description: 'Studio action: create, list, send, or delete',
        type: 3,
        required: true,
        choices: [
          { name: 'Create / Design Container', value: 'create' },
          { name: 'List Saved Templates', value: 'list' },
          { name: 'Send Template to Channel', value: 'send' },
          { name: 'Delete Saved Template', value: 'delete' }
        ]
      },
      {
        name: 'template_id',
        description: 'Template identifier (for send/delete actions)',
        type: 3,
        required: false
      },
      {
        name: 'channel',
        description: 'Destination channel to dispatch container to',
        type: 7,
        required: false
      }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'This command is strictly restricted to Extra Owners (or Server Owner).'));
      }
      const action = args[0]?.toLowerCase() || 'create';

      if (action === 'list') {
        return listTemplates(message, message.guild.id);
      }

      if (action === 'delete') {
        const id = args[1]?.toLowerCase();
        if (!id) return message.reply(cv2.warn('Missing Template ID', 'Usage: `!studio delete <template_id>`'));
        const ok = db.deleteStudioTemplate(message.guild.id, id);
        if (ok) {
          return message.reply(cv2.success('Template Deleted', `Studio template \`${id}\` was permanently removed.`));
        } else {
          return message.reply(cv2.warn('Not Found', `No template found with ID \`${id}\`.`));
        }
      }

      if (action === 'send') {
        const id = args[1]?.toLowerCase();
        const targetChannel = message.mentions.channels.first() || message.channel;
        if (!id) return message.reply(cv2.warn('Missing Template ID', 'Usage: `!studio send <template_id> [#channel]`'));
        return dispatchTemplate(message, message.guild.id, id, targetChannel);
      }

      // Default: create interactive modal
      const modal = createStudioModal(`studio_create_${Date.now()}`);
      // Prefix commands cannot trigger Discord modals directly unless through a button
      const openBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('studio_open_builder')
          .setLabel('Launch Container Builder')
          .setStyle(ButtonStyle.Primary)
      );
      return message.reply({
        ...cv2.info('Container & Announcement Studio', 'Click below to open the interactive Container Studio editor.'),
        components: [cv2.info('Container & Announcement Studio', 'Click below to open the interactive Container Studio editor.').components[0], openBtn]
      });
    },

    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.danger('Access Denied', 'This command is strictly restricted to Extra Owners (or Server Owner).'), flags: MessageFlags.Ephemeral });
      }
      const action = interaction.options.getString('action');
      const guildId = interaction.guild.id;

      if (action === 'list') {
        return listTemplates(interaction, guildId);
      }

      if (action === 'delete') {
        const id = interaction.options.getString('template_id');
        if (!id) return interaction.reply(cv2.e.warn('Missing ID', 'Please specify the `template_id` to delete.'));
        const ok = db.deleteStudioTemplate(guildId, id);
        if (ok) {
          return interaction.reply(cv2.success('Template Deleted', `Studio template \`${id}\` was permanently removed.`));
        }
        return interaction.reply(cv2.e.warn('Not Found', `Template \`${id}\` does not exist.`));
      }

      if (action === 'send') {
        const id = interaction.options.getString('template_id');
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        if (!id) return interaction.reply(cv2.e.warn('Missing ID', 'Please specify the `template_id` to send.'));
        return dispatchTemplate(interaction, guildId, id, ch);
      }

      if (action === 'create') {
        const modal = createStudioModal(`studio_modal_${Date.now()}`);
        return interaction.showModal(modal);
      }
    }
  },

  // --- FORENSIC AUDIT LOGS SEARCH ---
  {
    name: 'auditlogs',
    aliases: ['audit', 'forensics', 'auditsearch'],
    description: 'Forensic audit log search with member filtering, action classifier, and live timestamps',
    category: 'admin',
    permissions: [PermissionFlagsBits.ViewAuditLog],
    options: [
      {
        name: 'user',
        description: 'Filter logs by moderator / executor or target member',
        type: 6,
        required: false
      },
      {
        name: 'limit',
        description: 'Number of audit events to inspect (1-25, default 10)',
        type: 4,
        required: false
      }
    ],
    async executePrefix(message, args) {
      if (!message.member.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        return message.reply(cv2.danger('Access Denied', 'View Audit Log permission required to run forensic audit searches.'));
      }
      const targetUser = message.mentions.users.first();
      let limit = 10;
      const numArg = parseInt(args.find(a => /^\d+$/.test(a)));
      if (!isNaN(numArg) && numArg > 0) limit = Math.min(25, numArg);

      return searchAuditLogs(message, message.guild, targetUser, limit);
    },
    async executeSlash(interaction) {
      await interaction.deferReply();
      const targetUser = interaction.options.getUser('user');
      const limit = Math.min(25, Math.max(1, interaction.options.getInteger('limit') || 10));

      return searchAuditLogs(interaction, interaction.guild, targetUser, limit);
    }
  }
];

// Helper to construct the Studio editor modal
function createStudioModal(customId) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Container & Embed Studio');

  const titleInput = new TextInputBuilder()
    .setCustomId('studio_title')
    .setLabel('Container Heading / Title')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. Official Server Announcement')
    .setRequired(true)
    .setMaxLength(100);

  const descInput = new TextInputBuilder()
    .setCustomId('studio_description')
    .setLabel('Body Description (Markdown supported)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter your formatted message body here...')
    .setRequired(true)
    .setMaxLength(3000);

  const templateIdInput = new TextInputBuilder()
    .setCustomId('studio_template_id')
    .setLabel('Save as Template ID (lowercase, no spaces)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. rules_update or welcome_event')
    .setRequired(false)
    .setMaxLength(32);

  const footerInput = new TextInputBuilder()
    .setCustomId('studio_footer')
    .setLabel('Custom Footer Note')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. Athena Bulletproof Defense')
    .setRequired(false)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(templateIdInput),
    new ActionRowBuilder().addComponents(footerInput)
  );

  return modal;
}

// Helper to list saved templates
async function listTemplates(ctx, guildId) {
  const templates = db.getStudioTemplates(guildId);
  const entries = Object.entries(templates);

  if (entries.length === 0) {
    const empty = cv2.info(
      'Studio Template Catalog',
      'No saved templates found for this server.\n-# Use `/studio action: create` to design and store reusable container layouts.'
    );
    return ctx.reply ? ctx.reply(empty) : ctx.send(empty);
  }

  const lines = entries.map(([id, t]) => {
    const updatedSec = t.updatedAt ? Math.floor(t.updatedAt / 1000) : 0;
    return `> \u2022 **\`${id}\`** — **${t.title}** ${updatedSec ? `(<t:${updatedSec}:R>)` : ''}\n-#   Description: ${t.description.slice(0, 80).replace(/\n/g, ' ')}...`;
  });

  const container = cv2.info(
    'Studio Template Catalog',
    `**${entries.length}** container templates saved on disk:\n\n` +
    lines.join('\n\n') +
    `\n\n-# Dispatch any template to a channel: \`/studio action: send template_id: <id> channel: <#channel>\``
  );

  return ctx.reply ? ctx.reply(container) : ctx.send(container);
}

// Helper to dispatch a template
async function dispatchTemplate(ctx, guildId, templateId, channel) {
  const templates = db.getStudioTemplates(guildId);
  const t = templates[templateId];

  if (!t) {
    const errorMsg = cv2.warn('Template Not Found', `No studio template with ID \`${templateId}\` exists.`);
    return ctx.reply ? ctx.reply(errorMsg) : ctx.send(errorMsg);
  }

  if (!channel || !channel.isTextBased()) {
    const errorMsg = cv2.warn('Invalid Channel', 'Please specify a valid text channel.');
    return ctx.reply ? ctx.reply(errorMsg) : ctx.send(errorMsg);
  }

  const payload = cv2.make(t.title, t.description, [], false, t.footer || 'Studio Announcement');
  await channel.send(payload);

  const confirmMsg = cv2.success(
    'Container Dispatched',
    `Template \`${templateId}\` was posted to <#${channel.id}> successfully.`
  );
  return ctx.reply ? ctx.reply(confirmMsg) : ctx.send(confirmMsg);
}

// Helper to search and format audit logs
async function searchAuditLogs(ctx, guild, targetUser, limit = 10) {
  try {
    const fetchOptions = { limit };
    if (targetUser) fetchOptions.user = targetUser.id;

    const audit = await guild.fetchAuditLogs(fetchOptions);
    const entries = Array.from(audit.entries.values());

    if (entries.length === 0) {
      const empty = cv2.info('Forensic Audit Search', 'No matching audit log events found.');
      return ctx.editReply ? ctx.editReply(empty) : ctx.reply(empty);
    }

    const formattedLines = entries.map(entry => {
      const actionName = AUDIT_ACTION_MAP[entry.action] || `Action ${entry.action}`;
      const timeSec = Math.floor(entry.createdTimestamp / 1000);
      const executor = entry.executor ? `**${entry.executor.tag}**` : 'System';
      let targetDesc = '';
      if (entry.target) {
        if (entry.target.tag) targetDesc = ` on **${entry.target.tag}**`;
        else if (entry.target.name) targetDesc = ` on **#${entry.target.name}**`;
        else if (entry.target.id) targetDesc = ` on target \`${entry.target.id}\``;
      }

      const reason = entry.reason ? `\n-#   *Reason:* \`${entry.reason}\`` : '';
      return `> \u2022 **${actionName}** by ${executor}${targetDesc} — <t:${timeSec}:R>${reason}`;
    });

    const desc = 
      `Forensic audit log trail for **${guild.name}** (displaying latest \`${entries.length}\` events):\n\n` +
      formattedLines.join('\n\n') +
      `\n\n-# All audit entries cross-referenced directly from Discord Gateway API.`;

    const container = cv2.info('Forensic Audit Trail', desc);
    return ctx.editReply ? ctx.editReply(container) : ctx.reply(container);
  } catch (err) {
    console.error('[AuditLogs]', err);
    const fail = cv2.danger('Audit Log Error', `Failed to retrieve server audit logs: \`${err.message}\``);
    return ctx.editReply ? ctx.editReply(fail) : ctx.reply(fail);
  }
}
