import { MessageFlags, MessagePayload } from 'discord.js';

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
  if (isPreformatted(line)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-#') || trimmed.startsWith('> -#') || trimmed.startsWith('>')) {
      return convertBoldToBoldUnderline(line);
    }
    return line;
  }
  const startsEmoji = hasEmojiStart(line);
  const hasListMarker = /^[\u2022\-\*+] /.test(line);
  
  const bullet = (addBullet && !hasListMarker) ? '\u2022 ' : '';
  if (line.includes('**')) {
    const formatted = convertBoldToBoldUnderline(line);
    return '-# ' + bullet + formatted;
  }
  const cleanLine = line.replace(/^\*\*|\*\*$/g, '');
  return '-# **__' + bullet + cleanLine + '__**';
}

// Separator raw component
const SEP = { type: 14, divider: true };

// Build a raw CV2 container JSON with separators
function buildContainer(title, description, fields, customFooter, accentColor = 0x5865F2) {
  if (!fields) fields = [];
  var comps = [];

  // Big bold heading + divider under it
  if (title) {
    comps.push({ type: 10, content: '## **' + title + '**' });
    comps.push(SEP);
  }

  // Grey bold description with smart bullets
  if (description) {
    var lines = description.split('\n');
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
    var val = String(f.value || '').trim();

    if (f.inline) {
      inlineBuf.push('**__' + name + ':__** ' + val);
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
        fieldLines.push('-# **__' + name + ':__**\n' + subLines.join('\n'));
      } else if (val.includes('\n')) {
        var subLines = val.split('\n').map(function(l) {
          var lineText = l.trim() ? (l.startsWith('-#') ? l : '-# ' + l) : '';
          return convertBoldToBoldUnderline(lineText);
        });
        fieldLines.push('-# **__' + name + ':__**\n' + subLines.join('\n'));
      } else {
        fieldLines.push('-# **__' + name + ':__** ' + convertBoldToBoldUnderline(val));
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

  // Accent borderless CV2 container (with accent_color)
  // Discord caps total displayable text across all components at 4,000 characters.
  // Enforce a hard safety ceiling of 3,800 characters to prevent COMPONENT_DISPLAYABLE_TEXT_SIZE_EXCEEDED.
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

export const TICK_EMOJI = '<a:atheNATICK:1557841381630681106>';

var _m = function(eph) {
  return {
    success:  function(t,d,f,ft,acc) {
      var heading = t;
      if (t && !t.includes('1557841381630681106')) {
        heading = t + ' | ' + TICK_EMOJI;
      }
      return make(heading, d, f, eph, ft, acc || 0x5865F2);
    },
    warn:     function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0xFEE75C); },
    danger:   function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0xED4245); },
    error:    function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0xED4245); },
    info:     function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0x5865F2); },
    raid:     function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0xED4245); },
    owner:    function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0x5865F2); },
    security: function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0x5865F2); },
    defense:  function(t,d,f,ft,acc) { return make(t,d,f,eph,ft,acc || 0x5865F2); },
    log:      function(t,d,f,ft,acc) { return make('Log: ' + t, d, f, eph, ft, acc || 0x5865F2); },
  };
};

export var cv2 = Object.assign(_m(false), {
  TICK_EMOJI:   TICK_EMOJI,
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
          comps[0].components.unshift({ type: 14, divider: true });
          comps[0].components.unshift({ type: 10, content: payload.content });
        }
      }
      body = { components: comps, flags: payload.flags };
      sanitizeCV2Payload(body);
      const fileList = resolvedFiles || payload.files;
      if (payload.attachments && Array.isArray(payload.attachments)) {
        body.attachments = payload.attachments;
      } else if (fileList && Array.isArray(fileList)) {
        body.attachments = fileList.map((f, i) => ({
          id: String(i),
          filename: f.name || (typeof f === 'string' ? f.split(/[\\/]/).pop() : `file_${i}`),
          description: f.description
        }));
      }
    }
    
    if (ctx.replied || ctx.deferred) {
      return cv2.edit(ctx, { ...payload, files: resolvedFiles });
    }

    // type 4 = ChannelMessageWithSource (Reply)
    // type 7 = UpdateMessage (Update)
    return ctx.client.rest.post(`/interactions/${ctx.id}/${ctx.token}/callback`, { body: { type: type, data: body }, files: resolvedFiles });
  },
  edit: async function(ctx, payload) {
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
      body = { components: payload.components, flags: payload.flags };
      sanitizeCV2Payload(body);
      const fileList = resolvedFiles || payload.files;
      if (payload.attachments && Array.isArray(payload.attachments)) {
        body.attachments = payload.attachments;
      } else if (fileList && Array.isArray(fileList)) {
        body.attachments = fileList.map((f, i) => ({
          id: String(i),
          filename: f.name || (typeof f === 'string' ? f.split(/[\\/]/).pop() : `file_${i}`),
          description: f.description
        }));
      }
    }
    if (ctx.editReply) {
      return ctx.client.rest.patch(`/webhooks/${ctx.client.user.id}/${ctx.token}/messages/@original`, { body, files: resolvedFiles });
    } else if (ctx.edit) {
      if (isCV2 && ctx.content) {
        await ctx.delete().catch(() => null);
        return ctx.channel.send({ components: body.components, flags: body.flags, files: resolvedFiles });
      }
      return ctx.client.rest.patch(`/channels/${ctx.channel.id}/messages/${ctx.id}`, { body, files: resolvedFiles });
    }
  },
});

export default cv2;
// Safely edit a message or interaction reply with CV2 payload to bypass discord.js injecting content: null
