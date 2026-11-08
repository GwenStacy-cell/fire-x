import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import { buildLiveOpsPanel } from '../utils/liveOpsMonitor.js';

export const commands = [
  {
    name: 'liveops',
    aliases: ['livemonitor', 'telemetry', 'sysmon', 'matrixmon', 'perfmon', 'mon'],
    description: 'Real-time live operational monitor with speeds, latencies, antinuke matrix, and daemon metrics',
    category: 'utility',
    options: [
      {
        name: 'view',
        description: 'Specific metric subsystem to monitor',
        type: 3,
        required: false,
        choices: [
          { name: '⚡ Master Overview', value: 'overview' },
          { name: '🚀 Speed & Latency Deep-Dive', value: 'speed' },
          { name: '🛡️ Antinuke & Defense Matrix', value: 'antinuke' },
          { name: '🔊 Voice Matrix & SFX Deck', value: 'voice' },
          { name: '📡 Daemons & Automation', value: 'daemons' }
        ]
      }
    ],

    async executePrefix(message, args) {
      const rawArg = (args[0] || 'overview').toLowerCase();
      let activeView = 'overview';
      if (['speed', 'latency', 'perf', 'ping', 'bench'].includes(rawArg)) activeView = 'speed';
      else if (['antinuke', 'security', 'shield', 'defense', 'sec'].includes(rawArg)) activeView = 'antinuke';
      else if (['voice', 'sound', 'sfx', 'radio', 'vc'].includes(rawArg)) activeView = 'voice';
      else if (['daemons', 'daemon', 'jobs', 'watchers', 'git'].includes(rawArg)) activeView = 'daemons';

      const payload = await buildLiveOpsPanel(message.guild, message.client, activeView);
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      await interaction.deferReply();
      const activeView = interaction.options.getString('view') || 'overview';
      const payload = await buildLiveOpsPanel(interaction.guild, interaction.client, activeView);
      return interaction.editReply(payload);
    }
  }
];
