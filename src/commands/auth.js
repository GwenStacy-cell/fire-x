import { ActionRowBuilder, RoleSelectMenuBuilder } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

function buildAuthPayload(guildId) {
  const authRoles = db.getAuthRoles(guildId);
  
  const adminIds = authRoles.admin.length ? authRoles.admin.map(id => `<@&${id}>`).join(', ') : 'None Bound';
  const modIds = authRoles.mod.length ? authRoles.mod.map(id => `<@&${id}>`).join(', ') : 'None Bound';
  const staffIds = authRoles.staff.length ? authRoles.staff.map(id => `<@&${id}>`).join(', ') : 'None Bound';

  const adminSelect = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('auth_select_admin')
      .setPlaceholder('Bind Admin Roles')
      .setMinValues(0)
      .setMaxValues(10)
  );

  const modSelect = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('auth_select_mod')
      .setPlaceholder('Bind Mod Roles')
      .setMinValues(0)
      .setMaxValues(10)
  );

  const staffSelect = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('auth_select_staff')
      .setPlaceholder('Bind Staff Roles')
      .setMinValues(0)
      .setMaxValues(10)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 9,
        components: [
          { type: 10, content: `## Role Authorization Tiers\n\n-# **Admin Tier:** Bypasses \`isAuthorized()\`, granting full root access to the entire bot, including module setups and security dashboard configuration.\n-# **Mod Tier:** Grants access to intermediate moderation commands.\n-# **Staff Tier:** Grants access to basic moderation commands.\n\n-# <:tickred:1533860144822358178> **Tip:** Users can run \`!tier\` to check their clearance level.` }
        ],
        accessory: { type: 11, media: { url: 'https://cdn.discordapp.com/emojis/1525429906102816788.webp?size=128&quality=lossless' } }
      },
      { type: 14, divider: true },
      { type: 10, content: `### Admin Tier Roles\n-# **Examples:** \`!security\`, \`!ban\`, \`!massaddrole\`, \`!syncall\`\n-# **Bound Roles:** ${adminIds}` },
      adminSelect.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `### Mod Tier Roles\n-# **Examples:** \`!kick\`, \`!timeout\`, \`!purge\`\n-# **Bound Roles:** ${modIds}` },
      modSelect.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `### Staff Tier Roles\n-# **Examples:** \`!warn\`, \`!mute\`, \`!deafen\`, \`!slowmode\`\n-# **Bound Roles:** ${staffIds}` },
      staffSelect.toJSON()
    ]
  };

  return {
    content: "",
    components: [container],
    flags: 32768 // MessageFlags.IsComponentsV2
  };
}

export const commands = [
  {
    name: 'auth',
    description: 'Manage role authorization tiers (Admin, Mod, Staff).',
    aliases: ['tiers', 'authtiers', 'setauth'],
    category: 'security',
    executePrefix: async (message, args) => {
      const { isServerAdmin } = await import('../utils/helpers.js');
      if (!isServerAdmin(message.member, message.guild.id)) {
        return message.reply(cv2.danger('Access Denied', 'Only Extra Owners or the Server Owner can manage Authorization Tiers.')).catch(()=>null);
      }
      const payload = buildAuthPayload(message.guild.id);
      await message.reply(payload);
    }
  }
];

export { buildAuthPayload };
