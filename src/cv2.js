import { MessageFlags, MessagePayload } from 'discord.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  LEGACY_TICK, 
  getRandomHeadingGlyph,
  hasHeadingGlyphStart
} from './utils/emojis.js';

export { TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, BULLET_EMOJI };

// Returns true if a line already has discord markdown — skip auto-formatting
function isPreformatted(line) {
  if (!line.trim()) return true;
  return /^(-#|#{1,3} |> |```)/.test(line);
}

// Returns true if line starts with a custom or unicode emoji
function hasEmojiStart(line) {
  return /^<a?:[a-zA-Z0-9_]+:\d+>/.test(line) || /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u.test(line);
}

function convertBoldToBoldUnderline(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
    .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
}

// Style a single line: grey, with optional bullet for plain text
function styleLine(line, addBullet) {
  if (!line.trim()) return line;

  // Replace unicode bullets with animated target blink bullet
  let workingLine = line.replace(/(^|[\s>\-#])[\u2022•](\s)/g, `$1${BULLET_EMOJI}$2`);

  if (isPreformatted(workingLine)) {
    const trimmed = workingLine.trim();
    if (trimmed.startsWith('-#') || trimmed.startsWith('> -#') || trimmed.startsWith('>')) {
      return convertBoldToBoldUnderline(workingLine);
    }
    return workingLine;
  }
  const hasListMarker = /^[\u2022\-\*+] /.test(workingLine) || workingLine.startsWith(BULLET_EMOJI);
  
  const bullet = (addBullet && !hasListMarker) ? `${BULLET_EMOJI} ` : '';
  if (workingLine.includes('**')) {
    const formatted = convertBoldToBoldUnderline(workingLine);
    return '-# ' + bullet + formatted;
  }
  const cleanLine = workingLine.replace(/^\*\*|\*\*$/g, '');
  return '-# **__' + bullet + cleanLine + '__**';
}

// Separator raw component
const SEP = { type: 14, divider: true };

// Build a raw CV2 container JSON with separators
function buildContainer(title, description, fields, customFooter, accentColor = 0x5865F2) {
  if (!fields) fields = [];
  var comps = [];

  // Dynamic aesthetic heading + divider
  if (title) {
    let headerTitle = String(title).trim();
    // Auto-upgrade legacy tick
    headerTitle = headerTitle.replaceAll(LEGACY_TICK, TICK_EMOJI);

    // Strip any existing markdown headers or quotes (#, ##, ###, > #, etc.)
    headerTitle = headerTitle.replace(/^[>#\s]+/, '').trim();

    // Prepend dynamic random heading glyph if it doesn't already start with an emoji
    const hasEmoji = hasEmojiStart(headerTitle);
    if (!hasEmoji) {
      headerTitle = `${getRandomHeadingGlyph()} ${headerTitle}`;
    }

    comps.push({ type: 10, content: '# ' + headerTitle });
    comps.push(SEP);
  }

  // Grey bold description with smart bullets
  if (description) {
    var lines = String(description).replaceAll(LEGACY_TICK, TICK_EMOJI).split('\n');
    var inDescCode = false;
    var formattedLines = [];
    for (var d = 0; d < lines.length; d++) {
      var dLine = lines[d];
      var dTrimmed = dLine.trim();
      if (dTrimmed.startsWith('```')) {
        inDescCode = !inDescCode;
        formattedLines.push(dLine);
        continue;
      }
      if (inDescCode) {
        formattedLines.push(dLine);
        continue;
      }
      formattedLines.push(styleLine(dLine, false));
    }
    var formatted = formattedLines.join('\n').trim() || '\u200b';

    if (formatted.length <= 3900) {
      comps.push({ type: 10, content: formatted });
    } else {
      var splitLines = formatted.split('\n');
      var currentChunk = '';
      for (var j = 0; j < splitLines.length; j++) {
        var nextLine = splitLines[j];
        if (currentChunk.length + nextLine.length + 1 > 3800) {
          if (currentChunk.trim()) {
            comps.push({ type: 10, content: currentChunk.trim() });
            comps.push(SEP);
            currentChunk = '';
          }
        }
        currentChunk += (currentChunk ? '\n' : '') + nextLine;
      }
      if (currentChunk.trim()) {
        comps.push({ type: 10, content: currentChunk.trim() });
      }
    }
  }

  // Fields
  var fieldLines = [];
  var inlineBuf = [];

  function flushInline() {
    if (inlineBuf.length > 0) {
      fieldLines.push('-# ' + inlineBuf.join('  \u00b7  '));
      inlineBuf = [];
    }
  }

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (!f || !f.name) continue;
    var name = String(f.name).replace(/^\*\*|\*\*$/g, '').trim();
    var val = String(f.value || '').replaceAll(LEGACY_TICK, TICK_EMOJI).trim();
    // Replace unicode bullets in values
    val = val.replace(/(^|[\s>\-#])[\u2022•](\s)/g, `$1${BULLET_EMOJI}$2`);

    if (f.inline) {
      inlineBuf.push(`${BULLET_EMOJI} **__${name}:__** ${val}`);
      if (inlineBuf.length >= 3) {
        flushInline();
      }
    } else {
      flushInline();
      if (val.includes('```')) {
        var inFieldCode = false;
        var subLines = val.split('\n').map(function(l) {
          var trimmed = l.trim();
          if (trimmed.startsWith('```')) {
            inFieldCode = !inFieldCode;
            return trimmed;
          }
          if (inFieldCode) {
            return l;
          }
          var lineText = trimmed ? (trimmed.startsWith('-#') ? trimmed : '-# ' + trimmed) : '';
          return convertBoldToBoldUnderline(lineText);
        });
        fieldLines.push(`-# ${BULLET_EMOJI} **__${name}:__**\n` + subLines.join('\n'));
      } else if (val.includes('\n')) {
        var subLines = val.split('\n').map(function(l) {
          var lineText = l.trim() ? (l.startsWith('-#') ? l : '-# ' + l) : '';
          return convertBoldToBoldUnderline(lineText);
        });
        fieldLines.push(`-# ${BULLET_EMOJI} **__${name}:__**\n` + subLines.join('\n'));
      } else {
        fieldLines.push(`-# ${BULLET_EMOJI} **__${name}:__** ` + convertBoldToBoldUnderline(val));
      }
    }
  }
  flushInline();

  var fieldText = fieldLines.join('\n').trim();
  if (fieldText) {
    comps.push(SEP);
    if (fieldText.length <= 3900) {
      comps.push({ type: 10, content: fieldText });
    } else {
      var fLines = fieldText.split('\n');
      var fChunk = '';
      for (var k = 0; k < fLines.length; k++) {
        var nextFLine = fLines[k];
        if (fChunk.length + nextFLine.length + 1 > 3800) {
          if (fChunk.trim()) {
            comps.push({ type: 10, content: fChunk.trim() });
            comps.push(SEP);
            fChunk = '';
          }
        }
        fChunk += (fChunk ? '\n' : '') + nextFLine;
      }
      if (fChunk.trim()) {
        comps.push({ type: 10, content: fChunk.trim() });
      }
    }
  }

  // Bottom divider
  comps.push(SEP);
  let footerKey = (customFooter || '').toLowerCase().trim();
  
  const footers = {
      'success': 'System Operation Successfully Completed.',
      'warning': 'Defense Protocol Advisory Issued.',
      'danger': 'Critical Defense Protocol Engaged.',
      'error': 'System Fault Encountered.',
      'shield': 'Active Threat Neutralization and Firewall Defense Matrix Engaged.',
      'raid': 'Anti-Nuke Raid Protection Protocols Fully Enforced.',
      'info': 'System Data Retrieval and Analysis Complete.',
      'log': 'Athena Audit Log Entry Processed.',
      'moderation': 'Administrative Moderation Action Executed.',
      'security': 'Athena Core Defense System Active.',
      'defense': 'Athena Core Defense System Active.',
      'owner': 'Executive Override Command Authorized.',
      'engagement': 'Community Engagement and Interaction Module Active.',
      'utility': 'System Utility and Diagnostic Tools Deployed.',
      'utilities': 'System Utility and Diagnostic Tools Deployed.',
      'configuration': 'System Core Configuration and Settings Modified.',
      'config': 'System Core Configuration and Settings Modified.',
      'enuke': 'Emergency Defense Protocol Active.',
      'modmode': 'Server Maintenance and ModMode Active.',
      'general': 'System Data Retrieval and Analysis Complete.'
  };

  let footerText;
  if (footers[footerKey]) {
    footerText = footers[footerKey];
  } else if (!customFooter) {
    footerText = 'Athena Bulletproof Defense Matrix \u00b7 V1.0.0';
  } else {
    footerText = customFooter;
  }

  comps.push({ type: 10, content: `-# **${footerText}**` });

  const container = { type: 17, components: comps };
  if (accentColor) container.accent_color = accentColor;
  return sanitizeCV2Payload(container);
}

/**
 * Sanitizes any CV2 container or message payload so that the total displayable
 * text across all components strictly stays <= maxLimit (default 3800), preventing
 * DiscordAPIError[50035]: COMPONENT_DISPLAYABLE_TEXT_SIZE_EXCEEDED.
 */
export function sanitizeCV2Payload(payload, maxLimit = 3800) {
  if (!payload) return payload;

  const rootComps = Array.isArray(payload.components)
    ? payload.components
    : (payload.type === 17 && Array.isArray(payload.components) ? [payload] : null);

  if (!rootComps) return payload;

  const textComps = [];
  function collect(item) {
    if (!item) return;
    if (item.type === 10 && typeof item.content === 'string') {
      textComps.push(item);
    }
    if (Array.isArray(item.components)) {
      for (const child of item.components) {
        collect(child);
      }
    }
  }

  for (const c of rootComps) {
    collect(c);
  }

  for (const c of textComps) {
    if (typeof c.content === 'string') {
      c.content = c.content.replaceAll(LEGACY_TICK, TICK_EMOJI);
      c.content = c.content.replace(/(^|[\s>\-#])[\u2022•](\s)/g, `$1${BULLET_EMOJI}$2`);

      if (c.content.startsWith('## ') || c.content.startsWith('> ## ') || c.content.startsWith('> # ')) {
        let clean = c.content.replace(/^[>#\s]+/, '').trim();
        if (!hasHeadingGlyphStart(clean)) {
          clean = `${getRandomHeadingGlyph()} ${clean}`;
        }
        c.content = `# ${clean}`;
      } else if (c.content.startsWith('# ')) {
        let clean = c.content.slice(2).trim();
        if (!hasHeadingGlyphStart(clean)) {
          c.content = `# ${getRandomHeadingGlyph()} ${clean}`;
        }
      }
    }
  }

  let totalLength = textComps.reduce((sum, c) => sum + c.content.length, 0);
  let iterations = 0;
  while (totalLength > maxLimit && iterations < 5) {
    iterations++;
    const excess = totalLength - (maxLimit - 50);
    let longest = null;
    for (const c of textComps) {
      if (!longest || c.content.length > longest.content.length) {
        longest = c;
      }
    }

    if (!longest || longest.content.length <= 100) break;

    const notice = '\n-# **__[Condensed to fit Discord display limit]__**';
    const targetLen = Math.max(80, longest.content.length - excess - notice.length);
    let cut = longest.content.lastIndexOf('\n', targetLen);
    if (cut === -1 || cut < targetLen * 0.7) {
      cut = longest.content.lastIndexOf('. ', targetLen);
      if (cut !== -1) cut += 1;
    }
    if (cut === -1 || cut < targetLen * 0.5) {
      cut = targetLen;
    }
    let trimmed = longest.content.slice(0, cut).trim();
    const codeBlockCount = (trimmed.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      trimmed += '\n```';
    }
    longest.content = trimmed + notice;
    totalLength = textComps.reduce((sum, c) => sum + c.content.length, 0);
  }

  return payload;
}

function make(title, desc, fields, eph, customFooter, accentColor = 0x5865F2) {
  if (!fields) fields = [];
  if (!eph) eph = false;
  var flags = eph ? (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral) : MessageFlags.IsComponentsV2;
  return { components: [buildContainer(title, desc, fields, customFooter, accentColor)], flags: flags };
}

var _m = function(eph) {
  return {
    success: function(t, d, f, ft, acc) {
      var heading = t;
      if (t) {
        heading = heading.replaceAll(LEGACY_TICK, TICK_EMOJI);
        if (!heading.includes(TICK_EMOJI)) {
          heading = heading + ' | ' + TICK_EMOJI;
        }
      }
      return make(heading, d, f, eph, ft, acc || 0x5865F2);
    },
    warn: function(t, d, f, ft, acc) { 
      var heading = t;
      if (t && !heading.includes(WARN_EMOJI)) {
        heading = heading + ' | ' + WARN_EMOJI;
      }
      return make(heading, d, f, eph, ft, acc || 0xFEE75C); 
    },
    danger: function(t, d, f, ft, acc) { 
      var heading = t;
      if (t && !heading.includes(WRONG_EMOJI)) {
        heading = heading + ' | ' + WRONG_EMOJI;
      }
      return make(heading, d, f, eph, ft, acc || 0xED4245); 
    },
    error: function(t, d, f, ft, acc) { 
      var heading = t;
      if (t && !heading.includes(WRONG_EMOJI)) {
        heading = heading + ' | ' + WRONG_EMOJI;
      }
      return make(heading, d, f, eph, ft, acc || 0xED4245); 
    },
    info:     function(t, d, f, ft, acc) { return make(t, d, f, eph, ft, acc || 0x5865F2); },
    raid:     function(t, d, f, ft, acc) { return make(t, d, f, eph, ft, acc || 0xED4245); },
    owner:    function(t, d, f, ft, acc) { return make(t, d, f, eph, ft, acc || 0x5865F2); },
    security: function(t, d, f, ft, acc) { return make(t, d, f, eph, ft, acc || 0x5865F2); },
    defense:  function(t, d, f, ft, acc) { return make(t, d, f, eph, ft, acc || 0x5865F2); },
    log:      function(t, d, f, ft, acc) { return make('Log: ' + t, d, f, eph, ft, acc || 0x5865F2); },
  };
};

export var cv2 = Object.assign(_m(false), {
  TICK_EMOJI:   TICK_EMOJI,
  WRONG_EMOJI:  WRONG_EMOJI,
  WARN_EMOJI:   WARN_EMOJI,
  BULLET_EMOJI: BULLET_EMOJI,
  sanitizeCV2Payload: sanitizeCV2Payload,
  e:            _m(true),
  asEphemeral:  function(p) {
    return Object.assign({}, p, { flags: ((p.flags != null ? p.flags : MessageFlags.IsComponentsV2) | MessageFlags.Ephemeral) });
  },
  buildContainer: buildContainer,
  make:           make,
  
  respond: async function(ctx, payload, type = 4) {
    if (typeof payload === 'string') payload = { content: payload };
    let resolvedFiles = payload.files;
    if (resolvedFiles) {
      const arr = Array.isArray(resolvedFiles) ? resolvedFiles : [resolvedFiles];
      resolvedFiles = await Promise.all(arr.map(async f => {
        if (!f) return f;
        if (f.data && f.name) return f;
        return MessagePayload.resolveFile(f);
      }));
    }
    const isCV2 = payload.flags != null && (payload.flags & 32768);
    let body = payload;
    if (isCV2) {
      const comps = Array.isArray(payload.components) ? [...payload.components] : [];
      if (payload.content) {
        if (comps[0]?.type === 17 && Array.isArray(comps[0].components)) {
          let cText = String(payload.content);
          if (cText.startsWith('## ') || cText.startsWith('# ') || cText.startsWith('> #')) {
            let clean = cText.replace(/^[>#\s]+/, '').trim();
            if (!hasEmojiStart(clean)) clean = `${getRandomHeadingGlyph()} ${clean}`;
            cText = `# ${clean}`;
          }
          comps[0].components.unshift({ type: 14, divider: true });
          comps[0].components.unshift({ type: 10, content: cText });
        }
      }
      body = {
        type: type,
        data: {
          flags: payload.flags,
          components: comps[0]?.type === 17 ? [comps[0]] : comps,
          files: resolvedFiles
        }
      };
    } else {
      if (resolvedFiles) body.files = resolvedFiles;
    }
    if (ctx.deferred) {
      const editData = body.data || body;
      return ctx.editReply(editData);
    }
    return ctx.reply(body);
  }
});

export default cv2;
