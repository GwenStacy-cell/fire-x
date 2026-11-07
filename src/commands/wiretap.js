import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { 
  resolveYoutubeChannelId, 
  fetchLatestYoutubeVideo, 
  fetchLatestRedditPost, 
  buildWiretapBroadcastPayload 
} from '../utils/wiretapEngine.js';

export const commands = [
  {
    name: 'wiretap',
    aliases: ['feed', 'socialfeed', 'streamalert'],
    description: 'Configure automated social media broadcaster for YouTube uploads and Reddit posts',
    category: 'utility',
    permissions: ['ManageGuild'],
    options: [
      { name: 'action', description: 'Action to perform (add, list, remove, check)', type: 3, required: true },
      { name: 'platform', description: 'Platform (youtube, reddit)', type: 3, required: false },
      { name: 'target', description: 'YouTube channel handle / Subreddit name', type: 3, required: false },
      { name: 'channel', description: 'Destination text channel', type: 7, required: false }
    ],

    async executePrefix(message, args) {
      const sub = (args[0] || 'list').toLowerCase();

      // --- LIST WIRETAPS ---
      if (sub === 'list') {
        const list = db.getWiretaps(message.guild.id);
        if (list.length === 0) {
          return message.reply(cv2.warn(
            `No Wiretaps Active | ${WARN_EMOJI}`,
            `No automated social broadcasters are configured in this server.\n\n` +
            `**Setup Examples:**\n` +
            `${BULLET_EMOJI} \`!wiretap add youtube @PewDiePie #announcements\`\n` +
            `${BULLET_EMOJI} \`!wiretap add reddit memes #general-chat\``
          ));
        }

        const lines = list.map((w, i) => 
          `${BULLET_EMOJI} **#${i + 1}** \`[${w.platform.toUpperCase()}]\` **Target:** \`${w.target}\` \u2192 <#${w.channelId}> (ID: \`${w.id}\`)`
        ).join('\n');

        return message.reply(cv2.panel(
          `Social Media Wiretap Matrix | ${TICK_EMOJI}`,
          `Currently monitoring **${list.length}** social feed(s) for automated broadcasts:\n\n${lines}\n\n` +
          `Use \`!wiretap remove <id>\` to delete a broadcaster.`
        ));
      }

      // --- ADD WIRETAP ---
      if (sub === 'add') {
        const platform = (args[1] || '').toLowerCase();
        let target = args[2];
        const channelMention = message.mentions.channels.first() || message.channel;

        if (!['youtube', 'reddit', 'yt'].includes(platform) || !target) {
          return message.reply(cv2.warn(
            `Parameters Required | ${WARN_EMOJI}`,
            `Usage: \`!wiretap add <youtube | reddit> <target> [#channel]\`\n\n` +
            `${BULLET_EMOJI} **YouTube:** \`!wiretap add youtube @MrBeast #videos\`\n` +
            `${BULLET_EMOJI} **Reddit:** \`!wiretap add reddit anime #memes\``
          ));
        }

        const normalizedPlatform = platform === 'yt' ? 'youtube' : platform;
        let resolvedTarget = target;

        if (normalizedPlatform === 'youtube') {
          resolvedTarget = await resolveYoutubeChannelId(target);
        } else if (normalizedPlatform === 'reddit') {
          resolvedTarget = target.replace(/^r\//i, '').trim();
        }

        const item = db.addWiretap(message.guild.id, normalizedPlatform, resolvedTarget, channelMention.id);

        return message.reply(cv2.success(
          `Wiretap Configured | ${TICK_EMOJI}`,
          `Successfully deployed **${normalizedPlatform.toUpperCase()}** broadcaster for \`${target}\`!\n\n` +
          `${BULLET_EMOJI} **Target Feed:** \`${resolvedTarget}\`\n` +
          `${BULLET_EMOJI} **Broadcast Channel:** <#${channelMention.id}>\n` +
          `${BULLET_EMOJI} **Wiretap ID:** \`${item.id}\``
        ));
      }

      // --- REMOVE WIRETAP ---
      if (sub === 'remove' || sub === 'delete' || sub === 'del') {
        const id = args[1];
        if (!id) {
          return message.reply(cv2.warn(`ID Required | ${WARN_EMOJI}`, `Please specify the wiretap ID to delete: \`!wiretap remove <id>\`.`));
        }

        const removed = db.removeWiretap(message.guild.id, id);
        if (!removed) {
          return message.reply(cv2.warn(`Not Found | ${WARN_EMOJI}`, `No wiretap found matching ID or target \`${id}\`.`));
        }

        return message.reply(cv2.success(`Wiretap Removed | ${TICK_EMOJI}`, `Successfully disabled broadcaster.`));
      }

      // --- MANUAL CHECK / TEST ---
      if (sub === 'check' || sub === 'test') {
        const list = db.getWiretaps(message.guild.id);
        if (list.length === 0) {
          return message.reply(cv2.warn(`No Wiretaps | ${WARN_EMOJI}`, `No active wiretaps to test.`));
        }

        const first = list[0];
        let latest = null;
        if (first.platform === 'youtube') latest = await fetchLatestYoutubeVideo(first.target);
        else if (first.platform === 'reddit') latest = await fetchLatestRedditPost(first.target);

        if (!latest) {
          return message.reply(cv2.warn(`No Feed Data | ${WARN_EMOJI}`, `Could not retrieve latest post for \`${first.target}\`.`));
        }

        const payload = buildWiretapBroadcastPayload(latest);
        return message.reply(payload);
      }
    }
  }
];

export default { commands };
