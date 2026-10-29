import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

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
    aliases: ['edit', 'rateedit', 'editrate', 'rate-edit'],
    executePrefix: async (message, args) => {
      // Admin Setup Check
      if (args.length > 0) {
        const channelMatch = args[0].match(/<#(\d+)>/);
        const isId = /^\d{17,19}$/.test(args[0]);

        if (channelMatch || isId) {
          if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply(cv2.danger('Permission Denied', 'You must be a Server Administrator to set the rating channel.'));
          }
          const channelId = channelMatch ? channelMatch[1] : args[0];
          db.setRateChannel(message.guild.id, channelId);
          return message.reply(cv2.success('Channel Configured | <a:atheNATICK:1557841381630681106>', `The designated edit rating channel is now <#${channelId}>.`));
        }
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
        const adminHint = message.member.permissions.has(PermissionFlagsBits.Administrator)
          ? `\n-# **Admin Channel Binding:** Run \`!rate <#channel>\` (or \`!rateedit <#channel>\`) to bind the edit rating channel.`
          : '';
        return message.reply(`Please attach an image/video or provide a link to your edit!${adminHint}`).then(m => setTimeout(() => m.delete().catch(() => null), 7000));
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
