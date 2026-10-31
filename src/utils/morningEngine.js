import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from './emojis.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

// ==========================================
// PLEASANT MORNING & THOUGHT OF THE DAY POOL
// ==========================================
export const PLEASANT_QUOTES = [
  "If you lost everything one day , just know how to restart everything",
  "Every sunrise is an invitation to brighten someone's day and write a new chapter.",
  "Focus on making yourself better, not on thinking you are better.",
  "Breathe. Let go. And remind yourself that this very moment is the only one you have for sure.",
  "Peace of mind begins the exact moment you choose not to allow another person or event to control your emotions.",
  "A quiet mind hears what the world misses. Take a calm breath this morning.",
  "Small daily improvements over time lead to stunning, long-term results.",
  "Don't count the days; make the days count.",
  "Your energy introduces you before you even speak. Keep it bright and kind today.",
  "The secret of getting ahead is simply getting started.",
  "You don't have to have it all figured out to move forward with courage.",
  "Sometimes the smallest step in the right direction ends up being the biggest step of your life.",
  "Doubt kills more dreams than failure ever will. Believe in your potential today.",
  "Every morning we are born again. What you do today is what matters most.",
  "Patience is not the ability to wait, but the ability to keep a good attitude while waiting.",
  "Do what you can, with what you have, right where you are.",
  "Kindness in words creates confidence. Kindness in thinking creates profoundness.",
  "Act as if what you do makes a difference. It truly does.",
  "A positive thought in the morning can completely change the trajectory of your day.",
  "Stay close to anything that makes you glad you are alive.",
  "You cannot change the direction of the wind, but you can always adjust your sails.",
  "Happiness is not something ready-made. It comes from your own actions.",
  "Light tomorrow with today's purposeful choices.",
  "Difficult roads often lead to beautiful destinations. Keep walking forward.",
  "Wake up with determination. Go to bed with satisfaction.",
  "The only limit to our realization of tomorrow will be our doubts of today.",
  "Be stubborn about your goals, but flexible about your methods.",
  "A smooth sea never made a skilled sailor. Welcome the challenges of today.",
  "Be the reason someone smiles today. Kindness costs nothing and changes everything.",
  "Your mindset determines your reality. Start today with gratitude and grace.",
  "Give every day the chance to become the most beautiful day of your life.",
  "Don't let yesterday take up too much of today.",
  "Clear your mind of can't. You are capable of remarkable growth.",
  "In the middle of every difficulty lies an opportunity waiting to be embraced.",
  "Energy flows where attention goes. Focus on what brings light and clarity.",
  "When you arise in the morning, think of what a precious privilege it is to be alive.",
  "Quiet progress is still progress. Celebrate how far you've come.",
  "Do not anticipate trouble, or worry about what may never happen. Keep in the sunlight.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Surround yourself with what elevates your peace and sharpens your mind.",
  "Treat everyone with kindness, not because they are nice, but because you are.",
  "The best preparation for tomorrow is doing your best today.",
  "Never ruin a good day by thinking about a bad yesterday.",
  "Make today so wonderful that yesterday gets jealous.",
  "Speak with honesty, think with sincerity, and act with integrity.",
  "There is beauty in simplicity and strength in quiet consistency.",
  "Today is not just another day, it's a new opportunity to restart and flourish.",
  "Gratitude turns what we have into enough, and more.",
  "Let your courage be greater than your fear and your action louder than your words.",
  "Trust the timing of your life. What is meant for you will not pass you by.",
  "The sun is a daily reminder that we too can rise again from the darkness.",
  "One kind word can warm three winter months. Share a warm thought today.",
  "Keep your face always toward the sunshine, and shadows will fall behind you.",
  "Start each day with a grateful heart and an open, peaceful perspective.",
  "You are stronger than your excuses and wiser than your doubts.",
  "Take time to appreciate the journey, not just the destination.",
  "No rain, no flowers. Every challenge today prepares you for tomorrow's bloom.",
  "Be present in all things, and thankful for all things.",
  "The soul usually knows what to do to heal itself. The challenge is to silence the mind.",
  "Smile at strangers, slow down your pace, and welcome today's fresh possibilities."
];

