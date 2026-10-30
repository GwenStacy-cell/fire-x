import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from './emojis.js';
import db from '../database.js';
import { cleanDisplayName } from './helpers.js';

export async function postGlobalActionLog(client, opts) {
  const { action, guildId, guildName, guildIconUrl, targetId, targetTag, executorId, executorTag, reason, _isSample } = opts;
  const { MessageFlags } = await import('discord.js');
  const { generateGlobalActionCard } = await import('./canvasActionLog.js');

  if (targetId === client.user.id && !_isSample) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const attachment = await generateGlobalActionCard({
    action,
    guildName: guildName || 'Unknown Server',
    guildIconUrl,
    targetTag: targetTag || targetId,
    targetId,
    executorName: executorTag || 'Anti-Nuke / Bot',
    executorId,
    reason: reason || 'No reason provided',
    timestamp,
    guildId
  }).catch(() => null);

  if (!attachment) return;

  const cleanTarget = cleanDisplayName(targetTag || targetId);
  const cleanExecutor = cleanDisplayName(executorTag || 'Anti-Nuke / Bot');

  const card = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} **GLOBAL ACTION LOG — ${action}**`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `-# **• __Server:__ \`${guildName || 'Unknown Server'}\`**\n` +
          `-# **• __Target:__ [${cleanTarget}](https://discord.com/users/${targetId}) \`(${targetId})\`**\n` +
          `-# **• __Action Taken By:__ [${cleanExecutor}](https://discord.com/users/${executorId}) \`(${executorId})\`**\n` +
          `-# **• __Reason:__ \`${reason || 'No reason provided'}\`**`
      },
      { type: 14, divider: true },
      {
        type: 12,
        items: [{ media: { url: `attachment://${attachment.name || 'global_ban_log.png'}` } }]
      },
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Open Server', url: `https://discord.com/channels/${guildId}` },
          { type: 2, style: 5, label: `Violator: ${cleanTarget.substring(0, 60)}`, url: `https://discord.com/users/${targetId}` }
        ]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Prime Global Antinuke System • Cross-Server Action Monitor • ${timestamp}**`
      }
    ]
  };

  const payload = { components: [card], files: [attachment], flags: MessageFlags.IsComponentsV2 };

  for (const guild of client.guilds.cache.values()) {
    const cfg = db.getGuildConfig(guild.id);
    if (!cfg?.globalActionLogChannel) continue;
    const channel = guild.channels.cache.get(cfg.globalActionLogChannel);
    if (!channel) continue;
    channel.send(payload).catch(() => null);
  }
}
