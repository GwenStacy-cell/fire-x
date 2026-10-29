import { PermissionFlagsBits, ChannelType } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

const DEFAULT_STATUSES = [

  "<a:Star2:1516523061468205227> **Quiet corner under the moon**",
  "<a:a_fheartSpinWhite:1533844790314143955> **Stay awhile stay cozy**",
  "<a:st_Ghost:1543537892717105212> **Within {guild}'s dreamy garden**",
  "<a:redrose:1539251705579966557> **Lost in the clouds**",
  "<:Dark4luvontop:1533860091818803242> **Making memories**",
  "<a:ArrowHeart:1544688958196158525> **Vibing to the rhythm**",
  "<a:Star2:1516523061468205227> **Late night thoughts**",
  "<a:a_fheartSpinWhite:1533844790314143955> **Safe space**",
  "<a:st_Ghost:1543537892717105212> **Chasing cherry blossom dreams**",
  "<a:redrose:1539251705579966557> **Welcome to the heart of {guild}**",
  "<:Dark4luvontop:1533860091818803242> **Elevating the standard at {guild}**",
  "<a:ArrowHeart:1544688958196158525> **{guild} Exclusive lounge**",
  "<a:Star2:1516523061468205227> **Unwinding in {guild}'s sanctuary**",
  "<a:a_fheartSpinWhite:1533844790314143955> **Connecting minds across {guild}**",
  "<a:st_Ghost:1543537892717105212> **{guild} After hours**",
  "<a:redrose:1539251705579966557> **Finding focus in {guild}**",
  "<:Dark4luvontop:1533860091818803242> **{guild}'s creative studio**",
  "<a:ArrowHeart:1544688958196158525> **Building the future of {guild}**",
  "<a:Star2:1516523061468205227> **The official {guild} hangout**",
  "<a:a_fheartSpinWhite:1533844790314143955> **Networking within {guild}**",
  "<a:st_Ghost:1543537892717105212> **{guild} Community broadcast**",
  "<a:redrose:1539251705579966557> **Brainstorming at {guild}**",
  "<:Dark4luvontop:1533860091818803242> **{guild} Elite circle**",
  "<a:ArrowHeart:1544688958196158525> **Relaxing in {guild}'s atmosphere**",
  "<a:Star2:1516523061468205227> **Where {guild} comes to life**",
  "<a:a_fheartSpinWhite:1533844790314143955> **{guild} VIP Section**",
  "<a:st_Ghost:1543537892717105212> **Excellence powered by {guild}**",
  "<a:redrose:1539251705579966557> **{guild}'s midnight cafeé**",
  "<:Dark4luvontop:1533860091818803242> **Chilling in {guild}'s orbit**",
  "<a:ArrowHeart:1544688958196158525> **The {guild} collective**",
  "<a:Star2:1516523061468205227> **{guild} Study and focus**",
  "<a:a_fheartSpinWhite:1533844790314143955> **Engaging with {guild}**",
  "<a:st_Ghost:1543537892717105212> **{guild}'s hidden retreat**",
  "<a:ArrowHeart:1544688958196158525> **Will You Still Love Me When I'm No Longer, Young & Beautiful ?**"
];

function getRandomStatus(guild, customStatuses) {
  const pool = (customStatuses && customStatuses.length > 0) ? customStatuses : DEFAULT_STATUSES;
  const raw = pool[Math.floor(Math.random() * pool.length)];
  return raw.replace(/{guild}/g, guild.name);
}

