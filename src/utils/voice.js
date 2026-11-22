import { PermissionFlagsBits } from 'discord.js';
import { 
  joinVoiceChannel, 
  getVoiceConnection, 
  VoiceConnectionStatus, 
  entersState 
} from '@discordjs/voice';
import db from '../database.js';

const reconnectTimeouts = new Map();
const keepAliveTimers = new Map();

// Standard 20ms RFC 6716 Opus silence frame (3 bytes)
const OPUS_SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

/**
 * Initiates continuous Opus silence packet transmission over the UDP socket.
 * This punches through NAT firewalls and prevents Discord's voice server
 * from terminating idle voice sessions for inactivity.
 */
function startSilenceKeepAlive(guildId, connection) {
  stopSilenceKeepAlive(guildId);

  // Burst 5 initial silence frames to punch open the UDP mapping immediately
  for (let i = 0; i < 5; i++) {
    try {
      if (connection.state.status === VoiceConnectionStatus.Ready) {
        connection.playOpusPacket(OPUS_SILENCE_FRAME);
      }
    } catch (_) {}
  }

  // Periodic silence frame every 3 seconds to keep UDP connection 24/7 persistent
  const timer = setInterval(() => {
    try {
      const conn = getVoiceConnection(guildId);
      if (conn && conn.state.status === VoiceConnectionStatus.Ready) {
        conn.playOpusPacket(OPUS_SILENCE_FRAME);
      }
    } catch (_) {}
  }, 3000);

  keepAliveTimers.set(guildId, timer);
}

/**
 * Stops the silence keep-alive timer for a guild.
 */
export function stopSilenceKeepAlive(guildId) {
  if (keepAliveTimers.has(guildId)) {
    clearInterval(keepAliveTimers.get(guildId));
    keepAliveTimers.delete(guildId);
  }
}

/**
 * Cleanly disconnects the bot from its Home VC.
 * ONLY called when an authorized user explicitly runs unsethomevc.
 */
export function disconnectHomeVc(guildId) {
  stopSilenceKeepAlive(guildId);
  const connection = getVoiceConnection(guildId);
  if (connection) {
    try {
      connection.destroy();
    } catch (_) {}
  }
}

/**
 * Connect the bot to its designated Home VC in a guild.
 * Guarantees zero unprovoked disconnects, maintaining 24/7 persistence
 * until unsethomevc is explicitly executed.
 */
