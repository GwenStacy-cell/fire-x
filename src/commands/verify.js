import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

export const commands = [
  {
    name: 'verify',
    description: 'Configure server verification gate with Button, Graphic CAPTCHA, or Math challenges',
    type: 1, // CHAT_INPUT
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'setup',
        description: 'Deploy the verification panel to the current channel',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'role',
            description: 'The role ID or mention to grant upon verification',
            type: 3, // STRING
            required: true
          },
          {
            name: 'mode',
            description: 'Verification challenge type',
            type: 3,
            required: false,
            choices: [
              { name: 'Standard Button Verification', value: 'button' },
              { name: 'Graphic Image CAPTCHA (Zero false positives)', value: 'captcha' },
              { name: 'Arithmetic Math Challenge', value: 'math' }
            ]
          }
        ]
      },
      {
        name: 'mode',
        description: 'Switch the active verification challenge type',
        type: 1,
        options: [
          {
            name: 'type',
            description: 'Challenge mechanism',
            type: 3,
            required: true,
            choices: [
              { name: 'Standard Button Verification', value: 'button' },
              { name: 'Graphic Image CAPTCHA (Zero false positives)', value: 'captcha' },
              { name: 'Arithmetic Math Challenge', value: 'math' }
            ]
          }
        ]
      },
      {
        name: 'disable',
        description: 'Disable the verification system and remove the panel',
        type: 1 // SUB_COMMAND
      }
    ],

    async executePrefix(message, args) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply(cv2.danger('Access Denied', 'Administrator permissions required to configure verification.'));
      }
      const sub = args[0]?.toLowerCase();

      if (sub === 'disable') {
        const verifyData = db.getVerification(message.guild.id);
        if (verifyData.messageId && verifyData.channelId) {
          try {
            const channel = message.guild.channels.cache.get(verifyData.channelId);
            if (channel) {
              const msg = await channel.messages.fetch(verifyData.messageId).catch(() => null);
              if (msg) await msg.delete().catch(() => null);
            }
          } catch {}
        }
        db.deleteVerification(message.guild.id);
        return message.reply(cv2.success('Verification Disabled', 'The verification gate has been dismantled.'));
      }

      if (sub === 'mode') {
        const newMode = args[1]?.toLowerCase();
        if (!['button', 'captcha', 'math'].includes(newMode)) {
          return message.reply(cv2.warn('Invalid Mode', 'Valid modes: `button`, `captcha`, or `math`.'));
        }
        const verifyData = db.getVerification(message.guild.id);
        if (!verifyData || !verifyData.roleId) {
          return message.reply(cv2.warn('Not Configured', 'Please deploy the verification panel first using `!verify setup <@role>`.'));
        }
        db.updateVerification(message.guild.id, { mode: newMode });
        return message.reply(cv2.success('Verification Mode Updated', `Authentication mode has been switched to **${newMode.toUpperCase()}**.`));
      }

      if (sub === 'setup' || message.mentions.roles.first() || /^\d{17,20}$/.test(args[0])) {
        const roleArg = sub === 'setup' ? args[1] : args[0];
        const modeArg = (sub === 'setup' ? args[2] : args[1])?.toLowerCase() || 'button';
        const mode = ['button', 'captcha', 'math'].includes(modeArg) ? modeArg : 'button';

        const roleId = roleArg?.replace(/[<@&>]/g, '');
        const role = message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          return message.reply(cv2.danger('Role Not Found', 'Please provide a valid Role mention or ID: `!verify setup <@role> [button|captcha|math]`'));
        }

        const rawPayload = {
          content: "",
          components: [
            {
              type: 17,
              components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} **System Authentication**\n\n-# **Welcome to the server! Access to standard channels is currently restricted.**\n-# **To gain entry, you must verify your identity by clicking the authentication button below.**\n\n<:info_jtc:1524111455404953663> **__Authentication Details__**\n-# **\u2022 Verification Challenge: ${mode.toUpperCase()}**\n-# **\u2022 Role Granted: ${role.name}**\n-# **\u2022 Blocks automated bot raids and malicious accounts.**` }]
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: "verify_button",
                  label: "Authenticate Identity",
                  style: 2,
                  emoji: { id: "1524120618864214206" }
                }
              ]
            }
          ],
          flags: 32768
        };

        const panelMsg = await message.channel.send(rawPayload);
        db.updateVerification(message.guild.id, {
          roleId: role.id,
          messageId: panelMsg.id,
          channelId: message.channel.id,
          mode
        });

        return message.reply(cv2.success(
          'Verification Panel Deployed',
          `Verification panel deployed to <#${message.channel.id}> in **${mode.toUpperCase()}** mode.\n-# Members completing verification will receive <@&${role.id}>.`
        ));
      }

      return message.reply(cv2.info(
        'Verification System',
        'Usage Instructions:\n' +
        '-# ${BULLET_EMOJI} `!verify setup <@role> [button|captcha|math]` - Deploy verification panel\n' +
        '-# ${BULLET_EMOJI} `!verify mode <button|captcha|math>` - Switch challenge type\n' +
        '-# ${BULLET_EMOJI} `!verify disable` - Dismantle verification panel'
      ));
    },

    async executeSlash(interaction) {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === 'mode') {
        const newMode = interaction.options.getString('type');
        const verifyData = db.getVerification(guildId);
        if (!verifyData || !verifyData.roleId) {
          return interaction.reply(cv2.e.warn('Not Configured', 'Please deploy the verification panel first using `/verify setup`.'));
        }
        db.updateVerification(guildId, { mode: newMode });
        return interaction.reply(cv2.success('Verification Mode Updated', `Authentication mode has been switched to **${newMode.toUpperCase()}**.`));
      }

      if (subcommand === 'setup') {
        await interaction.deferReply();
        const mode = interaction.options.getString('mode') || 'button';
        const roleOption = interaction.options.get('role');
        let role = null;
        
        if (roleOption?.role) {
          role = roleOption.role;
        } else if (roleOption?.value && typeof roleOption.value === 'string') {
          const roleInput = roleOption.value.replace(/[<@&>]/g, '');
          role = interaction.guild.roles.cache.get(roleInput) || await interaction.guild.roles.fetch(roleInput).catch(() => null);
        }
        
        if (!role) {
          return interaction.editReply(cv2.danger('Role Not Found', 'Could not find a valid role. Make sure to provide a valid Role ID or mention.'));
        }
        
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.editReply(cv2.danger('Permission Error', `I cannot assign ${role} because it is higher than or equal to my highest role!`));
        }

        const rawPayload = {
          content: "",
          components: [
            {
              type: 17,
              components: [{ type: 10, content: `# ${getRandomHeadingGlyph()} **System Authentication**\n\n-# **Welcome to the server! Access to standard channels is currently restricted.**\n-# **To gain entry, you must verify your identity by clicking the authentication button below.**\n\n<:info_jtc:1524111455404953663> **__Authentication Details__**\n-# **\u2022 Verification Challenge: ${mode.toUpperCase()}**\n-# **\u2022 Role Granted: ${role.name}**\n-# **\u2022 Blocks automated bot raids and malicious accounts.**` }]
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  custom_id: "verify_button",
                  label: "Authenticate Identity",
                  style: 2,
                  emoji: { id: "1524120618864214206" }
                }
              ]
            }
          ],
          flags: 32768
        };

        const msg = await interaction.channel.send(rawPayload);

        db.updateVerification(guildId, {
          roleId: role.id,
          messageId: msg.id,
          channelId: interaction.channel.id,
          mode
        });

        const promptPayload = {
          content: "",
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} **Verification Panel Deployed!**\n\n-# **The panel is live in ${mode.toUpperCase()} mode. Users clicking the button will receive ${role}.**\n\n**Would you like Athena Prime to automatically configure the server permissions for you?**\n\n-# **If you select Auto-Configure, I will:**\n-# **• Disable \`View Channels\` globally for \`@everyone\`.**\n-# **• Disable \`View Channels\` for all roles assigned in Onboarding.**\n-# **• Enable \`View Channels\` globally for the ${role} role.**\n-# **• Make sure this verification channel remains visible to everyone.**`
                },
                { type: 14, divider: true },
                { type: 10, content: '-# **Athena Bulletproof Security Matrix**' }
              ]
            },
            {
              type: 1,
              components: [
                { type: 2, custom_id: 'auto_conf', label: 'Auto-Configure', style: 3 },
                { type: 2, custom_id: 'manual_conf', label: 'I\'ll do it manually', style: 2 }
              ]
            }
          ],
          flags: 32768
        };

        const promptMsg = await interaction.editReply(promptPayload);

        const filter = i => i.user.id === interaction.user.id && ['auto_conf', 'manual_conf'].includes(i.customId);
        try {
          const response = await promptMsg.awaitMessageComponent({ filter, time: 60000 });
          
          if (response.customId === 'auto_conf') {
            await response.deferUpdate();
            try {
              const everyone = interaction.guild.roles.everyone;
              await everyone.setPermissions(everyone.permissions.remove(PermissionFlagsBits.ViewChannel));
              await role.setPermissions(role.permissions.add(PermissionFlagsBits.ViewChannel));
              await interaction.channel.permissionOverwrites.edit(everyone, { ViewChannel: true });
              
              const rulesChannel = interaction.guild.rulesChannelId;
              const publicUpdatesChannel = interaction.guild.publicUpdatesChannelId;
              let forcedIds = [rulesChannel, publicUpdatesChannel].filter(Boolean);
              
              try {
                const onboarding = await interaction.guild.onboarding.fetch().catch(() => null);
                if (onboarding && onboarding.enabled) {
                  forcedIds.push(...onboarding.defaultChannelIds);
                  if (onboarding.prompts) {
                    const onboardingRoleIds = new Set();
                    onboarding.prompts.forEach(prompt => {
                      prompt.options.forEach(opt => {
                        opt.roleIds.forEach(id => onboardingRoleIds.add(id));
                      });
                    });
                    
                    for (const roleId of onboardingRoleIds) {
                      const onboardRole = interaction.guild.roles.cache.get(roleId);
                      if (onboardRole && onboardRole.permissions.has(PermissionFlagsBits.ViewChannel)) {
                        if (onboardRole.position < interaction.guild.members.me.roles.highest.position) {
                          await onboardRole.setPermissions(onboardRole.permissions.remove(PermissionFlagsBits.ViewChannel)).catch(() => null);
                        }
                      }
                    }
                  }
                }
              } catch(e) {}
              
              const successPayload = {
                content: "",
                components: [{ type: 17, components: [
                  { type: 10, content: `# ${getRandomHeadingGlyph()} **Auto-Configuration Complete**\n\n-# **The server is now securely locked behind the verification gate (${mode.toUpperCase()} mode).**\n-# **• \`View Channels\` has been stripped from @everyone and all Discord Onboarding roles.**` },
                  { type: 14, divider: true },
                  { type: 10, content: '-# **Athena Bulletproof Security Matrix**' }
                ] }],
                flags: 32768
              };
              await interaction.editReply(successPayload);
            } catch (err) {
              const errorPayload = {
                content: "",
                components: [{ type: 17, components: [
                  { type: 10, content: `# ${getRandomHeadingGlyph()} **Configuration Failed**\n\n-# **I do not have enough permissions to modify server roles or channel overwrites.**\n-# **\`${err.message}\`**` },
                  { type: 14, divider: true },
                  { type: 10, content: '-# **Athena Bulletproof Security Matrix**' }
                ] }],
                flags: 32768
              };
              await interaction.editReply(errorPayload);
            }
          } else {
            const manualPayload = {
              content: "",
              components: [{ type: 17, components: [
                { type: 10, content: `# ${getRandomHeadingGlyph()} **Manual Configuration**\n\n-# **You chose to do it manually. Please remember to restrict \`@everyone\` and allow ${role} to view channels.**` },
                { type: 14, divider: true },
                { type: 10, content: '-# **Athena Bulletproof Security Matrix**' }
              ] }],
              flags: 32768
            };
            await response.update(manualPayload);
          }
        } catch (e) {
          promptPayload.components.pop();
          await interaction.editReply(promptPayload).catch(() => null);
        }

      } else if (subcommand === 'disable') {
        await interaction.deferReply();
        const verifyData = db.getVerification(guildId);
        if (verifyData.messageId && verifyData.channelId) {
          try {
            const channel = interaction.guild.channels.cache.get(verifyData.channelId);
            if (channel) {
              const msg = await channel.messages.fetch(verifyData.messageId).catch(() => null);
              if (msg) await msg.delete();
            }
          } catch (err) {}
        }

        try {
          const everyone = interaction.guild.roles.everyone;
          await everyone.setPermissions(everyone.permissions.add(PermissionFlagsBits.ViewChannel));
        } catch(e) {}

        db.deleteVerification(guildId);
        
        const disablePayload = {
          content: "",
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `# ${getRandomHeadingGlyph()} **Verification Disabled**\n\n-# **The verification system has been disabled and the panel was removed.**\n-# **• Server visibility permissions have been restored for @everyone.**`
                },
                { type: 14, divider: true },
                { type: 10, content: '-# **Athena Bulletproof Security Matrix**' }
              ]
            }
          ],
          flags: 32768
        };
        await interaction.editReply(disablePayload);
      }
    }
  }
];
