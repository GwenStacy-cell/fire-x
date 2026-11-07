import { PermissionFlagsBits } from 'discord.js';
import { 
  joinVoiceChannel, 
  getVoiceConnection, 
  VoiceConnectionStatus, 
  entersState 
} from '@discordjs/voice';
import db from '../database.js';

const reconnectTimeouts = new Map();

/**
 * Connect the bot to its designated Home VC in a guild.
 * Cleans up stale connections, verifies channel permissions, handles reconnection,
 * and waits for the connection to reach Ready state.
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

  // Prevent spam reconnect loops unless forced (manual command, startup, or watchdog)
  if (!force) {
    if (reconnectTimeouts.has(guild.id)) {
      return { success: false, reason: 'Reconnect rate limited.' };
    }
    reconnectTimeouts.set(guild.id, true);
    setTimeout(() => reconnectTimeouts.delete(guild.id), 3000);
  }

  // Check if bot is already actively connected in this exact channel in Discord
  const currentVoiceChannelId = me.voice?.channelId;
  let connection = getVoiceConnection(guild.id);

  if (currentVoiceChannelId === channel.id && connection && connection.state.status === VoiceConnectionStatus.Ready) {
    console.log(`[Athena Prime] Bot is already connected and Ready in Home VC "${channel.name}" (${guild.name})`);
    return { success: true, connection, alreadyConnected: true };
  }

  // Check if music or soundboard is actively playing
  try {
    const { getQueue } = await import('./musicManager.js');
    const queue = getQueue(guild.id);
    if (!force && queue && (queue.isPlaying || queue.current || queue.songs.length > 0 || queue.isPreparing)) {
      return { success: false, reason: 'Bot is currently playing music in another channel.' };
    }
  } catch (err) {
    // ignore
  }

  try {
    const { activeVoiceSessions } = await import('./soundboardEngine.js').catch(() => ({ activeVoiceSessions: new Map() }));
    if (!force && activeVoiceSessions && activeVoiceSessions.has(guild.id)) {
      return { success: false, reason: 'Bot is currently active in a soundboard or radio voice session.' };
    }
  } catch (err) {
    // ignore
  }

  // Clean up any lingering Shoukaku player if music is idle
  try {
    const shoukaku = global.client?.shoukaku;
    if (shoukaku) {
      const player = shoukaku.players.get(guild.id);
      if (player) {
        await shoukaku.leaveVoiceChannel(guild.id).catch(() => null);
      }
    }
  } catch (err) {
    // ignore
  }

  // If connection is in a bad/disconnected state or pointing to another channel or stale, destroy it
  if (connection && (connection.state.status !== VoiceConnectionStatus.Ready || connection.joinConfig.channelId !== channel.id || !currentVoiceChannelId)) {
    try {
      connection.destroy();
    } catch (e) {}
    connection = null;
    await new Promise(r => setTimeout(r, 250));
  }

  // If bot is already in another channel in Discord, move it via REST API first
  if (currentVoiceChannelId && currentVoiceChannelId !== channel.id) {
    try {
      await me.voice.setChannel(channel.id);
    } catch (err) {
      console.warn(`[Athena Prime] Could not move bot via setChannel:`, err.message);
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

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (e) {
        try { connection.destroy(); } catch (_) {}
      }
    });

    // Wait for the connection to be fully ready (up to 10 seconds)
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    console.log(`[Athena Prime] Joined Home VC "${channel.name}" in guild "${guild.name}" via native voice`);

    // Synchronize voice channel status
    updateBotVcStatus(channel).catch(() => null);

    return { success: true, connection };
  } catch (error) {
    console.error(`[Athena Prime] Failed to join Home VC in guild ${guild.name}:`, error);
    try {
      if (connection) connection.destroy();
    } catch (_) {}
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