export async function connectToHomeVc(guild, channelId, force = false) {
  if (!guild || !channelId) return { success: false, reason: 'Invalid guild or channel ID.' };

  // Fetch voice channel strictly by ID
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch (e) {
      // ignore
    }
  }

  if (!channel || !channel.isVoiceBased()) {
    console.error(`[Athena Prime] Home Voice Channel ${channelId} not found or not voice-based in guild ${guild.name}`);
    return { success: false, reason: 'Voice channel not found or is not voice-based.' };
  }

  // Check bot member and permissions
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    return { success: false, reason: 'Unable to resolve bot guild member.' };
  }

  const perms = channel.permissionsFor(me);
  if (!perms || !perms.has(PermissionFlagsBits.ViewChannel)) {
    return { success: false, reason: 'Bot is missing ViewChannel permission in target VC.' };
  }
  if (!perms.has(PermissionFlagsBits.Connect)) {
    return { success: false, reason: 'Bot is missing Connect permission in target VC.' };
  }
  if (channel.userLimit > 0 && channel.members.size >= channel.userLimit && !perms.has(PermissionFlagsBits.MoveMembers) && !perms.has(PermissionFlagsBits.Administrator)) {
    return { success: false, reason: `Target VC is full (${channel.members.size}/${channel.userLimit}) and bot cannot bypass user limit.` };
  }

  // Prevent rapid reconnect spam unless forced
  if (!force) {
    if (reconnectTimeouts.has(guild.id)) {
      return { success: false, reason: 'Reconnect rate limited.' };
    }
    reconnectTimeouts.set(guild.id, true);
    setTimeout(() => reconnectTimeouts.delete(guild.id), 3000);
  }

  const currentVoiceChannelId = me.voice?.channelId;
  let connection = getVoiceConnection(guild.id);

  // If already in target channel and Ready, guarantee keep-alive is spinning and return immediately
  if (currentVoiceChannelId === channel.id && connection && connection.state.status === VoiceConnectionStatus.Ready) {
    startSilenceKeepAlive(guild.id, connection);
    updateBotVcStatus(channel).catch(() => null);
    return { success: true, connection, alreadyConnected: true };
  }

  // Check if music or soundboard is actively playing
  try {
    const { getQueue } = await import('./musicManager.js');
    const queue = getQueue(guild.id);
    if (!force && queue && (queue.isPlaying || queue.current || queue.songs.length > 0 || queue.isPreparing)) {
      return { success: false, reason: 'Bot is currently playing music in another channel.' };
    }
  } catch (err) {}

  try {
    const { activeVoiceSessions } = await import('./soundboardEngine.js').catch(() => ({ activeVoiceSessions: new Map() }));
    if (!force && activeVoiceSessions && activeVoiceSessions.has(guild.id)) {
      return { success: false, reason: 'Bot is currently active in a soundboard or radio voice session.' };
    }
  } catch (err) {}

  // Clean up lingering Shoukaku player if music is idle
  try {
    const shoukaku = global.client?.shoukaku;
    if (shoukaku) {
      const player = shoukaku.players.get(guild.id);
      if (player) {
        await shoukaku.leaveVoiceChannel(guild.id).catch(() => null);
      }
    }
  } catch (err) {}

  // If bot is in another channel in Discord, move it smoothly via REST API
  if (currentVoiceChannelId && currentVoiceChannelId !== channel.id) {
    try {
      await me.voice.setChannel(channel.id);
    } catch (err) {
      console.warn(`[Athena Prime] Could not move bot via setChannel:`, err.message);
    }
  }

  // If bot is already in this channel in Discord and connection exists, rejoin smoothly without destroying
  if (currentVoiceChannelId === channel.id && connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      connection.rejoin({
        channelId: channel.id,
        selfDeaf: false,
        selfMute: false
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      startSilenceKeepAlive(guild.id, connection);
      updateBotVcStatus(channel).catch(() => null);
      return { success: true, connection };
    } catch (err) {
      console.warn(`[Athena Prime] Voice rejoin failed, re-establishing session:`, err.message);
    }
  }

  // Establish voice connection via native @discordjs/voice
  try {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    connection.on('error', (err) => {
      console.error(`[Athena Prime] Voice connection error in ${guild.name}:`, err);
    });

    // Handle disconnects WITHOUT destroying the Home VC session
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      const cfg = db.getGuildConfig(guild.id);
      // If Home VC was unset, allow destruction
      if (!cfg?.homeVcId || cfg.homeVcId !== channel.id) {
        stopSilenceKeepAlive(guild.id);
        try { connection.destroy(); } catch (_) {}
        return;
      }

      // It IS Home VC: NEVER call connection.destroy()! Keep connection persistent
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (e) {
        // Did not automatically transition within 5s; rejoin cleanly without destroying
        try {
          connection.rejoin({
            channelId: channel.id,
            selfDeaf: false,
            selfMute: false
          });
        } catch (_) {
          setTimeout(() => {
            const freshGuild = guild.client.guilds.cache.get(guild.id);
            if (freshGuild) connectToHomeVc(freshGuild, channel.id, true).catch(() => null);
          }, 1000);
        }
      }
    });

    // Wait for the connection to reach Ready status
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    console.log(`[Athena Prime] Joined Home VC "${channel.name}" in guild "${guild.name}" (24/7 persistent mode)`);

    // Start continuous Opus silence keep-alive (prevents Discord idle UDP timeout)
    startSilenceKeepAlive(guild.id, connection);

    // Synchronize voice channel status
    updateBotVcStatus(channel).catch(() => null);

    return { success: true, connection };
  } catch (error) {
    if (error?.code === 'ABORT_ERR' || error?.name === 'AbortError') {
      console.warn(`[Athena Prime] Voice handshake timed out in "${guild.name}" (Discord voice gateway congested). Auto-reconnect watchdog will retry.`);
    } else {
      console.error(`[Athena Prime] Failed to join Home VC in guild ${guild.name}: ${error.message || error}`);
    }
    return { success: false, reason: error.message || 'Voice connection failed to reach Ready status.' };
  }
}

