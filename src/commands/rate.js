import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

const STAR = '<a:1z:1517089474369032253>';

export function buildRateContainer(authorName, avgRating, totalVotes, latestRatings, mediaUrl) {
  const components = [
    { type: 10, content: `## RATE ${authorName.toUpperCase()}'S EDIT` },
    { type: 14, divider: true },
    {
      type: 10,
      content: `${STAR} **Current Rating**\n**${avgRating}/5** (${totalVotes} vote${totalVotes !== 1 ? 's' : ''})\n\n**User Ratings**\n${latestRatings || '_No ratings yet_'}`
    },
    { type: 14, divider: true },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'rate_edit_1', label: '1', emoji: { id: '1517089474369032253', animated: true, name: '1z' }, style: 2 },
        { type: 2, custom_id: 'rate_edit_2', label: '2', emoji: { id: '1517089474369032253', animated: true, name: '1z' }, style: 2 },
        { type: 2, custom_id: 'rate_edit_3', label: '3', emoji: { id: '1517089474369032253', animated: true, name: '1z' }, style: 2 },
        { type: 2, custom_id: 'rate_edit_4', label: '4', emoji: { id: '1517089474369032253', animated: true, name: '1z' }, style: 2 },
        { type: 2, custom_id: 'rate_edit_5', label: '5', emoji: { id: '1517089474369032253', animated: true, name: '1z' }, style: 2 },
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'rate_edit_delete', label: 'Remove', style: 4 }
      ]
    },
    { type: 14, divider: true },
    { type: 10, content: `-# **Athena Bulletproof Security System · V1.0.0**` }
  ];

  // Append image as a link button if available (safest way — no CV2 image type issues)
  return {
    components: [{ type: 17, components }],
    flags: MessageFlags.IsComponentsV2
  };
}

export const commands = [
  {
    name: 'rate',
    slashHidden: true,
    description: 'Post an edit to be rated [Public], or set the designated rating channel [Extra Owner].',
    aliases: ['setrate', 'ratechannel', 'setratechannel', 'edit', 'rateedit', 'editrate', 'rate-edit'],
    executePrefix: async (message, args) => {
      const invoked = message.content.trim().split(/ +/)[0].toLowerCase().replace(/^!/, '');
      const isSetrateAlias = invoked === 'setrate' || invoked === 'setratechannel' || invoked === 'ratechannel';

      // 1. Channel Configuration Subcommand Check (!rate setchannel, !rate channel, !setrate, or direct #channel)
      const firstArg = (args[0] || '').toLowerCase();
      const isConfigKeyword = isSetrateAlias || firstArg === 'setchannel' || firstArg === 'channel' || firstArg === 'set' || firstArg === 'bind' || firstArg === 'status' || firstArg === 'disable' || firstArg === 'off' || firstArg === 'none';
      const channelMatch = (firstArg === 'setchannel' || firstArg === 'channel' || firstArg === 'set' || firstArg === 'bind' ? args[1] : args[0])?.match(/<#(\d+)>/);
      const isDirectId = /^\d{17,19}$/.test(firstArg === 'setchannel' || firstArg === 'channel' || firstArg === 'set' || firstArg === 'bind' ? (args[1] || '') : args[0]);

      if (isConfigKeyword || channelMatch || isDirectId) {
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can configure the edit rating channel.'));
        }

        const targetArg = (firstArg === 'setchannel' || firstArg === 'channel' || firstArg === 'set' || firstArg === 'bind') ? args[1] : (isSetrateAlias ? args[0] : (firstArg === 'status' ? 'status' : args[0]));
        const lowerTarget = (targetArg || '').toLowerCase();

        if (!targetArg || lowerTarget === 'status') {
          const currentId = db.getRateChannel(message.guild.id);
          const currentText = currentId ? `<#${currentId}> (\`${currentId}\`)` : '`None (Disabled)`';
          return message.reply(cv2.info(
            `Edit Rating Channel Status | <a:03_tick_circle:1565665642084827206>`,
            `**Current Bound Channel:** ${currentText}\n\n` +
            `> -# • **Set Channel:** \`!rate setchannel <#channel>\` or \`!setrate <#channel>\`\n` +
            `> -# • **Disable:** \`!rate setchannel none\` or \`!setrate none\`\n` +
            `> -# • **Clearance:** \`[Extra Owner]\``
          ));
        }

        if (lowerTarget === 'none' || lowerTarget === 'disable' || lowerTarget === 'off' || lowerTarget === 'reset') {
          db.setRateChannel(message.guild.id, null);
          return message.reply(cv2.success(
            `Channel Disabled | <a:03_tick_circle:1565665642084827206>`,
            'The designated edit rating channel has been disabled. Users can now rate edits in any channel.'
          ));
        }

        const targetId = channelMatch ? channelMatch[1] : (isDirectId ? (firstArg === 'setchannel' || firstArg === 'channel' ? args[1] : args[0]) : null);
        const resolvedChannel = targetId ? (message.guild.channels.cache.get(targetId) || await message.guild.channels.fetch(targetId).catch(() => null)) : message.mentions.channels.first();

        if (!resolvedChannel || !resolvedChannel.isTextBased()) {
          return message.reply(cv2.warn(
            'Invalid Channel',
            'Please mention or provide a valid text channel.\n\n**Example:** `!rate setchannel #edits` or `!setrate #edits`'
          ));
        }

        db.setRateChannel(message.guild.id, resolvedChannel.id);
        return message.reply(cv2.success(
          `Channel Configured | <a:03_tick_circle:1565665642084827206>`,
          `The designated edit rating channel is now <#${resolvedChannel.id}>.\nAny image or video sent in that channel will automatically receive an interactive star rating card!`
        ));
      }

      const configuredChannel = db.getRateChannel(message.guild.id);
      if (configuredChannel && message.channel.id !== configuredChannel) {
        return message.reply(`This command can only be used in <#${configuredChannel}>.`).then(m => setTimeout(() => m.delete().catch(() => null), 5000));
      }

      // Extract Media URL
      let mediaUrl = null;
      if (message.attachments.size > 0) {
        mediaUrl = message.attachments.first().url;
      } else if (args.length > 0 && (args[0].startsWith('http://') || args[0].startsWith('https://'))) {
        mediaUrl = args[0];
      }

      if (!mediaUrl) {
        const extraOwnerHint = isExtraOwnerOrHigher(message.author.id, message.guild)
          ? `\n-# **Extra Owner Channel Binding:** Run \`!rate setchannel <#channel>\` (or \`!setrate <#channel>\`) to bind the edit rating channel.`
          : '';
        return message.reply(`Please attach an image/video or provide a link to your edit!${extraOwnerHint}`).then(m => setTimeout(() => m.delete().catch(() => null), 7000));
      }

      await createRateMessage(message, mediaUrl);
    }
  }
];

export async function createRateMessage(message, mediaUrl) {
  const authorName = message.author.globalName || message.author.username;

  const panel = buildRateContainer(authorName, '0.0', 0, null, mediaUrl);

  // Send the CV2 panel, then forward the image as a follow-up so it renders large
  try {
    const sentMessage = await message.reply(panel);

    db.createEditRating(sentMessage.id, {
      authorId: message.author.id,
      authorName: authorName,
      mediaUrl: mediaUrl
    });

    // Send the edit image as a separate message so it displays full-size below the panel
    await message.channel.send({ content: mediaUrl }).catch(() => null);

  } catch (err) {
    console.error('Failed to post edit rating:', err);
    message.reply('An error occurred while posting your edit.').catch(() => null);
  }
}