export const commands = [
  {
    name: 'autovcstatus',
    description: 'Manage random aesthetic VC statuses [Extra Owner]',
    aliases: ['vcstatusauto', 'randomvc'],
    category: 'voice',
    permissions: [PermissionFlagsBits.Administrator],
    async executePrefix(message, args) {
      const guildId = message.guild.id;
      const cfg = db.getGuildConfig(guildId) || {};
      const action = args[0]?.toLowerCase();

      if (!action) {
        return message.reply(cv2.warn('Auto VC Status', [
          '**Usage:**',
          '`!autovcstatus on` - Enable and shuffle all VCs',
          '`!autovcstatus off` - Disable and clear all VC statuses',
          '`!autovcstatus shuffle` - Manually reshuffle all VCs',
          '`!autovcstatus add <status>` - Add a custom status (supports custom emojis)',
          '`!autovcstatus remove <index>` - Remove a custom status',
          '`!autovcstatus list` - View custom statuses',
          '',
          `**Current State:** ${cfg.autoVcStatus ? '<:on:1533844867191406672> Enabled' : '<:off:1533844858983157851> Disabled'}`
        ].join('\n')));
      }

      const customStatuses = cfg.customVcStatuses || [];
      const pool = (customStatuses && customStatuses.length > 0) ? customStatuses : DEFAULT_STATUSES;

      if (action === 'on' || action === 'shuffle') {
        if (action === 'on') db.updateGuildConfig(guildId, { autoVcStatus: true });
        if (action === 'shuffle' && !cfg.autoVcStatus) return message.reply(cv2.warn('Disabled', 'Enable the feature first with `!autovcstatus on`.'));
        
        const m = await message.reply(cv2.success(action === 'on' ? 'Enabled' : 'Shuffling', '<a:loading:1542155051286396938> Sweeping voice channels now...'));
        
        // Sweep all VCs
        await message.guild.channels.fetch();
        const vcs = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
        const homeVcId = cfg.homeVcId; // Protect home VC
        
        // Shuffle pool so VCs get unique statuses
        const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
        let index = 0;
        let updated = 0;
        
        const botVcId = message.guild.members.me?.voice?.channelId;
        for (const vc of vcs.values()) {
          // Protect home VC, bot's current VC, and any VC explicitly named "home"
          if (vc.id === homeVcId || vc.id === botVcId || vc.name.toLowerCase().includes('home')) continue;
          
          try {
            const rawStatus = shuffledPool[index % shuffledPool.length];
            const newStatus = rawStatus.replace(/{guild}/g, message.guild.name).substring(0, 500);
            index++;
            
            if (typeof vc.setVoiceStatus === 'function') {
              await vc.setVoiceStatus(newStatus);
            } else {
              await message.client.rest.put(`/channels/${vc.id}/voice-status`, { body: { status: newStatus } });
            }
            updated++;
            await new Promise(r => setTimeout(r, 800)); // Rate limit protection
          } catch (e) {
            console.error(`Failed to set VC status for ${vc.id}:`, e.message);
          }
        }
        
        return m.edit(cv2.success(action === 'on' ? 'Enabled' : 'Shuffled', `Set unique statuses for **${updated}** voice channels.\n-# Statuses are stored on Discord's backend and will appear once a member joins each VC.`)).catch(()=>null);
      }

      if (action === 'off') {
        db.updateGuildConfig(guildId, { autoVcStatus: false });
        const m = await message.reply(cv2.success('Disabled', '<a:loading:1542155051286396938> Auto VC Status disabled. Clearing statuses from all voice channels...'));
        
        await message.guild.channels.fetch();
        const vcs = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);
        const homeVcId = cfg.homeVcId;
        
        let cleared = 0;
        for (const vc of vcs.values()) {
          if (vc.id === homeVcId || vc.name.toLowerCase().includes('home')) continue;
          
          try {
            if (typeof vc.setVoiceStatus === 'function') {
              await vc.setVoiceStatus(null);
            } else {
              await message.client.rest.put(`/channels/${vc.id}/voice-status`, { body: { status: null } });
            }
            cleared++;
            await new Promise(r => setTimeout(r, 800));
          } catch(e) {}
        }
        
        return m.edit(cv2.success('Disabled', `Auto VC Status disabled. Cleared statuses from **${cleared}** voice channels.`)).catch(()=>null);
      }

      if (action === 'add') {
        const text = args.slice(1).join(' ');
        if (!text) return message.reply(cv2.warn('Usage', 'Provide the status text/emojis. Example: `!autovcstatus add <:myemoji:123> **chill zone**`'));
        if (text.length > 500) return message.reply(cv2.danger('Error', 'Status too long (max 500 chars).'));
        
        customStatuses.push(text);
        db.updateGuildConfig(guildId, { customVcStatuses: customStatuses });
        return message.reply(cv2.success('Added', `Added to rotation:\n> ${text}`));
      }

      if (action === 'remove' || action === 'delete') {
        const idx = parseInt(args[1]) - 1;
        if (isNaN(idx) || idx < 0 || idx >= customStatuses.length) {
          return message.reply(cv2.warn('Error', 'Invalid index. Check `!autovcstatus list`.'));
        }
        
        const removed = customStatuses.splice(idx, 1);
        db.updateGuildConfig(guildId, { customVcStatuses: customStatuses });
        return message.reply(cv2.success('Removed', `Removed from rotation:\n> ${removed[0]}`));
      }

      if (action === 'list') {
        if (customStatuses.length === 0) {
          return message.reply(cv2.info('Status Pool', 'You are currently using the default aesthetic status pool. Add your own with `!autovcstatus add`.'));
        }
        
        const list = customStatuses.map((s, i) => `**${i + 1}.** ${s}`).join('\n');
        return message.reply(cv2.info('Custom Status Pool', list));
      }
      
      return message.reply(cv2.warn('Unknown Action', 'Valid actions: `on`, `off`, `shuffle`, `add`, `remove`, `list`'));
    }
  }
];

export { getRandomStatus };
