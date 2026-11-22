export const commands = [
  {
    name: 'si',
    aliases: ['s-info', 'ginfo'],
    description: 'Displays comprehensive server statistics and security status.',
    category: 'utility',
    async executePrefix(message, args) {
      const { commands: secCmds } = await import('./security.js');
      const sinfoCmd = secCmds.find(c => c.name === 'serverinfo');
      if (sinfoCmd) return sinfoCmd.executePrefix(message, args);
    },
    async executeSlash(interaction) {
      const { commands: secCmds } = await import('./security.js');
      const sinfoCmd = secCmds.find(c => c.name === 'serverinfo');
      if (sinfoCmd) return sinfoCmd.executeSlash(interaction);
    }
  }
];