export const MORNING_HEADINGS = [
  "Thought of the day!",
  "Morning Inspiration!",
  "Daily Spark!",
  "Morning Reflection!",
  "Sunrise Wisdom!",
  "Mindful Morning!"
];

/**
 * Returns a random pleasant thought, prioritizing custom server thoughts if provided
 */
export function getRandomThought(customQuotes = []) {
  const pool = Array.isArray(customQuotes) && customQuotes.length > 0 && Math.random() < 0.4
    ? customQuotes
    : PLEASANT_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Builds the sleek, pleasant morning card matching Athena Prime design standards
 */
export function buildMorningPayload(quote, config = {}, guild = null) {
  const accentColor = config.accentColor 
    ? (typeof config.accentColor === 'string' ? parseInt(config.accentColor.replace('#', ''), 16) : config.accentColor)
    : 0x5865F2;

  const headingText = MORNING_HEADINGS[Math.floor(Math.random() * MORNING_HEADINGS.length)];
  const glyph = getRandomHeadingGlyph();

  let pingText = '';
  let content = undefined;
  if (config.ping === 'here') {
    pingText = ' @here';
    content = '@here';
  } else if (config.ping && config.ping !== 'none' && !config.ping.startsWith('@')) {
    // Role ID
    pingText = ` <@&${config.ping}>`;
    content = `<@&${config.ping}>`;
  }

  // Components V2 Payload Container (matching the user's sleek screenshot)
  const container = {
    type: 17,
    accent_color: accentColor,
    components: [
      {
        type: 10,
        content: `# ${glyph} ${headingText}`
      },
      {
        type: 10,
        content: `${quote}`
      },
      {
        type: 14,
        divider: true
      },
      {
        type: 10,
        content: `-# Good Morning${pingText} | Secure`
      }
    ]
  };

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };

  if (content) {
    payload.content = content;
    payload.allowed_mentions = { parse: ['everyone', 'roles'] };
  }

  return payload;
}

/**
 * Resolves the target text channel strictly by ID according to DB rules.
 * 1. Specific channelId in config
 * 2. Most active channel where users chat
 * 3. Fallback: systemChannel or first permitted text channel
 */
export async function getResolvedMorningChannel(guild, config) {
  if (!guild) return null;

  // 1. Explicitly configured channel ID
  if (config.channelId) {
    const chan = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
    if (chan && chan.isTextBased()) {
      const perms = chan.permissionsFor(guild.members.me);
      if (perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages)) {
        return chan;
      }
    }
  }

  // 2. Auto-detect: Most active text channel where users type
  const activeChanId = db.getMostActiveChannelId(guild.id);
  if (activeChanId) {
    const chan = guild.channels.cache.get(activeChanId) || await guild.channels.fetch(activeChanId).catch(() => null);
    if (chan && chan.isTextBased()) {
      const perms = chan.permissionsFor(guild.members.me);
      if (perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages)) {
        return chan;
      }
    }
  }

  // 3. Fallback: System channel
  if (guild.systemChannelId) {
    const sysChan = guild.channels.cache.get(guild.systemChannelId) || await guild.channels.fetch(guild.systemChannelId).catch(() => null);
    if (sysChan && sysChan.isTextBased()) {
      const perms = sysChan.permissionsFor(guild.members.me);
      if (perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages)) {
        return sysChan;
      }
    }
  }

  // 4. Fallback: First text channel where the bot has send permissions
  const fallbackChan = guild.channels.cache.find(c => {
    if (!c.isTextBased() || c.isVoiceBased() || c.isThread()) return false;
    const perms = c.permissionsFor(guild.members.me);
    return perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages);
  });

  return fallbackChan || null;
}

/**
 * Dispatches a pleasant morning message to the guild
 */