/**
 * Toggle the bot's OWN self-deafen by updating the voice connection.
 */
export async function toggleBotDeafen(guild, deaf) {
  try {
    const me = guild.members.me;
    if (!me || !me.voice?.channelId) {
      return { success: false, message: 'The bot is not currently in a voice channel.' };
    }

    const shoukaku = global.client?.shoukaku;
    if (shoukaku) {
      const player = shoukaku.players.get(guild.id);
      if (player) {
         await me.voice.setDeaf(deaf).catch(() => null);
         return { success: true };
      }
    }
    await me.voice.setDeaf(deaf).catch(() => null);
    return { success: true };
  } catch (err) {
    console.error('Failed to toggle deafen:', err);
    return { success: false, message: 'An error occurred while updating voice state.' };
  }
}

let vcStatusIndex = 0;
let emojiIndex = 0;

/**
 * Dynamically updates the bot's Voice Channel Status with server statistics
 * and aesthetic emojis as requested by the user, rotating sequentially.
 */
export async function updateBotVcStatus(channel) {
  if (!channel || !channel.isVoiceBased()) return;
  
  const config = db.getGuildConfig(channel.guild.id);
  if (config.vcStatusEnabled === false) {
    try {
      await channel.client.rest.put(`/channels/${channel.id}/voice-status`, { body: { status: null } });
    } catch (e) {}
    return;
  }
  
  const emojis = [
    '<a:a_fheartSpinWhite:1533844790314143955>',
    '<a:ArrowHeart:1544688958196158525>',
    '<a:emoji_114:1533844815756787752>',
    '<a:bubu_sigh:1525429906102816788>',
    '<a:thunder:1533844816557768764>',
    '<a:Beloved_chidharha:1544998293153779722>',
    '<a:nt:1445649701809684552>',
    '<a:MMMilkDance:1538515109146660956>'
  ];
  
  const startEmoji = emojis[emojiIndex % emojis.length];
  const endEmoji = emojis[(emojiIndex + 1) % emojis.length];
  emojiIndex++;

  const guild = channel.guild;
  const vcMembers = channel.members;
  
  const connected = vcMembers.size;
  const muted = vcMembers.filter(m => m.voice.selfMute || m.voice.serverMute).size;
  const deafened = vcMembers.filter(m => m.voice.selfDeaf || m.voice.serverDeaf).size;
  
  const totalMembers = guild.memberCount;
  const totalBots = guild.members.cache.filter(m => m.user.bot).size;
  const activeMembers = guild.members.cache.filter(m => m.voice.channelId).size;

  const templates = [
    `${startEmoji} **Total Members : ${totalMembers}** ${endEmoji}`,
    `${startEmoji} **Active Members : ${activeMembers} !!**`,
    `${startEmoji} **Users Connected : ${connected}** ${endEmoji}`,
    `${startEmoji} **Users Muted : ${muted}** ${endEmoji}`,
    `${startEmoji} **Total Bots : ${totalBots}** ${endEmoji} **!!**`,
    `<a:PI_nezurun:1538517600013783060> **Members : ${totalMembers} . <a:AnyaYay:1537513785718476850> Voice Chat : ${connected}**`
  ];
  
  const finalStatus = templates[vcStatusIndex % templates.length];
  vcStatusIndex++;
  
  try {
    await channel.client.rest.put(
      `/channels/${channel.id}/voice-status`,
      { body: { status: finalStatus } }
    );
  } catch (error) {
    // Gracefully ignore rate limits or permission errors
  }
}
