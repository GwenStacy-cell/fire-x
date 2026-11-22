import { isBotOwnerSync } from '../utils/helpers.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { BULLET_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';

export const commands = [
  {
    name: 'shortcuts',
    aliases: ['sc'],
    description: 'Manage and view Athena Prime short cut aliases.',
    category: 'utilities',
    permissions: [],
    options: [],
    async executePrefix(message, args) {
      const config = db.getGuildConfig(message.guild.id);
      
      if (args[0] === 'enable') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !isBotOwnerSync(message.author.id)) {
            return message.reply(cv2.danger('Permission Denied', 'You must be an Administrator to enable shortcuts.'));
        }
        db.updateGuildConfig(message.guild.id, { shortcutsEnabled: true });
        return message.reply(cv2.success('Shortcuts Enabled', 'All pre-added short cut aliases are now **enabled** server-wide!'));
      }
      
      if (args[0] === 'disable') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !isBotOwnerSync(message.author.id)) {
            return message.reply(cv2.danger('Permission Denied', 'You must be an Administrator to disable shortcuts.'));
        }
        db.updateGuildConfig(message.guild.id, { shortcutsEnabled: false });
        return message.reply(cv2.success('Shortcuts Disabled', 'All pre-added short cut aliases have been **disabled** server-wide. Users must now type full command names.'));
      }
      
      const enabledText = config.shortcutsEnabled !== false ? '<:on:1533844867191406672> **Enabled**' : '<:off:1533844858983157851> **Disabled**';
      const glyph = getRandomHeadingGlyph();
      
      const text = `# ${glyph} Athena Universal Shortcuts Network\n` +
      `- Global Status: ${enabledText} • 1,248+ active command routes\n\n` +
      `### Role Management\n` +
      `> ${BULLET_EMOJI} \`!er\` ➔ \`!editrole\` (Interactive GUI Role Manager)\n` +
      `> ${BULLET_EMOJI} \`!cr\` ➔ \`!createrole\` (Interactive Role Creator)\n` +
      `> ${BULLET_EMOJI} \`!dr\` ➔ \`!deleterole\`\n` +
      `> ${BULLET_EMOJI} \`!mar\` ➔ \`!massaddrole\`\n` +
      `> ${BULLET_EMOJI} \`!mrr\` ➔ \`!massremoverole\`\n` +
      `> ${BULLET_EMOJI} \`!ms\` ➔ \`!massstrip\`\n` +
      `> ${BULLET_EMOJI} \`!mrestore\` ➔ \`!massrestore\`\n\n` +
      `### Information & Stats\n` +
      `> ${BULLET_EMOJI} \`!so\` or \`!serverstats\` ➔ \`!serveroverview\` (8-Panel Statbot Canvas)\n` +
      `> ${BULLET_EMOJI} \`!bs\` or \`!bi\` ➔ \`!botstats\`\n` +
      `> ${BULLET_EMOJI} \`!ui\` or \`!whois\` ➔ \`!userinfo\`\n` +
      `> ${BULLET_EMOJI} \`!sinfo\` or \`!si\` ➔ \`!serverinfo\`\n` +
      `> ${BULLET_EMOJI} \`!yts\` ➔ \`!ytstats\`\n` +
      `> ${BULLET_EMOJI} \`!yt\` ➔ \`!youtube\`\n` +
      `> ${BULLET_EMOJI} \`!h\` or \`!cmds\` ➔ \`!help\`\n\n` +
      `### Voice & Channels\n` +
      `> ${BULLET_EMOJI} \`!vcp\` ➔ \`!vcpanel\`\n` +
      `> ${BULLET_EMOJI} \`!vcl\` ➔ \`!vclock\`\n` +
      `> ${BULLET_EMOJI} \`!vcunl\` ➔ \`!vcunlock\`\n` +
      `> ${BULLET_EMOJI} \`!vcs\` ➔ \`!vcstatus\`\n` +
      `> ${BULLET_EMOJI} \`!jtc\` ➔ \`!jtcsetup\`\n` +
      `> ${BULLET_EMOJI} \`!jtcoff\` ➔ \`!jtcdisable\`\n\n` +
      `### Security & Access Control\n` +
      `> ${BULLET_EMOJI} \`!qrm\` ➔ \`!qrmanager\`\n` +
      `> ${BULLET_EMOJI} \`!la\` ➔ \`!lockapps\`\n` +
      `> ${BULLET_EMOJI} \`!ula\` ➔ \`!unlockapps\`\n` +
      `> ${BULLET_EMOJI} \`!v\` ➔ \`!verify\`\n` +
      `> ${BULLET_EMOJI} \`!tp\` ➔ \`!ticketpanel\`\n` +
      `> ${BULLET_EMOJI} \`!slogs\` ➔ \`!serverlogs\`\n` +
      `> ${BULLET_EMOJI} \`!mp\` ➔ \`!moveprotect\`\n` +
      `> ${BULLET_EMOJI} \`!mto\` ➔ \`!masstimeout\`\n` +
      `> ${BULLET_EMOJI} \`!massunban\` ➔ \`!unbanall\`\n` +
      `> ${BULLET_EMOJI} \`!sec\` or \`!shield\` ➔ \`!security\`\n` +
      `> ${BULLET_EMOJI} \`!an\` ➔ \`!antinuke\`\n` +
      `> ${BULLET_EMOJI} \`!qr\` / \`!q\` / \`!jail\` / \`!freeze\` ➔ \`!quarantine\`\n` +
      `> ${BULLET_EMOJI} \`!unq\` / \`!lift\` / \`!unjail\` / \`!unfreeze\` ➔ \`!unquarantine\`\n` +
      `> ${BULLET_EMOJI} \`!ld\` ➔ \`!lockdown\`\n` +
      `> ${BULLET_EMOJI} \`!em\` ➔ \`!emergency\`\n\n` +
      `### Utility & Engagement\n` +
      `> ${BULLET_EMOJI} \`!ct\` ➔ \`!createthread\`\n` +
      `> ${BULLET_EMOJI} \`!ta\` ➔ \`!archivethread\`\n` +
      `> ${BULLET_EMOJI} \`!td\` ➔ \`!deletethread\`\n` +
      `> ${BULLET_EMOJI} \`!arc\` ➔ \`!autorole-config\`\n` +
      `> ${BULLET_EMOJI} \`!ssc\` ➔ \`!setstatschannel\`\n` +
      `> ${BULLET_EMOJI} \`!ign\` ➔ \`!ignore\`\n` +
      `> ${BULLET_EMOJI} \`!qm\` ➔ \`!quotemaker\`\n` +
      `> ${BULLET_EMOJI} \`!sq\` ➔ \`!setquote\`\n` +
      `> ${BULLET_EMOJI} \`!bday\` ➔ \`!birthday\`\n` +
      `> ${BULLET_EMOJI} \`!bserver\` ➔ \`!buildserver\`\n\n` +
      `- Use \`!shortcuts enable\` or \`!shortcuts disable\` to toggle these aliases globally for your server.`;
      
      const container = { type: 17, components: [{ type: 10, content: text }] };
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async executeSlash(interaction) {
      await interaction.reply({ content: 'Please use the prefix command `!shortcuts` for this feature.', ephemeral: true });
    }
  }
];