export async function dispatchMorningMessage(guild, client, force = false) {
  if (!guild) return { success: false, reason: 'Invalid Guild' };
  const config = db.getMorningConfig(guild.id);
  if (!config.enabled && !force) return { success: false, reason: 'Morning messages disabled for this server' };

  const channel = await getResolvedMorningChannel(guild, config);
  if (!channel) {
    console.warn(`[MorningEngine] No accessible text channel found in ${guild.name} (${guild.id}) to send morning message.`);
    return { success: false, reason: 'No accessible text channel found with send permissions' };
  }

  const quote = getRandomThought(config.customQuotes);
  const payload = buildMorningPayload(quote, config, guild);

  try {
    const sentMsg = await channel.send(payload);
    // Add positive morning reaction
    await sentMsg.react('❤️').catch(() => null);

    // Save channel ID if it was auto-detected so database tracking rules are fulfilled
    if (!config.channelId && channel.id) {
      db.updateMorningConfig(guild.id, { detectedChannelId: channel.id });
    }

    return { success: true, channelId: channel.id, quote, messageId: sentMsg.id };
  } catch (err) {
    console.error(`[MorningEngine] Failed to dispatch morning message in ${guild.name}:`, err);
    return { success: false, reason: err.message };
  }
}

/**
 * Generates a randomized morning time for a specific server for today.
 * Window: 07:00 AM to 10:59 AM (varies per server and per day)
 */
export function generateRandomScheduleForToday(todayStr) {
  const schedHour = 7 + Math.floor(Math.random() * 4); // 7, 8, 9, 10
  const schedMinute = Math.floor(Math.random() * 60);  // 0..59
  return {
    dateStr: todayStr,
    hour: schedHour,
    minute: schedMinute
  };
}

/**
 * Background runner: Checks all servers with morning messages enabled
 * and dispatches at each server's distinct random morning time.
 */
export async function checkAndDispatchAllMorningMessages(client) {
  if (!client || !client.guilds) return;

  const enabledConfigs = db.getAllMorningConfigs();
  if (enabledConfigs.length === 0) return;

  for (const item of enabledConfigs) {
    const guild = client.guilds.cache.get(item.guildId);
    if (!guild) continue;

    const config = db.getMorningConfig(guild.id);
    if (!config || !config.enabled) continue;

    const tz = config.timezone || 'Asia/Kolkata';
    const now = new Date();

    let todayStr = '';
    let currentHour = 0;
    let currentMinute = 0;

    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(now);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      todayStr = `${y}-${m}-${d}`;
    } catch {
      todayStr = now.toISOString().substring(0, 10);
      currentHour = now.getUTCHours();
      currentMinute = now.getUTCMinutes();
    }

    // 1. Check if already dispatched today
    if (config.lastSentDate === todayStr) {
      continue;
    }

    // 2. Ensure server has today's unique random scheduled time
    let scheduled = config.scheduledTimeToday;
    if (!scheduled || scheduled.dateStr !== todayStr) {
      scheduled = generateRandomScheduleForToday(todayStr);
      db.updateMorningConfig(guild.id, { scheduledTimeToday: scheduled });
    }

    // 3. Check if target random time has arrived
    const isDue = (currentHour > scheduled.hour) || (currentHour === scheduled.hour && currentMinute >= scheduled.minute);

    // Only dispatch during morning window (before 12:00 PM)
    if (isDue && currentHour < 12) {
      console.log(`[MorningEngine] Triggering scheduled morning message for "${guild.name}" (${guild.id}) at ${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} (Scheduled: ${String(scheduled.hour).padStart(2, '0')}:${String(scheduled.minute).padStart(2, '0')})`);
      const result = await dispatchMorningMessage(guild, client, false);
      if (result.success) {
        db.updateMorningConfig(guild.id, { lastSentDate: todayStr });
      }
    }
  }
}

let isBroadcasterStarted = false;

/**
 * Starts the background morning ticker (checks every 30 seconds)
 */
export function startMorningBroadcaster(client) {
  if (isBroadcasterStarted) return;
  isBroadcasterStarted = true;

  console.log('[MorningEngine] Morning Thought Broadcaster daemon initialized (30s sweep).');
  // Initial check
  checkAndDispatchAllMorningMessages(client).catch(() => null);

  // Periodic 30-second sweep
  setInterval(() => {
    checkAndDispatchAllMorningMessages(client).catch(() => null);
  }, 30 * 1000);
}
