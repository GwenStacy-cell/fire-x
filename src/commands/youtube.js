import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isAuthorized } from '../utils/helpers.js';
import { BULLET_EMOJI } from '../utils/emojis.js';
import { resolveYouTubeChannel, resolveYouTubeChannelId, getLatestVideo, sendYouTubeNotification } from '../utils/youtubeNotifier.js';
import { manageWebSubSubscription } from '../utils/websub.js';

export const commands = [
  {
    name: 'youtube',
    description: 'Manage YouTube upload notifiers for the server.',
    category: 'engagement',
    permissions: [], // Restricted via isAuthorized manually
    async executePrefix(message, args) {
      if (!await isAuthorized(message.author, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only designated Administrators, Extra Owners, or Server Owners can manage YouTube notifiers.'));
      }

      const subcommand = args[0]?.toLowerCase();
      const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';

      if (!subcommand || !['add', 'remove', 'list', 'test'].includes(subcommand)) {
        return message.reply(cv2.info('YouTube Notifier Management', 
            `Monitor YouTube channels and broadcast instant alerts when a new video is uploaded.\n\n` +
            `> -# ${BULLET_EMOJI} **Add Tracker:** \`${prefix}youtube add <url|@handle> <#channel> [custom message]\`\n` +
            `> -# ${BULLET_EMOJI} **Remove Tracker:** \`${prefix}youtube remove <url|channel_id>\`\n` +
            `> -# ${BULLET_EMOJI} **List Trackers:** \`${prefix}youtube list\`\n` +
            `> -# ${BULLET_EMOJI} **Test Alert:** \`${prefix}youtube test [url]\``
          ));
      }

      // --- LIST COMMAND ---
      if (subcommand === 'list') {
        const notifiers = db.getYouTubeNotifiers(message.guild.id);
        if (notifiers.length === 0) {
          return message.reply(cv2.info('YouTube Notifiers', 'There are no active YouTube notifiers configured in this server.'));
        }

        let desc = '';
        for (let i = 0; i < notifiers.length; i++) {
          const n = notifiers[i];

          // Auto-heal 'Unknown Channel' on view
          if (!n.channelName || n.channelName === 'Unknown Channel') {
            const video = await getLatestVideo(n.youtubeId);
            if (video && video.channelName && video.channelName !== 'Unknown Channel') {
              n.channelName = video.channelName;
              db.save();
            }
          }

          const displayName = n.channelName || 'YouTube Channel';
          desc += `**${i + 1}. [${displayName}](${n.youtubeUrl})**\n`;
          desc += `> -# ${BULLET_EMOJI} **Target Channel:** <#${n.discordChannelId}>\n`;
          if (n.lastVideoId) {
            desc += `> -# ${BULLET_EMOJI} **Latest Video ID:** \`${n.lastVideoId}\`\n`;
          }
          desc += '\n';
        }

        return message.reply(cv2.info('YouTube Notifiers', desc.trim()));
      }

      // --- TEST COMMAND ---
      if (subcommand === 'test') {
        const notifiers = db.getYouTubeNotifiers(message.guild.id);
        if (notifiers.length === 0) {
          return message.reply(cv2.warn('No Trackers Active', `No YouTube channels are currently being tracked. Use \`${prefix}youtube add <url> <#channel>\` first.`));
        }

        const waitMsg = await message.reply(cv2.info('Dispatching Test Alert', '<a:loading:1542155051286396938> Fetching video feed and generating test alert...'));

        const targetNotifier = args[1]
          ? notifiers.find(n => n.youtubeUrl.includes(args[1]) || n.youtubeId.includes(args[1]) || n.discordChannelId === args[1].replace(/[<#>]/g, '')) || notifiers[0]
          : notifiers[0];

        let video = await getLatestVideo(targetNotifier.youtubeId);
        if (!video || !video.id) {
          video = {
            id: 'dQw4w9WgXcQ',
            title: 'Sample Test Video Upload',
            link: targetNotifier.youtubeUrl,
            author: targetNotifier.channelName || 'YouTube Creator',
            pubDate: new Date(),
            thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            channelName: targetNotifier.channelName || 'YouTube Channel'
          };
        }

        // Auto-heal channelName
        if ((!targetNotifier.channelName || targetNotifier.channelName === 'Unknown Channel') && video.channelName) {
          targetNotifier.channelName = video.channelName;
          db.save();
        }

        const sent = await sendYouTubeNotification(message.client, message.guild, targetNotifier, video, true);
        if (sent) {
          return waitMsg.edit(cv2.success('Test Alert Dispatched',
            `Successfully dispatched a test YouTube notification!\n\n` +
            `> -# ${BULLET_EMOJI} **Target Channel:** <#${targetNotifier.discordChannelId}>\n` +
            `> -# ${BULLET_EMOJI} **Channel Tracked:** [${targetNotifier.channelName || 'YouTube Channel'}](${targetNotifier.youtubeUrl})\n` +
            `> -# ${BULLET_EMOJI} **Status:** Live notification delivered to Discord.`
          ));
        } else {
          return waitMsg.edit(cv2.danger('Dispatch Failed', `Could not send alert to <#${targetNotifier.discordChannelId}>. Please ensure the bot has **View Channel**, **Send Messages**, and **Embed Links** permissions.`));
        }
      }

      // --- REMOVE COMMAND ---
      if (subcommand === 'remove') {
        const url = args[1];
        if (!url) return message.reply(cv2.warn('Syntax Error', `Please specify a YouTube channel URL or ID to remove.\n\n**Usage:** \`${prefix}youtube remove <url>\``));

        const waitMsg = await message.reply(cv2.info('Processing...', '<a:loading:1542155051286396938> Resolving channel ID...'));
        const channelId = await resolveYouTubeChannelId(url);

        if (!channelId) {
          return waitMsg.edit(cv2.danger('Resolution Failed', 'Could not resolve a YouTube channel from that URL.'));
        }

        const success = db.removeYouTubeNotifier(message.guild.id, channelId);
        if (success) {
          manageWebSubSubscription(channelId, 'unsubscribe');
          return waitMsg.edit(cv2.success('Tracker Removed', `Successfully removed YouTube tracker for channel ID \`${channelId}\`.`));
        } else {
          return waitMsg.edit(cv2.warn('Not Found', 'That YouTube channel is not currently being tracked in this server.'));
        }
      }

      // --- ADD COMMAND ---
      if (subcommand === 'add') {
        const url = args[1];
        let channelMention = message.mentions.channels.first();
        
        if (!channelMention && args[2]) {
          const potentialId = args[2].replace(/[<#>]/g, '');
          channelMention = message.guild.channels.cache.get(potentialId)
            || await message.guild.channels.fetch(potentialId).catch(() => null);
          
          if (!channelMention) {
             const nameQuery = args.slice(2).join(' ').toLowerCase();
             channelMention = message.guild.channels.cache.find(c => c.name.toLowerCase() === nameQuery || c.name.toLowerCase().includes(nameQuery));
          }
        }
        
        if (!url || !channelMention) {
          return message.reply(cv2.warn('Syntax Error', 
            `Please specify a channel URL and target Discord text channel.\n\n` +
            `> -# ${BULLET_EMOJI} **Usage:** \`${prefix}youtube add <url|@handle> <#channel> [custom message]\`\n` +
            `> -# ${BULLET_EMOJI} **Example:** \`${prefix}youtube add https://youtube.com/@MrBeast #uploads @everyone New Video!\``
          ));
        }

        let customMessage = '';
        const channelMentionStr = `<#${channelMention.id}>`;
        if (message.content.includes(channelMentionStr)) {
            const channelStrIndex = message.content.indexOf(channelMentionStr);
            customMessage = message.content.slice(channelStrIndex + channelMentionStr.length).trim();
        } else {
            const msgAfterUrl = message.content.substring(message.content.indexOf(url) + url.length).trim();
            const lowerMsg = msgAfterUrl.toLowerCase();
            const lowerName = channelMention.name.toLowerCase();
            if (lowerMsg.includes(lowerName)) {
               const idx = lowerMsg.indexOf(lowerName);
               customMessage = msgAfterUrl.slice(idx + lowerName.length).trim();
            }
        }

        const waitMsg = await message.reply(cv2.info('Connecting Tracker...', '<a:loading:1542155051286396938> Resolving YouTube channel telemetry and metadata...'));
        
        const resolved = await resolveYouTubeChannel(url);
        if (!resolved || !resolved.channelId) {
          return waitMsg.edit(cv2.danger('Resolution Error', 'Could not resolve a valid YouTube channel from that URL. Please verify the link or @handle.'));
        }
        const channelId = resolved.channelId;

        // Check if already tracking
        const currentNotifiers = db.getYouTubeNotifiers(message.guild.id);
        if (currentNotifiers.some(n => n.youtubeId === channelId)) {
          return waitMsg.edit(cv2.warn('Already Tracked', 'This YouTube channel is already being monitored in this server!'));
        }

        // Fetch latest video to get the official channel name and seed latest video ID
        const latestVideo = await getLatestVideo(channelId);
        const channelName = resolved.channelName || latestVideo?.channelName || latestVideo?.author || 'YouTube Channel';
        const lastVideoId = latestVideo?.id || null;

        db.addYouTubeNotifier(message.guild.id, {
          youtubeId: channelId,
          youtubeUrl: resolved.channelUrl || url,
          discordChannelId: channelMention.id,
          customMessage: customMessage,
          lastVideoId: lastVideoId,
          recentVideoIds: lastVideoId ? [lastVideoId] : [],
          channelName: channelName
        });

        // Request WebSub push notification subscription
        manageWebSubSubscription(channelId, 'subscribe');

        const cfg = db.getGuildConfig(message.guild.id);
        const accentHex = cfg?.accentColor || '#ff0000';
        const accentInt = parseInt(String(accentHex).replace('#', ''), 16) || 0xff0000;
        const { EmbedBuilder } = await import('discord.js');

        await waitMsg.delete().catch(() => {});
        await message.reply(cv2.success('Tracker Activated', `YouTube tracker for **${channelName}** successfully linked to ${channelMention}.`));

        // Send activation confirmation to the target notification channel
        const successEmbed = new EmbedBuilder()
          .setColor(accentInt)
          .setAuthor({ 
            name: `YouTube Integration Active`, 
            iconURL: 'https://cdn.discordapp.com/emojis/1533383764250460241.webp?size=96&quality=lossless'
          })
          .setTitle(`Successfully Linked: ${channelName}`)
          .setURL(resolved.channelUrl || url)
          .setDescription(`> <a:target_blink:1565667466984554588> **This channel will now automatically receive instant alerts whenever __${channelName}__ uploads a new video!**`)
          .setFooter({ text: 'Athena Prime YouTube Notifier' })
          .setTimestamp();
          
        if (latestVideo && latestVideo.thumbnail) {
          successEmbed.setImage(latestVideo.thumbnail);
        }

        let channelMsg = '';
        if (customMessage) {
            channelMsg = `**Ping Configuration:**\n${customMessage}`;
        }

        await channelMention.send({ content: channelMsg, embeds: [successEmbed] }).catch(() => {});
      }
    }
  }
];
