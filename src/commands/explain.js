import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import db from '../database.js';
import { 
  buildExplainContainer, 
  buildTopicsDirectoryContainer, 
  ARCHITECTURE_TOPICS, 
  DETAILED_COMMANDS 
} from '../utils/explainerRegistry.js';

let commandMapCache = null;
async function getCommandMap() {
  if (!commandMapCache) {
    try {
      const loader = await import('./loader.js');
      commandMapCache = loader.commandMap || loader.default;
    } catch (e) {
      console.error('[explain] Error loading commandMap:', e);
    }
  }
  return commandMapCache;
}

export const commands = [
  {
    name: 'explain',
    aliases: ['explaincmd', 'architecture', 'deepdive', 'howitworks', 'docs'],
    description: 'Deep-dive architectural breakdowns, zero-day exploit analysis, and command mechanics',
    type: 1,
    options: [
      {
        name: 'topic',
        description: 'Command or architecture topic to explain (e.g., security, kick, ban, automod, unbypassable)',
        type: 3,
        required: false,
        autocomplete: true
      }
    ],
    async executePrefix(message, args) {
      try {
        const config = db.getGuildConfig(message.guild.id);
        const prefix = config?.prefix || '!';

        if (args && args.length > 0) {
          const query = args.join(' ').trim();
          const cmdMap = await getCommandMap();
          const container = buildExplainContainer(query, 0, prefix, cmdMap);
          return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const dirContainer = buildTopicsDirectoryContainer(prefix);
        return message.reply({ components: [dirContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        console.error('[Explain Command] executePrefix error:', err);
        return message.reply({ content: '-# <:off:1533844858983157851> An error occurred while retrieving architectural documentation.' });
      }
    },
    async executeSlash(interaction) {
      try {
        const topic = interaction.options?.getString?.('topic');
        if (topic) {
          const cmdMap = await getCommandMap();
          const container = buildExplainContainer(topic, 0, '/', cmdMap);
          return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const dirContainer = buildTopicsDirectoryContainer('/');
        return interaction.reply({ components: [dirContainer], flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        console.error('[Explain Command] executeSlash error:', err);
        return interaction.reply({ content: '-# <:off:1533844858983157851> Failed to render architecture documentation.', flags: MessageFlags.Ephemeral });
      }
    },
    async autocomplete(interaction) {
      try {
        const focusedValue = interaction.options.getFocused().toLowerCase().trim();
        const choices = [
          { name: 'DEFCON: 5-Tier Defense Matrix & Batched Panic Architecture', value: 'defcon' },
          { name: 'Command: !dashboard (All-Inclusive War-Room Command Center)', value: 'defcon' },
          { name: 'Command: !panic / !emergency (Emergency Server Blackout)', value: 'defcon' },
          { name: 'Command: !lockdown (Tier 1-3 Batched Channel Lockdown)', value: 'lockdown' },
          { name: 'AI Guide: Neural Architecture & Action Buttons', value: 'athena' },
          { name: 'AI Announcement: Neural Studio & Custom Emojis', value: 'aiannounce' },
          { name: 'Security: Zero-Day & Linked Role Exploits', value: 'security' },
          { name: 'Persistence: Unbypassable Sentinel Roles', value: 'unbypassable' },
          { name: 'Onboarding: Neutralize Dangerous Prompt Roles', value: 'onboarding' },
          { name: 'Command: !aiannounce (AI Announcement Studio)', value: 'aiannounce' },
          { name: 'Command: !athena (AI Specialist & Guide)', value: 'athena' },
          { name: 'Command: !ask (Conversational AI Engine)', value: 'ask' },
          { name: 'Command: !aimode (Dedicated Chat Channel)', value: 'aimode' },
          { name: 'Voice: Voice Grid Control & Channel Drag', value: 'voice' },
          { name: 'Automod: Multi-Tier Filter & Regex Engine', value: 'automod' },
          { name: 'Moderation: Rogue Admin & Mass Action Defense', value: 'moderation' },
          { name: 'Quarantine: Zero-Trust Containment & Role Strip', value: 'quarantine' },
          { name: 'CloudSync: Encrypted Backup & 1-Click Restore', value: 'cloudsync' },
          { name: 'Auth: Three-Tier Role Authorization Matrix', value: 'auth' },
          { name: 'Heuristics: Adaptive Profiling & Threat Signatures', value: 'learn' },
          { name: 'Command: !learn (Heuristic Antinuke Profiling)', value: 'learn' },
          { name: 'Command: !antinuke (Defense Panel & Wiretap)', value: 'antinuke' },
          { name: 'Command: !unbypassable (Sentinel Persistence)', value: 'unbypassable' },
          { name: 'Command: !vcdrag (Voice Loop Drag Engine)', value: 'vcdrag' },
          { name: 'Command: !massmove (Atomic Voice Relocation)', value: 'massmove' },
          { name: 'Command: !massdc (Mass Voice Disconnection)', value: 'massdc' },
          { name: 'Command: !muteall (Voice Grid Mute Engine)', value: 'muteall' },
          { name: 'Command: !deafenall (Voice Grid Deafen Engine)', value: 'deafenall' },
          { name: 'Command: !kick (Hierarchy Kick Engine)', value: 'kick' },
          { name: 'Command: !ban (Mass Ban & Wiretap Eviction)', value: 'ban' },
          { name: 'Command: !timeout (Gateway Duration Mute)', value: 'timeout' },
          { name: 'Command: !purge (Atomic Message Deletion)', value: 'purge' },
          { name: 'Command: !slowmode (Channel Velocity Rate Limit)', value: 'slowmode' },
          { name: 'Command: !nuke (Channel Clone & Nuclear Wipe)', value: 'nuke' },
          { name: 'Command: !lock / !unlock (Channel Isolation & ACL)', value: 'lock' },
          { name: 'Command: !addrole / !removerole (Role Assignment)', value: 'addrole' },
          { name: 'Command: !striproles (Mass Demotion Defense)', value: 'striproles' },
          { name: 'Command: !autorole (Join-Time Role Provisioning)', value: 'autorole' },
          { name: 'Command: !firewall (Live Gateway Telemetry)', value: 'firewall' },
          { name: 'Command: !neutralizeonboarding (Onboarding Audit)', value: 'neutralizeonboarding' },
          { name: 'Command: !panic (Instant Server Lockdown)', value: 'panic' },
          { name: 'Command: !scanserver (Dangerous Permissions Audit)', value: 'scanserver' },
          { name: 'Command: !setup (ID-Backed Resource Binding)', value: 'setup' },
          { name: 'Command: !backup / !restore (Cloud Snapshot Serialization)', value: 'backup' },
          { name: 'Command: !db (Database Cloud Sync & Recovery)', value: 'db' },
          { name: 'Command: !honeypot (Ghost Honeypot Sentinel)', value: 'honeypot' },
          { name: 'Command: !decapitate (Webhook Decapitation Engine)', value: 'decapitate' },
          { name: 'Command: !timemachine (Time-Machine Delta Rollback)', value: 'timemachine' },
          { name: 'Command: !exploitscan (Server Permission Exploit Scanner)', value: 'exploitscan' },
          { name: 'Command: !dualkey (Dual-Key Nuclear Authorizations)', value: 'dualkey' }
        ];

        const filtered = choices
          .filter(c => c.name.toLowerCase().includes(focusedValue) || c.value.toLowerCase().includes(focusedValue))
          .slice(0, 25);

        return interaction.respond(filtered);
      } catch (e) {
        return interaction.respond([]);
      }
    }
  }
];

/**
 * Global persistent interaction handler for Architecture & Explain menus.
 */
export async function handleExplainInteraction(interaction) {
  try {
    const customId = interaction.customId;
    if (!customId) return false;

    const prefix = db.getGuildConfig(interaction.guild?.id)?.prefix || '!';

    // 1. Close button
    if (customId === 'arch_close') {
      await interaction.message?.delete().catch(() => null);
      return true;
    }

    // 2. Return to Topics Directory
    if (customId === 'arch_home') {
      const container = buildTopicsDirectoryContainer(prefix);
      await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // 3. Topic selection from dropdown
    if (customId === 'arch_select_topic' && interaction.isStringSelectMenu()) {
      const selected = interaction.values[0];
      const cmdMap = await getCommandMap();
      const container = buildExplainContainer(selected, 0, prefix, cmdMap);
      await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // 4. Topic selection from direct buttons (e.g. arch_topic_security)
    if (customId.startsWith('arch_topic_')) {
      const topicId = customId.replace('arch_topic_', '');
      const cmdMap = await getCommandMap();
      const container = buildExplainContainer(topicId, 0, prefix, cmdMap);
      await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // 5. Section pagination (e.g. arch_page_security_1)
    if (customId.startsWith('arch_page_')) {
      const parts = customId.split('_'); // ['arch', 'page', topicId, pageIndex]
      const topicId = parts[2];
      const pageIndex = parseInt(parts[3], 10) || 0;
      const cmdMap = await getCommandMap();
      const container = buildExplainContainer(topicId, pageIndex, prefix, cmdMap);
      await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    // 6. Inspect command from deep-dive button (e.g. arch_cmd_unbypassable)
    if (customId.startsWith('arch_cmd_')) {
      const cmdName = customId.replace('arch_cmd_', '');
      const cmdMap = await getCommandMap();
      const container = buildExplainContainer(cmdName, 0, prefix, cmdMap);
      await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    return false;
  } catch (err) {
    console.error('[handleExplainInteraction] Error:', err);
    return false;
  }
}

export default commands;
