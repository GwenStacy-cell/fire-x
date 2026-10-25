import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import db from './database.js';
import { isValidImageUrl } from './utils/helpers.js';

// Safely load config
const configPath = path.resolve('config.json');
let config = {
  botName: 'Athena Prime',
  footerText: 'Athena Bulletproof Security System � V1.0.0',
  colors: {
    success: '#2b2d31',
    warning: '#2b2d31',
    danger: '#2b2d31',
    neutral: '#2b2d31',
    raid: '#2b2d31',
    dark: '#2b2d31',
    owner: '#2b2d31',
    security: '#2b2d31'
  }
};
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (error) {
  console.error('Failed to load config in embed helper, using defaults:', error);
}

const colors = config.colors;
const FOOTER_TEXT = config.footerText || 'Athena Bulletproof Security System � V1.0.0';

// ——————————————————————————————————————————
// GUILD CONTEXT — set once per command invocation
// Node.js is single-threaded so this is safe for sequential calls
// ——————————————————————————————————————————
let _currentGuildId = null;

export function setGuildContext(guildId) {
  _currentGuildId = guildId || null;
}

/**
 * Get the active accent color for the current guild context.
 * Explicit guildId param takes priority, falls back to module-level context.
 */
function getAccentColor(guildId, fallbackColor) {
  const id = guildId || _currentGuildId;
  if (!id) return fallbackColor;
  try {
    const cfg = db.getGuildConfig(id);
    if (cfg && cfg.accentColor) return cfg.accentColor;
  } catch { /* ignore */ }
  return fallbackColor;
}

/**
 * Embed utility to construct state-of-the-art beautiful coloured replies
 */
export const embed = {
  /**
   * General builder to standardize layout, footers and timestamps
   */
  build({ title, description, color, fields = [], thumbnail, image, footerText, author }) {
    const builder = new EmbedBuilder()
      .setColor(color || colors.dark)
      .setTimestamp();

    if (title) builder.setTitle(title);
    if (description) builder.setDescription(description);
    if (thumbnail && typeof thumbnail === 'string' && isValidImageUrl(thumbnail)) {
      try { builder.setThumbnail(thumbnail.trim()); } catch {}
    }
    if (image && typeof image === 'string' && isValidImageUrl(image)) {
      try { builder.setImage(image.trim()); } catch {}
    }

    if (fields && fields.length > 0) {
      builder.addFields(fields.map(f => ({
        name: f.name,
        value: f.value,
        inline: !!f.inline
      })));
    }

    builder.setFooter({
      text: footerText || FOOTER_TEXT
    });

    if (author) {
      builder.setAuthor({
        name: author.name,
        ...(author.iconURL && typeof author.iconURL === 'string' && isValidImageUrl(author.iconURL) ? { iconURL: author.iconURL.trim() } : {})
      });
    }

    return builder;
  },

  success(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.success), fields });
  },

  warn(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.warning), fields });
  },

  danger(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.danger), fields });
  },

  error(title, description, fields = [], guildId = null) {
    return this.danger(title, description, fields, guildId);
  },

  info(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.neutral), fields });
  },

  raid(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.raid), fields });
  },

  owner(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.owner || '#FFD700'), fields });
  },

  security(title, description, fields = [], guildId = null) {
    return this.build({ title, description, color: getAccentColor(guildId, colors.security || '#00e5ff'), fields });
  },

  log(title, description, fields = [], level = 'info', guildId = null) {
    let color = colors.dark;
    if (level === 'success') { color = colors.success; }
    else if (level === 'warning') { color = colors.warning; }
    else if (level === 'danger') { color = colors.danger; }
    else if (level === 'raid') { color = colors.raid; }

    return this.build({ title: `Log: ${title}`, description, color: getAccentColor(guildId, color), fields });
  }
};
export default embed;
