import { AttachmentBuilder } from 'discord.js';
import db from '../database.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from './emojis.js';

/**
 * Escapes raw strings for safe HTML rendering.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Simple, fast Markdown-to-HTML parser for Discord text formatting.
 */
function formatDiscordMarkdown(text) {
  if (!text) return '';
  let str = escapeHtml(text);

  // Multi-line code blocks ```lang\ncode```
  str = str.replace(/```(?:([a-zA-Z0-9_-]+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  str = str.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold & Italic ***text***
  str = str.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold **text**
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic *text* or _text_
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough ~~text~~
  str = str.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Underline __text__
  str = str.replace(/__([^_]+)__/g, '<u>$1</u>');

  // Blockquotes > quote
  str = str.replace(/^>(?:&gt;)?\s*(.+)$/gm, '<blockquote>$1</blockquote>');

  // Mentions <@ID> or <@!ID>
  str = str.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@$1</span>');

  // Channel mentions <#ID>
  str = str.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel-$1</span>');

  // Role mentions <@&ID>
  str = str.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role-$1</span>');

  // URLs into clickable links
  str = str.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // Line breaks
  str = str.replace(/\n/g, '<br>');

  return str;
}

/**
 * Iteratively fetch up to `limit` messages from a ticket channel in chronological order.
 */
export async function fetchTicketMessages(channel, limit = 1000) {
  const allMessages = [];
  let lastId = null;

  while (allMessages.length < limit) {
    const fetchOptions = { limit: 100 };
    if (lastId) fetchOptions.before = lastId;

    const batch = await channel.messages.fetch(fetchOptions).catch(() => null);
    if (!batch || batch.size === 0) break;

    for (const msg of batch.values()) {
      allMessages.push(msg);
    }

    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  // Reverse to strictly chronological order (oldest -> newest)
  return allMessages.reverse();
}

/**
 * Formats duration in human-readable string.
 */
function formatDuration(ms) {
  const diffSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

/**
 * Generate a high-fidelity standalone HTML ticket transcript.
 */
export function generateHtmlTranscript({ guild, channel, ticketId, ticketData, messages, closedBy }) {
  const openerId = ticketData?.ownerId || 'Unknown';
  const claimedId = ticketData?.claimedBy || null;
  const createdAt = ticketData?.createdAt || channel.createdTimestamp || Date.now();
  const closedAt = Date.now();
  const durationStr = formatDuration(closedAt - createdAt);

  const closerTag = closedBy?.user?.tag || closedBy?.tag || (closedBy?.id ? `<@${closedBy.id}>` : 'Staff');
  const closerId = closedBy?.id || 'Unknown';
  const guildIconUrl = guild.iconURL({ dynamic: true, size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  let messagesHtml = '';

  for (const msg of messages) {
    const author = msg.author;
    const authorTag = author ? (author.tag || `${author.username}#${author.discriminator}`) : 'Unknown User';
    const authorId = author ? author.id : '0';
    const avatarUrl = author ? author.displayAvatarURL({ dynamic: true, size: 64 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
    const isBot = author?.bot;
    const timeStr = new Date(msg.createdTimestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const parsedContent = formatDiscordMarkdown(msg.content);

    // Attachments
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      attachmentsHtml += '<div class="msg-attachments">';
      for (const att of msg.attachments.values()) {
        const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(att.name || att.url);
        if (isImage) {
          attachmentsHtml += `
            <div class="attachment-image">
              <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name || 'image')}" loading="lazy" />
              </a>
              <span class="attachment-meta">${escapeHtml(att.name || 'Image')} (${Math.round(att.size / 1024)} KB)</span>
            </div>`;
        } else {
          attachmentsHtml += `
            <div class="attachment-file">
              <span class="file-icon">&#128196;</span>
              <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer" class="file-name">${escapeHtml(att.name || 'File')}</a>
              <span class="file-size">(${Math.round(att.size / 1024)} KB)</span>
            </div>`;
        }
      }
      attachmentsHtml += '</div>';
    }

    // Embeds
    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      embedsHtml += '<div class="msg-embeds">';
      for (const emb of msg.embeds) {
        const colorHex = emb.color ? `#${emb.color.toString(16).padStart(6, '0')}` : '#3b82f6';
        embedsHtml += `<div class="embed-box" style="border-left-color: ${colorHex};">`;
        if (emb.author?.name) {
          embedsHtml += `<div class="embed-author">${escapeHtml(emb.author.name)}</div>`;
        }
        if (emb.title) {
          embedsHtml += `<div class="embed-title">${escapeHtml(emb.title)}</div>`;
        }
        if (emb.description) {
          embedsHtml += `<div class="embed-description">${formatDiscordMarkdown(emb.description)}</div>`;
        }
        if (emb.fields && emb.fields.length > 0) {
          embedsHtml += '<div class="embed-fields">';
          for (const f of emb.fields) {
            embedsHtml += `
              <div class="embed-field ${f.inline ? 'inline' : ''}">
                <div class="field-name">${escapeHtml(f.name)}</div>
                <div class="field-value">${formatDiscordMarkdown(f.value)}</div>
              </div>`;
          }
          embedsHtml += '</div>';
        }
        if (emb.image?.url) {
          embedsHtml += `<div class="embed-image"><img src="${escapeHtml(emb.image.url)}" loading="lazy" /></div>`;
        }
        if (emb.footer?.text) {
          embedsHtml += `<div class="embed-footer">${escapeHtml(emb.footer.text)}</div>`;
        }
        embedsHtml += '</div>';
      }
      embedsHtml += '</div>';
    }

    messagesHtml += `
      <div class="message-row" data-author="${escapeHtml(authorTag.toLowerCase())}" data-content="${escapeHtml((msg.content || '').toLowerCase())}">
        <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="avatar" />
        <div class="message-body">
          <div class="message-header">
            <span class="author-name">${escapeHtml(authorTag)}</span>
            ${isBot ? '<span class="bot-badge">BOT</span>' : ''}
            <span class="timestamp">${timeStr}</span>
            <span class="user-id">(${authorId})</span>
          </div>
          ${parsedContent ? `<div class="message-text">${parsedContent}</div>` : ''}
          ${attachmentsHtml}
          ${embedsHtml}
        </div>
      </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${escapeHtml(ticketId)} Transcript - ${escapeHtml(guild.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0e14;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 980px;
      background-color: #121824;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .header-card {
      background: linear-gradient(135deg, #101726 0%, #172338 100%);
      padding: 24px;
      border-bottom: 1px solid #1e293b;
    }
    .guild-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .guild-icon {
      width: 60px;
      height: 60px;
      border-radius: 16px;
      border: 2px solid #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    .guild-info h1 {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ticket-badge {
      font-size: 13px;
      background: #1e293b;
      color: #60a5fa;
      padding: 3px 10px;
      border-radius: 9999px;
      border: 1px solid #3b82f6;
    }
    .guild-sub {
      font-size: 13px;
      color: #94a3b8;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .meta-pill {
      background: #0b0e14;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 10px 14px;
    }
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .meta-value {
      font-size: 13px;
      color: #f1f5f9;
      font-weight: 500;
      word-break: break-all;
    }
    .filter-bar {
      padding: 16px 24px;
      background: #0e1420;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .search-input {
      flex: 1;
      background: #0b0e14;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    .search-input:focus {
      border-color: #3b82f6;
    }
    .msg-counter {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
    }
    .transcript-stream {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      background-color: #0d121c;
    }
    .message-row {
      display: flex;
      gap: 14px;
      padding: 8px 12px;
      border-radius: 8px;
      transition: background 0.15s ease;
    }
    .message-row:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .message-body {
      flex: 1;
      min-width: 0;
    }
    .message-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    .author-name {
      font-size: 14px;
      font-weight: 600;
      color: #f8fafc;
    }
    .bot-badge {
      background: #5865F2;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      line-height: 1;
    }
    .timestamp {
      font-size: 11px;
      color: #64748b;
    }
    .user-id {
      font-size: 11px;
      color: #475569;
    }
    .message-text {
      font-size: 14px;
      color: #cbd5e1;
      word-wrap: break-word;
    }
    .code-block {
      background: #0b0e14;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px 14px;
      margin: 8px 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      overflow-x: auto;
    }
    .inline-code {
      background: #0b0e14;
      border: 1px solid #1e293b;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
    }
    .mention {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 1px 4px;
      border-radius: 4px;
      font-weight: 500;
    }
    blockquote {
      border-left: 3px solid #3b82f6;
      padding-left: 10px;
      color: #94a3b8;
      margin: 6px 0;
    }
    a {
      color: #38bdf8;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .msg-attachments {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .attachment-image img {
      max-width: 480px;
      max-height: 340px;
      border-radius: 8px;
      border: 1px solid #1e293b;
      display: block;
      margin-bottom: 4px;
    }
    .attachment-meta {
      font-size: 11px;
      color: #64748b;
    }
    .attachment-file {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0b0e14;
      border: 1px solid #1e293b;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .msg-embeds {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .embed-box {
      background: #0b0e14;
      border: 1px solid #1e293b;
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      padding: 12px 16px;
      max-width: 580px;
    }
    .embed-author {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .embed-title {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .embed-description {
      font-size: 13px;
      color: #cbd5e1;
      margin-bottom: 8px;
    }
    .embed-fields {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }
    .embed-field {
      flex: 1 1 100%;
    }
    .embed-field.inline {
      flex: 1 1 45%;
    }
    .field-name {
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
    }
    .field-value {
      font-size: 13px;
      color: #e2e8f0;
    }
    .embed-image img {
      max-width: 100%;
      border-radius: 6px;
      margin-top: 8px;
    }
    .embed-footer {
      font-size: 11px;
      color: #64748b;
      margin-top: 8px;
    }
    .footer-bar {
      padding: 16px 24px;
      background: #101726;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <div class="guild-bar">
        <img class="guild-icon" src="${escapeHtml(guildIconUrl)}" alt="Server Icon" />
        <div class="guild-info">
          <h1>${escapeHtml(guild.name)} <span class="ticket-badge">#ticket-${escapeHtml(ticketId)}</span></h1>
          <div class="guild-sub">Server ID: ${escapeHtml(guild.id)} &bull; Forensic Ticket Archive</div>
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-pill">
          <div class="meta-label">Ticket Opener</div>
          <div class="meta-value">&lt;@${escapeHtml(openerId)}&gt;</div>
        </div>
        <div class="meta-pill">
          <div class="meta-label">Closed By</div>
          <div class="meta-value">${escapeHtml(closerTag)}</div>
        </div>
        <div class="meta-pill">
          <div class="meta-label">Assigned Staff</div>
          <div class="meta-value">${claimedId ? `&lt;@${escapeHtml(claimedId)}&gt;` : 'Unassigned'}</div>
        </div>
        <div class="meta-pill">
          <div class="meta-label">Duration</div>
          <div class="meta-value">${escapeHtml(durationStr)}</div>
        </div>
        <div class="meta-pill">
          <div class="meta-label">Total Messages</div>
          <div class="meta-value">${messages.length}</div>
        </div>
        <div class="meta-pill">
          <div class="meta-label">Closed Timestamp</div>
          <div class="meta-value">${new Date(closedAt).toUTCString()}</div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" id="search-box" class="search-input" placeholder="Search conversation by keyword, username, or message text..." oninput="filterMessages()" />
      <span class="msg-counter" id="msg-counter">${messages.length} messages</span>
    </div>

    <div class="transcript-stream" id="stream">
      ${messagesHtml || '<div style="text-align:center;color:#64748b;padding:30px;">No messages recorded in this ticket.</div>'}
    </div>

    <div class="footer-bar">
      Athena Prime Bulletproof Defense &amp; Support Matrix &bull; Generated ${new Date().toUTCString()}
    </div>
  </div>

  <script>
    function filterMessages() {
      const q = document.getElementById('search-box').value.toLowerCase().trim();
      const rows = document.querySelectorAll('.message-row');
      let visible = 0;
      rows.forEach(r => {
        const author = r.getAttribute('data-author') || '';
        const content = r.getAttribute('data-content') || '';
        if (!q || author.includes(q) || content.includes(q)) {
          r.style.display = 'flex';
          visible++;
        } else {
          r.style.display = 'none';
        }
      });
      document.getElementById('msg-counter').innerText = visible + ' messages shown';
    }
  </script>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

/**
 * Generate a clean plain text UTF-8 transcript.
 */
export function generateTextTranscript({ guild, channel, ticketId, ticketData, messages, closedBy }) {
  const openerId = ticketData?.ownerId || 'Unknown';
  const claimedId = ticketData?.claimedBy || null;
  const createdAt = ticketData?.createdAt || channel.createdTimestamp || Date.now();
  const closedAt = Date.now();
  const durationStr = formatDuration(closedAt - createdAt);

  const closerTag = closedBy?.user?.tag || closedBy?.tag || (closedBy?.id ? closedBy.id : 'Staff');
  const closerId = closedBy?.id || 'Unknown';

  let out = '';
  out += '================================================================================\n';
  out += ' ATHENA PRIME • OFFICIAL SUPPORT TICKET TRANSCRIPT\n';
  out += '================================================================================\n';
  out += ` Ticket ID:        #${ticketId}\n`;
  out += ` Channel:          #${channel.name} (${channel.id})\n`;
  out += ` Server / Guild:   ${guild.name} (${guild.id})\n`;
  out += ` Ticket Opener:    <@${openerId}> (ID: ${openerId})\n`;
  out += ` Opened At:        ${new Date(createdAt).toUTCString()}\n`;
  out += ` Closed By:        ${closerTag} (ID: ${closerId})\n`;
  out += ` Closed At:        ${new Date(closedAt).toUTCString()}\n`;
  out += ` Duration:         ${durationStr}\n`;
  out += ` Assigned Staff:   ${claimedId ? `<@${claimedId}> (ID: ${claimedId})` : 'Unassigned'}\n`;
  out += ` Total Messages:   ${messages.length}\n`;
  out += '================================================================================\n\n';

  for (const msg of messages) {
    const timeStr = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const authorTag = msg.author ? (msg.author.tag || `${msg.author.username}#${msg.author.discriminator}`) : 'Unknown User';
    const authorId = msg.author ? msg.author.id : '0';
    const isBot = msg.author?.bot ? ' [BOT]' : '';

    out += `[${timeStr}] ${authorTag}${isBot} (${authorId}):\n`;
    if (msg.content) {
      out += `  ${msg.content.replace(/\n/g, '\n  ')}\n`;
    }

    if (msg.attachments && msg.attachments.size > 0) {
      for (const att of msg.attachments.values()) {
        out += `  [Attachment] ${att.name || 'file'} (${att.url})\n`;
      }
    }

    if (msg.embeds && msg.embeds.length > 0) {
      for (const emb of msg.embeds) {
        const title = emb.title ? ` "${emb.title}"` : '';
        out += `  [Embed${title}]: ${emb.description || '(No description)'}\n`;
        if (emb.fields && emb.fields.length > 0) {
          for (const f of emb.fields) {
            out += `    • ${f.name}: ${f.value}\n`;
          }
        }
      }
    }

    out += '\n';
  }

  out += '================================================================================\n';
  out += ' END OF TRANSCRIPT • ATHENA BULLETPROOF DEFENSE & SUPPORT MATRIX\n';
  out += '================================================================================\n';

  return Buffer.from(out, 'utf-8');
}

/**
 * Builds the Component V2 closure summary card.
 */
export function generateTicketCloseSummaryCard({
  guild,
  channel,
  ticketId,
  openerId,
  openerTag,
  closedById,
  closedByTag,
  claimedId,
  claimedTag,
  messageCount,
  durationStr,
  createdAt,
  closedAt
}) {
  return {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Resolved & Closed** | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `<a:target_blink:1565667466984554588> **Ticket ID:** \`#${ticketId}\`\n` +
          `<a:target_blink:1565667466984554588> **Server:** **${guild.name}** (\`${guild.id}\`)\n` +
          `<a:target_blink:1565667466984554588> **Opened By:** <@${openerId}> (\`${openerTag || openerId}\`)\n` +
          `<a:target_blink:1565667466984554588> **Closed By:** <@${closedById}> (\`${closedByTag || closedById}\`)\n` +
          `<a:target_blink:1565667466984554588> **Assigned Staff:** ${claimedId ? `<@${claimedId}> (\`${claimedTag || claimedId}\`)` : '`Unclaimed`'}\n` +
          `<a:target_blink:1565667466984554588> **Total Messages:** \`${messageCount}\`\n` +
          `<a:target_blink:1565667466984554588> **Duration:** \`${durationStr}\`\n` +
          `<a:target_blink:1565667466984554588> **Opened At:** <t:${Math.floor(createdAt / 1000)}:f>\n` +
          `<a:target_blink:1565667466984554588> **Closed At:** <t:${Math.floor(closedAt / 1000)}:f>`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# <a:03_tick_circle:1565665642084827206> **Official Forensic Transcript:** Complete HTML interactive viewer and UTF-8 TXT archive attached.' }
    ]
  };
}

/**
 * End-to-end auto-export engine:
 * Fetches messages, generates HTML & TXT transcripts, and dispatches them to:
 * 1. Server Owner
 * 2. Assigned / Claimed Staff
 * 3. Closer
 * 4. Ticket Creator (Member)
 * 5. Dedicated Ticket Log Channel
 * Also records Staff Pulse action for moderation quotas.
 */
export async function dispatchTicketExports({ guild, channel, ticketId, ticketData, closedBy }) {
  // 1. Fetch messages
  const messages = await fetchTicketMessages(channel, 1000);

  const openerId = ticketData?.ownerId || null;
  const claimedId = ticketData?.claimedBy || null;
  const createdAt = ticketData?.createdAt || channel.createdTimestamp || Date.now();
  const closedAt = Date.now();
  const durationStr = formatDuration(closedAt - createdAt);

  const closedById = closedBy?.id || (closedBy?.user ? closedBy.user.id : 'Unknown');
  const closedByTag = closedBy?.user?.tag || closedBy?.tag || closedById;

  // Resolve Opener Tag
  let openerTag = openerId;
  if (openerId) {
    const openerUser = await guild.client.users.fetch(openerId).catch(() => null);
    if (openerUser) openerTag = openerUser.tag;
  }

  // Resolve Claimed Staff Tag
  let claimedTag = claimedId;
  if (claimedId) {
    const claimedUser = await guild.client.users.fetch(claimedId).catch(() => null);
    if (claimedUser) claimedTag = claimedUser.tag;
  }

  // 2. Generate Transcripts
  const htmlBuffer = generateHtmlTranscript({ guild, channel, ticketId, ticketData, messages, closedBy });
  const txtBuffer = generateTextTranscript({ guild, channel, ticketId, ticketData, messages, closedBy });

  const summaryCard = generateTicketCloseSummaryCard({
    guild,
    channel,
    ticketId,
    openerId,
    openerTag,
    closedById,
    closedByTag,
    claimedId,
    claimedTag,
    messageCount: messages.length,
    durationStr,
    createdAt,
    closedAt
  });

  const dispatched = [];

  // 3. Dispatch to Server Owner
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
      const ownerSummary = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Closed • Server Owner Report** | <a:03_tick_circle:1565665642084827206>` },
          { type: 14, divider: true },
          {
            type: 10,
            content:
              `A support ticket in **${guild.name}** has been resolved and closed.\n\n` +
              `<a:target_blink:1565667466984554588> **Ticket ID:** \`#${ticketId}\`\n` +
              `<a:target_blink:1565667466984554588> **Opened By:** <@${openerId}> (\`${openerTag}\`)\n` +
              `<a:target_blink:1565667466984554588> **Closed By:** <@${closedById}> (\`${closedByTag}\`)\n` +
              `<a:target_blink:1565667466984554588> **Assigned Staff:** ${claimedId ? `<@${claimedId}> (\`${claimedTag}\`)` : '`Unclaimed`'}\n` +
              `<a:target_blink:1565667466984554588> **Total Messages:** \`${messages.length}\`\n` +
              `<a:target_blink:1565667466984554588> **Duration:** \`${durationStr}\`\n` +
              `<a:target_blink:1565667466984554588> **Closed At:** <t:${Math.floor(closedAt / 1000)}:F>`
          },
          { type: 14, divider: true },
          { type: 10, content: '-# **Official Forensic Transcripts Attached:** Complete HTML viewer & UTF-8 TXT archive.' }
        ]
      };

      await owner.send({
        components: [ownerSummary],
        files: [
          new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-transcript.html` }),
          new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-transcript.txt` })
        ],
        flags: 32768
      }).catch(() => null);
      dispatched.push(`Owner (${owner.id})`);
    }
  } catch (err) {
    console.warn('[Ticket Auto-Export] Failed to send transcript to server owner:', err.message);
  }

  // 4. Dispatch to Ticket Creator (Member)
  if (openerId) {
    try {
      const openerUser = await guild.client.users.fetch(openerId).catch(() => null);
      if (openerUser) {
        const memberSummary = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Support Ticket #${ticketId} Resolved** | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `Thank you for reaching out to support in **${guild.name}**!\nYour ticket has been marked as resolved and closed.\n\n` +
                `<a:target_blink:1565667466984554588> **Ticket ID:** \`#${ticketId}\`\n` +
                `<a:target_blink:1565667466984554588> **Handled By:** ${claimedId ? `<@${claimedId}>` : `<@${closedById}>`}\n` +
                `<a:target_blink:1565667466984554588> **Resolution Duration:** \`${durationStr}\`\n\n` +
                `Attached below is your official copy of the entire conversation transcript for your records.`
            },
            { type: 14, divider: true },
            { type: 10, content: `-# **Athena Prime Support Matrix • ${guild.name}**` }
          ]
        };

        await openerUser.send({
          components: [memberSummary],
          files: [
            new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-transcript.html` }),
            new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-transcript.txt` })
          ],
          flags: 32768
        }).catch(() => null);
        dispatched.push(`Member (${openerId})`);
      }
    } catch (err) {
      console.warn('[Ticket Auto-Export] Failed to send transcript to ticket opener:', err.message);
    }
  }

  // 5. Dispatch to Claimed Staff Member
  if (claimedId && claimedId !== guild.ownerId) {
    try {
      const staffUser = await guild.client.users.fetch(claimedId).catch(() => null);
      if (staffUser) {
        const staffSummary = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Closed • Staff Assignment Report** | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `Support ticket **#${ticketId}** in **${guild.name}** has been resolved and closed.\n\n` +
                `<a:target_blink:1565667466984554588> **Opened By:** <@${openerId}> (\`${openerTag}\`)\n` +
                `<a:target_blink:1565667466984554588> **Closed By:** <@${closedById}> (\`${closedByTag}\`)\n` +
                `<a:target_blink:1565667466984554588> **Messages Exchanged:** \`${messages.length}\`\n` +
                `<a:target_blink:1565667466984554588> **Duration:** \`${durationStr}\``
            },
            { type: 14, divider: true },
            { type: 10, content: '-# **Staff Activity Quota:** Recorded in Staff Pulse matrix.' }
          ]
        };

        await staffUser.send({
          components: [staffSummary],
          files: [
            new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-transcript.html` }),
            new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-transcript.txt` })
          ],
          flags: 32768
        }).catch(() => null);
        dispatched.push(`Claimed Staff (${claimedId})`);
      }
    } catch (err) {
      console.warn('[Ticket Auto-Export] Failed to send transcript to claimed staff:', err.message);
    }
  }

  // 6. Dispatch to Closer (if staff member and not owner, not opener, and not claimed staff)
  if (closedById && closedById !== 'Unknown' && closedById !== guild.ownerId && closedById !== openerId && closedById !== claimedId) {
    try {
      const closerUser = closedBy.user || (await guild.client.users.fetch(closedById).catch(() => null));
      if (closerUser) {
        const closerSummary = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Closed • Staff Closure Archive** | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `You closed ticket **#${ticketId}** in **${guild.name}**.\n\n` +
                `<a:target_blink:1565667466984554588> **Opened By:** <@${openerId}> (\`${openerTag}\`)\n` +
                `<a:target_blink:1565667466984554588> **Messages Exchanged:** \`${messages.length}\`\n` +
                `<a:target_blink:1565667466984554588> **Duration:** \`${durationStr}\``
            },
            { type: 14, divider: true },
            { type: 10, content: '-# **Staff Activity Quota:** Recorded in Staff Pulse matrix.' }
          ]
        };

        await closerUser.send({
          components: [closerSummary],
          files: [
            new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-transcript.html` }),
            new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-transcript.txt` })
          ],
          flags: 32768
        }).catch(() => null);
        dispatched.push(`Closer (${closedById})`);
      }
    } catch (err) {
      console.warn('[Ticket Auto-Export] Failed to send transcript to closer:', err.message);
    }
  }

  // 7. Dispatch to Server Ticket Log Channel
  const ticketConfig = db.getTickets(guild.id);
  const guildConfig = db.getGuildConfig(guild.id);
  const logChannelId = ticketConfig.logChannelId || guildConfig?.serverLogs?.defaultChannelId || guildConfig?.logChannel;

  if (logChannelId) {
    try {
      const logChannel = guild.channels.cache.get(logChannelId) || (await guild.channels.fetch(logChannelId).catch(() => null));
      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({
          components: [summaryCard],
          files: [
            new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-transcript.html` }),
            new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-transcript.txt` })
          ],
          flags: 32768
        }).catch(() => null);
        dispatched.push(`Log Channel (${logChannelId})`);
      }
    } catch (err) {
      console.warn('[Ticket Auto-Export] Failed to send transcript to log channel:', err.message);
    }
  }

  // 8. Record Staff Action in Staff Pulse
  if (closedById && closedById !== 'Unknown') {
    db.recordStaffAction(guild.id, closedById, 'tickets');
  }
  if (claimedId && claimedId !== closedById) {
    db.recordStaffAction(guild.id, claimedId, 'tickets');
  }

  return {
    success: true,
    messageCount: messages.length,
    durationStr,
    dispatched,
    htmlBuffer,
    txtBuffer,
    summaryCard
  };
}
