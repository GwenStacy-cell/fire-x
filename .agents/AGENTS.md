# Bot Emoji Rules
- Avoid using Discord native emojis (like ✅, ❌, ⚠️, etc.) anywhere in the bot's responses or embeds.
- For command success / actions completed / granted / executed: ALWAYS use the custom tick emoji `<a:03_tick_circle:1565665642084827206>` placed after the heading in the format: `Heading | <a:03_tick_circle:1565665642084827206>`.
- For error / danger / rejected actions: ALWAYS use the custom cross emoji `<a:04_cross_circle:1565665644806934639>` in the format: `Heading | <a:04_cross_circle:1565665644806934639>`.
- For warning / caution / advisories: ALWAYS use the custom exclamation emoji `<a:exclamation_outline1:1565666739356827759>` in the format: `Heading | <a:exclamation_outline1:1565666739356827759>`.
- For bullet points in lists, descriptions, and fields: ALWAYS use the target blink emoji `<a:target_blink:1565667466984554588>`.
- For command / feature headings: Prepend a randomized animated glyph from `HEADING_GLYPHS` in `src/utils/emojis.js`. Occasionally (intermittently), headings may also be framed symmetrically between ninja bullets: `# <a:ninja_bullet:1567038601668337705> Heading <a:ninja_bullet_rtl:1567038652687712317>`.
- For Navigation & Pagination buttons (Help menu, Explainer, Dashboards):
  - Home: `<a:01_home_beat:1567037361810833428>` (ID: `1567037361810833428`)
  - Delete / Close: `<a:02_delete_beat:1567037365547962449>` (ID: `1567037365547962449`)
  - Previous: `<a:03_previous_beat:1567037369058598962>` (ID: `1567037369058598962`)
  - Next: `<a:04_next_beat:1567037372133019710>` (ID: `1567037372133019710`)
- For uptime/status indicator ticks, use: `<a:uptime:1552608831060844575>`.
- DO NOT replace or change emojis for the counting feature (`src/utils/countingEngine.js`).

# Database ID Detection & Fetching Rules
- ALWAYS fetch and detect channels, categories, roles, and other Discord entities from the bot's database (`database.js` / guildConfig / specific database methods) using their IDs.
- NEVER rely on or fall back to matching hardcoded names, strings, or display emojis to detect or identify existing roles, channels, or categories when they can or should be tracked in the database.
- Whenever a setup command or feature creates or binds a channel, category, role, or resource, ALWAYS store its ID in the database immediately.
- In all present and future commands, handlers, and event listeners, ALWAYS fetch by ID (`guild.channels.cache.get(id) || await guild.channels.fetch(id)` / `guild.roles.cache.get(id) || await guild.roles.fetch(id)`) using the database configuration.

# Version, Changelog & Bot Status Note Rules
- ALWAYS maintain the rolling 5-day changelog in `src/utils/changelogData.js` (`CHANGELOG_ENTRIES`) whenever new features, bug fixes, or optimizations are implemented.
- Whenever code is updated, increment the version (e.g. `v2.9.0`) and prepend a new entry at the top of `CHANGELOG_ENTRIES` with clear date, headline, summary, what's new, improvements, and fixes.
- ALWAYS ensure the bot's custom activity status note (in `src/events/ready.js`: `CHANGELOG_ENTRIES[0]?.version`) updates to reflect the new version in the rotating presence ("Athena {version} is now rolling out..").
