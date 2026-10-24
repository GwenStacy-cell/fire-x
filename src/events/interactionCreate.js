import { PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessagePayload, AttachmentBuilder } from 'discord.js';
import { generateImageCaptcha, generateMathCaptcha, validateAnswer } from '../utils/captchaEngine.js';
import { buildXpDashboard } from '../commands/leveling.js';
import commandMap from '../commands/loader.js';
import cv2 from '../cv2.js';
import { createRoleStates, buildCreateRolePanel } from '../commands/rolemanager.js';
import { setGuildContext } from '../embed.js';

// Import all button handlers dynamically
import * as downloader from '../utils/mediaDownloader.js';
import db from '../database.js';

import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';
const TOGGLE_ON = '<:emoji_16:1533860111704002665>';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    // ==========================================
    // GLOBALLY BLACKLISTED USER ENFORCEMENT
    // ==========================================
    if (db.isUserBotBlacklisted(interaction.user.id) && !isBotOwnerSync(interaction.user.id)) {
      const bData = db.cache.botBlacklistData?.[interaction.user.id];
      const reason = bData?.reason || 'Violation of Athena Bot Rules & Security Protocols';
      const banNotice = cv2.danger(
        'Globally Blacklisted',
        `-# **__Security Notice:__** You are globally banned from using Athena.\n\n` +
        `> -# **__Account:__** <@${interaction.user.id}> (\`${interaction.user.id}\`)\n` +
        `> -# **__Status:__** \`Permanently Blacklisted\`\n` +
        `> -# **__Reason:__** \`${reason}\`\n` +
        `> -# **__Enforcement:__** All commands and features are permanently locked for your account across all servers, including server-owner privileges.\n` +
        `> -# **__Appeal:__** If you believe this is an error, please contact the Bot Owner.`
      );
      if (interaction.isRepliable()) {
        return interaction.reply({ ...banNotice, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 }).catch(() => null);
      }
      return;
    }

    if (interaction.customId && interaction.customId.startsWith('ann_')) {
      try {
        const announce = await import('../commands/announce.js');
        return announce.handleAnnouncementInteractions(interaction);
      } catch (e) { console.error(e); }
    }

    if (interaction.customId && interaction.customId.startsWith('aian_')) {
      try {
        const aiannounce = await import('../commands/aiannounce.js');
        return aiannounce.handleAIAnnouncementInteractions(interaction);
      } catch (e) { console.error(e); }
    }

    if (interaction.customId && interaction.customId.startsWith('tts_')) {
      try {
        const { handleTtsInteraction } = await import('../commands/tts.js');
        return handleTtsInteraction(interaction);
      } catch (e) { console.error('[InteractionCreate] TTS interaction error:', e); }
    }

    // ==========================================
    // DEFENSE MATRIX: LOCKDOWN & EMERGENCY BUTTONS
    // ==========================================
    if (interaction.isButton() && (interaction.customId === 'lockdown_lift' || interaction.customId === 'lockdown_status' || interaction.customId === 'emergency_end')) {
      const { isBotOwnerSync, isExtraOwner } = await import('../utils/helpers.js');
      const { handleUnlockdown, handleEmergency } = await import('../commands/security.js');

      if (interaction.customId === 'lockdown_lift') {
        const isAuthorizedAdmin = isBotOwnerSync(interaction.user.id) || 
          interaction.user.id === interaction.guild?.ownerId || 
          isExtraOwner(interaction.guild?.id, interaction.user.id) || 
          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (!isAuthorizedAdmin) {
          return interaction.reply({ content: '-# You lack authorization to lift server panic lockdown. Administrator or higher clearance required.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferUpdate().catch(() => null);
        const result = await handleUnlockdown(interaction.guild, interaction.member);
        return interaction.editReply(result).catch(() => null);
      }

      if (interaction.customId === 'lockdown_status') {
        const snapshot = db.getLockdownSnapshot(interaction.guild?.id);
        if (!snapshot) {
          return interaction.reply({ content: '-# No active panic lockdown snapshot in database. Server is operating under normal defense parameters.', flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
          content: `### Active Panic Lockdown Audit | <a:uptime:1552608831060844575>\n` +
            `> **Tier:** \`${snapshot.tierLabel || 'Tier ' + snapshot.tier}\`\n` +
            `> **Channels Secured:** \`${snapshot.channels?.length || 0} channels\`\n` +
            `> **Enforcer:** <@${snapshot.moderatorId}>\n` +
            `> **Raid Shield:** \`${snapshot.preRaidMode ? 'Active' : 'Standby'}\`\n` +
            `> **Verification Level:** \`${snapshot.preVerifLevel !== undefined ? 'Elevated (Phone Required)' : 'Standard'}\``,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === 'emergency_end') {
        const isAuthorizedOwner = isBotOwnerSync(interaction.user.id) || interaction.user.id === interaction.guild?.ownerId;
        if (!isAuthorizedOwner) {
          return interaction.reply({ content: '-# Only the Server Owner or Bot Owner can resolve Emergency Blackout Mode.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferUpdate().catch(() => null);
        const result = await handleEmergency(interaction.guild, interaction.member, 'end');
        return interaction.editReply(result).catch(() => null);
      }
    }

    if (interaction.isButton() && (interaction.customId === 'hud_mode_telemetry' || interaction.customId === 'hud_mode_server' || interaction.customId === 'hud_mode_defcon' || interaction.customId === 'hud_mode_omni' || interaction.customId === 'dash_refresh')) {
      await interaction.deferUpdate().catch(() => null);
      if (interaction.customId === 'hud_mode_omni' || interaction.customId === 'dash_refresh') {
        const { buildDashboardResponse } = await import('../commands/dashboard.js');
        const result = await buildDashboardResponse(interaction.guild, interaction.client, interaction.user);
        return interaction.editReply(result).catch(() => null);
      }
      const { buildHudResponse } = await import('../commands/hud.js');
      const mode = interaction.customId.replace('hud_mode_', '');
      const result = await buildHudResponse(interaction.guild, interaction.client, mode, interaction.user);
      return interaction.editReply(result).catch(() => null);
    }

    if (interaction.isButton() && interaction.customId === 'dash_defcon_knowmore') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      const { buildDefconIntelContainer } = await import('../commands/dashboard.js');
      const prefix = interaction.guild?.id ? (db.getGuildConfig(interaction.guild.id)?.prefix || '!') : '!';
      const container = buildDefconIntelContainer(prefix);
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (interaction.isButton() && interaction.customId === 'play_tactical_dispatch') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
      const { dispatchTacticalAudioToVc, createTacticalDispatchAttachment, TACTICAL_DISPATCH_SCRIPTS } = await import('../utils/tacticalAudio.js');
      const lockdown = db.getLockdownSnapshot(interaction.guild?.id);
      const isEmergency = Boolean(db.getEmergencyState(interaction.guild?.id));
      
      let script = 'Athena Prime Defense Matrix online. Operational status nominal. All perimeter shields locked and 28 security modules active.';
      if (isEmergency) script = TACTICAL_DISPATCH_SCRIPTS.panic;
      else if (lockdown) script = lockdown.tier === 1 ? TACTICAL_DISPATCH_SCRIPTS.lockdown_tier1 : lockdown.tier === 2 ? TACTICAL_DISPATCH_SCRIPTS.lockdown_tier2 : TACTICAL_DISPATCH_SCRIPTS.lockdown_tier3;

      if (interaction.member?.voice?.channel) {
        await dispatchTacticalAudioToVc(interaction.member, script);
        return interaction.editReply({
          content: `### Tactical Audio Briefing | <a:atheNATICK:1557841381630681106>\n> <a:uptime:1552608831060844575> **Broadcasting live defense dispatch to <#${interaction.member.voice.channel.id}>...**\n> -# Script: *"${script}"*`
        });
      } else {
        const audioAtt = await createTacticalDispatchAttachment(script);
        return interaction.editReply({
          content: `### Tactical Audio Briefing | <a:atheNATICK:1557841381630681106>\n> <a:uptime:1552608831060844575> **Synthesized Tactical Military Audio Dispatch.**\n> -# Join any Voice Channel to have Athena broadcast this dispatch live on command.\n> -# Script: *"${script}"*`,
          files: audioAtt ? [audioAtt] : []
        });
      }
    }


    
    // ==========================================
    // PING ALERTS SYSTEM
    // ==========================================
    if (interaction.isButton() && interaction.customId === 'ping_ack') {
      await interaction.update({ content: '-# <a:uptime:1552608831060844575> Notification acknowledged.', components: [] });
      return;
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('ping_block_')) {
      const guildId = interaction.customId.split('_')[2];
      db.addPingAlertBlock(interaction.user.id, guildId);
      await interaction.update({ content: '-# <a:uptime:1552608831060844575> You will no longer receive ping notifications from this server.', components: [] });
      return;
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('ping_reply_')) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply({ content: '-# <:cross_red:1533860128015519895> The Reply feature is restricted to the Bot Owner.', ephemeral: true });
      }
      const parts = interaction.customId.split('_');
      const channelId = parts[2];
      const messageId = parts[3];
      
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
      const modal = new ModalBuilder().setCustomId(`ping_modal_reply_${channelId}_${messageId}`).setTitle('Reply to Ping (Owner Only)');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('reply_text').setLabel('Your Reply').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
      ));
      return interaction.showModal(modal);
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ping_modal_reply_')) {
      if (!isBotOwnerSync(interaction.user.id)) {
        return interaction.reply({ content: '-# <:cross_red:1533860128015519895> The Reply feature is restricted to the Bot Owner.', ephemeral: true });
      }
      const parts = interaction.customId.split('_');
      const channelId = parts[3];
      const messageId = parts[4];
      const replyText = interaction.fields.getTextInputValue('reply_text');
      
      try {
        const client = interaction.client;
        const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          let sent = null;
          if (messageId) {
            sent = await channel.send({
              content: replyText,
              reply: { messageReference: messageId, failIfNotExists: false }
            }).catch(() => null);
          }
          if (!sent) {
            sent = await channel.send({ content: replyText }).catch(() => null);
          }
          if (sent) {
            return interaction.reply({ content: '-# <a:atheNATICK:1557841381630681106> Reply sent successfully to the channel!', flags: 64 });
          } else {
            return interaction.reply({ content: '-# <:off:1533844858983157851> Failed to send message to the destination channel.', flags: 64 });
          }
        } else {
          return interaction.reply({ content: '-# <:off:1533844858983157851> Failed to send reply: Channel not found.', flags: 64 });
        }
      } catch (e) {
        console.error('[ping_modal_reply] Error:', e);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '-# <:off:1533844858983157851> Error sending reply.', flags: 64 }).catch(() => null);
        }
      }
      return;
    }

    // ==========================================
    // CAPTCHA & MATH VERIFICATION MODAL SUBMISSION
    // ==========================================
    if (interaction.isModalSubmit() && (interaction.customId === 'verify_captcha_modal' || interaction.customId === 'verify_math_modal')) {
      const isMath = interaction.customId === 'verify_math_modal';
      const input = interaction.fields.getTextInputValue(isMath ? 'math_solution' : 'captcha_solution');
      const isValid = validateAnswer(interaction.guild.id, interaction.user.id, input);

      const verifyData = db.getVerification(interaction.guild.id);
      if (!isValid) {
        return interaction.reply({
          ...cv2.asEphemeral(cv2.danger('Verification Failed', 'Incorrect challenge answer. Please click Authenticate Identity again to receive a fresh verification challenge.')),
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      }

      if (!verifyData || !verifyData.roleId) {
        return interaction.reply({ content: '-# **Verification system is not configured.**', flags: MessageFlags.Ephemeral }).catch(() => null);
      }

      try {
        const role = interaction.guild.roles.cache.get(verifyData.roleId) || await interaction.guild.roles.fetch(verifyData.roleId).catch(() => null);
        if (!role) {
          return interaction.reply({ content: '-# **The verification role no longer exists.**', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        await interaction.member.roles.add(role);
        return interaction.reply({
          ...cv2.asEphemeral(cv2.success('Identity Authenticated', 'Challenge solution validated! You have been granted access to the server.')),
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      } catch (err) {
        return interaction.reply({ content: '-# **Failed to assign verification role. Ensure bot role is higher than the verification role.**', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }

    // ==========================================
    // STUDIO CONTAINER MODAL & BUTTON
    // ==========================================
    if (interaction.isButton() && interaction.customId === 'studio_open_builder') {
      const modal = new ModalBuilder()
        .setCustomId(`studio_modal_${Date.now()}`)
        .setTitle('Container & Embed Studio');
      const titleInput = new TextInputBuilder()
        .setCustomId('studio_title')
        .setLabel('Container Heading / Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Official Server Announcement')
        .setRequired(true)
        .setMaxLength(100);
      const descInput = new TextInputBuilder()
        .setCustomId('studio_description')
        .setLabel('Body Description (Markdown supported)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your formatted message body here...')
        .setRequired(true)
        .setMaxLength(3000);
      const templateIdInput = new TextInputBuilder()
        .setCustomId('studio_template_id')
        .setLabel('Save as Template ID (lowercase, no spaces)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. rules_update or welcome_event')
        .setRequired(false)
        .setMaxLength(32);
      const footerInput = new TextInputBuilder()
        .setCustomId('studio_footer')
        .setLabel('Custom Footer Note')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Athena Bulletproof Defense')
        .setRequired(false)
        .setMaxLength(100);
      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(templateIdInput),
        new ActionRowBuilder().addComponents(footerInput)
      );
      return interaction.showModal(modal).catch(() => null);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('studio_')) {
      const title = interaction.fields.getTextInputValue('studio_title');
      const description = interaction.fields.getTextInputValue('studio_description');
      const templateId = interaction.fields.getTextInputValue('studio_template_id')?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const footer = interaction.fields.getTextInputValue('studio_footer')?.trim();

      if (templateId) {
        db.saveStudioTemplate(interaction.guild.id, templateId, {
          title,
          description,
          footer
        });
      }

      const previewPayload = cv2.make(title, description, [], false, footer || 'Studio Container Preview');
      const confirmText = templateId ? `\n-# Saved to server templates as \`${templateId}\`. Dispatch with \`/studio action: send template_id: ${templateId}\`.` : '';

      return interaction.reply({
        content: `-# <a:atheNATICK:1557841381630681106> **Container Studio Preview Generated:**${confirmText}`,
        components: previewPayload.components,
        flags: MessageFlags.Ephemeral
      }).catch(() => null);
    }

    // ==========================================
    // PERSISTENT HELP SYSTEM INTERACTIONS
    // ==========================================
    if (interaction.customId && interaction.customId.startsWith('help_')) {
      try {
        const { handleHelpInteraction } = await import('../commands/utility.js');
        if (handleHelpInteraction) {
          const handled = await handleHelpInteraction(interaction);
          if (handled) return;
        }
      } catch (e) {
        console.error('[InteractionCreate] Error handling help interaction:', e);
      }
    }

    // ==========================================
    // PERSISTENT ARCHITECTURE & EXPLAIN INTERACTIONS
    // ==========================================
    if (interaction.customId && (interaction.customId.startsWith('arch_') || interaction.customId.startsWith('explain_'))) {
      try {
        const { handleExplainInteraction } = await import('../commands/explain.js');
        if (handleExplainInteraction) {
          const handled = await handleExplainInteraction(interaction);
          if (handled) return;
        }
      } catch (e) {
        console.error('[InteractionCreate] Error handling explain interaction:', e);
      }
    }

    // ==========================================
    // --- LEARN MODE & HEURISTICS INTERACTIONS ---
    // ==========================================
    if (interaction.customId && interaction.customId.startsWith('learn_')) {
      try {
        const { handleLearnInteraction } = await import('../commands/learn.js');
        if (handleLearnInteraction) {
          const handled = await handleLearnInteraction(interaction);
          if (handled) return;
        }
      } catch (e) {
        console.error('[InteractionCreate] Error handling learn interaction:', e);
      }
    }

    // --- COUNTING ENGINE INTERACTIONS ---
    if (interaction.customId && interaction.customId.startsWith('counting_')) {
      import('../commands/counting.js').then(m => {
        if (interaction.isButton() && m.handleCountingButton) {
          m.handleCountingButton(interaction).catch(e => console.error(e));
        } else if (interaction.isAnySelectMenu() && m.handleCountingMenu) {
          m.handleCountingMenu(interaction).catch(e => console.error(e));
        } else if (interaction.isModalSubmit() && m.handleCountingModal) {
          m.handleCountingModal(interaction).catch(e => console.error(e));
        }
      }).catch(e => console.error(e));
      return;
    }

    // --- ATHENA GUIDE HUB & ASSISTANT INTERACTIONS ---
    if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('athena_')) {
      import('../commands/athena.js').then(m => {
        if (m.handleAthenaGuideButtons) m.handleAthenaGuideButtons(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }

    // --- SUGGESTION BUTTONS ---
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
      import('../commands/ticket.js').then(m => {
        if (m.handleTicketButtons) m.handleTicketButtons(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_')) {
      import('../commands/ticket.js').then(m => {
        if (m.handleTicketModals) m.handleTicketModals(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('tp_')) {
      import('../commands/ticketpanel.js').then(m => {
        if (m.handleTicketPanelButtons) m.handleTicketPanelButtons(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }
    
    if (interaction.isAnySelectMenu() && interaction.customId === 'ticket_select_option') {
      import('../commands/ticket.js').then(m => {
        if (m.handleTicketSelectMenu) m.handleTicketSelectMenu(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }
    
    if (interaction.isAnySelectMenu() && interaction.customId.startsWith('tp_')) {
      import('../commands/ticketpanel.js').then(m => {
        if (m.handleTicketPanelMenus) m.handleTicketPanelMenus(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('tp_')) {
      import('../commands/ticketpanel.js').then(m => {
        if (m.handleTicketPanelModals) m.handleTicketPanelModals(interaction).catch(e => console.error(e));
      }).catch(e => console.error(e));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('sug_')) {
      import('../commands/community.js').then(m => {
        if (m.handleSuggestionButtons) m.handleSuggestionButtons(interaction).catch(()=>{});
      }).catch(()=>{});
      return;
    }

    if (interaction.customId && interaction.customId.startsWith('vcrole_')) {
      import('../commands/community.js').then(m => {
        if (m.handleVoiceRoleInteraction) m.handleVoiceRoleInteraction(interaction).catch(()=>{});
      }).catch(()=>{});
      return;
    }

    // --- CHESS THEME DROPDOWN ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'chess_theme_select') {
      import('../commands/chess.js').then(m => {
        if (m.handleChessThemeSelect) m.handleChessThemeSelect(interaction).catch(()=>{});
      }).catch(()=>{});
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('chess_theme_apply_')) {
      import('../commands/chess.js').then(m => {
        if (m.handleChessThemeApply) m.handleChessThemeApply(interaction).catch(()=>{});
      }).catch(()=>{});
      return;
    }

    // --- VC PANEL DROPDOWNS ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'vcp_select') {
      const i = interaction;
      if (i.user.id !== i.guild.ownerId && !isBotOwnerSync(i.user.id) && !isExtraOwner(i.guild.id, i.user.id)) {
        return i.reply({ content: 'Only the Server Owner, Bot Owner, and Extra Owners can use this panel.', flags: 64 }).catch(()=>{});
      }

      const vc = i.member.voice.channel;
      if (!vc) return i.reply({ content: 'You must be in a voice channel!', flags: 64 }).catch(()=>{});

      const actionFull = i.values[0].substring(0, i.values[0].lastIndexOf('_'));
      const targetId = i.values[0].substring(i.values[0].lastIndexOf('_') + 1);

      try {
        if (actionFull === 'vcp_unban_1') {
           await vc.permissionOverwrites.delete(targetId).catch(()=>{});
           return i.update({ content: `Successfully unbanned user ID ${targetId}.`, components: [] }).catch(()=>{});
        }

        const targetMember = vc.members.get(targetId);
        if (!targetMember) return i.update({ content: 'That user is no longer in the VC.', components: [] }).catch(()=>{});

        if (actionFull === 'vcp_mute_1') {
          await targetMember.voice.setMute(true).catch(()=>{});
          return i.update({ content: `Muted ${targetMember.user.tag}.`, components: [] }).catch(()=>{});
        } else if (actionFull === 'vcp_unmute_1') {
          await targetMember.voice.setMute(false).catch(()=>{});
          return i.update({ content: `Unmuted ${targetMember.user.tag}.`, components: [] }).catch(()=>{});
        } else if (actionFull === 'vcp_deafen_1') {
          await targetMember.voice.setDeaf(true).catch(()=>{});
          return i.update({ content: `Deafened ${targetMember.user.tag}.`, components: [] }).catch(()=>{});
        } else if (actionFull === 'vcp_undeafen_1') {
          await targetMember.voice.setDeaf(false).catch(()=>{});
          return i.update({ content: `Undeafened ${targetMember.user.tag}.`, components: [] }).catch(()=>{});
        } else if (actionFull === 'vcp_kick_1') {
          await targetMember.voice.disconnect().catch(()=>{});
          return i.update({ content: `Kicked ${targetMember.user.tag}.`, components: [] }).catch(()=>{});
        } else if (actionFull === 'vcp_ban_1') {
          await vc.permissionOverwrites.edit(targetId, { Connect: false }).catch(()=>{});
          await targetMember.voice.disconnect().catch(()=>{});
          return i.update({ content: `Banned ${targetMember.user.tag} from the VC.`, components: [] }).catch(()=>{});
        }
      } catch (error) {
        console.error('[VCPanel] Dropdown error:', error);
        if (!i.replied && !i.deferred) return i.update({ content: 'Failed to apply action.', components: [] }).catch(()=>{});
      }
    }

  if (!interaction.guild && !(interaction.isButton() && interaction.customId.startsWith('gen_invite_'))) return;

  // AUTO-REPLY MATRIX INTERACTIONS
  if (interaction.customId?.startsWith('ar_')) {
    const { handleAutoReplyInteractions } = await import('../commands/trigger.js');
    return handleAutoReplyInteractions(interaction);
  }

  // TRIGGER MATRIX INTERACTIONS
  if (interaction.customId?.startsWith('trig_')) {
    const { handleTriggerInteractions } = await import('../commands/trigger.js');
    return handleTriggerInteractions(interaction);
  }

  // --- APP BUILDER ---
  // XP STRING SELECT MENU (Announcement Mode)
      if (interaction.isStringSelectMenu() && interaction.customId === 'xp_mode_select') {
        const val = interaction.values[0];
        const system = db.getXpSystem(interaction.guild.id);

        if (val === 'channel_modal') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
          const modal = new ModalBuilder().setCustomId('xp_announce_modal').setTitle('Announcement Destination');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id')
              .setLabel('Channel ID, mention, "current", or "dm"')
              .setPlaceholder('e.g. 123456789012345678, current, dm, or disabled')
              .setValue(system.announceChannelId || '')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ));
          return interaction.showModal(modal);
        }

        if (val === 'current') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'current', announceChannelId: null });
        } else if (val === 'dm') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'dm', announceChannelId: null });
        } else if (val === 'disabled') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'disabled', announceChannelId: null });
        }

        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

  // XP ROLE SELECT MENUS
      if (interaction.isRoleSelectMenu() && interaction.customId === 'xp_add_multiplier') {
        const system = db.getXpSystem(interaction.guild.id);
        const mults = system.multipliers || {};
        for (const [roleId] of interaction.roles) mults[roleId] = 1.5;
        db.setXpSystem(interaction.guild.id, { ...system, multipliers: mults });
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.isRoleSelectMenu() && interaction.customId === 'xp_add_reward') {
        // Ask for level via modal — cache selected role IDs temporarily
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        if (!interaction.client._xpRewardRoleCache) interaction.client._xpRewardRoleCache = new Map();
        const roleIds = [...interaction.roles.keys()];
        interaction.client._xpRewardRoleCache.set(interaction.user.id, roleIds);
        setTimeout(() => interaction.client._xpRewardRoleCache.delete(interaction.user.id), 120000);
        const modal = new ModalBuilder().setCustomId('xp_reward_level_modal').setTitle('Set Level for Role Reward');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('level').setLabel('At which level should this role be given?').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      if (interaction.isButton()) {
        // --- XP DASHBOARD BUTTONS ---
        if (interaction.customId === 'xp_dash') {
          const panel = await buildXpDashboard(interaction.guild.id);
          return cv2.respond(interaction, { ...panel, flags: (panel.flags || 32768) | MessageFlags.Ephemeral }, 4);
        }

        if (interaction.customId === 'xp_toggle') {
          const system = db.getXpSystem(interaction.guild.id);
          db.setXpSystem(interaction.guild.id, { ...system, enabled: !system.enabled });
          const panel = await buildXpDashboard(interaction.guild.id);
          return cv2.respond(interaction, panel, 7);
        }

        if (interaction.customId === 'xp_set_announce') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
          const system = db.getXpSystem(interaction.guild.id);
          const modal = new ModalBuilder().setCustomId('xp_announce_modal').setTitle('Announcement Destination');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id')
              .setLabel('Channel ID, mention, "current", or "dm"')
              .setPlaceholder('e.g. 123456789012345678, current, dm, or disabled')
              .setValue(system.announceChannelId ? system.announceChannelId : (system.announceMode || 'current'))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ));
          return interaction.showModal(modal);
        }

        if (interaction.customId === 'xp_set_cmd') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
          const modal = new ModalBuilder().setCustomId('xp_cmd_modal').setTitle('Set Command Channel');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Paste the Channel ID here').setStyle(TextInputStyle.Short).setRequired(true)
          ));
          return interaction.showModal(modal);
        }

        if (interaction.customId === 'xp_clear') {
          db.setXpSystem(interaction.guild.id, { enabled: false, announceChannelId: null, cmdChannelId: null, roleRewards: {}, multipliers: {} });
          const panel = await buildXpDashboard(interaction.guild.id);
          return cv2.respond(interaction, panel, 7);
        }

        if (interaction.customId === 'xp_save') {
          const saveContainer = {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  `# Configuration Saved\n` +
                  `-# • **Status:** <a:uptime:1552608831060844575> **__XP Manager settings saved and synchronized__**`
              }
            ]
          };
          return interaction.reply({ components: [saveContainer], flags: (MessageFlags.IsComponentsV2 || 32768) | MessageFlags.Ephemeral });
        }

    // --- VC PANEL BUTTONS ---
    if (interaction.customId.startsWith('vcp_')) {
      if (interaction.user.id !== interaction.guild.ownerId && !isBotOwnerSync(interaction.user.id) && !isExtraOwner(interaction.guild.id, interaction.user.id)) {
          return interaction.reply({ content: 'Only the Server Owner, Bot Owner, and Extra Owners can use this panel.', flags: 64 }).catch(()=>{});
        }

      const vc = interaction.member.voice.channel;
      if (!vc) {
        return interaction.reply({ content: 'You must be in a voice channel to use these controls!', flags: 64 }).catch(()=>{});
      }

      const everyoneRole = interaction.guild.roles.everyone;
      const i = interaction;

      try {
        if (i.customId === 'vcp_mute_all') {
          vc.members.forEach(m => { if (m.id !== i.user.id) m.voice.setMute(true).catch(()=>{}); });
          return i.reply({ content: 'Muted all other members.', flags: 64 }).catch(()=>{});
        } 
        else if (i.customId === 'vcp_unmute_all') {
          vc.members.forEach(m => { m.voice.setMute(false).catch(()=>{}); });
          return i.reply({ content: 'Unmuted all members.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_deafen_all') {
          vc.members.forEach(m => { if (m.id !== i.user.id) m.voice.setDeaf(true).catch(()=>{}); });
          return i.reply({ content: 'Deafened all other members.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_undeafen_all') {
          vc.members.forEach(m => { m.voice.setDeaf(false).catch(()=>{}); });
          return i.reply({ content: 'Undeafened all members.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_kick_all') {
          vc.members.forEach(m => { if (m.id !== i.user.id) m.voice.disconnect().catch(()=>{}); });
          return i.reply({ content: 'Kicked all other members from VC.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_ban_all') {
          vc.members.forEach(m => {
            if (m.id !== i.user.id) {
              vc.permissionOverwrites.edit(m.id, { Connect: false }).catch(()=>{});
              m.voice.disconnect().catch(()=>{});
            }
          });
          return i.reply({ content: 'Banned all other members from this VC.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_unban_all') {
          const overwrites = vc.permissionOverwrites.cache;
          overwrites.forEach(overwrite => {
            if (overwrite.type === 1) {
              vc.permissionOverwrites.delete(overwrite.id).catch(()=>{});
            }
          });
          return i.reply({ content: 'Unbanned all individual members from this VC.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_lock') {
          await vc.permissionOverwrites.edit(everyoneRole, { Connect: false }).catch(()=>{});
          return i.reply({ content: 'Voice channel Locked.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_unlock') {
          await vc.permissionOverwrites.edit(everyoneRole, { Connect: null }).catch(()=>{});
          return i.reply({ content: 'Voice channel Unlocked.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_hide') {
          await vc.permissionOverwrites.edit(everyoneRole, { ViewChannel: false }).catch(()=>{});
          return i.reply({ content: 'Voice channel Hidden.', flags: 64 }).catch(()=>{});
        }
        else if (i.customId === 'vcp_unhide') {
          await vc.permissionOverwrites.edit(everyoneRole, { ViewChannel: null }).catch(()=>{});
          return i.reply({ content: 'Voice channel Unhidden.', flags: 64 }).catch(()=>{});
        }
        else if (['vcp_mute_1', 'vcp_unmute_1', 'vcp_deafen_1', 'vcp_undeafen_1', 'vcp_kick_1', 'vcp_ban_1', 'vcp_unban_1'].includes(i.customId)) {
          const actionMap = {
            'vcp_mute_1': 'Mute',
            'vcp_unmute_1': 'Unmute',
            'vcp_deafen_1': 'Deafen',
            'vcp_undeafen_1': 'Undeafen',
            'vcp_kick_1': 'Kick',
            'vcp_ban_1': 'Ban',
            'vcp_unban_1': 'Unban'
          };
          const actionName = actionMap[i.customId];
          let options = [];
          
          if (i.customId === 'vcp_unban_1') {
            const overwrites = vc.permissionOverwrites.cache.filter(o => o.type === 1 && o.deny.has('Connect'));
            if (overwrites.size === 0) return i.reply({ content: 'No users are banned from this VC.', flags: 64 }).catch(()=>{});
            for (const [id, overwrite] of overwrites) {
              options.push({ label: `User ID: ${id}`, value: `${i.customId}_${id}` });
            }
          } else {
            vc.members.forEach(m => {
              if (m.id !== i.user.id) {
                options.push({ label: m.user.tag, value: `${i.customId}_${m.id}` });
              }
            });
            if (options.length === 0) return i.reply({ content: 'No other members in VC to target.', flags: 64 }).catch(()=>{});
          }

          options = options.slice(0, 25);
          const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('vcp_select')
              .setPlaceholder(`Select user to ${actionName}`)
              .addOptions(options)
          );

          return i.reply({ content: `Please select a user to **${actionName}**:`, components: [selectMenu], flags: 64 }).catch(()=>{});
        }
      } catch (error) {
        console.error('[VCPanel] Button error:', error);
        if (!i.replied && !i.deferred) return i.reply({ content: 'An error occurred.', flags: 64 }).catch(()=>{});
      }
    }

    if (interaction.customId === 'btn_app_apply') {
      try {
        const config = db.getAppConfig(interaction.guild.id);
        if (!config.questions || config.questions.length === 0) return interaction.reply({ content: 'There are no questions configured for this application.', ephemeral: true }).catch(()=>{});
        
        const modal = new ModalBuilder().setCustomId('modal_app_submit').setTitle('Staff Application');
        
        config.questions.forEach((q, i) => {
          const input = new TextInputBuilder()
            .setCustomId(`app_q_${i}`)
            .setLabel(q.length > 45 ? q.substring(0, 42) + '...' : q)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });
        
        return await interaction.showModal(modal);
      } catch (err) {
        return interaction.reply({ content: `Crash detected: ${err.message}`, ephemeral: true }).catch(console.error);
      }
    }

    if (interaction.customId.startsWith('btn_app_review_')) {
      const action = interaction.customId.split('_')[3];
      const targetId = interaction.customId.split('_')[4];
      
      const modal = new ModalBuilder().setCustomId(`modal_app_review_${action}_${targetId}`).setTitle(action === 'accept' ? 'Accept Application' : 'Deny Application');
      const input = new TextInputBuilder().setCustomId('review_reason').setLabel('Reason (sent to user)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return await interaction.showModal(modal).catch(console.error);
    }
  }

  // XP MODAL SUBMITS
      if (interaction.customId === 'xp_announce_modal') {
        const rawInput = interaction.fields.getTextInputValue('channel_id').trim();
        const inputLower = rawInput.toLowerCase();
        const system = db.getXpSystem(interaction.guild.id);

        if (inputLower === 'current' || inputLower === 'current channel' || inputLower === 'chat') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'current', announceChannelId: null });
        } else if (inputLower === 'dm' || inputLower === 'dms' || inputLower === 'direct message') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'dm', announceChannelId: null });
        } else if (inputLower === 'off' || inputLower === 'disable' || inputLower === 'disabled' || inputLower === 'none') {
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'disabled', announceChannelId: null });
        } else {
          const cleanId = rawInput.replace(/[<#>]/g, '').trim();
          const channel = interaction.guild.channels.cache.get(cleanId);
          if (!channel) {
            return interaction.reply({
              content: 'Invalid input. Please enter a valid channel ID/mention, or type `current`, `dm`, or `disabled`.',
              flags: 64
            });
          }
          db.setXpSystem(interaction.guild.id, { ...system, announceMode: 'channel', announceChannelId: channel.id });
        }

        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.customId === 'xp_reward_level_modal') {
        const levelStr = interaction.fields.getTextInputValue('level').trim();
        const level = parseInt(levelStr);
        if (isNaN(level) || level < 1) return interaction.reply({ content: 'Invalid level. Please enter a number >= 1.', flags: 64 });
        const roleIds = interaction.client._xpRewardRoleCache?.get(interaction.user.id) || [];
        if (roleIds.length === 0) return interaction.reply({ content: 'Session expired. Please re-select the roles.', flags: 64 });
        const system = db.getXpSystem(interaction.guild.id);
        const rewards = system.roleRewards || {};
        for (const roleId of roleIds) rewards[level] = roleId;
        db.setXpSystem(interaction.guild.id, { ...system, roleRewards: rewards });
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.customId === 'xp_cmd_modal') {
        const channelId = interaction.fields.getTextInputValue('channel_id').trim();
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return interaction.reply({ content: 'Invalid channel ID. Make sure you paste the channel ID, not the name.', flags: 64 });
        const system = db.getXpSystem(interaction.guild.id);
        db.setXpSystem(interaction.guild.id, { ...system, cmdChannelId: channelId });
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.isModalSubmit()) {
      // CREATEROLE MODALS
      if (interaction.isModalSubmit() && interaction.customId === 'cr_modal_name') {
        const userId = interaction.user.id;
        const state = createRoleStates.get(userId);
        if (!state) return interaction.reply({ content: 'Session expired.', flags: 64 });
        state.name = interaction.fields.getTextInputValue('role_name').trim();
        createRoleStates.set(userId, state);
        return interaction.update(buildCreateRolePanel(state));
      }

      if (interaction.isModalSubmit() && interaction.customId === 'cr_modal_color') {
        const userId = interaction.user.id;
        const state = createRoleStates.get(userId);
        if (!state) return interaction.reply({ content: 'Session expired.', flags: 64 });
        let hex = interaction.fields.getTextInputValue('role_color').trim();
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({ content: 'Invalid hex color! Use format #FF5733', flags: 64 });
        }
        state.color = hex;
        createRoleStates.set(userId, state);
        return interaction.update(buildCreateRolePanel(state));
      }

      if (interaction.isModalSubmit() && interaction.customId === 'cr_modal_position') {
        const userId = interaction.user.id;
        const state = createRoleStates.get(userId);
        if (!state) return interaction.reply({ content: 'Session expired.', flags: 64 });
        const pos = parseInt(interaction.fields.getTextInputValue('role_position').trim());
        if (isNaN(pos) || pos < 1) {
          return interaction.reply({ content: 'Invalid position! Must be a number ≥ 1', flags: 64 });
        }
        state.position = pos;
        createRoleStates.set(userId, state);
        return interaction.update(buildCreateRolePanel(state));
      }
    if (interaction.customId === 'modal_app_submit') {
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});
      
      const config = db.getAppConfig(interaction.guild.id);
      if (!config.logChannel) return interaction.editReply({ content: 'Application log channel is not configured!' }).catch(()=>{});
      
      const logChannel = interaction.guild.channels.cache.get(config.logChannel);
      if (!logChannel) return interaction.editReply({ content: 'Application log channel not found!' }).catch(()=>{});

      const embed = {
        type: 17,
        components: [
          { type: 10, content: `# New Staff Application` },
          { type: 14, divider: true },
          { type: 9, components: [{ type: 10, content: `**Applicant:** <@${interaction.user.id}>` }, { type: 10, content: `**User ID:** ${interaction.user.id}` }], accessory: { type: 11, media: { url: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }) } } },
          { type: 14, divider: true }
        ]
      };

      config.questions.forEach((q, i) => {
        const answer = interaction.fields.getTextInputValue(`app_q_${i}`);
        embed.components.push({ type: 10, content: `**${q}**` });
        embed.components.push({ type: 10, content: `> ${answer}` });
      });
      
      embed.components.push({ type: 14, divider: true });

      const btnAccept = new ButtonBuilder().setCustomId(`btn_app_review_accept_${interaction.user.id}`).setLabel('Accept').setStyle(ButtonStyle.Success);
      const btnDeny = new ButtonBuilder().setCustomId(`btn_app_review_deny_${interaction.user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(btnAccept, btnDeny);

      embed.components.push(row.toJSON());
      await logChannel.send({ components: [embed], flags: MessageFlags.IsComponentsV2 }).catch(()=>{});
      return interaction.editReply({ content: 'Your application has been submitted successfully!' }).catch(()=>{});
    }

    if (interaction.customId.startsWith('modal_app_review_')) {
      const parts = interaction.customId.split('_');
      const action = parts[3];
      const targetId = parts[4];
      const reason = interaction.fields.getTextInputValue('review_reason');
      
      const embed = interaction.message.components[0].toJSON();
      
      embed.components.push({ type: 10, content: `### Result: ${action === 'accept' ? '<a:emoji_106:1533844832395595838> Accepted' : '<:cross_red:1533860128015519895> Denied'} by <@${interaction.user.id}>` });
      embed.components.push({ type: 10, content: `**Reason:** ${reason}` });
      
      await interaction.update({ components: [embed], flags: MessageFlags.IsComponentsV2 }).catch(console.error);

      // Async DM task so it doesn't block interaction timeout
      interaction.guild.members.fetch(targetId).then(target => {
        if (target) {
          const emoji = action === 'accept' ? '<a:emoji_106:1533844832395595838>' : '<:cross_red:1533860128015519895>';
          const title = `${emoji} Application ${action === 'accept' ? 'Accepted' : 'Denied'}`;
          target.send(cv2[action === 'accept' ? 'success' : 'danger'](title, `**Server:** ${interaction.guild.name}\n**Reason:** ${reason}`)).catch(() => null);
        }
      }).catch(()=>{});
      return;
    }
  }

    try {
        // ==========================================
    // GLOBALLY PATCH CV2 RESPONSES TO BYPASS DJS V14 VALIDATION BUG
    // ==========================================
    const isCV2 = (opts) => {
      if (!opts) return false;
      if (opts.flags != null && (opts.flags & 32768)) return true;
      if (Array.isArray(opts.components) && opts.components.some(c => c && (c.type === 17 || c.type === 9 || c.type === 14 || c.data?.type === 17))) return true;
      return false;
    };

    const resolveFilesHelper = async (files) => {
      if (!files) return undefined;
      const arr = Array.isArray(files) ? files : [files];
      if (arr.length === 0) return undefined;
      return Promise.all(arr.map(async (file) => {
        if (!file) return file;
        if (file.data && file.name) return file;
        return MessagePayload.resolveFile(file);
      }));
    };

    const prepareCV2Payload = (options, resolvedFiles) => {
      const flags = (options.flags != null ? options.flags : 0) | 32768;
      let comps = Array.isArray(options.components) ? [...options.components] : [];
      if (options.content) {
        const cIdx = comps.findIndex(c => c && (c.type === 17 || c.data?.type === 17));
        if (cIdx !== -1) {
          const c = { ...(comps[cIdx].toJSON ? comps[cIdx].toJSON() : comps[cIdx]) };
          c.components = Array.isArray(c.components) ? [...c.components] : [];
          c.components.unshift({ type: 14, divider: true });
          c.components.unshift({ type: 10, content: options.content });
          comps[cIdx] = c;
        } else {
          comps.unshift({ type: 17, components: [{ type: 10, content: options.content }] });
        }
      }
      const data = { components: comps, flags };
      const fileList = resolvedFiles || options.files;
      if (options.attachments && Array.isArray(options.attachments)) {
        data.attachments = options.attachments;
      } else if (fileList && Array.isArray(fileList)) {
        data.attachments = fileList.map((f, i) => ({
          id: String(i),
          filename: f.name || (typeof f === 'string' ? f.split(/[\\/]/).pop() : `file_${i}`),
          description: f.description
        }));
      }
      return data;
    };

    const _editReply = interaction.editReply.bind(interaction);
    interaction.editReply = async function(options) {
      if (!interaction.deferred && !interaction.replied) {
        return interaction.reply(options);
      }
      if (isCV2(options)) {
        interaction.replied = true;
        const resolvedFiles = await resolveFilesHelper(options.files);
        const body = prepareCV2Payload(options, resolvedFiles);
        return interaction.client.rest.patch(`/webhooks/${interaction.client.user.id}/${interaction.token}/messages/@original`, {
          body, files: resolvedFiles
        });
      }
      return _editReply(options);
    };

    const _reply = interaction.reply.bind(interaction);
    interaction.reply = async function(options) {
      if (interaction.deferred || interaction.replied) {
        if (interaction.followUp) return interaction.followUp(options);
        return;
      }
      if (isCV2(options)) {
        interaction.replied = true;
        const resolvedFiles = await resolveFilesHelper(options.files);
        const data = prepareCV2Payload(options, resolvedFiles);
        return interaction.client.rest.post(`/interactions/${interaction.id}/${interaction.token}/callback`, {
          body: { type: 4, data }, files: resolvedFiles
        });
      }
      return _reply(options);
    };

    if (interaction.update) {
      const _update = interaction.update.bind(interaction);
      interaction.update = async function(options) {
        if (isCV2(options)) {
          interaction.replied = true;
          const resolvedFiles = await resolveFilesHelper(options.files);
          const data = prepareCV2Payload(options, resolvedFiles);
          return interaction.client.rest.post(`/interactions/${interaction.id}/${interaction.token}/callback`, {
            body: { type: 7, data }, files: resolvedFiles
          });
        }
        return _update(options);
      };
    }
    
    if (interaction.followUp) {
      const _followUp = interaction.followUp.bind(interaction);
      interaction.followUp = async function(options) {
        if (isCV2(options)) {
          const resolvedFiles = await resolveFilesHelper(options.files);
          const body = prepareCV2Payload(options, resolvedFiles);
          return interaction.client.rest.post(`/webhooks/${interaction.client.user.id}/${interaction.token}`, {
            body, files: resolvedFiles
          });
        }
        return _followUp(options);
      };
    }

    const guild = interaction.guild;
    if (guild) setGuildContext(guild.id);
    
    // ==========================================
    // 1. SLASH COMMANDS
    // ==========================================
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (!command) {
        return interaction.reply({ content: 'Command not found.', flags: MessageFlags.Ephemeral });
      }

      if (command.ownerOnly && !isBotOwnerSync(interaction.user.id)) {
        return interaction.reply({ content: 'Only the bot developer can use this command.', flags: MessageFlags.Ephemeral });
      }

      if (command.permissions && command.permissions.length > 0) {
        if (!interaction.member.permissions.has(command.permissions) && !isBotOwnerSync(interaction.user.id) && interaction.user.id !== interaction.guild.ownerId) {
          return interaction.reply(cv2.e.danger('Access Denied', `You lack the required permissions (\`${command.permissions.join(', ')}\`) to run this command.`));
        }
      }

      try {
        await command.executeSlash(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }

    // ==========================================

    // ==========================================
    // 1.5 AUTOCOMPLETE
    // ==========================================
    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (command && command.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error('Autocomplete Error:', error);
        }
      }
      return;
    }

    // 2. MODALS
    // ==========================================
    
    
    
    if (interaction.isModalSubmit()) {
    if (interaction.customId === 'accent_hex_modal') {
      import('../commands/accent.js').then(m => m.handleAccentModal(interaction)).catch(console.error);
      return;
    }

    if (interaction.customId === 'modal_app_add_q') {
      import('../commands/app.js').then(m => m.handleAppManagerModals(interaction)).catch(console.error);
      return;
    }

    

    

    if (interaction.customId === 'modal_quote_id' || interaction.customId === 'modal_quote_custom') {
      import('../commands/quote.js').then(m => m.handleQuoteModals(interaction)).catch(console.error);
      return;
    }

      if (interaction.customId === 'verify_math_modal' || interaction.customId === 'verify_captcha_modal') {
        const answer = interaction.customId === 'verify_math_modal' 
          ? interaction.fields.getTextInputValue('math_answer') 
          : interaction.fields.getTextInputValue('captcha_answer');
          
        const { validateAnswer } = await import('../utils/captchaEngine.js');
        const isValid = validateAnswer(interaction.guild.id, interaction.user.id, answer);
        
        if (!isValid) {
          return await interaction.reply({ content: '-# **Authentication Failed.** Incorrect answer or the challenge expired.', flags: 64 }).catch(()=>null);
        }
        
        const verifyData = db.getVerification(interaction.guild.id);
        if (verifyData && verifyData.roleId) {
          try {
             await interaction.member.roles.add(verifyData.roleId);
             return await interaction.reply({ content: '-# <:emoji_16:1533860111704002665> **Identity Authenticated! You have been granted access to the server.**', flags: 64 }).catch(()=>null);
          } catch(e) {
             return await interaction.reply({ content: '-# **Failed to assign the verification role.**', flags: 64 }).catch(()=>null);
          }
        }
      }


      if (interaction.customId === 'ytstats_bind_modal' || interaction.customId === 'ytstats_auto_modal') {
        const { handleYtStatsModal } = await import('../commands/ytstats.js');
        return handleYtStatsModal(interaction);
      }
      if (interaction.customId.startsWith('autorole_modal_') || interaction.customId === 'autorole_vanity_modal') {

        const { handleAutoRoleModal } = await import('../commands/autorole.js');
        return handleAutoRoleModal(interaction);
      }
      if (interaction.customId.startsWith('autoreact_modal_')) {

        const { handleAutoReactModal } = await import('../commands/autoreact.js');
        return handleAutoReactModal(interaction);
      }

      if (interaction.customId === 'autonick_modal') {
        const { handleAutonickModal } = await import('../commands/security.js');
        return handleAutonickModal(interaction);
      }
      if (interaction.customId.startsWith('welc_modal_') || interaction.customId.startsWith('leav_modal_')) {
        const { handleWelcomeManagerModal } = await import('../commands/welcome.js');
        return handleWelcomeManagerModal(interaction);
      }

      if (interaction.customId.startsWith('modal_honeypot_')) {
        const channelId = interaction.customId.replace('modal_honeypot_', '');
        const bannerUrl = interaction.fields.getTextInputValue('banner_url') || null;
        let timeoutVal = interaction.fields.getTextInputValue('timeout_minutes');
        let parsedTimeout = parseInt(timeoutVal);
        if (isNaN(parsedTimeout) || parsedTimeout < 1) parsedTimeout = 15;
        
        const db = (await import('../database.js')).default;
        db.updateGuildConfig(interaction.guild.id, { honeypotChannelId: channelId, honeypotTimeoutMinutes: parsedTimeout });
        
        const config = db.getGuildConfig(interaction.guild.id);
        const timeoutMinutes = config.honeypotTimeoutMinutes || 15;
        
        const { getAutoModPanel } = await import('../commands/security.js');
        const panel = await getAutoModPanel(interaction.guild);
        
        await cv2.respond(interaction, panel, 7).catch(() => null);
        
        const trapChannel = interaction.guild.channels.cache.get(channelId);
        if (trapChannel) {
          const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, EmbedBuilder, MessageFlags } = await import('discord.js');
          
          const container = new ContainerBuilder();
          
          const header = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Athena | Note**`));
            
          container.addSectionComponents(header);
          
          const trapText = `-# **This is trap channel don't send any \`messages\` here \`${timeoutMinutes} minutes timeout will happen\` if you send any \`fucking messages\` here**`;
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(trapText));
          
          const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };
          
          if (bannerUrl) {
            const embed = new EmbedBuilder().setImage(bannerUrl).setColor(config.accentColor || 0x2b2d31);
            payload.embeds = [embed];
          }
          
          trapChannel.send(payload).catch(() => null);
        }
        return;
      }

        if (interaction.customId === 'accent_modal') {
          const { handleAccentModal } = await import('../commands/accent.js');
          return handleAccentModal(interaction);
        }


      
      if (interaction.customId.startsWith('gw_setup_modal_')) {
        const { gwManagers, buildManagerContainer } = await import('../commands/giveaway.js');
        const ms = (await import('ms')).default;

        const managerId = interaction.customId.replace('gw_setup_modal_', '');
        const cfg = gwManagers.get(managerId);
        
        if (!cfg) return interaction.reply({ content: 'Session expired.', flags: MessageFlags.Ephemeral });

        const prize = interaction.fields.getTextInputValue('prize');
        const duration = interaction.fields.getTextInputValue('duration');
        const winners = parseInt(interaction.fields.getTextInputValue('winners')) || 1;

        const durationMs = ms(duration);
        if (!durationMs || durationMs < 10000) {
          return interaction.reply({ content: 'Invalid duration. Examples: 10m, 1h, 1d.', flags: MessageFlags.Ephemeral });
        }

        cfg.prize = prize;
        cfg.duration = duration;
        cfg.durationMs = durationMs;
        cfg.winners = Math.max(1, winners);

        gwManagers.set(managerId, cfg);
        return interaction.update({ components: [buildManagerContainer(managerId)], flags: 1 << 15 });
      }

      if (interaction.customId === 'vc_limit_modal') {
        const limitStr = interaction.fields.getTextInputValue('limit_input');
        const limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return interaction.reply({ content: 'Invalid limit. Must be a number between 0 and 99.', flags: MessageFlags.Ephemeral });
        }
        
        const vc = interaction.member.voice.channel;
        if (!vc) return interaction.reply({ content: 'You are not in a voice channel.', flags: MessageFlags.Ephemeral });

        // Basic check: Is it a custom VC?
        const j2cConfig = db.getGuildConfig(interaction.guild.id).j2c;
        if (!j2cConfig || vc.parentId !== j2cConfig.categoryId) {
           return interaction.reply({ content: 'You can only manage your own custom voice channel.', flags: MessageFlags.Ephemeral });
        }

        await vc.setUserLimit(limit);
        return interaction.reply({ content: `Channel limit set to ${limit}.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'vc_name_modal') {
        const newName = interaction.fields.getTextInputValue('name_input');
        const vc = interaction.member.voice.channel;
        if (!vc) return interaction.reply({ content: 'You are not in a voice channel.', flags: MessageFlags.Ephemeral });

        const j2cConfig = db.getGuildConfig(interaction.guild.id).j2c;
        if (!j2cConfig || vc.parentId !== j2cConfig.categoryId) {
           return interaction.reply({ content: 'You can only manage your own custom voice channel.', flags: MessageFlags.Ephemeral });
        }

        await vc.setName(newName);
        return interaction.reply({ content: `Channel renamed to \`${newName}\`.`, flags: MessageFlags.Ephemeral });
      }
      
      if (interaction.customId.startsWith('enuke_modal_')) {
        const { handleEnukeModal } = await import('../commands/enuke.js');
        return handleEnukeModal(interaction);
      }

      // Handle Whitelist limit modal
      if (interaction.customId.startsWith('wlModal_limit_')) {
        await handleWhitelistModal(interaction);
        return;
      }
    }

    // ==========================================
    // 3. INTERACTIVE COMPONENT BUTTON CLICKS
    // ==========================================
    
    if (interaction.isModalSubmit()) {
      
      
      if (interaction.customId === "modal_sec_extra_owner") {
          const targetId = interaction.fields.getTextInputValue("target_id");
          const db = (await import("../database.js")).default;
          db.addExtraOwner(interaction.guild.id, targetId);
          return interaction.reply({ content: `Successfully added Extra Owner: <@${targetId}>`, flags: MessageFlags.Ephemeral });
      }
if (interaction.customId === "modal_2fa_setup") {
        const email = interaction.fields.getTextInputValue("2fa_email");
        if (!email.includes("@")) return interaction.reply({ content: "Invalid email format.", flags: MessageFlags.Ephemeral });
        
        const code2fa = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const { send2FACode } = await import("../utils/mailer.js");
          send2FACode(email, code2fa, interaction.guild.name).catch(e => console.log('SMTP Error:', e.message));
          
          const db = (await import("../database.js")).default;
          db.updateGuildConfig(interaction.guild.id, {
            twoFactorEmail: email,
            pendingTwoFactorCode: code2fa,
            twoFactorVerified: false
          });

          
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("btn_verify_2fa").setLabel("Verify Code").setStyle(ButtonStyle.Success)
          );
          return interaction.editReply({ content: "A verification code has been dispatched to **" + email + "** (Check your Pterodactyl console if it doesn't arrive). Click below to enter it.", components: [row] });
        } catch (err) {
          return interaction.editReply({ content: "Failed to send email: " + err.message });
        }
      }
      
              if (interaction.customId === "btn_intercept_2fa") {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import("discord.js");
            const modal = new ModalBuilder()
                .setCustomId("modal_2fa_verify")
                .setTitle("Two-Factor Authentication");
            const codeInput = new TextInputBuilder()
                .setCustomId("2fa_code")
                .setLabel("Enter the 6-digit code sent to your email")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(6)
                .setMinLength(6);
            const row = new ActionRowBuilder().addComponents(codeInput);
            modal.addComponents(row);
            return interaction.showModal(modal);
        }

        if (interaction.customId === "modal_2fa_verify") {
        const inputCode = interaction.fields.getTextInputValue("2fa_code");
        const db = (await import("../database.js")).default;
        const config = db.getGuildConfig(interaction.guild.id);
        
        if (config.pendingTwoFactorCode && config.pendingTwoFactorCode === inputCode) {
          db.updateGuildConfig(interaction.guild.id, {
            twoFactorVerified: true,
            pendingTwoFactorCode: null
          });
          
          return interaction.reply({ content: "? **Gmail 2FA Successfully Configured!** Your server is now heavily protected.", flags: MessageFlags.Ephemeral });
        } else {
          return interaction.reply({ content: "? Incorrect verification code.", flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.customId === "modal_2fa_intercept") {
        const inputCode = interaction.fields.getTextInputValue("2fa_code");
        const db = (await import("../database.js")).default;
        const config = db.getGuildConfig(interaction.guild.id);
        
        if (config.pendingTwoFactorCode && config.pendingTwoFactorCode === inputCode) {
           db.updateGuildConfig(interaction.guild.id, { pendingTwoFactorCode: null });
           
           const sec = await import("../commands/security.js");
           if (sec.executeInterceptedAction) {
             return sec.executeInterceptedAction(interaction);
           } else {
             return interaction.reply({ content: "? Code verified. You may proceed.", flags: MessageFlags.Ephemeral });
           }
        } else {
           return interaction.reply({ content: "? Incorrect 2FA code. Action permanently blocked.", flags: MessageFlags.Ephemeral });
        }
      }
    }

    
    
    
    
    if (interaction.isButton() || interaction.isAnySelectMenu()) {


      if (interaction.customId === 'ytstats_refresh') {
        // Use a direct reply to bypass the buggy deferReply prototype
        await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Force refreshing YouTube Stats...**', flags: 64 }).catch(() => null);
        const { forceUpdateYtStats } = await import('../utils/ytStatsEngine.js');
        try {
          await forceUpdateYtStats(interaction.guild);
          return interaction.editReply({ content: '-# **Forced refresh complete!** Note: If the name did not change, Discord may be rate-limiting the channel.' }).catch(()=>null);
        } catch (e) {
          return interaction.editReply({ content: `-# **Refresh failed:** ${e.message}` }).catch(()=>null);
        }
      }
      if (interaction.customId.startsWith('ytstats_')) {
        const { handleYtStatsButton } = await import('../commands/ytstats.js');
        if (interaction.isButton()) return handleYtStatsButton(interaction);
      }
      if (interaction.customId.startsWith('autorole_')) {

        const { handleAutoRoleButton, handleAutoRoleMenu } = await import('../commands/autorole.js');
        if (interaction.isButton()) return handleAutoRoleButton(interaction);
        if (interaction.isAnySelectMenu()) return handleAutoRoleMenu(interaction);
      }
      if (interaction.customId.startsWith('autoreact_')) {

        const { handleAutoReactButton, handleAutoReactMenu } = await import('../commands/autoreact.js');
        if (interaction.isButton()) return handleAutoReactButton(interaction);
        if (interaction.isAnySelectMenu()) return handleAutoReactMenu(interaction);
      }


      // ==========================================
      // CREATEROLE INTERACTIVE HANDLERS
      // ==========================================
      if (interaction.isButton() && (interaction.customId.startsWith('cr_') && interaction.customId !== 'cr_confirm')) {
        const userId = interaction.user.id;
        const state = createRoleStates.get(userId);
        if (!state) return interaction.reply({ content: 'This session expired. Run `!createrole` again.', flags: 64 });

        const id = interaction.customId;

        if (id.startsWith('cr_perm_')) {
          const permKey = id.replace('cr_perm_', '');
          if (state.perms.includes(permKey)) {
            state.perms = state.perms.filter(p => p !== permKey);
          } else {
            state.perms.push(permKey);
          }
          createRoleStates.set(userId, state);
          return interaction.update(buildCreateRolePanel(state));
        }

        if (id === 'cr_prev') {
          const totalPages = Math.ceil(25 / 15);
          state.page = state.page === 0 ? totalPages - 1 : state.page - 1;
          createRoleStates.set(userId, state);
          return interaction.update(buildCreateRolePanel(state));
        }

        if (id === 'cr_next') {
          const totalPages = Math.ceil(25 / 15);
          state.page = state.page >= totalPages - 1 ? 0 : state.page + 1;
          createRoleStates.set(userId, state);
          return interaction.update(buildCreateRolePanel(state));
        }

        if (id === 'cr_allon') {
          const { PermissionFlagsBits: PF } = await import('discord.js');
          state.perms = Object.keys(PF).filter(k => PF[k] !== undefined && typeof PF[k] === 'bigint').map(k => k);
          createRoleStates.set(userId, state);
          return interaction.update(buildCreateRolePanel(state));
        }

        if (id === 'cr_alloff') {
          state.perms = [];
          createRoleStates.set(userId, state);
          return interaction.update(buildCreateRolePanel(state));
        }

        if (id === 'cr_setname') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
          const modal = new ModalBuilder().setCustomId('cr_modal_name').setTitle('Set Role Name');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_name').setLabel('Role Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'cr_setcolor') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
          const modal = new ModalBuilder().setCustomId('cr_modal_color').setTitle('Set Role Color');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_color').setLabel('Hex Color (e.g. #FF5733)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#FF5733')
          ));
          return interaction.showModal(modal);
        }

        if (id === 'cr_setposition') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
          const modal = new ModalBuilder().setCustomId('cr_modal_position').setTitle('Set Role Position');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_position').setLabel('Position number (1 = bottom, higher = top)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setPlaceholder('1')
          ));
          return interaction.showModal(modal);
        }
      }

      // CREATEROLE - CONFIRM
      if (interaction.isButton() && interaction.customId === 'cr_confirm') {
        const userId = interaction.user.id;
        const state = createRoleStates.get(userId);
        if (!state) return interaction.reply({ content: 'Session expired. Run `!createrole` again.', flags: 64 });
        if (!state.name) return interaction.reply({ content: 'Please set a role name first!', flags: 64 });

        const { PermissionsBitField } = await import('discord.js');
        const permBits = new PermissionsBitField();
        for (const perm of state.perms) {
          try { permBits.add(PermissionsBitField.Flags[perm]); } catch(e) {}
        }

        const roleData = {
          name: state.name,
          permissions: permBits,
          reason: `Created by ${interaction.user.tag} via !createrole`
        };
        if (state.color) roleData.color = state.color;

        const newRole = await interaction.guild.roles.create(roleData).catch(err => {
          interaction.reply({ content: `Failed to create role: ${err.message}`, flags: 64 });
          return null;
        });
        if (!newRole) return;

        if (state.position != null && state.position > 0) {
          const myHighest = interaction.guild.members.me.roles.highest.position;
          const safePos = Math.min(state.position, myHighest - 1);
          await newRole.setPosition(safePos).catch(() => null);
        }

        createRoleStates.delete(userId);

        const summary = cv2.success('Role Created', [
          `**Name:** ${newRole.name}`,
          `**Color:** ${state.color || 'None'}`,
          `**Permissions:** ${state.perms.length} permission(s) granted`,
          `**Position:** ${newRole.position}`,
          `**Role:** ${newRole}`
        ].join('\n'));
        return interaction.update(summary);
      }



      if (interaction.customId.startsWith('calc_')) {
        const { handleCalculatorButton } = await import('../commands/utility.js');
        return handleCalculatorButton(interaction);
      }

      if (interaction.customId.startsWith('autonick_')) {
        const { handleAutonickButton } = await import('../commands/security.js');
        return handleAutonickButton(interaction);
      }
      if (interaction.customId.startsWith('welcmgr_') || interaction.customId.startsWith('leavmgr_')) {
        const { handleWelcomeManagerButton, handleWelcomeManagerMenu } = await import('../commands/welcome.js');
        if (interaction.isButton()) return handleWelcomeManagerButton(interaction);
        if (interaction.isAnySelectMenu()) return handleWelcomeManagerMenu(interaction);
      }

        if (interaction.customId.startsWith('accent_') && !interaction.isModalSubmit()) {
          const { handleAccentButton } = await import('../commands/accent.js');
          return handleAccentButton(interaction);
        }


      // GIVEAWAY MANAGER HANDLERS
      if (interaction.customId.startsWith('gw_mode_') || interaction.customId.startsWith('gw_setup_') || interaction.customId.startsWith('gw_start_') || interaction.customId.startsWith('gw_manage_') || interaction.customId.startsWith('gw_end_') || interaction.customId.startsWith('gw_reroll_') || interaction.customId === 'gw_join') {
        const { gwManagers, buildManagerContainer } = await import('../commands/giveaway.js');
        const ms = (await import('ms')).default;
        
        if (interaction.customId === 'gw_join') {
          const messageId = interaction.message.id;
          const gwData = db.getGiveaway(messageId);
          if (!gwData || gwData.ended) return interaction.reply({ content: 'This giveaway is over or invalid!', flags: MessageFlags.Ephemeral });
          
          if (!gwData.participants.includes(interaction.user.id)) {
            gwData.participants.push(interaction.user.id);
            db.saveGiveaway(messageId, gwData);
            
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            originalEmbed.setFooter({ text: `${gwData.participants.length} Entries` });
            await interaction.update({ embeds: [originalEmbed] });
          } else {
            return interaction.reply({ content: 'You have already entered this giveaway!', flags: MessageFlags.Ephemeral });
          }
          return;
        }

        if (interaction.customId.startsWith('gw_end_')) {
          const { endGiveaway } = await import('../commands/giveaway.js');
          const targetMsgId = interaction.customId.replace('gw_end_', '');
          const gwData = db.getGiveaway(targetMsgId);
          if (!gwData || gwData.ended) return interaction.reply({ content: 'Giveaway not found or already ended.', flags: MessageFlags.Ephemeral });
          
          await interaction.reply({ content: 'Ending giveaway...', flags: MessageFlags.Ephemeral });
          await endGiveaway(interaction.client, targetMsgId, gwData);
          return interaction.editReply({ content: 'Giveaway ended successfully!' });
        }

        if (interaction.customId.startsWith('gw_reroll_')) {
          const targetMsgId = interaction.customId.replace('gw_reroll_', '');
          const gwData = db.getGiveaway(targetMsgId);
          if (!gwData || !gwData.ended) return interaction.reply({ content: 'Giveaway not found or is still active. End it first!', flags: MessageFlags.Ephemeral });
          
          const participants = gwData.participants || [];
          if (participants.length === 0) return interaction.reply({ content: 'Nobody entered this giveaway.', flags: MessageFlags.Ephemeral });
          
          const newWinnerId = participants[Math.floor(Math.random() * participants.length)];
          const EMOJI_WINNER = '<a:giveaway:1533844904604864603>';
          
          // Reply publicly in the channel instead of ephemeral
          return interaction.channel.send({ content: `Rerolled the giveaway! The new winner is <@${newWinnerId}>! ${EMOJI_WINNER}` });
        }

        const managerId = interaction.customId.split('_').slice(2).join('_');
        const cfg = gwManagers.get(managerId);

        if (!cfg) {
          return interaction.reply({ content: 'This giveaway manager session has expired.', flags: MessageFlags.Ephemeral });
        }

        if (interaction.user.id !== cfg.hostId) {
          return interaction.reply({ content: 'You are not the host of this manager.', flags: MessageFlags.Ephemeral });
        }

        
        if (interaction.customId.startsWith('gw_manage_')) {
          const allGw = db.getActiveGiveaways() || [];
          const guildGw = allGw.filter(g => g.guildId === interaction.guild.id);
          
          if (guildGw.length === 0) {
            return interaction.reply({ content: 'There are no active or ended giveaways stored in this server.', flags: MessageFlags.Ephemeral });
          }

          const recentGw = guildGw.slice(-25).reverse();

          const options = recentGw.map(gw => {
            return {
              label: gw.prize.length > 50 ? gw.prize.substring(0, 47) + '...' : gw.prize,
              description: `${gw.ended ? 'Ended' : 'Active'} | ${gw.participants?.length || 0} Entries`,
              value: gw.messageId
            };
          });

          const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('gw_manage_select')
              .setPlaceholder('Select a giveaway to manage...')
              .addOptions(options)
          );

          return interaction.reply({ content: 'Select a giveaway from the list below:', components: [selectRow], flags: MessageFlags.Ephemeral });
        }
        
        if (interaction.isStringSelectMenu() && interaction.customId === 'gw_manage_select') {
          const targetMsgId = interaction.values[0];
          const gwData = db.getGiveaway(targetMsgId);
          
          if (!gwData) {
            return interaction.update({ content: 'Giveaway no longer exists in database.', components: [] });
          }

          const embed = new EmbedBuilder()
            .setTitle('Manage Giveaway')
            .setDescription(`Prize: **${gwData.prize}**\nStatus: **${gwData.ended ? 'Ended' : 'Active'}**\nEntries: **${(gwData.participants || []).length}**`)
            .setColor('#5865F2');

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gw_end_${targetMsgId}`).setLabel('End Giveaway').setStyle(ButtonStyle.Danger).setDisabled(gwData.ended),
            new ButtonBuilder().setCustomId(`gw_reroll_${targetMsgId}`).setLabel('Reroll Winner').setStyle(ButtonStyle.Secondary).setDisabled(!gwData.ended)
          );

          return interaction.update({ content: '', embeds: [embed], components: [row] });
        }

        
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('gw_mode_')) {
          cfg.mode = interaction.values[0];
          gwManagers.set(managerId, cfg);
          return interaction.update({ components: [buildManagerContainer(managerId)], flags: 1 << 15 });
        }

        if (interaction.customId.startsWith('gw_setup_')) {
          const modal = new ModalBuilder()
            .setCustomId(`gw_setup_modal_${managerId}`)
            .setTitle('Giveaway Setup');

          const prizeInput = new TextInputBuilder()
            .setCustomId('prize')
            .setLabel('Prize')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.prize === 'Not Set' ? '' : cfg.prize)
            .setRequired(true);

          const durationInput = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Duration (e.g. 10m, 1h, 1d)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.duration === 'Not Set' ? '' : cfg.duration)
            .setRequired(true);

          const winnersInput = new TextInputBuilder()
            .setCustomId('winners')
            .setLabel('Number of Winners')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.winners.toString())
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(prizeInput),
            new ActionRowBuilder().addComponents(durationInput),
            new ActionRowBuilder().addComponents(winnersInput)
          );

          return interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('gw_start_')) {
          if (cfg.prize === 'Not Set' || cfg.durationMs < 10000) {
            return interaction.reply({ content: 'Please configure the prize and duration first! Minimum duration is 10s.', flags: MessageFlags.Ephemeral });
          }

          const endsAt = Date.now() + cfg.durationMs;
          const endsAtTimestamp = Math.floor(endsAt / 1000);

          const guildConfig = db.getGuildConfig(interaction.guild.id) || {};
          const accentColor = guildConfig.accentColor || '#5865F2';
          
          const EMOJI_HEADER = '<a:emoji_11:1533024044075454464>';
          const EMOJI_JOIN = '<a:emoji_56:1533024028451672257>';

          const gwEmbed = new EmbedBuilder()
            .setDescription(`## ${EMOJI_HEADER} GIVEAWAY ${EMOJI_HEADER}\n\n**Prize:** ${cfg.prize}\n**Ends:** <t:${endsAtTimestamp}:R> (<t:${endsAtTimestamp}:f> IST)\n**Hosted By:** <@${cfg.hostId}>\n**Winners:** ${cfg.winners}\n\nClick the button below to enter!`)
            .setColor(accentColor)
            .setFooter({ text: '0 Entries' })
            .setTimestamp(new Date(endsAt));

          const joinButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('gw_join')
              .setLabel('Join')
              .setStyle(ButtonStyle.Primary)
              .setEmoji(EMOJI_JOIN)
          );

          await interaction.message.delete().catch(() => null);

          const message = await interaction.channel.send({ embeds: [gwEmbed], components: [joinButton] });

          db.saveGiveaway(message.id, {
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            hostId: cfg.hostId,
            prize: cfg.prize,
            winnersCount: cfg.winners,
            endsAt: endsAt,
            mode: cfg.mode,
            participants: []
          });

          gwManagers.delete(managerId);
          return;
        }
      }

      // SERVER SCANNER BUTTONS
      if (interaction.customId.startsWith('scanserver_')) {
        const { handleScanServer } = await import('../commands/security.js');
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const page = parseInt(parts[2] || '0', 10);
        
        try {
          if (action === 'prev') {
            const newPanel = await handleScanServer(interaction.guild, page - 1);
            return await cv2.respond(interaction, newPanel, 7);
          }
          if (action === 'next') {
            const newPanel = await handleScanServer(interaction.guild, page + 1);
            return await cv2.respond(interaction, newPanel, 7);
          }
          if (action === 'ban') {
             const botId = interaction.values[0];
             await interaction.guild.members.ban(botId, { reason: 'Unauthorized Bot Banned via Scanner' }).catch(() => null);
             const newPanel = await handleScanServer(interaction.guild, page);
             return await cv2.respond(interaction, newPanel, 7);
          }
          if (action === 'banall') {
             await interaction.guild.members.fetch();
             const db = (await import('../database.js')).default;
             const config = db.getGuildConfig(interaction.guild.id);
             const whitelistedIds = config.botWhitelist || [];
             const allBots = interaction.guild.members.cache.filter(m => m.user.bot && !whitelistedIds.includes(m.id) && m.id !== interaction.client.user.id);
             
             for (const [id, bot] of allBots) {
                await interaction.guild.members.ban(id, { reason: 'Mass Ban via Scanner' }).catch(() => null);
             }
             const newPanel = await handleScanServer(interaction.guild, page);
             return await cv2.respond(interaction, newPanel, 7);
          }
        } catch (err) {
          console.error(err);
          return await interaction.reply({ content: 'An error occurred while processing the scanner action.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }

      // VERIFICATION BUTTON
      if (interaction.customId === 'verify_button') {
        const verifyData = db.getVerification(interaction.guild.id);
        if (!verifyData || !verifyData.roleId) {
          return await interaction.reply({ content: '-# **Verification system is not properly configured.**', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        
        try {
          const role = interaction.guild.roles.cache.get(verifyData.roleId) || await interaction.guild.roles.fetch(verifyData.roleId).catch(() => null);
          if (!role) {
             return await interaction.reply({ content: '-# **The verification role no longer exists.**', flags: MessageFlags.Ephemeral }).catch(() => null);
          }
          if (interaction.member.roles.cache.has(verifyData.roleId)) {
             return await interaction.reply({ content: '-# **You are already verified.**', flags: MessageFlags.Ephemeral }).catch(() => null);
          }

          // If Image Captcha mode
          if (verifyData.mode === 'captcha') {
            const buffer = generateImageCaptcha(interaction.guild.id, interaction.user.id);
            const attachment = new AttachmentBuilder(buffer, { name: 'captcha.png' });
            const promptRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('verify_captcha_open_modal')
                .setLabel('Enter CAPTCHA Solution')
                .setStyle(ButtonStyle.Primary)
            );
            const container = cv2.info(
              'Security Verification Challenge',
              'Please view the image below and click **Enter CAPTCHA Solution** to submit the 6 characters displayed.\n-# \u2022 This verification challenge blocks automated bot raids with zero false positives.'
            );
            return await interaction.reply({
              components: [container.components[0], promptRow],
              files: [attachment],
              flags: MessageFlags.Ephemeral
            }).catch(() => null);
          }

          // If Math mode
          if (verifyData.mode === 'math') {
            const question = generateMathCaptcha(interaction.guild.id, interaction.user.id);
            const modal = new ModalBuilder()
              .setCustomId('verify_math_modal')
              .setTitle('Arithmetic Verification');
            const mathInput = new TextInputBuilder()
              .setCustomId('math_solution')
              .setLabel(question)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(5);
            modal.addComponents(new ActionRowBuilder().addComponents(mathInput));
            return await interaction.showModal(modal).catch(() => null);
          }

          // Default Button Mode
          await interaction.member.roles.add(role);
          return await interaction.reply({ 
            ...cv2.asEphemeral(cv2.success('Identity Authenticated', 'You have been granted access to the server.')),
            flags: MessageFlags.Ephemeral 
          }).catch(() => null);
        } catch (err) {
          return await interaction.reply({ content: '-# **Failed to assign the verification role. Ensure my role is higher than the verification role.**', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }

      if (interaction.customId === 'verify_captcha_open_modal') {
        const modal = new ModalBuilder()
          .setCustomId('verify_captcha_modal')
          .setTitle('Submit CAPTCHA Solution');
        const codeInput = new TextInputBuilder()
          .setCustomId('captcha_solution')
          .setLabel('Enter the 6 characters from image')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(8);
        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        return await interaction.showModal(modal).catch(() => null);
      }


      // AUTH SELECTORS
      if (interaction.customId.startsWith('auth_select_')) {
        const { isServerAdmin } = await import('../utils/helpers.js');
        if (!isServerAdmin(interaction.member, interaction.guild.id)) {
          return await interaction.reply({ content: '-# **Access Denied. Only Server Admins can modify Auth Tiers.**', flags: 64 }).catch(()=>null);
        }
      
        const tier = interaction.customId.split('_')[2]; // admin, mod, or staff
        const selectedRoles = interaction.values; // Array of Role IDs
        
        db.updateAuthRoles(interaction.guild.id, tier, selectedRoles);
        
        const { buildAuthPayload } = await import('../commands/auth.js');
        const payload = buildAuthPayload(interaction.guild.id);
        
        return await interaction.update(payload).catch(() => null);
      }
      // ENUKE BUTTON
      if (interaction.customId.startsWith('enuke_open_manager_')) {
        const { handleEnukeButton } = await import('../commands/enuke.js');
        return handleEnukeButton(interaction);
      }

      // RATE EDIT BUTTONS
      if (interaction.customId.startsWith('rate_edit_')) {
        const action = interaction.customId.replace('rate_edit_', '');
        const ratingData = db.getEditRating(interaction.message.id);

        if (!ratingData) {
          return interaction.reply({ content: 'This rating session has expired or is invalid.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }

        if (action === 'delete') {
          // Only author or admin can delete
          if (interaction.user.id !== ratingData.authorId && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: 'You can only remove your own edits!', flags: MessageFlags.Ephemeral }).catch(() => null);
          }
          db.deleteEditRating(interaction.message.id);
          await interaction.message.delete().catch(() => null);
          return interaction.reply({ content: 'Edit rating post removed.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }

        const stars = parseInt(action);
        if (isNaN(stars) || stars < 1 || stars > 5) return interaction.deferUpdate().catch(() => null);

        // Prevent self-rating
        if (interaction.user.id === ratingData.authorId) {
          return interaction.reply({ content: 'You cannot rate your own edit!', flags: MessageFlags.Ephemeral }).catch(() => null);
        }

        // Save rating
        db.updateEditRating(interaction.message.id, interaction.user.id, interaction.user.username, stars);

        // Calculate new stats
        const updatedData = db.getEditRating(interaction.message.id);
        const votes = Object.values(updatedData.votes);
        const totalVotes = votes.length;
        const totalStars = votes.reduce((acc, v) => acc + v.stars, 0);
        const avgRating = (totalStars / totalVotes).toFixed(1);

        // Get last 5 ratings — repeated stars per vote
        const STAR_EMOJI = '<a:1z:1517089474369032253>';
        const latestRatings = Object.entries(updatedData.votes)
          .reverse()
          .slice(0, 5)
          .map(([id, v]) => `**${v.name}:** ${STAR_EMOJI.repeat(v.stars)}`)
          .join('\n');

        // Rebuild as borderless CV2 panel
        const { buildRateContainer } = await import('../commands/rate.js');
        const updatedPanel = buildRateContainer(
          updatedData.authorName,
          avgRating,
          totalVotes,
          latestRatings || '_No ratings yet_',
          updatedData.mediaUrl
        );

        await interaction.update(updatedPanel).catch(() => null);
        return;
      }


      // RECORD BUTTONS
      if (interaction.customId.startsWith('record_stop')) {
        const targetGuildId = interaction.customId.split('_')[2] || interaction.guild?.id;
        if (!targetGuildId) return interaction.reply({ content: '<:off:1533844858983157851> Cannot determine target server.', flags: 64 });
        const vc = interaction.member?.voice?.channel;
        const vcName = vc ? vc.name : 'Voice Channel';
        const container = {
          type: 17,
          components: [
            { type: 10, content: `## Voice Recording Stopped | <a:atheNATICK:1557841381630681106>\n\n-# Channel: 🔊 **${vcName}**\n\n-# Processing and exporting the audio file, please wait...` },
            { type: 14, divider: true },
            { type: 10, content: '-# Athena Bulletproof Security' }
          ]
        };
        try { await cv2.respond(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 }, 7); } catch(err) { console.error("INTERACTION ERROR:", err); }
        
        try {
          const { stopRecording } = await import('../utils/audioRecorder.js');
          const result = await stopRecording(targetGuildId);
          if (!result) {
            const emptyContainer = { type: 17, components: [{ type: 10, content: '-# <:off:1533844858983157851> No active recording found for this server.' }] };
            return interaction.message.edit({ components: [emptyContainer] });
          }
          
          const targetGuild = interaction.client.guilds.cache.get(targetGuildId) || interaction.guild;
          const durSec = Math.floor(result.durationMs / 1000);
          const durationStr = `${Math.floor(durSec/60)}m ${durSec%60}s`;
          const startDate = new Date(result.startTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

          const dmContainer = {
            type: 17,
            components: [
              { type: 10, content: `## Athena Voice Export | <a:atheNATICK:1557841381630681106>` },
              {
                type: 9,
                components: [{ type: 10, content: `-# **Server :** **${targetGuild ? targetGuild.name : 'Unknown'}**\n-# **Channel :** **${vcName}**\n-# **Started At :** **${startDate}**\n-# **Duration :** **${durationStr}**\n-# **Speakers Detected :** **${result.userCount || 1}**` }],
                accessory: { type: 11, media: { url: (targetGuild ? targetGuild.iconURL({ dynamic: true }) : null) || 'https://i.imgur.com/8Qj85vP.png' } }
              },
              { type: 14, divider: true },
              { type: 10, content: `-# **Audio file is attached below.**` }
            ]
          };

          const fs = await import('fs');
          const { AttachmentBuilder } = await import('discord.js');
          const audioBuffer = fs.readFileSync(result.mp3Path);
          const cleanServerName = (targetGuild ? targetGuild.name : 'Server').replace(/[^a-zA-Z0-9_-]/g, '_');
          const cleanVcName = vcName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `${cleanServerName}_${cleanVcName}.mp3`;
          const audioAttachment = new AttachmentBuilder(audioBuffer, { name: fileName });

          let dmDelivered = false;
          try {
            await interaction.user.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
            await interaction.user.send({ content: `-# 🔊 **Playable Voice Recording** (${durationStr})`, files: [audioAttachment] });
            dmDelivered = true;
          } catch (e) {
            dmDelivered = false;
          }

          if (dmDelivered) {
            const successContainer = { type: 17, components: [{ type: 10, content: `-# **Audio Export Successful | <a:atheNATICK:1557841381630681106>**\n-# Delivered securely to your DMs.` }] };
            await interaction.message.edit({ components: [successContainer] });
          } else {
            const channelFallbackContainer = {
              type: 17,
              components: [
                { type: 10, content: `## Athena Voice Export | <a:atheNATICK:1557841381630681106>` },
                {
                  type: 9,
                  components: [{ type: 10, content: `-# **Server :** **${targetGuild ? targetGuild.name : 'Unknown'}**\n-# **Channel :** **${vcName}**\n-# **Started At :** **${startDate}**\n-# **Duration :** **${durationStr}**\n-# **Note :** Your DMs are closed, so the audio was delivered here.` }],
                  accessory: { type: 11, media: { url: (targetGuild ? targetGuild.iconURL({ dynamic: true }) : null) || 'https://i.imgur.com/8Qj85vP.png' } }
                },
                { type: 14, divider: true },
                { type: 10, content: `-# **Audio file is attached below.**` }
              ]
            };
            await interaction.followUp({ components: [channelFallbackContainer], flags: MessageFlags.IsComponentsV2 });
            await interaction.followUp({ content: `${interaction.user}, here is your voice recording:`, files: [audioAttachment] });
            const successContainer = { type: 17, components: [{ type: 10, content: `-# **Audio Export Successful | <a:atheNATICK:1557841381630681106>**\n-# Delivered in this channel (DMs closed).` }] };
            await interaction.message.edit({ components: [successContainer] });
          }

          try { fs.unlinkSync(result.mp3Path); } catch(e) {}
        } catch (err) {
          const errContainer = { type: 17, components: [{ type: 10, content: `-# <:off:1533844858983157851> **Recording Stopped:** ${err.message}` }] };
          await interaction.message.edit({ components: [errContainer] });
        }
        return;
      }

      if (interaction.customId.startsWith('record_status')) {
        const targetGuildId = interaction.customId.split('_')[2] || interaction.guild?.id;
        if (!targetGuildId) return interaction.reply({ content: '<:off:1533844858983157851> Cannot determine target server.', flags: 64 });
        const { getRecordingStatus } = await import('../utils/audioRecorder.js');
        const isActive = getRecordingStatus(targetGuildId);
        const container = {
          type: 17,
          components: [
            { type: 10, content: `## Voice Recording Status | <a:uptime:1552608831060844575>\n-# Status: ${isActive ? '<a:uptime:1552608831060844575> **Recording Active**' : '<:off:1533844858983157851> **Inactive**'}` },
            { type: 14, divider: true },
            { type: 10, content: '-# Athena Bulletproof Security' }
          ]
        };
        try { return await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true }); } catch(err) { console.error("INTERACTION ERROR:", err); }
      }

      // MEDIA PROMPT BUTTONS
      if (interaction.customId.startsWith('dl_mp4') || interaction.customId.startsWith('dl_mp3')) {
        const isMp4 = interaction.customId.startsWith('dl_mp4');
        const parts = interaction.customId.split('_');
        const customMessageId = parts.length > 2 ? parts[2] : null;
        const originalMessageId = customMessageId || (interaction.message.reference ? interaction.message.reference.messageId : null);

        let url = customMessageId ? downloader.mediaUrlCache.get(customMessageId) : null;
        let originalMessage = null;

        if (originalMessageId) {
          try {
            originalMessage = await interaction.channel.messages.fetch(originalMessageId).catch(() => null);
          } catch (e) {}
        }

        if (!url && originalMessage) {
          const urlMatch = originalMessage.content.match(/(https?:\/\/[^\s]+)/);
          url = urlMatch ? urlMatch[0] : null;
        }

        if (!url) {
          return interaction.reply({ content: '-# **Could not retrieve media URL from that post.**', flags: MessageFlags.Ephemeral });
        }

        if (!originalMessage) {
          originalMessage = {
            id: originalMessageId || interaction.id,
            author: interaction.user,
            channel: interaction.channel,
            content: url,
            delete: async () => {},
            reply: async (data) => interaction.channel.send(data)
          };
        }

        await interaction.update({ content: `-# **Downloading ${isMp4 ? 'MP4' : 'MP3'}...**`, components: [] });

        let success = false;
        try {
          if (isMp4) {
            success = await downloader.processMediaLink(interaction.client, originalMessage, url);
          } else {
            success = await downloader.processMp3Link(interaction.client, originalMessage, url);
          }

          if (!success) {
            await interaction.message.edit({ content: `-# **Failed to download media.**` }).catch(() => null);
          } else {
            await interaction.message.delete().catch(() => null);
          }
        } catch (error) {
          console.error('[Media Prompt Error]:', error);
          await interaction.message.edit({ content: `-# **An error occurred while downloading.**` }).catch(() => null);
        }
        return;
      }

      // GIVEAWAY BUTTONS
      if (interaction.customId.startsWith('gw_join_')) {
        const messageId = interaction.customId.split('_')[2];
        const gwData = db.getGiveaway(interaction.guild.id, messageId);
        
        if (!gwData || !gwData.active) {
          return interaction.reply(cv2.e.danger('Giveaway Ended', 'This giveaway has already ended or does not exist.'));
        }

        if (gwData.participants.includes(interaction.user.id)) {
          // Remove them
          gwData.participants = gwData.participants.filter(id => id !== interaction.user.id);
          db.saveGiveaways();
          await interaction.reply(cv2.e.info('Left Giveaway', 'You have left the giveaway.'));
        } else {
          // Add them
          gwData.participants.push(interaction.user.id);
          db.saveGiveaways();
          await interaction.reply(cv2.e.success('Joined Giveaway', 'You have successfully entered the giveaway! Good luck!'));
        }

        // Update the embed participant count
        const { getActiveGiveawayPanel } = await import('../commands/giveaway.js');
        const panel = getActiveGiveawayPanel(gwData);
        await interaction.message.edit(panel).catch(console.error);
        return;
      }
      
      // LEVELING BUTTONS
      if (interaction.customId === 'xp_dash') {
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, { ...panel, flags: (panel.flags || 32768) | MessageFlags.Ephemeral }, 4);
      }

      if (interaction.customId === 'xp_toggle') {
        const system = db.getXpSystem(interaction.guild.id);
        db.setXpSystem(interaction.guild.id, { ...system, enabled: !system.enabled });
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.customId === 'xp_set_announce') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        const modal = new ModalBuilder().setCustomId('xp_announce_modal').setTitle('Set Announce Channel');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channel_id').setLabel('Paste the channel ID here').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'xp_set_cmd') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        const modal = new ModalBuilder().setCustomId('xp_cmd_modal').setTitle('Set Command Channel');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channel_id').setLabel('Paste the channel ID here').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'xp_clear') {
        db.setXpSystem(interaction.guild.id, { enabled: false, announceChannelId: null, cmdChannelId: null, roleRewards: {}, multipliers: {} });
        const panel = await buildXpDashboard(interaction.guild.id);
        return cv2.respond(interaction, panel, 7);
      }

      if (interaction.customId === 'xp_save') {
        return interaction.reply({ content: '<:emoji_16:1533860111704002665> XP settings saved successfully!', flags: 64 });
      }

      // VOICE CONTROL BUTTONS
      if (interaction.customId.startsWith('vc_')) {
        const vc = interaction.member.voice.channel;
        if (!vc) {
          return interaction.reply(cv2.e.danger('Not in VC', 'You must be in a Voice Channel to use this control.'));
        }
        
        const j2cConfig = db.getGuildConfig(interaction.guild.id).j2c;
        if (!j2cConfig || vc.parentId !== j2cConfig.categoryId) {
          return interaction.reply(cv2.e.danger('Not a Custom VC', 'You can only control your own Join-to-Create custom channel.'));
        }

        const action = interaction.customId.split('_')[1];

        if (action === 'lock') {
          await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
          return interaction.reply({ content: 'Channel Locked.', flags: MessageFlags.Ephemeral });
        }
        if (action === 'unlock') {
          await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null });
          return interaction.reply({ content: 'Channel Unlocked.', flags: MessageFlags.Ephemeral });
        }
        if (action === 'hide') {
          await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
          return interaction.reply({ content: 'Channel Hidden.', flags: MessageFlags.Ephemeral });
        }
        if (action === 'unhide') {
          await vc.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null });
          return interaction.reply({ content: 'Channel Visible.', flags: MessageFlags.Ephemeral });
        }
        if (action === 'limit') {
          const modal = new ModalBuilder()
            .setCustomId('vc_limit_modal')
            .setTitle('Set User Limit');
          const input = new TextInputBuilder()
            .setCustomId('limit_input')
            .setLabel('Enter limit (0-99, 0 for unlimited)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }
        if (action === 'name') {
          const modal = new ModalBuilder()
            .setCustomId('vc_name_modal')
            .setTitle('Change Channel Name');
          const input = new TextInputBuilder()
            .setCustomId('name_input')
            .setLabel('New Channel Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }
        if (action === 'info') {
          return interaction.reply({ content: `**Channel Info**\nName: ${vc.name}\nBitrate: ${vc.bitrate / 1000}kbps\nLimit: ${vc.userLimit === 0 ? 'None' : vc.userLimit}\nConnected: ${vc.members.size}`, flags: MessageFlags.Ephemeral });
        }
        if (action === 'claim') {
          const currentOwner = vc.name.split("'s")[0]; 
          // It's a crude check, a real system tracks the owner ID in the DB.
          return interaction.reply({ content: 'Ownership claiming is not yet fully implemented.', flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.isButton() && interaction.customId.startsWith('gen_invite_')) {
        const targetGuildId = interaction.customId.split('_')[2];
        const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
        if (!targetGuild) {
          return interaction.reply({ content: 'I am no longer in that server.', flags: 64 });
        }
        
        // Find a suitable channel to create an invite
        const channel = targetGuild.channels.cache.find(c => c.type === 0 && c.permissionsFor(targetGuild.members.me).has('CreateInstantInvite'));
        if (!channel) {
          return interaction.reply({ content: 'I do not have permission to create invites in that server, or there are no text channels.', flags: 64 });
        }
        
        try {
          const invite = await channel.createInvite({ maxAge: 86400, maxUses: 1 });
          return interaction.reply({ content: `Here is your invite for **${targetGuild.name}**: ${invite.url}`, flags: 64 });
        } catch (err) {
          console.error(err);
          return interaction.reply({ content: 'Failed to create invite.', flags: 64 });
        }
      }

      await handleSecurityInteractions(interaction, guild);
    }

  } catch (error) {
    if (error.code !== 10062 && !error.message?.includes('Unknown interaction')) console.error('Interaction Error:', error);
  }
  } // close execute
}; // close object

async function handleSecurityInteractions(interaction, guild) {
  if (!guild) return;
  const customId = interaction.customId;
  const config = db.getGuildConfig(guild.id);

    if (customId === 'sec_module_manage') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getAntinukeConfigPanel(guild);
        return cv2.respond(interaction, panel, 7);
      } catch(e) { console.error(e); }
    }

    // ⚡ Real-Time Live Security Records Panel & Pagination
    if (customId === 'sec_live_records' || customId.startsWith('sec_records_refresh') || customId.startsWith('sec_records_page_')) {
      try {
        const sec = await import('../commands/security.js');
        let page = 0;
        if (customId.startsWith('sec_records_page_')) {
          page = parseInt(customId.replace('sec_records_page_', '')) || 0;
        } else if (customId.startsWith('sec_records_refresh_')) {
          page = parseInt(customId.replace('sec_records_refresh_', '')) || 0;
        }
        const panel = await sec.getSecurityLiveRecordsPanel(guild, page);
        return interaction.update(panel);
      } catch (e) { console.error(e); }
    }

    // ⚡ Clear Security Live Records History (Owner only)
    if (customId === 'sec_records_clear') {
      const isAllowed = isBotOwnerSync(interaction.user.id) || interaction.user.id === guild.ownerId || db.isExtraOwner(guild.id, interaction.user.id);
      if (!isAllowed) {
        return interaction.reply({ content: '-# <:cross_red:1533860128015519895> Only the **Server Owner** or **Extra Owners** can clear live audit records.', flags: MessageFlags.Ephemeral });
      }
      db.clearSecurityLiveRecords(guild.id);
      const sec = await import('../commands/security.js');
      const panel = await sec.getSecurityLiveRecordsPanel(guild, 0);
      return interaction.update(panel);
    }

    // ⚡ One-Click Engage All Security Shields
    if (customId === 'sec_enable_all') {
      const isBotOwner = isBotOwnerSync(interaction.user.id);
      const isAllowed = isBotOwner || interaction.user.id === guild.ownerId;
      if (!isAllowed) {
        return interaction.reply({ content: '-# Only the **Server Owner** or **Bot Owner** can engage all security shields.', flags: MessageFlags.Ephemeral });
      }

      const sec = await import('../commands/security.js');
      const config = db.getGuildConfig(guild.id);
      if (config.securityEnabled && config.antiNukeEnabled) {
        return interaction.reply({ content: '-# Security shields are already enabled on this server. To re-enable or refresh the system, please use `!security disable all` first, and then run `!security enable all` again.', flags: MessageFlags.Ephemeral });
      }

      const req = sec.checkSecurityRequirements(guild, interaction.user);
      if (!req.canEnable) {
        const warningCard = sec.buildSecurityRequirementsWarning(guild, req);
        return interaction.reply({ ...warningCard, flags: MessageFlags.Ephemeral });
      }

      await interaction.deferUpdate();
      
      // Step 1: Animated Setup Checklist
      const success = await sec.runSecurityEnableSequence(guild, async (payload) => {
        await interaction.editReply(payload).catch(() => null);
      }, interaction.user);

      if (!success) return;

      // Step 2: Terms of Service & Security Configuration Guide
      const tosPanel = await sec.getServerSecurityEnabledPanel();
      if (interaction.channel) await interaction.channel.send(tosPanel).catch(() => null);

      // Step 3: Interactive Security Dashboard with Action Row Buttons
      const panel = await sec.getSecureDashboardPanel(guild);
      if (interaction.channel) await interaction.channel.send(panel).catch(() => null);
      return;
    }

    if (customId === 'sec_disable_all_btn') {
      const isBotOwner = isBotOwnerSync(interaction.user.id);
      const isAllowed = isBotOwner || interaction.user.id === guild.ownerId;
      if (!isAllowed) {
        return interaction.reply({ content: '-# Only the **Server Owner** or **Bot Owner** can disengage security shields.', flags: MessageFlags.Ephemeral });
      }
      const sec = await import('../commands/security.js');
      await interaction.deferReply();
      const result = await sec.handleSecurityToggleAll(guild, interaction.member, false);
      return interaction.editReply(result);
    }

    
    if (customId === "sec_close_dash") {
      try {
        return interaction.message.delete();
      } catch(e) {}
    }

    if (customId === "sec_rescan_dash") {
      try {
        const sec = await import("../commands/security.js");
        const panel = await sec.getSecureDashboardPanel(guild);
        return cv2.respond(interaction, panel, 7);
      } catch(e) { console.error(e); }
    }

            if (customId === "sec_extra_owner") {
      const modal = new ModalBuilder().setCustomId("modal_sec_extra_owner").setTitle("Add Extra Owner");
      const input = new TextInputBuilder().setCustomId("target_id").setLabel("User ID to add").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
    
    if (customId === "sec_wl_user" || customId === "sec_wl_role") {
      const { getWhitelistOverviewPanel } = await import("../commands/security.js");
      const panel = await getWhitelistOverviewPanel(interaction.guild);
      return cv2.respond(interaction, { ...panel, flags: (panel.flags || 32768) | MessageFlags.Ephemeral }, 4);
    }

    if (customId === "sec_2fa_gmail") {
      const modal = new ModalBuilder().setCustomId("modal_2fa_setup").setTitle("Configure Gmail 2FA");
      const emailInput = new TextInputBuilder().setCustomId("2fa_email").setLabel("Your Athena Gmail Address").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("admin@gmail.com");
      modal.addComponents(new ActionRowBuilder().addComponents(emailInput));
      return interaction.showModal(modal);
    }

    if (customId === 'sec_close') {
      try {
        return interaction.message.delete();
      } catch(e) { console.error(e); }
    }

    // 🍯 Honeypot Raider Sentry Controls
    if (customId === 'sec_honeypot_deploy') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleHoneypotCommand(guild, interaction.member, 'deploy');
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_honeypot_remove') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleHoneypotCommand(guild, interaction.member, 'remove');
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    // 👻 Anti-GhostPing Sentry Toggle
    if (customId === 'sec_antighostping_toggle') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleAntiGhostPingCommand(guild, interaction.member, 'toggle');
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    // 🔒 Quarantine Vault Roster Actions
    if (customId === 'sec_mass_unquarantine') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleMassUnquarantineAction(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_mass_ban_quarantine') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleMassBanQuarantineAction(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_quarantine_extend') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleExtendQuarantineAction(guild, interaction.member, 15);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_quarantine_refresh') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getQuarantineListPanel(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    // 🏥 Server Health Scorecard & Auto-Fix
    if (customId === 'sec_health_rescan' || customId === 'sec_health_btn') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getSecurityHealthPanel(guild);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_fix_vectors') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleAutoFixHealthVectors(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    // ⚡ Zero-Risk Nuke Attack Simulator
    if (customId === 'sec_simnuke_rerun' || customId === 'sec_simnuke_btn') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleSimNukeCommand(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    // 🎙️ Tactical Voice Briefing Quick Button
    if (customId === 'sec_briefing_btn') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.handleTacticalBriefing(guild, interaction.member, interaction.channel, interaction.member.voice?.channel);
        return interaction.reply({ ...panel, flags: (panel.flags || 32768) | MessageFlags.Ephemeral });
      } catch (e) { console.error(e); }
    }

    // 📜 Defense Matrix Black Box
    if (customId === 'sec_panichistory_btn') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getPanicHistoryPanel(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (customId === 'sec_clear_panic_history') {
      const isOwnerOrExtra = isBotOwnerSync(interaction.user.id) || interaction.user.id === guild.ownerId || db.isExtraOwner(guild.id, interaction.user.id);
      if (!isOwnerOrExtra) {
        return interaction.reply({ content: '-# Only the **Server Owner** or **Extra Owners** can purge the Black Box telemetry log.', flags: MessageFlags.Ephemeral });
      }
      db.clearPanicHistory(guild.id);
      const sec = await import('../commands/security.js');
      const panel = await sec.getPanicHistoryPanel(guild, interaction.member);
      return cv2.respond(interaction, panel, 7);
    }

    // 🎛️ Unified Security Matrix Control Room Jump & Module Selector
    if (customId === 'sec_matrix_jump') {
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getSecurityMatrixHub(guild, interaction.member);
        return cv2.respond(interaction, panel, 7);
      } catch (e) { console.error(e); }
    }

    if (interaction.isStringSelectMenu() && customId === 'sec_matrix_module_select') {
      const sec = await import('../commands/security.js');
      const val = interaction.values[0];
      let panel;
      if (val === 'mod_antinuke') {
        panel = await sec.getAntinukeConfigPanel(guild);
      } else if (val === 'mod_honeypot') {
        panel = await sec.getHoneypotStatusPanel(guild);
      } else if (val === 'mod_ghostping') {
        panel = await sec.getAntiGhostPingPanel(guild);
      } else if (val === 'mod_quarantine') {
        panel = await sec.getQuarantineListPanel(guild, interaction.member);
      } else if (val === 'mod_defcon') {
        panel = await sec.getSecurityStatusPanel(guild);
      } else if (val === 'mod_health') {
        panel = await sec.getSecurityHealthPanel(guild);
      } else if (val === 'mod_simnuke') {
        panel = await sec.handleSimNukeCommand(guild, interaction.member);
      } else if (val === 'mod_blackbox') {
        panel = await sec.getPanicHistoryPanel(guild, interaction.member);
      }
      if (panel) return cv2.respond(interaction, panel, 7);
    }

    if (['toggle_antinuke', 'toggle_spam', 'toggle_invite', 'cycle_punishment', 'sec_status_back', 'sec_status_view', 'sec_architecture_guide', 'antinuke_config', 'save_panel'].includes(customId)) {
      try {
        let updated = false;
        const updateData = {};
        
        if (customId === 'toggle_antinuke') {
          const isBotOwner = isBotOwnerSync(interaction.user.id);
          const isAllowed = isBotOwner || interaction.user.id === guild.ownerId;
          if (!isAllowed) {
            return interaction.reply({ content: '-# <:cross_red:1533860128015519895> Only the **Server Owner** or **Bot Owner** can configure the Anti-Nuke Firewall.', flags: MessageFlags.Ephemeral });
          }

          const maxPos = Math.max(...guild.roles.cache.map(r => r.position));
          const botMember = guild.members.me || await guild.members.fetch(interaction.client.user.id).catch(() => null);
          const botPos = botMember?.roles?.highest?.position ?? 0;
          const meetsRoleHierarchy = isBotOwner || botPos >= maxPos - 2;
          const meetsMemberCount = isBotOwner || (guild.memberCount || 0) >= 200;

          const isCurrentlyActive = Boolean(config.securityEnabled && config.antiNukeEnabled && meetsRoleHierarchy && meetsMemberCount);
          const isEnabling = !isCurrentlyActive;

          if (isEnabling) {
            if (!meetsMemberCount) {
              return interaction.reply({ content: `-# <:cross_red:1533860128015519895> Server requires at least **200 members** to activate Anti-Nuke firewall. (Currently: **${guild.memberCount || 0}** members).`, flags: MessageFlags.Ephemeral });
            }
            if (!meetsRoleHierarchy) {
              return interaction.reply({ content: `-# <:cross_red:1533860128015519895> **Role Hierarchy Requirement:** Move Athena's role to the top 3 highest roles in Server Settings so she can enforce bulletproof security.\n-# Currently, the highest role is at position **${maxPos}**, but Athena's role is at position **${botPos}**.`, flags: MessageFlags.Ephemeral });
            }

            updateData.securityEnabled = true;
            updateData.antiNukeEnabled = true;
            updateData.antinukeModules = config.antinukeModules || {};
            const allKeys = ['antiRoleCreate', 'antiRoleDelete', 'antiRoleUpdate', 'antiRolePermUpdate', 'antiMemberRoleUpdate', 'antiRoleReorder', 'antiChannelCreate', 'antiChannelDelete', 'antiChannelUpdate', 'antiChannelPermUpdate', 'antiChannelReorder', 'antiChannelNameMod', 'antiEmojiCreate', 'antiEmojiDelete', 'antiEmojiUpdate', 'antiWebhooks', 'antiBotAdd', 'antiServerUpdate', 'antiBan', 'antiKick', 'antiUnban', 'antiInvite', 'antiScheduledEvents', 'antiMemberPurge', 'antiMassBan', 'antiAutomodUpdate', 'antiAppCommands', 'antiLinkedRole'];
            for (const k of allKeys) {
              updateData.antinukeModules[k] = true;
            }
          } else {
            updateData.antiNukeEnabled = false;
            updateData.securityEnabled = false;
          }
          updated = true;
        }
        if (customId === 'toggle_spam') {
          if (!config.securityEnabled) {
            return interaction.reply({ content: '-# <:cross_red:1533860128015519895> Security is currently disabled on this server. Please execute `!security enable all` or click `⚡ Engage All Shields` in `!ss` first.', flags: MessageFlags.Ephemeral });
          }
          updateData.antiSpamEnabled = !config.antiSpamEnabled;
          updated = true;
        }
        if (customId === 'toggle_invite') {
          if (!config.securityEnabled) {
            return interaction.reply({ content: '-# <:cross_red:1533860128015519895> Security is currently disabled on this server. Please execute `!security enable all` or click `⚡ Engage All Shields` in `!ss` first.', flags: MessageFlags.Ephemeral });
          }
          updateData.antiInviteEnabled = (config.antiInviteEnabled === true) ? false : true;
          updated = true;
        }
        if (customId === 'cycle_punishment') {
          const current = config.antiNukePunishment || 'ban';
          updateData.antiNukePunishment = current === 'ban' ? 'kick' : current === 'kick' ? 'quarantine' : 'ban';
          updated = true;
        }
        if (customId === 'sec_architecture_guide') {
           const sec = await import('../commands/security.js');
           return interaction.update(await sec.getAntinukeArchitecturePanel(guild));
        }
        if (customId === 'sec_status_back' || customId === 'sec_status_view') {
           const sec = await import('../commands/security.js');
           return interaction.update(await sec.getSecurityStatusPanel(guild));
        }
        if (customId === 'antinuke_config') {
           const sec = await import('../commands/security.js');
           return interaction.update(await sec.getAntinukeConfigPanel(guild));
        }
        if (customId === 'save_panel') {
           return interaction.message.delete();
        }

        if (updated) {
          const db = (await import('../database.js')).default;
          db.updateGuildConfig(guild.id, updateData);
          const sec = await import('../commands/security.js');
          return interaction.update(await sec.getAntinukeConfigPanel(guild));
        }
      } catch (e) { console.error(e); }
    }
    
    if (customId === 'toggle_blacklist_filter') {
        return interaction.reply({ content: 'Use `!blacklist add <word>` to enable the word filter, or `!blacklist remove <word>` to disable it.', flags: MessageFlags.Ephemeral });
    }

  // Security Overview Navigation
  if (customId === 'sec_back') {
    try {
      const sec = await import('../commands/security.js');
      const panel = await sec.getSecurityStatusPanel(guild);
      return cv2.respond(interaction, panel, 7);
    } catch(e) { console.error(e); }
  }

  // Antilink / Anti-Spam Menu
  if (customId === 'sec_antilink') {
    try {
      const sec = await import('../commands/security.js');
      const panel = await sec.getAntilinkModulePanel(guild);
      return cv2.respond(interaction, panel, 7);
    } catch(e) { console.error(e); }
  }

  
    if (customId && customId.startsWith('ann_')) {
      try {
        const announce = await import('../commands/announce.js');
        return announce.handleAnnouncementInteractions(interaction);
      } catch (e) { console.error(e); }
    }

    if (customId.startsWith('am_') || customId.startsWith('bp_')) {
      let updated = false;
      let targetRoleForBypass = null;

      if (customId === 'am_tgl_massmention') {
        db.updateGuildConfig(guild.id, { antiSpamMentionEnabled: !config.antiSpamMentionEnabled });
        updated = true;
      }
      else if (customId === 'am_tgl_flood') {
        db.updateGuildConfig(guild.id, { antiFloodEnabled: !(config.antiFloodEnabled !== false) });
        updated = true;
      }
      else if (customId === 'am_tgl_link') {
        const newVal = !config.antiLinkEnabled;
        const updateData = { antiLinkEnabled: newVal };
        if (newVal) updateData.allowAllLinks = false;
        db.updateGuildConfig(guild.id, updateData);
        updated = true;
      }
      else if (customId === 'am_tgl_invite') {
        const newVal = !config.antiInviteEnabled;
        const updateData = { antiInviteEnabled: newVal };
        if (newVal) updateData.allowInvitesGlobally = false;
        db.updateGuildConfig(guild.id, updateData);
        updated = true;
      }
      else if (customId === 'am_tgl_word') {
        db.updateGuildConfig(guild.id, { wordFilterEnabled: !(config.wordFilterEnabled !== false) });
        updated = true;
      }
      else if (customId === 'am_tgl_fonts') {
        db.updateGuildConfig(guild.id, { bigFontsEnabled: !(config.bigFontsEnabled !== false) });
        updated = true;
      }
      else if (customId === 'am_tgl_hiddenurl') {
        db.updateGuildConfig(guild.id, { hiddenUrlEnabled: !(config.hiddenUrlEnabled !== false) });
        updated = true;
      }
      else if (customId === 'am_tgl_filecheck') {
        db.updateGuildConfig(guild.id, { fileCheckEnabled: !(config.fileCheckEnabled !== false) });
        updated = true;
      }
      else if (customId === 'am_tgl_aitoxicity') {
        const current = config.aiToxicityEnabled === true;
        db.updateGuildConfig(guild.id, { aiToxicityEnabled: !current });
        const { getAdvancedConfigPanel } = await import('../commands/security.js');
        const newPanel = await getAdvancedConfigPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_tgl_global_links') {
        const newVal = !config.allowAllLinks;
        const updateData = { allowAllLinks: newVal };
        if (newVal) updateData.antiLinkEnabled = false;
        db.updateGuildConfig(guild.id, updateData);
        const { getAdvancedConfigPanel } = await import('../commands/security.js');
        const newPanel = await getAdvancedConfigPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_tgl_selfbot') {
        const current = config.selfbotDetectionEnabled !== false;
        db.updateGuildConfig(guild.id, { selfbotDetectionEnabled: !current });
        const { getAutoModPanel } = await import('../commands/security.js');
        const newPanel = await getAutoModPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_tgl_global_invites') {
        const config = db.getGuildConfig(guild.id);
        const newVal = !config.allowInvitesGlobally;
        const updateData = { allowInvitesGlobally: newVal };
        if (newVal) updateData.antiInviteEnabled = false;
        db.updateGuildConfig(guild.id, updateData);
        const { getAdvancedConfigPanel } = await import('../commands/security.js');
        const newPanel = await getAdvancedConfigPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_advanced_configs') {
        const { getAdvancedConfigPanel } = await import('../commands/security.js');
        const newPanel = await getAdvancedConfigPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_back_to_main') {
        const { getAutoModPanel } = await import('../commands/security.js');
        const newPanel = await getAutoModPanel(guild);
        return cv2.respond(interaction, newPanel, 7).catch(() => null);
      }
      else if (customId === 'am_timeout_cycle') {
        const current = config.honeypotTimeoutMinutes || 15;
        let next = 15;
        if (current === 15) next = 60;
        else if (current === 60) next = 1440;
        else if (current === 1440) next = 5;
        else next = 15;
        db.updateGuildConfig(guild.id, { honeypotTimeoutMinutes: next });
        updated = true;
      }
      else if (customId === 'am_save') {
        return interaction.message.delete().catch(() => null);
      }
      else if (customId === 'am_select_link_channel') {
        const selected = interaction.values[0];
        const current = config.linkAllowedChannel || config.urlAllowedChannel || config.antiLinkAllowedChannel;
        const newChannel = current === selected ? null : selected;
        db.updateGuildConfig(guild.id, {
          linkAllowedChannel: newChannel,
          urlAllowedChannel: newChannel,
          antiLinkAllowedChannel: newChannel
        });
        updated = true;
      }
      else if (customId === 'am_select_invite_channel') {
        const selected = interaction.values[0];
        const current = config.inviteAllowedChannel;
        const newChannel = current === selected ? null : selected;
        db.updateGuildConfig(guild.id, { inviteAllowedChannel: newChannel });
        updated = true;
      }
      else if (customId === 'am_select_honeypot_channel') {
        const channelId = interaction.values[0];
        import('discord.js').then(({ ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder }) => {
        const modal = new ModalBuilder()
          .setCustomId(`modal_honeypot_${channelId}`)
          .setTitle('Honeypot Trap Setup');
          
        const bannerInput = new TextInputBuilder()
          .setCustomId('banner_url')
          .setLabel('Banner Image URL (Optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://example.com/banner.png');
          
                const timeoutInput = new TextInputBuilder()
          .setCustomId('timeout_minutes')
          .setLabel('Timeout Duration (Minutes)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('15');
          
        modal.addComponents(new ActionRowBuilder().addComponents(bannerInput), new ActionRowBuilder().addComponents(timeoutInput));
        return interaction.showModal(modal);
        });
      }
      else if (customId === 'am_select_granular_role') {
        targetRoleForBypass = interaction.values[0];
        updated = true;
      }
      else if (customId.startsWith('bp_')) {
        const parts = customId.split('_');
        if (parts[1] === 'back') {
          updated = true;
        } else if (parts[1] === 'all') {
          targetRoleForBypass = parts[2];
          const bypasses = config.automodBypasses || {};
          bypasses[targetRoleForBypass] = ['Anti Invite', 'Swear Words', 'URL Filter', 'Spam Filter', 'Mass Mentions', 'Anti Flood', 'Hidden URL Filter', 'Selfbot Detection', 'File Check', 'Big Fonts'];
          db.updateGuildConfig(guild.id, { automodBypasses: bypasses });
          updated = true;
        } else if (parts[1] === 'reset') {
            targetRoleForBypass = parts[2];
            const bypasses = config.automodBypasses || {};
            bypasses[targetRoleForBypass] = [];
            db.updateGuildConfig(guild.id, { automodBypasses: bypasses });
            updated = true;
          } else if (parts[1] === 'save') {
            targetRoleForBypass = parts[2];
            const bypasses = config.automodBypasses || {};
            const roleBypasses = bypasses[targetRoleForBypass] || [];
            const filterStr = roleBypasses.length >= 10 ? 'All Automoderation Events' : (roleBypasses.length > 0 ? roleBypasses.join(', ') : 'None');
            
            await interaction.message.delete().catch(() => null);
            
            const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = await import('discord.js');
            const c = new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`-# > **[${interaction.member?.displayName || interaction.user.displayName || interaction.user.username}](https://discord.com/users/${interaction.user.id})** Has Bypass **${filterStr}** For <@&${targetRoleForBypass}>`)
            );
            return interaction.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
          } else {
          const filterName = parts[1];
          targetRoleForBypass = parts[2];
          const bypasses = config.automodBypasses || {};
          if (!bypasses[targetRoleForBypass]) bypasses[targetRoleForBypass] = [];
          
          if (bypasses[targetRoleForBypass].includes(filterName)) {
            bypasses[targetRoleForBypass] = bypasses[targetRoleForBypass].filter(f => f !== filterName);
          } else {
            bypasses[targetRoleForBypass].push(filterName);
          }
          db.updateGuildConfig(guild.id, { automodBypasses: bypasses });
          updated = true;
        }
      }

      if (updated) {
        try {
          const sec = await import('../commands/security.js');
          let panel;
          if (targetRoleForBypass) {
            panel = await sec.getGranularBypassPanel(guild, targetRoleForBypass);
          } else {
            panel = await sec.getAutoModPanel(guild);
          }
          return cv2.respond(interaction, panel, 7);
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

  // Whitelist Logic
  if (customId === 'wl_close') {
    return interaction.message.delete().catch(() => null);
  }

  if (customId === 'wlo_back') {
    try {
      const sec = await import('../commands/security.js');
      const panel = await sec.getWhitelistOverviewPanel(guild);
      return cv2.respond(interaction, panel, 7);
    } catch(e) { console.error(e); }
  }

  if (customId.startsWith('wlo_')) {
    const actionParts = customId.split('_'); 
    
    if (interaction.isAnySelectMenu()) {
      if (customId.startsWith('wlo_select')) {
        let type, targetId, viewAction;
        const subAction = actionParts[1].replace('select', ''); 
        type = actionParts[2]; 
        
        if (interaction.isUserSelectMenu() || interaction.isRoleSelectMenu()) {
          targetId = interaction.values[0];
        } else if (interaction.isStringSelectMenu()) {
          if (interaction.values[0] === 'none') return interaction.deferUpdate();
          targetId = interaction.values[0];
        }
        
        try {
          const sec = await import('../commands/security.js');
          if (subAction === 'remove') {
            db.updateWhitelist(guild.id, targetId, type, null);
            const panel = await sec.getWhitelistOverviewPanel(guild);
            return cv2.respond(interaction, panel, 7);
          } else {
            const panel = await sec.getWhitelistPanel(guild, targetId, type, 'manage');
            return cv2.respond(interaction, panel, 7);
          }
        } catch(e) { console.error(e); }
        return;
      }
    }
    
    if (interaction.isButton()) {
    

    

      const subAction = actionParts[1];
      const type = actionParts[2];
      
      try {
        const sec = await import('../commands/security.js');
        const panel = await sec.getWhitelistSelectPanel(guild, type, subAction);
        return cv2.respond(interaction, panel, 7);
      } catch(e) { console.error(e); }
      return;
    }
  }

  const parts = customId.split('_');
  if (parts[0] !== 'wl') return;
  
  const action = parts[1];
  let type, targetId, limitVal;

  if (action === 'limit') {
    if (parts[2] === 'custom') {
      type = parts[3];
      targetId = parts[4];
      const modal = new ModalBuilder()
        .setCustomId(`wlModal_limit_${type}_${targetId}`)
        .setTitle('Custom Trigger Limit');
      
      const input = new TextInputBuilder()
        .setCustomId('limit_input')
        .setLabel('Enter custom limit (Number)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
        
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
    limitVal = parseInt(parts[2], 10);
    type = parts[3];
    targetId = parts[4];
  } else {
    type = parts[2];
    targetId = parts[3];
  }

  // Determine which view to render after update
  let viewToRender = 'manage';
  if (action === 'save') {
    viewToRender = 'overview';
  } else if (action === 'manage') {
    viewToRender = 'manage';
  }

  let wData = db.getWhitelist(guild.id, targetId, type) || { modules: [], triggerLimit: 0, currentUsage: 0 };

  if (action === 'select') {
    wData.modules = interaction.values;
  } else if (action === 'all') {
    wData.modules = ['all'];
  } else if (action === 'reset') {
    wData.modules = [];
    wData.currentUsage = 0;
    wData.triggerLimit = 0;
  } else if (action === 'limit') {
    wData.triggerLimit = limitVal;
    wData.currentUsage = 0;
  }

  if (wData.modules.length === 0) {
    db.updateWhitelist(guild.id, targetId, type, null); 
  } else {
    db.updateWhitelist(guild.id, targetId, type, wData);
  }

  try {
    const sec = await import('../commands/security.js');
    if (viewToRender === 'overview') {
      const panel = await sec.getWhitelistOverviewPanel(guild);
      await cv2.respond(interaction, panel, 7);
    } else {
      if (sec.getWhitelistPanel) {
        const panel = await sec.getWhitelistPanel(guild, targetId, type, viewToRender);
        await cv2.respond(interaction, panel, 7);
      } else {
        await interaction.update({ content: 'Saved.', components: [] });
      }
    }
  } catch(e) {
    console.error(e);
    await interaction.update({ content: 'Saved.', components: [] });
  }
}

// Handle Modal Submissions for Custom Limits
export async function handleWhitelistModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('wlModal_limit_')) return;
  
  const parts = interaction.customId.split('_');
  const type = parts[2];
  const targetId = parts[3];
  
  const limitStr = interaction.fields.getTextInputValue('limit_input');
  const limitVal = parseInt(limitStr, 10);
  
  if (isNaN(limitVal) || limitVal < 0) {
    return interaction.reply({ content: 'Invalid limit. Please enter a valid positive number.', flags: MessageFlags.Ephemeral });
  }

  let wData = db.getWhitelist(interaction.guild.id, targetId, type) || { modules: [], triggerLimit: 0, currentUsage: 0 };
  wData.triggerLimit = limitVal;
  wData.currentUsage = 0;
  
  if (wData.modules.length === 0) {
    db.updateWhitelist(interaction.guild.id, targetId, type, null);
  } else {
    db.updateWhitelist(interaction.guild.id, targetId, type, wData);
  }
  
  try {
    const sec = await import('../commands/security.js');
    if (sec.getWhitelistPanel) {
      const panel = await sec.getWhitelistPanel(interaction.guild, targetId, type, 'manage');
      await cv2.respond(interaction, panel, 7);
    } else {
      await interaction.update({ content: 'Saved.', components: [] });
    }
  } catch(e) {
    console.error(e);
    await interaction.update({ content: 'Saved.', components: [] });
  }
}





