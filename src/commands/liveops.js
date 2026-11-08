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
          { name: 'Master Overview', value: 'overview' },
          { name: 'Command Telemetry', value: 'commands' },
          { name: 'Speed and Latencies', value: 'speed' },
          { name: 'Antinuke Matrix', value: 'antinuke' },
          { name: 'Database Records', value: 'database' },
          { name: 'Daemons and Voice', value: 'daemons' }
        ]
      }
    ],

    async executePrefix(message, args) {
      const rawArg = (args[0] || 'overview').toLowerCase();
      let activeView = 'overview';
      if (['cmd', 'cmds', 'command', 'commands', 'telemetry'].includes(rawArg)) activeView = 'commands';
      else if (['speed', 'latency', 'perf', 'ping', 'bench'].includes(rawArg)) activeView = 'speed';
      else if (['antinuke', 'security', 'shield', 'defense', 'sec'].includes(rawArg)) activeView = 'antinuke';
      else if (['database', 'db', 'data', 'storage', 'records'].includes(rawArg)) activeView = 'database';
      else if (['daemons', 'daemon', 'voice', 'sound', 'sfx', 'radio', 'vc', 'jobs', 'watchers', 'git'].includes(rawArg)) activeView = 'daemons';

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
