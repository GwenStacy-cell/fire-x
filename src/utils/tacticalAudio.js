import { AttachmentBuilder } from 'discord.js';
import { generateVoiceAudio } from './ttsVoiceEngine.js';

export const TACTICAL_DISPATCH_SCRIPTS = {
  defcon1: 'Commander! Emergency blackout protocol initiated! All public channels have been hidden and isolated, and verification shields are at maximum! Server is under total lockdown defense!',
  panic: 'Commander! Emergency blackout protocol engaged! All public channels have been isolated and verification shields elevated! Athena Prime is guarding the server!',
  unpanic: 'Commander! Emergency blackout has been resolved! All channels and roles have been restored to normal operations! Everything is safe now!',
  lockdown_tier1: 'Commander! Tier 1 soft lockdown engaged! Chat messages and voice communications are now restricted for all members!',
  lockdown_tier2: 'Commander! Tier 2 lockdown engaged! Media attachments, reactions, and application commands are disabled, and raid mode is armed!',
  lockdown_tier3: 'Commander! Tier 3 nuclear blackout engaged! Total server darkness deployed, all channels are isolated!',
  unlockdown: 'Commander! Server lockdown has been lifted! Channel permissions have been restored from database snapshots, and operations are back online!',
  raidmode_on: 'Warning Commander! Server raid mode armed! Join velocity thresholds are active and incoming accounts are being quarantined!',
  security_enable_all: 'Athena Prime Defense Matrix online! All perimeter shields locked and 32 security modules armed, Commander!'
};

/**
 * Synthesizes a high-tech tactical military audio dispatch buffer.
 * @param {string} text - Dispatch text
 * @param {string} voiceKey - Voice profile (defaults to 'tactical')
 * @returns {Promise<Buffer|null>}
 */
export async function generateTacticalDispatchBuffer(text, voiceKey = 'tactical') {
  try {
    const buffer = await generateVoiceAudio(text, voiceKey, 'en');
    return buffer || null;
  } catch (err) {
    console.error('[TacticalAudio] Synthesis error:', err.message);
    return null;
  }
}

/**
 * Creates an MP3 AttachmentBuilder for embedding in text channels or embeds.
 * @param {string} text - Dispatch text
 * @param {string} filename - Attachment filename
 * @param {string} voiceKey - Voice profile
 * @returns {Promise<AttachmentBuilder|null>}
 */
export async function createTacticalDispatchAttachment(text, filename = 'tactical_dispatch.mp3', voiceKey = 'tactical') {
  try {
    const buffer = await generateTacticalDispatchBuffer(text, voiceKey);
    if (!buffer || buffer.length === 0) return null;
    return new AttachmentBuilder(buffer, { name: filename, description: text.slice(0, 100) });
  } catch (err) {
    console.error('[TacticalAudio] Attachment error:', err.message);
    return null;
  }
}

/**
 * Connects and plays a tactical voice briefing in VC if the executor is connected to a Voice Channel.
 * @param {GuildMember} member - Moderator or executor member
 * @param {string} text - Briefing script
 * @param {string} voiceKey - Voice profile
 * @returns {Promise<{ spokenInVc: boolean, channelId: string|null }>}
 */
export async function dispatchTacticalAudioToVc(member, text, voiceKey = 'tactical') {
  if (!member || !member.voice?.channel) {
    return { spokenInVc: false, channelId: null };
  }

  try {
    const { queueTtsMessage } = await import('../commands/tts.js');
    const success = await queueTtsMessage(member, text, voiceKey);
    return { spokenInVc: Boolean(success), channelId: member.voice.channel.id };
  } catch (err) {
    console.error('[TacticalAudio] VC dispatch error:', err.message);
    return { spokenInVc: false, channelId: null };
  }
}
