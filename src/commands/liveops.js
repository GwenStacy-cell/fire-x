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
          { name: 'V8 Runtime and Kernel', value: 'runtime' },
          { name: 'Speed and Latencies', value: 'speed' },
          { name: 'Antinuke and Heuristics', value: 'antinuke' },
          { name: 'Command Telemetry', value: 'commands' },
          { name: 'Storage and Daemons', value: 'storage' }
        ]
      }
    ],

    async executePrefix(message, args) {
      const rawArg = (args[0] || 'overview').toLowerCase();
      let activeView = 'overview';
      if (['runtime', 'v8', 'elu', 'kernel', 'cpu', 'memory', 'mem'].includes(rawArg)) activeView = 'runtime';
      else if (['speed', 'latency', 'perf', 'ping', 'bench'].includes(rawArg)) activeView = 'speed';
      else if (['antinuke', 'security', 'shield', 'defense', 'sec', 'ring', 'heuristic'].includes(rawArg)) activeView = 'antinuke';
      else if (['cmd', 'cmds', 'command', 'commands', 'telemetry'].includes(rawArg)) activeView = 'commands';
      else if (['storage', 'db', 'data', 'disk', 'database', 'records', 'daemons', 'daemon', 'voice', 'sound', 'sfx', 'radio', 'vc', 'jobs', 'watchers', 'git'].includes(rawArg)) activeView = 'storage';

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
