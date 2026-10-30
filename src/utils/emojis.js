/**
 * Athena Prime - Frontend Theme & Emoji Matrix
 * Centralized registry for all interface glyphs, status badges, and structural markers.
 */

// Strict Status & Structural Emojis
export const TICK_EMOJI = '<a:03_tick_circle:1565665642084827206>';
export const WRONG_EMOJI = '<a:04_cross_circle:1565665644806934639>';
export const WARN_EMOJI = '<a:exclamation_outline1:1565666739356827759>';
export const BULLET_EMOJI = '<a:target_blink:1565667466984554588>';
export const UPTIME_EMOJI = '<a:uptime:1552608831060844575>';

// Legacy tick ID for backwards compatibility / auto-upgrade
export const LEGACY_TICK = '<a:03_tick_circle:1565665642084827206>';

// Dynamic Random Heading Glyphs (34 Animated Glyphs)
export const HEADING_GLYPHS = [
  '<a:01_alef_:1565629242451034132>',
  '<a:02_bet_:1565629248641957908>',
  '<a:03_bet_dagesh_:1565629251410071652>',
  '<a:04_gimel_:1565629253494640660>',
  '<a:05_dalet_:1565629255919075348>',
  '<a:06_he_:1565629232464265226>',
  '<a:07_vav_:1565629258724806736>',
  '<a:08_theta_:1565674360734228520>',
  '<a:09_chet_:1565629265582493826>',
  '<a:10_tet_:1565629269885849620>',
  '<a:11_yod_:1565629292983885907>',
  '<a:12_kaf_:1565629298768093235>',
  '<a:13_kaf_dagesh_:1565629305428516985>',
  '<a:14_kaf_final_:1565629313082982473>',
  '<a:15_kaf_final_dagesh_:1565629316325445662>',
  '<a:16_lamed_:1565629319240360046>',
  '<a:17_mem_:1565629322138624020>',
  '<a:18_mem_final_:1565629325397725234>',
  '<a:19_nun_:1565629328006320258>',
  '<a:20_nun_final_:1565629330904842340>',
  '<a:21_samekh_:1565629351167262760>',
  '<a:22_ayin_:1565629353616875600>',
  '<a:23_pe_:1565629356037111900>',
  '<a:24_omega_:1565674311824576542>',
  '<a:24_pe_dagesh_:1565629358926856212>',
  '<a:25_pe_final_:1565629361691041842>',
  '<a:26_tsadi_:1565629364819730432>',
  '<a:27_tsadi_final_:1565629367319666688>',
  '<a:28_qof_:1565629210767396914>',
  '<a:29_resh_:1565629214537809981>',
  '<a:30_shin_:1565629216848879616>',
  '<a:31_shin_dot_:1565629219415793715>',
  '<a:32_sin_dot_:1565629223455039499>',
  '<a:33_tav_:1565629226546241546>'
];

/**
 * Returns a random heading glyph from the dynamic pool
 */
export function getRandomHeadingGlyph() {
  const index = Math.floor(Math.random() * HEADING_GLYPHS.length);
  return HEADING_GLYPHS[index];
}

/**
 * Checks if a string starts with one of the animated heading glyphs
 */
export function hasHeadingGlyphStart(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return HEADING_GLYPHS.some(g => trimmed.startsWith(g));
}

/**
 * Formats a heading string:
 * 1. Prepend a random animated glyph if no emoji is at start
 * 2. Replaces legacy tick with the new tick
 * 3. Appends status badge if specified
 */
export function formatHeading(title, status = null) {
  if (!title) return '';
  let str = String(title).trim();

  // Upgrade legacy tick
  str = str.replaceAll(LEGACY_TICK, TICK_EMOJI);
  if (str.includes(UPTIME_EMOJI)) {
    const lower = str.toLowerCase();
    if (/cooldown|advisory|warning|caution|notice|audit|limit|deleted/i.test(lower)) {
      str = str.replace(UPTIME_EMOJI, WARN_EMOJI);
    } else if (/denied|blocked|banned|defeat|error|danger|threat|raid|failed/i.test(lower)) {
      str = str.replace(UPTIME_EMOJI, WRONG_EMOJI);
    } else {
      str = str.replace(UPTIME_EMOJI, TICK_EMOJI);
    }
  }

  // Status badge appending
  if (status === 'success') {
    if (!str.includes(TICK_EMOJI)) str = `${str} | ${TICK_EMOJI}`;
  } else if (status === 'danger' || status === 'error') {
    if (!str.includes(WRONG_EMOJI)) str = `${str} | ${WRONG_EMOJI}`;
  } else if (status === 'warn' || status === 'warning') {
    if (!str.includes(WARN_EMOJI)) str = `${str} | ${WARN_EMOJI}`;
  }

  // Prepend random heading glyph if it doesn't already start with an emoji or header markdown
  const hasEmoji = /^<a?:[a-zA-Z0-9_]+:\d+>/.test(str);
  if (!hasEmoji && !str.startsWith('#')) {
    str = `${getRandomHeadingGlyph()} ${str}`;
  }

  return str;
}
