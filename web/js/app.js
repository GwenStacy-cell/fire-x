/* Athena Prime • Web Control Plane Frontend Controller
   Zero-dependency ES5/ES6 browser script — safe to customize after deployment */

(function () {
  'use strict';

  const TIMELINE_STAGES = {
    1: {
      badge: 'STEP 01',
      latency: '0.00ms Intercept',
      title: '0ms TCP Wiretap',
      description: 'Raw gateway packet inspection listens directly on Discord WebSocket heartbeat buffers before high-level libraries finish deserialization.',
      vector: 'RAW_WEBSOCKET_INSPECT'
    },
    2: {
      badge: 'STEP 02',
      latency: '0.18ms Lookup',
      title: 'O(1) Hashed Access Gate',
      description: 'Pre-indexed in-memory Sets verify Server Owner, Extra Owners, and Bot/User whitelists with zero allocation overhead.',
      vector: 'O1_SET_AUTHORIZATION'
    },
    3: {
      badge: 'STEP 03',
      latency: '< 12ms Strike',
      title: 'Single-Shot Raw TLS Ban',
      description: 'Condemned tokens are neutralized over 12 pre-warmed keep-alive TLS sockets bypassing slower HTTP client wrapper queues.',
      vector: '12_SOCKET_RAW_TLS'
    },
    4: {
      badge: 'STEP 04',
      latency: '18ms Quarantine',
      title: 'Role Escalation & Inviter Cascade',
      description: 'Unwhitelisted bots operate under Zero Immunity and trigger an automated cascade stripping or banning non-exempt inviters.',
      vector: 'ZERO_IMMUNITY_CASCADE'
    },
    5: {
      badge: 'STEP 05',
      latency: '84ms Recovery',
      title: 'Time-Machine Self-Repair',
      description: 'Deleted channels, categories, roles, and overwrites are healed directly from in-memory infrastructure snapshots.',
      vector: 'RAM_INFRA_RECONCILE'
    }
  };

  const FEATURE_MATRICES = {
    nuke: [
      { title: '32 Granular Shields', badge: 'FULL MATRIX', body: 'Covers Roles, Channels, Webhooks, Vanity URLs, Bot Adds, Soundboards, AutoMod, and Mass Bans/Purges.' },
      { title: 'Zero Immunity Bot Rule', badge: 'STRICT MODE', body: 'Owner-added unwhitelisted bots are terminated instantaneously on unauthorized mutation bursts.' },
      { title: '2FA Disarm Protection', badge: 'TIER-0 LOCK', body: 'Master security disarm and module shutdown are gated behind Tier-0 ownership and Gmail 2FA OTP.' }
    ],
    telemetry: [
      { title: '12-Socket Raw TLS Pool', badge: 'KEEP-ALIVE', body: 'Maintains persistent TLS connections directly to discord.com:443 with X-RateLimit bucket tracking.' },
      { title: '0ms Audit Log Ring', badge: 'SYNCHRONIZED', body: 'In-memory circular audit ring matches gateway events immediately, falling back only when needed.' },
      { title: '!sectrack Control Panel', badge: 'LIVE FEED', body: 'Inspect socket capacity, bucket cooldowns, anti-strip syncs, and recent intercept logs in real time.' }
    ],
    automod: [
      { title: 'Link & Invite Enforcer', badge: 'REAL-TIME', body: 'Mutually synchronized Anti-Link and Anti-Invite filters plus customizable domain allowlists.' },
      { title: 'Custom Blacklist Engine', badge: 'REGEX READY', body: 'Manage guild blacklisted substrings from Discord or this web portal with instant database sync.' },
      { title: 'Anti-Flood & AI Toxicity', badge: 'HEURISTICS', body: 'Multi-layer spam velocity limits, mass mention guards, big-font protection, and AI moderation.' }
    ],
    tagdrag: [
      { title: 'Identity Tag Detection', badge: 'PRIMARY GUILD', body: 'Detects Discord server identity tags in real time on voice joins and profile updates.' },
      { title: 'Protected Lobby Safety', badge: 'NO-CONFLICT', body: 'Automatically skips JTC generators, Home VC, Stats rooms, and Quarantine confinement channels.' },
      { title: 'Per-Rule Intervals', badge: 'HOT SWAP', body: 'Configure or pause individual tag rotation rules live from Discord or this web console.' }
    ],
    sentinel: [
      { title: 'Ghost Honeypot Trap', badge: '< 10MS TRAP', body: 'Hidden canary channel & decoy role neutralize automated token scrapers the moment they broadcast.' },
      { title: 'Time-Machine Snapshots', badge: 'ROLLBACK', body: 'Rolling 20-minute plus manual snapshots restore wiped roles, categories, and permission overwrites.' },
      { title: 'Anti-Strip Persistence', badge: '3.5S SYNC', body: 'Monitors and restores Athena persistence sentinel roles if attackers attempt privilege stripping.' }
    ]
  };

  const state = {
    view: 'showcase',
    me: null,
    guilds: [],
    activeGuildId: null,
    guildData: null,
    shieldCat: 'all',
    wlFilter: 'all',
    pollTimer: null
  };

  // Safe HTML escaping utility — prevents XSS on all Discord names/inputs
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Never';
    const diffSec = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }

  function showToast(msg, type = 'success') {
    const el = document.getElementById('toastBanner');
    const txt = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');
    if (!el || !txt) return;
    txt.textContent = msg;
    if (type === 'error') {
      el.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full font-mono text-xs font-semibold shadow-2xl transition-all duration-200 flex items-center gap-2 bg-error-container text-on-error-container opacity-100 translate-y-0';
      if (icon) icon.textContent = 'error';
    } else {
      el.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full font-mono text-xs font-semibold shadow-2xl transition-all duration-200 flex items-center gap-2 bg-secondary-container text-on-secondary-container opacity-100 translate-y-0';
      if (icon) icon.textContent = 'verified';
    }
    clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(() => {
      el.classList.add('opacity-0', 'pointer-events-none', 'translate-y-[-10px]');
      el.classList.remove('opacity-100', 'translate-y-0');
    }, 3200);
  }

  async function apiFetch(url, options = {}) {
    const opts = {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    };
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // NAVIGATION & VIEW SWITCHING
  // ---------------------------------------------------------------------------
  const ALL_VIEWS = [
    'showcase','overview','access','sectrack','controls','incidents','docs',
    'tickets','welcome','serverlogs','msgdeletelog','autorole','verify','counting',
    'leveling','reactionroles','ccmds','youtube',
    'serverstats','autoreact','media','quarantine','persona','morning'
  ];
  const SETTINGS_VIEWS = [
    'tickets','welcome','serverlogs','msgdeletelog','autorole','verify','counting',
    'leveling','reactionroles','ccmds','youtube',
    'serverstats','autoreact','media','quarantine','persona','morning'
  ];

  function setView(viewName) {
    const protectedViews = ['overview','access','sectrack','controls','incidents','docs',...SETTINGS_VIEWS];
    if (protectedViews.includes(viewName) && !state.me) {
      openAuthModal();
      return;
    }

    state.view = viewName;
    ALL_VIEWS.forEach(v => {
      const sec = document.getElementById(`view-${v}`);
      if (sec) sec.classList.toggle('hidden', v !== viewName);
    });

    // Lazy-load settings panel data when navigating to it
    if (SETTINGS_VIEWS.includes(viewName) && state.activeGuildId) {
      loadSettingsPanel(viewName);
    }

    document.querySelectorAll('.nav-link').forEach(btn => {
      const active = btn.dataset.nav === viewName;
      btn.className = active
        ? 'nav-link w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold bg-surface-container-high text-primary shadow-[0_0_12px_rgba(0,240,255,0.14)] transition-all text-left'
        : 'nav-link w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all text-left';
    });

    document.querySelectorAll('.mob-nav-btn').forEach(btn => {
      const active = btn.dataset.nav === viewName;
      btn.classList.toggle('text-primary-container', active);
      btn.classList.toggle('font-bold', active);
      btn.classList.toggle('text-on-surface-variant', !active);
    });
  }

  // ---------------------------------------------------------------------------
  // PUBLIC SHOWCASE RENDERING
  // ---------------------------------------------------------------------------
  async function loadPublicOverview() {
    try {
      const data = await apiFetch('/api/public/overview');
      const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setTxt('pubShieldCount', `${data.shieldCount || 32} Shields`);
      setTxt('pubTlsSockets', `${data.tls?.totalSockets ?? 12}/${data.tls?.poolCapacity ?? 12} Sockets`);
      setTxt('pubGuildsCount', `${data.guildsCount ?? 0} Guilds`);
      setTxt('pubPing', `${data.wsPingMs ?? 0}ms`);
      setTxt('pubVersionPill', data.version || 'v4.0');
      setTxt('pubStrikes', String(data.tls?.strikesServed ?? 0));
      setTxt('pubSecuredGuilds', String(data.securedGuildsCount ?? 0));
      setTxt('hdrPingText', `${data.wsPingMs ?? 0}ms`);
      setTxt('hdrVersionText', data.version || 'v4.0');
      setTxt('hdrTlsText', `${data.tls?.totalSockets ?? 12}-Socket Raw TLS`);

      const logBox = document.getElementById('pubChangelogList');
      if (logBox && Array.isArray(data.changelog)) {
        logBox.innerHTML = data.changelog.slice(0, 3).map(entry => `
          <div class="p-3 rounded-lg bg-surface-container border border-outline-variant/20 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-primary-container font-bold">${esc(entry.version)}</span>
              <span class="text-[10px] text-outline">${esc(entry.date)}</span>
            </div>
            <div class="text-on-surface font-semibold">${esc(entry.headline)}</div>
          </div>
        `).join('');
      }
    } catch {
      // Non-fatal while bot finishes initial boot
    }
  }

  function renderFeatureMatrix(tabKey) {
    const box = document.getElementById('featureMatrixContent');
    if (!box) return;
    const items = FEATURE_MATRICES[tabKey] || FEATURE_MATRICES.nuke;
    box.innerHTML = items.map(item => `
      <div class="bg-surface-container p-4 rounded-xl border border-outline-variant/20 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-on-surface text-sm">${esc(item.title)}</span>
          <span class="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-primary-container">${esc(item.badge)}</span>
        </div>
        <p class="text-xs text-on-surface-variant leading-relaxed">${esc(item.body)}</p>
      </div>
    `).join('');
  }

  // ---------------------------------------------------------------------------
  // AUTH SESSION & GUILD SWITCHING
  // ---------------------------------------------------------------------------
  function openAuthModal(expired = false) {
    const modal = document.getElementById('authModal');
    const notice = document.getElementById('authExpiredNotice');
    if (notice) notice.classList.toggle('hidden', !expired);
    if (modal) modal.classList.remove('hidden');
  }

  function closeAuthModal() {
    document.getElementById('authModal')?.classList.add('hidden');
  }

  async function initSession() {
    try {
      const me = await apiFetch('/api/me');
      state.me = me.user;
      state.guilds = me.guilds || [];

      document.getElementById('dashNavGroup')?.classList.remove('hidden');
      document.getElementById('sidebarGuildBox')?.classList.remove('hidden');
      document.getElementById('sidebarGuestCard')?.classList.add('hidden');
      document.getElementById('sidebarUserCard')?.classList.remove('hidden');
      document.getElementById('hdrLoginBtn')?.classList.add('hidden');
      document.getElementById('hdrProfileBtn')?.classList.remove('hidden');
      document.getElementById('hdrRefreshBtn')?.classList.remove('hidden');

      document.querySelectorAll('.mob-nav-btn[data-nav="overview"], .mob-nav-btn[data-nav="access"], .mob-nav-btn[data-nav="sectrack"], .mob-nav-btn[data-nav="controls"], .mob-nav-btn[data-nav="incidents"]')
        .forEach(el => el.classList.remove('hidden'));

      document.getElementById('sidebarUserName').textContent = me.user.displayName;
      document.getElementById('sidebarUserAvatar').src = me.user.avatarUrl || '';
      document.getElementById('hdrAvatarImg').src = me.user.avatarUrl || '';

      // Inject bot's real Discord avatar into the sidebar brand icon
      if (me.botAvatar) {
        const img = document.getElementById('sidebarBotAvatar');
        const fallback = document.getElementById('sidebarBotAvatarFallback');
        if (img) { img.src = me.botAvatar; img.style.display = ''; }
        if (fallback) fallback.style.display = 'none';
      }

      const mobSel = document.getElementById('mobileGuildSelect');
      const dskSel = document.getElementById('guildSwitcherSelect');
      const optionsHtml = state.guilds.map(g =>
        `<option value="${esc(g.id)}">${esc(g.name)} (${g.memberCount}m)</option>`
      ).join('');

      if (dskSel) dskSel.innerHTML = optionsHtml;
      if (mobSel) {
        mobSel.innerHTML = optionsHtml;
        mobSel.classList.remove('hidden');
      }

      const hashParams = new URLSearchParams((window.location.hash.split('?')[1] || ''));
      const preferredGid = hashParams.get('guild') || me.defaultGuildId || state.guilds[0]?.id || null;
      state.activeGuildId = state.guilds.some(g => g.id === preferredGid) ? preferredGid : (state.guilds[0]?.id || null);

      if (state.activeGuildId) {
        if (dskSel) dskSel.value = state.activeGuildId;
        if (mobSel) mobSel.value = state.activeGuildId;
        await loadGuildState();
      }

      if (window.location.hash.startsWith('#dashboard')) {
        setView('overview');
      }

      startPolling();
    } catch {
      // Guest user — keep Showcase view active
      state.me = null;
      if (window.location.hash === '#auth-expired') {
        openAuthModal(true);
      }
    }
  }

  function startPolling() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (state.me && state.activeGuildId && ['overview', 'sectrack'].includes(state.view)) {
        loadGuildState(true);
      }
    }, 5000);
  }

  async function loadGuildState(silent = false) {
    if (!state.activeGuildId) return;
    try {
      const data = await apiFetch(`/api/guilds/${encodeURIComponent(state.activeGuildId)}/state`);
      state.guildData = data;
      renderGuildData(data);
    } catch (err) {
      if (!silent) showToast(err.message, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER AUTHENTICATED GUILD VIEWS
  // ---------------------------------------------------------------------------
  function renderGuildData(data) {
    const { guild, clearance, security, telemetry, access, controls, incidents, quarantined, syncSummary } = data;

    document.getElementById('sidebarUserRole').textContent = clearance.roleLabel;
    document.getElementById('sidebarMemberCount').textContent = `${guild.memberCount.toLocaleString()} members`;
    document.getElementById('sidebarLatency').innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span><span>${telemetry.wsPingMs}ms</span>`;

    // Update sidebar brand icon to guild-specific bot avatar (server profile pic if set)
    if (guild.botGuildAvatar) {
      const img = document.getElementById('sidebarBotAvatar');
      const fallback = document.getElementById('sidebarBotAvatarFallback');
      if (img) { img.src = guild.botGuildAvatar; img.style.display = ''; }
      if (fallback) fallback.style.display = 'none';
    }

    // Top Header Status Pills
    const shieldPill = document.getElementById('hdrShieldPill');
    const shieldLabel = document.getElementById('hdrShieldLabel');
    const shieldIcon = document.getElementById('hdrShieldIcon');
    const disarmBtn = document.getElementById('hdrDisarmBtn');

    if (shieldPill && shieldLabel) {
      shieldPill.classList.remove('hidden');
      if (security.isSecured) {
        shieldLabel.textContent = `SYSTEM ARMED ${security.armedCount}/${security.totalModules}`;
        shieldLabel.className = 'font-mono text-[11px] font-bold text-secondary tracking-wider uppercase';
        if (shieldIcon) shieldIcon.className = 'material-symbols-outlined text-secondary text-[16px]';
      } else {
        shieldLabel.textContent = 'SYSTEM STANDBY 0/32';
        shieldLabel.className = 'font-mono text-[11px] font-bold text-error tracking-wider uppercase';
        if (shieldIcon) shieldIcon.className = 'material-symbols-outlined text-error text-[16px]';
      }
    }

    if (disarmBtn) {
      disarmBtn.classList.toggle('hidden', !(clearance.canDisarm && security.isSecured));
    }

    document.getElementById('hdrPingText').textContent = `${telemetry.wsPingMs}ms`;
    document.getElementById('hdrTlsText').textContent = `${telemetry.tls?.totalSockets ?? 12}-Socket Raw TLS`;

    // Overview Tab KPIs
    document.getElementById('ovArmedBig').textContent = `${security.armedCount} / ${security.totalModules} ACTIVE`;
    const ovBadge = document.getElementById('ovStatusBadge');
    ovBadge.textContent = security.isSecured ? 'ARMED • DEFCON 1' : 'DISARMED / IDLE';
    ovBadge.className = security.isSecured
      ? 'px-2.5 py-0.5 rounded font-mono text-[11px] font-bold bg-secondary-container/20 text-secondary'
      : 'px-2.5 py-0.5 rounded font-mono text-[11px] font-bold bg-error-container text-on-error-container';

    document.getElementById('ovStatusSub').textContent = security.isSecured
      ? 'Autonomous anti-nuke shields and persistence roles are actively guarding this guild.'
      : 'Perimeter shields are offline. Arm security to deploy all 32 modules & persistence roles.';

    const h = guild.hierarchy;
    const hOk = h.hasBotBypass || (h.meetsTop3 && h.meetsMemberCount && h.hasManageRoles);
    const hEl = document.getElementById('ovHierarchyStatus');
    hEl.textContent = h.hasBotBypass
      ? `Root Bypass Active (Pos ${h.botPos}/${h.maxPos})`
      : `Pos ${h.botPos}/${h.maxPos} • ${guild.memberCount}/200 Mbrs`;
    hEl.className = hOk ? 'text-secondary font-semibold' : 'text-error font-semibold';

    document.getElementById('ov2faPill').textContent = security.twoFactorVerified
      ? `2FA LOCKED (${security.twoFactorEmailMasked || 'EMAIL'})`
      : 'NO 2FA EMAIL SET';

    document.getElementById('ovWsPing').textContent = String(telemetry.wsPingMs || 0);
    document.getElementById('ovSocketsInline').textContent = `${telemetry.tls?.warmIdleSockets ?? 0}/${telemetry.tls?.poolCapacity ?? 12} TLS Warm`;
    document.getElementById('ovIncidentCount').textContent = String(incidents.length);
    document.getElementById('ovIntegrity').textContent = `${security.integrity}%`;
    document.getElementById('ovInfraStats').textContent = `${guild.channelCount} channels • ${guild.roleCount} roles`;

    const armBtn = document.getElementById('ovArmBtn');
    const ovDisarmBtn = document.getElementById('ovDisarmBtn');
    if (armBtn) {
      armBtn.disabled = !clearance.canArm;
      armBtn.classList.toggle('opacity-40', !clearance.canArm);
    }
    if (ovDisarmBtn) {
      ovDisarmBtn.disabled = !(clearance.canDisarm && security.isSecured);
      ovDisarmBtn.classList.toggle('opacity-40', !(clearance.canDisarm && security.isSecured));
    }

    renderShieldsGrid(security.shields, security.isSecured, clearance.canToggleModules, clearance.canDisarm);
    renderAccessControl(access, clearance);
    renderTelemetryTab(guild, telemetry, security);
    renderExtraControlsTab(controls, clearance, guild);
    renderIncidentsTab(incidents, quarantined, clearance);
    renderSyncDocsTab(syncSummary);
  }

  function renderShieldsGrid(shields, masterArmed, canToggle, canDisarm = false) {
    const grid = document.getElementById('shieldsMatrixGrid');
    if (!grid) return;
    const filtered = state.shieldCat === 'all' ? shields : shields.filter(s => s.category === state.shieldCat);
    grid.innerHTML = filtered.map(s => {
      const canModifyThis = Boolean(masterArmed && canToggle && (!s.enabled || canDisarm));
      return `
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/25 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-sm text-on-surface truncate">${esc(s.label)}</span>
            <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-primary-container">${esc(s.code)}</span>
          </div>
          <p class="text-xs text-on-surface-variant mt-1">${esc(s.desc)}</p>
        </div>
        <label class="tactical-switch" title="${canModifyThis ? 'Toggle Shield' : (masterArmed ? 'Server Owner / Bot Owner required to disable active shields' : 'Arm Master Security first')}">
          <input type="checkbox" class="shield-toggle-input" data-mod="${esc(s.key)}" ${s.enabled ? 'checked' : ''} ${canModifyThis ? '' : 'disabled'} />
          <span class="tactical-slider"></span>
        </label>
      </div>
    `;
    }).join('');

    grid.querySelectorAll('.shield-toggle-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const moduleKey = inp.dataset.mod;
        const enabled = inp.checked;
        try {
          await apiFetch(`/api/guilds/${state.activeGuildId}/modules/toggle`, {
            method: 'POST',
            body: JSON.stringify({ moduleKey, enabled })
          });
          showToast(`${moduleKey} -> ${enabled ? 'ARMED' : 'DISABLED'}`);
          loadGuildState(true);
        } catch (err) {
          inp.checked = !enabled;
          showToast(err.message, 'error');
        }
      });
    });
  }

  function renderAccessControl(access, clearance) {
    // Populate modal quick pick cache
    const wlType = document.getElementById('wlTypeSelect')?.value || 'users';
    const quickPick = document.getElementById('wlQuickPick');
    if (quickPick) {
      const list = wlType === 'roles' ? (access.availableRoles || []) : (access.cachedMembers || []);
      quickPick.innerHTML = '<option value="">-- Select from cache --</option>' + list.map(item =>
        wlType === 'roles'
          ? `<option value="${esc(item.id)}">@${esc(item.name)} (${esc(item.id)})</option>`
          : `<option value="${esc(item.id)}">${esc(item.displayName)} (@${esc(item.username)})</option>`
      ).join('');
    }

    // Whitelist list
    const wlBox = document.getElementById('whitelistContainer');
    const items = [];
    if (state.wlFilter === 'all' || state.wlFilter === 'users') {
      (access.whitelists?.users || []).forEach(u => items.push({ kind: 'users', ...u }));
    }
    if (state.wlFilter === 'all' || state.wlFilter === 'roles') {
      (access.whitelists?.roles || []).forEach(r => items.push({ kind: 'roles', ...r }));
    }

    if (items.length === 0) {
      wlBox.innerHTML = `<div class="p-4 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono">No whitelist entries match the current filter.</div>`;
    } else {
      wlBox.innerHTML = items.map(it => {
        const scope = (it.modules || ['all']).join(', ').toUpperCase();
        const limitLabel = it.triggerLimit > 0 ? `${it.currentUsage || 0} / ${it.triggerLimit} ops` : 'UNLIMITED';
        return `
          <div class="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded font-mono text-[10px] ${it.kind === 'roles' ? 'bg-tertiary-container/20 text-tertiary-container' : 'bg-surface-container-high text-primary'}">${it.kind === 'roles' ? 'ROLE' : 'MEMBER'}</span>
                <span class="font-semibold text-sm text-on-surface truncate">${esc(it.kind === 'roles' ? it.name : it.displayName)}</span>
              </div>
              <div class="font-mono text-[11px] text-on-surface-variant mt-1">ID: ${esc(it.id)} • SCOPE: <span class="text-secondary">${esc(scope)}</span> • LIMIT: ${esc(limitLabel)}</div>
            </div>
            ${clearance.canManageWhitelist ? `
              <button class="wl-revoke-btn px-3 py-1.5 rounded-lg bg-error-container/70 hover:bg-error hover:text-on-error text-on-error-container font-mono text-[11px] font-bold uppercase shrink-0" data-type="${esc(it.kind)}" data-id="${esc(it.id)}">REVOKE</button>
            ` : ''}
          </div>
        `;
      }).join('');

      wlBox.querySelectorAll('.wl-revoke-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/guilds/${state.activeGuildId}/whitelist/remove`, {
              method: 'POST',
              body: JSON.stringify({ type: btn.dataset.type, targetId: btn.dataset.id })
            });
            showToast('Whitelist entry revoked.');
            loadGuildState(true);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    }

    // Extra Owners
    const eoList = document.getElementById('extraOwnersList');
    const eoForm = document.getElementById('addExtraOwnerForm');
    if (eoForm) eoForm.classList.toggle('hidden', !clearance.canManageExtraOwners);

    if ((access.extraOwners || []).length === 0) {
      eoList.innerHTML = `<div class="p-3 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono">No Extra Owners registered.</div>`;
    } else {
      eoList.innerHTML = access.extraOwners.map(eo => `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-sm text-on-surface truncate">${esc(eo.displayName)}</div>
            <div class="font-mono text-[10px] text-on-surface-variant">UID: ${esc(eo.id)} • TIER 1</div>
          </div>
          ${clearance.canManageExtraOwners ? `
            <button class="eo-revoke-btn px-2.5 py-1 rounded bg-surface-container-high hover:bg-error-container text-on-surface-variant hover:text-on-error-container font-mono text-[10px] font-bold" data-id="${esc(eo.id)}">REVOKE</button>
          ` : ''}
        </div>
      `).join('');
      eoList.querySelectorAll('.eo-revoke-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/guilds/${state.activeGuildId}/extra-owners/remove`, {
              method: 'POST',
              body: JSON.stringify({ userId: btn.dataset.id })
            });
            showToast('Extra Owner revoked.');
            loadGuildState(true);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    }

    // Bot Whitelist
    const botBox = document.getElementById('botWhitelistContainer');
    const botForm = document.getElementById('addBotWlForm');
    if (botForm) botForm.classList.toggle('hidden', !clearance.canManageWhitelist);

    if ((access.botWhitelist || []).length === 0) {
      botBox.innerHTML = `<div class="p-3 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono">No bots whitelisted — all external bots operate under strict guard.</div>`;
    } else {
      botBox.innerHTML = access.botWhitelist.map(b => `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-semibold text-sm text-on-surface truncate">${esc(b.displayName)}</div>
            <div class="font-mono text-[10px] text-secondary">APP ID: ${esc(b.id)} • VERIFIED</div>
          </div>
          ${clearance.canManageWhitelist ? `
            <button class="bot-remove-btn px-2.5 py-1 rounded bg-surface-container-high hover:bg-error-container text-on-surface-variant hover:text-on-error-container font-mono text-[10px] font-bold" data-id="${esc(b.id)}">REMOVE</button>
          ` : ''}
        </div>
      `).join('');
      botBox.querySelectorAll('.bot-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/guilds/${state.activeGuildId}/bot-whitelist/remove`, {
              method: 'POST',
              body: JSON.stringify({ botId: btn.dataset.id })
            });
            showToast('Bot removed from whitelist.');
            loadGuildState(true);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    }
  }

  function renderTelemetryTab(guild, telemetry, security) {
    const tls = telemetry.tls || {};
    document.getElementById('stShard').textContent = `#${guild.shardId ?? 0}`;
    document.getElementById('stTarget').textContent = tls.target || 'discord.com:443';
    document.getElementById('stResolvedIp').textContent = tls.cachedIpv4 || 'DNS Ready';
    document.getElementById('stRateHits').textContent = String(tls.rateLimitHits ?? 0);
    document.getElementById('stBucketsCount').textContent = String(tls.trackedBuckets ?? 0);
    document.getElementById('stStrikes').textContent = String(tls.strikesServed ?? 0);
    document.getElementById('stWarmCount').textContent = `${tls.warmIdleSockets ?? 0}/${tls.poolCapacity ?? 12}`;
    document.getElementById('stAuxCount').textContent = String(tls.auxRequestsServed ?? 0);

    // 12-Socket Visual Mesh
    const cap = tls.poolCapacity || 12;
    const total = tls.totalSockets || 0;
    const idle = tls.warmIdleSockets || 0;
    const meshGrid = document.getElementById('tlsMeshGrid');
    const cards = [];
    for (let i = 1; i <= cap; i++) {
      const connected = i <= total;
      const warm = i <= idle;
      const badge = warm ? 'WARM' : (connected ? 'BUSY' : 'INIT');
      const colorCls = warm ? 'bg-secondary' : (connected ? 'bg-primary-container' : 'bg-outline-variant');
      cards.push(`
        <div class="rounded-lg bg-surface-container-low p-3 border border-outline-variant/20 space-y-2">
          <div class="flex items-center justify-between font-mono text-[10px]">
            <span class="text-outline">#${String(i).padStart(2, '0')}</span>
            <span class="w-2 h-2 rounded-full ${colorCls}"></span>
          </div>
          <div class="font-mono text-xs font-bold text-on-surface">${connected ? 'TLS 1.3' : 'STANDBY'}</div>
          <div class="flex justify-between font-mono text-[10px]">
            <span class="text-on-surface-variant">${tls.heartbeatMs ? `${Math.round(tls.heartbeatMs / 1000)}s HB` : '10s HB'}</span>
            <span class="${warm ? 'text-secondary' : 'text-primary'}">${badge}</span>
          </div>
        </div>
      `);
    }
    meshGrid.innerHTML = cards.join('');

    // Subsystems summary
    const track = telemetry.track || {};
    const antiStrip = telemetry.antiStrip || {};
    document.getElementById('sectrackSubsystems').innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
        <div class="font-mono text-[10px] text-primary-container uppercase">AUDIT RING &amp; REST</div>
        <div class="font-mono text-lg font-bold text-on-surface">${esc(track.auditRingCount ?? 0)} Buffered</div>
        <div class="text-xs text-on-surface-variant">In-flight punishments: ${esc(track.inFlightPunishments ?? 0)} • Condemned: ${esc(track.condemnedCount ?? 0)}</div>
      </div>
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
        <div class="font-mono text-[10px] text-secondary uppercase">ANTISTRIP PERSISTENCE</div>
        <div class="font-mono text-lg font-bold text-on-surface">${security.isSecured ? 'ENFORCED' : 'IDLE'}</div>
        <div class="text-xs text-on-surface-variant">Firewall Role: ${esc(antiStrip.firewallRoleId ? 'Linked' : 'None')} • Unbypassable: ${esc(antiStrip.unbypassableRoleId ? 'Linked' : 'None')}</div>
      </div>
      <div class="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
        <div class="font-mono text-[10px] text-primary uppercase">THREAT SIGNATURES</div>
        <div class="font-mono text-lg font-bold text-on-surface">${esc(track.restorationQueueLength ?? 0)} Queued Repairs</div>
        <div class="text-xs text-on-surface-variant">Under attack: ${security.underAttack ? '<span class="text-error font-bold">YES</span>' : '<span class="text-secondary">NO</span>'}</div>
      </div>
    `;

    // Live Stream
    const feed = document.getElementById('liveRecordsFeed');
    const recs = telemetry.liveRecords || [];
    if (recs.length === 0) {
      feed.innerHTML = `<div class="p-3 rounded bg-surface-container text-on-surface-variant">Perimeter quiet — zero hostile mutations recorded recently.</div>`;
    } else {
      feed.innerHTML = recs.map(r => `
        <div class="p-2.5 rounded bg-surface-container border-l-2 border-primary-container space-y-0.5">
          <div class="flex justify-between text-primary font-semibold">
            <span>${esc(r.action || 'EVENT')}</span>
            <span class="text-secondary">${esc(r.latencyMs ? `${r.latencyMs}ms` : '')}</span>
          </div>
          <div class="text-on-surface-variant truncate">${esc(r.executor || '')} -> ${esc(r.target || '')}</div>
        </div>
      `).join('');
    }

    // X-RateLimit Buckets
    const bucketsBox = document.getElementById('rateBucketList');
    const buckets = tls.sampleBuckets || [];
    if (buckets.length === 0) {
      bucketsBox.innerHTML = `<div class="p-3 rounded bg-surface-container text-secondary">Global Rate Lock: DISENGAGED (0 congested buckets)</div>`;
    } else {
      bucketsBox.innerHTML = buckets.map(b => `
        <div class="p-2.5 rounded bg-surface-container flex justify-between items-center">
          <span class="text-on-surface truncate max-w-[180px]">${esc(b.routeKey)}</span>
          <span class="text-primary">Rem: ${esc(b.remaining)} (${esc(Math.ceil((b.resetInMs || 0) / 1000))}s)</span>
        </div>
      `).join('');
    }
  }

  function renderExtraControlsTab(controls, clearance, guild) {
    const am = controls.automod || {};
    const toggleDefs = [
      { key: 'antiLinkEnabled', label: 'Anti-Link / Phishing Guard', desc: 'Blocks unapproved external URLs & cloaked links' },
      { key: 'antiInviteEnabled', label: 'Discord Invite Blocker', desc: 'Blocks external discord.gg vanity and invite links' },
      { key: 'antiSpamEnabled', label: 'Anti-Spam Velocity Limiter', desc: 'Mitigates rapid multi-message flooding' },
      { key: 'antiSpamMentionEnabled', label: 'Mass Mention Guard', desc: 'Stops ghost-pings and mass mention raids' },
      { key: 'wordFilterEnabled', label: 'Blacklisted Words Engine', desc: 'Enforces custom blacklisted substrings below' },
      { key: 'aiToxicityEnabled', label: 'AI Toxicity & Scam Shield', desc: 'Heuristic detection for hostile harassment & scams' }
    ];

    const listEl = document.getElementById('automodTogglesList');
    listEl.innerHTML = toggleDefs.map(d => `
      <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-3">
        <div>
          <div class="font-semibold text-sm text-on-surface">${esc(d.label)}</div>
          <div class="text-xs text-on-surface-variant">${esc(d.desc)}</div>
        </div>
        <label class="tactical-switch">
          <input type="checkbox" class="am-toggle-cb" data-key="${esc(d.key)}" ${am[d.key] ? 'checked' : ''} ${clearance.canManageControls ? '' : 'disabled'} />
          <span class="tactical-slider"></span>
        </label>
      </div>
    `).join('');

    listEl.querySelectorAll('.am-toggle-cb').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          await apiFetch(`/api/guilds/${state.activeGuildId}/automod`, {
            method: 'POST',
            body: JSON.stringify({ toggles: { [cb.dataset.key]: cb.checked } })
          });
          showToast(`${cb.dataset.key} updated.`);
          loadGuildState(true);
        } catch (err) {
          cb.checked = !cb.checked;
          showToast(err.message, 'error');
        }
      });
    });

    // Blacklist Words Chips
    const chipsEl = document.getElementById('blacklistWordsChips');
    const words = am.blacklistWords || [];
    chipsEl.innerHTML = words.length === 0
      ? `<span class="font-mono text-xs text-outline">No blacklisted words configured yet.</span>`
      : words.map(w => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-primary font-mono text-xs">
          <span>${esc(w)}</span>
          ${clearance.canManageControls ? `<button type="button" class="bl-del-btn text-outline hover:text-error" data-word="${esc(w)}">&times;</button>` : ''}
        </span>
      `).join('');

    chipsEl.querySelectorAll('.bl-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/guilds/${state.activeGuildId}/automod`, {
            method: 'POST',
            body: JSON.stringify({ action: 'remove_word', word: btn.dataset.word })
          });
          showToast('Word removed.');
          loadGuildState(true);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    // Honeypot
    const hp = controls.honeypot || {};
    const hpPill = document.getElementById('hpStatusPill');
    hpPill.textContent = hp.armed ? 'ARMED & ACTIVE' : 'STANDBY';
    hpPill.className = hp.armed
      ? 'font-mono text-[10px] px-2 py-0.5 rounded bg-secondary-container/20 text-secondary font-bold'
      : 'font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant';
    document.getElementById('hpPunishmentSelect').value = hp.punishment || 'ban';
    document.getElementById('hpDetailsGrid').innerHTML = `
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="text-outline text-[10px]">CANARY CHANNEL</div>
        <div class="text-primary font-bold truncate mt-0.5">${esc(hp.channelName ? `#${hp.channelName}` : 'Unconfigured')}</div>
      </div>
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="text-outline text-[10px]">DECOY ROLE</div>
        <div class="text-on-surface font-bold truncate mt-0.5">${esc(hp.roleName || 'Unconfigured')}</div>
      </div>
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="text-outline text-[10px]">NEUTRALIZED</div>
        <div class="text-secondary font-bold mt-0.5">${esc(hp.triggersCount || 0)} Raiders</div>
      </div>
    `;
    document.getElementById('hpDeployBtn').disabled = !clearance.canManageControls;
    document.getElementById('hpRemoveBtn').disabled = !(clearance.canManageControls && hp.armed);

    // TagDrag Rules
    const tdList = document.getElementById('tagDragRulesList');
    const rules = controls.tagdrag?.rules || [];
    tdList.innerHTML = rules.length === 0
      ? `<div class="p-3 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono">No !tagdrag voice inference rules configured.</div>`
      : rules.map(r => `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2 font-mono text-xs">
          <div>
            <span class="text-primary font-bold">[${esc(r.tag || r.identityGuildId)}]</span>
            <span class="text-on-surface-variant ml-2">${esc(r.intervalSec || 2)}s rotation</span>
            <span class="ml-2 px-1.5 py-0.5 rounded text-[10px] ${r.enabled ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high text-outline'}">${r.enabled ? 'ACTIVE' : 'PAUSED'}</span>
          </div>
          ${clearance.canManageControls ? `
            <div class="flex gap-1.5">
              <button class="td-toggle-btn px-2 py-1 rounded bg-surface-container-high hover:text-primary" data-q="${esc(r.id)}">${r.enabled ? 'PAUSE' : 'ENABLE'}</button>
              <button class="td-del-btn px-2 py-1 rounded bg-error-container/60 text-error hover:bg-error hover:text-on-error" data-q="${esc(r.id)}">DEL</button>
            </div>
          ` : ''}
        </div>
      `).join('');

    tdList.querySelectorAll('.td-toggle-btn').forEach(b => b.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/guilds/${state.activeGuildId}/tagdrag`, { method: 'POST', body: JSON.stringify({ action: 'toggle', query: b.dataset.q }) });
        showToast('TagDrag rule toggled.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    }));
    tdList.querySelectorAll('.td-del-btn').forEach(b => b.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/guilds/${state.activeGuildId}/tagdrag`, { method: 'POST', body: JSON.stringify({ action: 'remove', query: b.dataset.q }) });
        showToast('TagDrag rule deleted.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    }));

    // Snapshot Vault
    const bk = controls.backups || {};
    document.getElementById('snapshotStatsMosaic').innerHTML = `
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="font-mono text-[10px] text-outline">CHANNELS TRACKED</div>
        <div class="font-mono text-lg font-bold text-primary">${esc(bk.channelsTracked ?? guild.channelCount)}</div>
      </div>
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="font-mono text-[10px] text-outline">ROLES HIERARCHIES</div>
        <div class="font-mono text-lg font-bold text-primary">${esc(bk.rolesTracked ?? guild.roleCount)}</div>
      </div>
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="font-mono text-[10px] text-outline">PERM OVERRIDES</div>
        <div class="font-mono text-lg font-bold text-primary">${esc(bk.overridesTracked ?? 0)}</div>
      </div>
      <div class="p-3 rounded-lg bg-surface-container">
        <div class="font-mono text-[10px] text-outline">AUTO SNAPSHOTS</div>
        <div class="font-mono text-lg font-bold text-secondary">${esc(bk.rollingSnapshotsCount ?? 0)} Stored</div>
      </div>
    `;

    const snaps = bk.snapshots || [];
    const snapsBox = document.getElementById('snapshotsHistoryList');
    snapsBox.innerHTML = snaps.length === 0
      ? `<div class="p-3 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono">No manual Time-Machine snapshots yet.</div>`
      : snaps.map(s => `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2 font-mono text-xs">
          <div class="min-w-0">
            <div class="text-on-surface font-semibold truncate">${esc(s.label)} <span class="text-primary-container">(${esc(s.id)})</span></div>
            <div class="text-[10px] text-outline">${esc(formatRelativeTime(s.timestamp))} • ${esc(s.channelsCount)} ch / ${esc(s.rolesCount)} roles</div>
          </div>
          ${clearance.canRestoreSnapshot ? `
            <button class="snap-restore-btn px-2.5 py-1 rounded bg-surface-container-high hover:bg-primary-container hover:text-on-primary text-primary font-bold shrink-0" data-id="${esc(s.id)}">RESTORE</button>
          ` : ''}
        </div>
      `).join('');

    snapsBox.querySelectorAll('.snap-restore-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.confirm(`Restore missing channels and roles from snapshot ${btn.dataset.id}?`)) return;
        try {
          const r = await apiFetch(`/api/guilds/${state.activeGuildId}/snapshots/restore`, {
            method: 'POST',
            body: JSON.stringify({ snapshotId: btn.dataset.id })
          });
          showToast(r.message || 'Snapshot restored.');
          loadGuildState(true);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }

  function renderIncidentsTab(incidents, quarantined, clearance) {
    const listBox = document.getElementById('incidentsList');
    if (incidents.length === 0) {
      listBox.innerHTML = `<div class="p-4 rounded-lg bg-surface-container text-xs font-mono text-secondary">Zero security incidents recorded. Perimeter has experienced zero hostile incursions.</div>`;
    } else {
      listBox.innerHTML = incidents.map((inc, idx) => `
        <div class="inc-card p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high border-l-2 border-error cursor-pointer transition-colors" data-idx="${idx}">
          <div class="flex items-center justify-between font-mono text-xs">
            <span class="text-primary font-bold">${esc(inc.id)} • ${esc(inc.type)}</span>
            <span class="text-secondary">${esc(inc.latencyMs)}ms</span>
          </div>
          <div class="text-xs text-on-surface-variant mt-1">
            Attacker: <span class="text-on-surface font-semibold">${esc(inc.attackerTag)}</span> (${esc(inc.attackerId)}) • ${esc(formatRelativeTime(inc.timestamp))}
          </div>
        </div>
      `).join('');

      const inspectIdx = (idx) => {
        const inc = incidents[idx];
        if (!inc) return;
        document.getElementById('incidentDeepDiveBox').innerHTML = `
          <div class="space-y-2.5">
            <div class="p-3 rounded-lg bg-surface-container space-y-1">
              <div class="text-primary font-bold">${esc(inc.id)} — ${esc(inc.type)}</div>
              <div class="text-secondary">STATUS: ${esc(inc.status)} (${esc(inc.latencyMs)}ms strike)</div>
            </div>
            <div class="p-3 rounded-lg bg-surface-container space-y-1">
              <div><span class="text-outline">Attacker:</span> ${esc(inc.attackerTag)} (${esc(inc.attackerId)})</div>
              <div><span class="text-outline">Blocked / Attempted:</span> ${esc(inc.actionsBlocked)} / ${esc(inc.actionsAttempted)}</div>
              <div><span class="text-outline">Timestamp:</span> ${esc(new Date(inc.timestamp).toLocaleString())}</div>
            </div>
            ${inc.details ? `<div class="p-3 rounded-lg bg-surface-container-lowest text-on-surface whitespace-pre-wrap">${esc(inc.details)}</div>` : ''}
          </div>
        `;
      };

      listBox.querySelectorAll('.inc-card').forEach(card => {
        card.addEventListener('click', () => inspectIdx(Number(card.dataset.idx)));
      });
      inspectIdx(0);
    }

    const qBox = document.getElementById('quarantinesList');
    if (quarantined.length === 0) {
      qBox.innerHTML = `<div class="p-3 rounded-lg bg-surface-container text-xs font-mono text-on-surface-variant">No members currently held in quarantine.</div>`;
    } else {
      qBox.innerHTML = quarantined.map(q => `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2 font-mono text-xs">
          <div class="min-w-0">
            <div class="text-on-surface font-bold truncate">${esc(q.displayName)}</div>
            <div class="text-[10px] text-error truncate">${esc(q.reason || 'Quarantined')}</div>
          </div>
          ${clearance.canManageWhitelist ? `
            <button class="qr-release-btn px-2.5 py-1 rounded bg-secondary-container text-on-secondary font-bold shrink-0" data-id="${esc(q.userId)}">RELEASE</button>
          ` : ''}
        </div>
      `).join('');
      qBox.querySelectorAll('.qr-release-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/guilds/${state.activeGuildId}/quarantine/release`, {
              method: 'POST',
              body: JSON.stringify({ userId: btn.dataset.id })
            });
            showToast('Member released from quarantine.');
            loadGuildState(true);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    }
  }

  function renderSyncDocsTab(sync) {
    if (!sync) return;
    const rows = [
      ['Welcome Channel', sync.welcome],
      ['Leave Channel', sync.leave],
      ['Server Logs Default', sync.serverLogs],
      ['Delete Logs', sync.deleteLog],
      ['Security Logs', sync.securityLog],
      ['Invite Logs', sync.inviteLog],
      ['Rate Channel', sync.rate],
      ['Quote Channel', sync.quote],
      ['Counting Channel', sync.counting],
      ['Home VC (24/7)', sync.homeVc],
      ['Discord Dashboard', sync.dashboardChannel]
    ];
    document.getElementById('syncChannelsGrid').innerHTML = rows.map(([title, item]) => {
      const ch = item?.channel;
      const active = Boolean(item?.enabled && ch?.exists);
      return `
        <div class="p-3 rounded-lg bg-surface-container flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-on-surface font-semibold">${esc(title)}</div>
            <div class="text-[11px] text-outline truncate">${ch?.name ? `#${esc(ch.name)} (${esc(ch.id)})` : (ch?.id ? `ID ${esc(ch.id)} (Missing)` : 'Not Configured')}</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${active ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high text-outline'}">${active ? 'SYNCED' : 'UNSET'}</span>
        </div>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // EVENT WIRING
  // ---------------------------------------------------------------------------
  function bindEvents() {
    document.querySelectorAll('.nav-link, .mob-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => setView(btn.dataset.nav));
    });

    // Showcase Timeline
    document.querySelectorAll('.timeline-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = TIMELINE_STAGES[btn.dataset.step];
        if (!step) return;
        document.querySelectorAll('.timeline-step-btn').forEach(b => {
          const active = b === btn;
          b.className = active
            ? 'timeline-step-btn flex-1 min-w-[90px] py-2 px-3 rounded-lg font-mono text-xs font-bold bg-primary-container text-on-primary transition-all'
            : 'timeline-step-btn flex-1 min-w-[90px] py-2 px-3 rounded-lg font-mono text-xs text-on-surface-variant hover:text-on-surface transition-all';
        });
        document.getElementById('stepBadge').textContent = step.badge;
        document.getElementById('stepLatency').textContent = step.latency;
        document.getElementById('stepTitle').textContent = step.title;
        document.getElementById('stepDescription').textContent = step.description;
        document.getElementById('stepVector').textContent = step.vector;
      });
    });

    // Showcase Feature Matrix Tabs
    document.querySelectorAll('.matrix-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.matrix-tab-btn').forEach(b => {
          const active = b === btn;
          b.className = active
            ? 'matrix-tab-btn px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-mono text-xs font-bold uppercase'
            : 'matrix-tab-btn px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface font-mono text-xs uppercase';
        });
        renderFeatureMatrix(btn.dataset.tab);
      });
    });

    // Auth Modal & Exchange
    ['hdrLoginBtn', 'heroOpenAuthBtn', 'sidebarOpenLoginBtn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        if (state.me) setView('overview');
        else openAuthModal(false);
      });
    });
    document.getElementById('closeAuthModalBtn')?.addEventListener('click', closeAuthModal);

    document.getElementById('manualTokenForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('manualTokenInput').value;
      try {
        await apiFetch('/api/auth/exchange', { method: 'POST', body: JSON.stringify({ token: input }) });
        closeAuthModal();
        showToast('Authenticated via Athena Magic Link!');
        await initSession();
        setView('overview');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const handleLogout = async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
      window.location.hash = '';
      window.location.reload();
    };
    document.getElementById('logoutBtnDesktop')?.addEventListener('click', handleLogout);

    // Guild Switchers
    const onGuildChange = async (gid) => {
      state.activeGuildId = gid;
      _guildChannels = []; // clear channel cache on guild switch
      document.getElementById('guildSwitcherSelect').value = gid;
      document.getElementById('mobileGuildSelect').value = gid;
      await loadGuildState();
    };
    document.getElementById('guildSwitcherSelect')?.addEventListener('change', (e) => onGuildChange(e.target.value));
    document.getElementById('mobileGuildSelect')?.addEventListener('change', (e) => onGuildChange(e.target.value));
    document.getElementById('hdrRefreshBtn')?.addEventListener('click', () => loadGuildState());

    // Shield Filter Tabs
    document.querySelectorAll('.shield-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.shieldCat = btn.dataset.cat;
        document.querySelectorAll('.shield-filter-btn').forEach(b => {
          b.className = b === btn
            ? 'shield-filter-btn px-3 py-1 rounded bg-surface-container-high text-primary font-mono text-xs font-bold'
            : 'shield-filter-btn px-3 py-1 rounded text-outline hover:text-on-surface font-mono text-xs';
        });
        if (state.guildData) {
          renderShieldsGrid(state.guildData.security.shields, state.guildData.security.isSecured, state.guildData.clearance.canToggleModules, state.guildData.clearance.canDisarm);
        }
      });
    });

    // Arm All 32 Shields
    document.getElementById('ovArmBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('ovArmBtn');
      btn.disabled = true;
      showToast('Arming all 32 Anti-Nuke shields...');
      try {
        const res = await apiFetch(`/api/guilds/${state.activeGuildId}/security/arm`, { method: 'POST' });
        showToast(res.message || 'Armed!');
        await loadGuildState();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // Disarm Flow + 2FA Modal
    const openDisarm = async () => {
      document.getElementById('disarmModal')?.classList.remove('hidden');
      document.getElementById('disarmStatusMsg').textContent = 'Requesting 2FA Disarm Challenge from Athena...';
      document.getElementById('disarmOtpGroup').classList.add('hidden');
      document.getElementById('disarmPhraseGroup').classList.add('hidden');
      try {
        const ch = await apiFetch(`/api/guilds/${state.activeGuildId}/security/disarm/challenge`, { method: 'POST' });
        document.getElementById('disarmStatusMsg').textContent = ch.message || 'Verify challenge below.';
        if (ch.requiresOtp) {
          document.getElementById('disarmOtpGroup').classList.remove('hidden');
        } else {
          document.getElementById('disarmPhraseGroup').classList.remove('hidden');
        }
      } catch (err) {
        document.getElementById('disarmStatusMsg').textContent = err.message;
        showToast(err.message, 'error');
      }
    };
    document.getElementById('ovDisarmBtn')?.addEventListener('click', openDisarm);
    document.getElementById('hdrDisarmBtn')?.addEventListener('click', openDisarm);
    document.getElementById('closeDisarmModalBtn')?.addEventListener('click', () => document.getElementById('disarmModal')?.classList.add('hidden'));

    document.getElementById('disarmConfirmForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const code = document.getElementById('disarmOtpInput').value;
        const confirmPhrase = document.getElementById('disarmPhraseInput').value;
        const res = await apiFetch(`/api/guilds/${state.activeGuildId}/security/disarm/confirm`, {
          method: 'POST',
          body: JSON.stringify({ code, confirmPhrase })
        });
        document.getElementById('disarmModal').classList.add('hidden');
        document.getElementById('disarmOtpInput').value = '';
        document.getElementById('disarmPhraseInput').value = '';
        showToast(res.message || 'Security disarmed.');
        await loadGuildState();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Access Tabs & Modals
    document.querySelectorAll('.wl-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.wlFilter = btn.dataset.wl;
        document.querySelectorAll('.wl-tab-btn').forEach(b => {
          b.className = b === btn
            ? 'wl-tab-btn flex-1 py-1.5 rounded-lg font-mono text-xs font-bold bg-surface-container text-primary-container'
            : 'wl-tab-btn flex-1 py-1.5 rounded-lg font-mono text-xs text-on-surface-variant hover:text-on-surface';
        });
        if (state.guildData) renderAccessControl(state.guildData.access, state.guildData.clearance);
      });
    });

    document.getElementById('openAddWhitelistBtn')?.addEventListener('click', () => {
      if (!state.guildData?.clearance?.canManageWhitelist) return showToast('Requires Extra Owner or higher.', 'error');
      document.getElementById('whitelistModal').classList.remove('hidden');
    });
    document.getElementById('closeWhitelistModalBtn')?.addEventListener('click', () => document.getElementById('whitelistModal').classList.add('hidden'));
    document.getElementById('wlTypeSelect')?.addEventListener('change', () => {
      if (state.guildData) renderAccessControl(state.guildData.access, state.guildData.clearance);
    });
    document.getElementById('wlQuickPick')?.addEventListener('change', (e) => {
      if (e.target.value) document.getElementById('wlTargetIdInput').value = e.target.value;
    });

    document.getElementById('whitelistModalForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const type = document.getElementById('wlTypeSelect').value;
        const targetId = document.getElementById('wlTargetIdInput').value;
        const modules = document.getElementById('wlScopeSelect').value.split(',');
        const triggerLimit = Number(document.getElementById('wlLimitInput').value || 0);
        await apiFetch(`/api/guilds/${state.activeGuildId}/whitelist/save`, {
          method: 'POST',
          body: JSON.stringify({ type, targetId, modules, triggerLimit })
        });
        document.getElementById('whitelistModal').classList.add('hidden');
        document.getElementById('wlTargetIdInput').value = '';
        showToast('Whitelist updated.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('addExtraOwnerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const userId = document.getElementById('extraOwnerIdInput').value;
        await apiFetch(`/api/guilds/${state.activeGuildId}/extra-owners/add`, { method: 'POST', body: JSON.stringify({ userId }) });
        document.getElementById('extraOwnerIdInput').value = '';
        showToast('Extra Owner authorized.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('addBotWlForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const botId = document.getElementById('botWlIdInput').value;
        await apiFetch(`/api/guilds/${state.activeGuildId}/bot-whitelist/add`, { method: 'POST', body: JSON.stringify({ botId }) });
        document.getElementById('botWlIdInput').value = '';
        showToast('Bot whitelisted.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Extra Controls: Blacklist Words & Heuristic Tester
    document.getElementById('addBlacklistWordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = document.getElementById('blacklistWordInput');
      try {
        await apiFetch(`/api/guilds/${state.activeGuildId}/automod`, {
          method: 'POST',
          body: JSON.stringify({ action: 'add_word', word: inp.value })
        });
        inp.value = '';
        showToast('Blacklisted word added.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('heuristicTesterInput')?.addEventListener('input', (e) => {
      const val = String(e.target.value || '').toLowerCase();
      const badge = document.getElementById('heuristicTesterBadge');
      const words = state.guildData?.controls?.automod?.blacklistWords || [];
      const matched = val && words.some(w => val.includes(w.toLowerCase()));
      if (!val) {
        badge.textContent = 'CLEAN';
        badge.className = 'absolute right-2.5 top-3 px-2 py-0.5 rounded bg-secondary/15 text-secondary font-mono text-[10px]';
      } else if (matched || val.includes('discord.gg/')) {
        badge.textContent = 'INTERCEPT [MATCH]';
        badge.className = 'absolute right-2.5 top-3 px-2 py-0.5 rounded bg-error/20 text-error font-mono text-[10px]';
      } else {
        badge.textContent = 'MONITORING';
        badge.className = 'absolute right-2.5 top-3 px-2 py-0.5 rounded bg-primary-container/20 text-primary-container font-mono text-[10px]';
      }
    });

    // Honeypot
    document.getElementById('hpDeployBtn')?.addEventListener('click', async () => {
      const punishment = document.getElementById('hpPunishmentSelect').value;
      try {
        const res = await apiFetch(`/api/guilds/${state.activeGuildId}/honeypot`, {
          method: 'POST',
          body: JSON.stringify({ action: 'deploy', punishment })
        });
        showToast(res.message);
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });
    document.getElementById('hpRemoveBtn')?.addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/guilds/${state.activeGuildId}/honeypot`, {
          method: 'POST',
          body: JSON.stringify({ action: 'remove' })
        });
        showToast(res.message);
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });
    document.getElementById('hpPunishmentSelect')?.addEventListener('change', async (e) => {
      try {
        await apiFetch(`/api/guilds/${state.activeGuildId}/honeypot`, {
          method: 'POST',
          body: JSON.stringify({ action: 'punishment', punishment: e.target.value })
        });
        showToast(`Honeypot punishment -> ${e.target.value.toUpperCase()}`);
      } catch (err) { showToast(err.message, 'error'); }
    });

    // TagDrag
    document.getElementById('addTagDragForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const tag = document.getElementById('tdTagInput').value;
        const intervalSec = Number(document.getElementById('tdIntervalInput').value || 2);
        await apiFetch(`/api/guilds/${state.activeGuildId}/tagdrag`, {
          method: 'POST',
          body: JSON.stringify({ action: 'add', tag, intervalSec })
        });
        document.getElementById('tdTagInput').value = '';
        showToast('TagDrag rule saved.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Snapshots & Export
    document.getElementById('btnManualSnapshot')?.addEventListener('click', async () => {
      try {
        const res = await apiFetch(`/api/guilds/${state.activeGuildId}/snapshots/create`, { method: 'POST', body: '{}' });
        showToast(res.message);
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });
    document.getElementById('btnExportJson')?.addEventListener('click', () => {
      if (state.activeGuildId) {
        window.location.href = `/api/guilds/${encodeURIComponent(state.activeGuildId)}/snapshots/export`;
      }
    });

    // Clear incidents
    document.getElementById('clearIncidentsBtn')?.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/guilds/${state.activeGuildId}/incidents/clear`, { method: 'POST' });
        showToast('Incident history purged.');
        loadGuildState(true);
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // SETTINGS PANELS — lazy load dispatcher
  // ---------------------------------------------------------------------------
  const _settingsCache = {};
  let _guildChannels = []; // cached from /api/guilds/:id/channels

  // Load all guild channels from API and cache them
  async function loadGuildChannels(gid) {
    try {
      const data = await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/channels`);
      _guildChannels = data.channels || [];
    } catch (_) { _guildChannels = []; }
  }

  async function loadSettingsPanel(view) {
    if (!state.activeGuildId) return;
    const gid = state.activeGuildId;
    // Ensure channels are loaded
    if (!_guildChannels.length) await loadGuildChannels(gid);
    try {
      const map = {
        tickets: renderTickets, welcome: renderWelcome, serverlogs: renderServerlogs,
        msgdeletelog: renderMsgDeleteLog, autorole: renderAutorole, verify: renderVerify,
        counting: renderCounting, leveling: renderLeveling,
        reactionroles: renderReactionRoles, ccmds: renderCcmds,
        youtube: renderYoutube, serverstats: renderServerStats,
        autoreact: renderAutoreact, media: renderMedia,
        quarantine: renderQuarantine, persona: renderPersona, morning: renderMorning
      };
      const data = await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/${view}`);
      _settingsCache[view] = data;
      if (map[view]) map[view](data, gid);
    } catch (err) { showToast(err.message, 'error'); }
  }

  // Helper: build <option> list from availableRoles (from guild state)
  function roleOptions(currentId = '') {
    const roles = state.guildData?.access?.availableRoles || [];
    return `<option value="">— Select role —</option>` + roles.map(r =>
      `<option value="${esc(r.id)}" ${r.id === currentId ? 'selected' : ''}>${esc(r.name)}</option>`
    ).join('');
  }

  // Helper: build <option> list from cached guild channels
  function channelOptions(currentId = '', types = null) {
    let channels = _guildChannels;
    if (types) channels = channels.filter(c => types.includes(c.type));
    return `<option value="">— Select channel —</option>` + channels.map(c =>
      `<option value="${esc(c.id)}" ${c.id === currentId ? 'selected' : ''}>${c.type === 2 ? '🔊' : c.type === 4 ? '📁' : '#'} ${esc(c.name)}</option>`
    ).join('');
  }

  // Helper: get effective value from a hybrid selector (dropdown takes priority, then text input)
  function hybridVal(selectId, inputId) {
    const inp = document.getElementById(inputId)?.value?.trim();
    const sel = document.getElementById(selectId)?.value?.trim();
    return inp || sel || '';
  }

  // Helper: populate a select and also pre-fill text input from known value
  function populateSelect(selectId, optHtml, currentId) {
    const el = document.getElementById(selectId);
    if (el) el.innerHTML = optHtml;
    if (currentId) {
      const inp = document.getElementById(selectId.replace(/([A-Z])/g, m => m) + 'Id') || null;
      if (inp && !inp.value) inp.placeholder = `Current ID: ${currentId}`;
    }
  }

  // ── TICKETS ──────────────────────────────────────────────────────────────
  function renderTickets(d) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    set('tkCategoryId', d.categoryId);
    const pch = document.getElementById('tkPanelChannel');
    if (pch) { pch.innerHTML = channelOptions(d.panelChannelId, [0,5]); }
    const sr = document.getElementById('tkStaffRole');
    if (sr) sr.innerHTML = roleOptions((d.staffRoleIds || [])[0] || '');
    setChk('tkAiTriage', d.aiTriage);
    const cnt = document.getElementById('tkActiveCount');
    if (cnt) cnt.textContent = d.activeCount || 0;
  }
  document.getElementById('tkSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      const r1 = hybridVal('tkStaffRole', 'tkStaffRoleId');
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/tickets`, {
        method: 'POST', body: JSON.stringify({
          categoryId: document.getElementById('tkCategoryId')?.value?.trim(),
          staffRoleIds: r1 ? [r1] : [],
          panelChannelId: hybridVal('tkPanelChannel', 'tkPanelChannelId'),
          aiTriage: document.getElementById('tkAiTriage')?.checked
        })
      });
      showToast('Ticket config saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── WELCOME / LEAVE ───────────────────────────────────────────────────────
  function renderWelcome(d) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v ?? ''; };
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    const w = d.welcome || {}; const l = d.leave || {};
    setChk('wlWelcomeEnabled', w.enabled);
    const wch = document.getElementById('wlWelcomeChannel');
    if (wch) wch.innerHTML = channelOptions(w.channelId, [0,5]);
    set('wlWelcomeMsg', w.message);
    set('wlWelcomeTitle', w.embedTitle);
    set('wlWelcomeColor', w.embedColor || '#00f0ff');
    setChk('wlLeaveEnabled', l.enabled);
    const lch = document.getElementById('wlLeaveChannel');
    if (lch) lch.innerHTML = channelOptions(l.channelId, [0,5]);
    set('wlLeaveMsg', l.message);
  }
  document.getElementById('wlWelcomeSave')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/welcome`, {
        method: 'POST', body: JSON.stringify({
          type: 'welcome',
          enabled: document.getElementById('wlWelcomeEnabled')?.checked,
          channelId: hybridVal('wlWelcomeChannel', 'wlWelcomeChannelId'),
          message: document.getElementById('wlWelcomeMsg')?.value,
          embedTitle: document.getElementById('wlWelcomeTitle')?.value,
          embedColor: document.getElementById('wlWelcomeColor')?.value
        })
      });
      showToast('Welcome config saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('wlLeaveSave')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/welcome`, {
        method: 'POST', body: JSON.stringify({
          type: 'leave',
          enabled: document.getElementById('wlLeaveEnabled')?.checked,
          channelId: hybridVal('wlLeaveChannel', 'wlLeaveChannelId'),
          message: document.getElementById('wlLeaveMsg')?.value
        })
      });
      showToast('Leave config saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── SERVER LOGS ───────────────────────────────────────────────────────────
  const LOG_MODULES = [
    { key: 'bans',       label: 'Member Bans' },
    { key: 'kicks',      label: 'Member Kicks' },
    { key: 'leaves',     label: 'Member Leaves' },
    { key: 'joins',      label: 'Member Joins' },
    { key: 'msgDeletes', label: 'Deleted Messages' },
    { key: 'msgEdits',   label: 'Edited Messages' },
    { key: 'channels',   label: 'Channel Changes' },
    { key: 'roles',      label: 'Role Changes' }
  ];
  function renderServerlogs(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    setChk('slEnabled', d.enabled);
    const dch = document.getElementById('slDefaultChannel');
    if (dch) dch.innerHTML = channelOptions(d.defaultChannelId, [0,5]);
    const inp = document.getElementById('slDefaultChannelId');
    if (inp && d.defaultChannelId) inp.placeholder = `Current: ${d.defaultChannelId}`;
    const grid = document.getElementById('slModuleGrid');
    if (!grid) return;
    const mods = d.modules || {};
    grid.innerHTML = LOG_MODULES.map(m => {
      const mod = mods[m.key] || {};
      const chOpts = channelOptions(mod.channelId || '', [0,5]);
      return `<div class="bg-surface-container-lowest rounded-lg p-3 border border-outline-variant/20 space-y-2">
        <div class="flex items-center gap-2">
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" class="sr-only peer sl-mod-chk" data-key="${m.key}" ${mod.enabled ? 'checked' : ''} />
            <div class="w-8 h-4 bg-outline rounded-full peer peer-checked:bg-primary transition-colors"></div>
            <div class="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
          </label>
          <span class="font-mono text-xs text-on-surface">${m.label}</span>
        </div>
        <select class="sl-mod-ch w-full bg-surface-container border border-outline-variant/20 rounded px-2 py-1 font-mono text-[11px] text-on-surface-variant outline-none" data-key="${m.key}">${chOpts}</select>
        <input type="text" class="sl-mod-chid w-full bg-surface-container border border-outline-variant/20 rounded px-2 py-1 font-mono text-[11px] text-on-surface-variant outline-none" data-key="${m.key}" placeholder="Or paste channel ID" value="${mod.channelId || ''}" />
      </div>`;
    }).join('');
  }
  document.getElementById('slSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      const modules = {};
      LOG_MODULES.forEach(m => {
        const chk = document.querySelector(`.sl-mod-chk[data-key="${m.key}"]`);
        const sel = document.querySelector(`.sl-mod-ch[data-key="${m.key}"]`);
        const inp = document.querySelector(`.sl-mod-chid[data-key="${m.key}"]`);
        modules[m.key] = {
          enabled: Boolean(chk?.checked),
          channelId: (inp?.value?.trim() || sel?.value?.trim()) || null
        };
      });
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/serverlogs`, {
        method: 'POST', body: JSON.stringify({
          enabled: document.getElementById('slEnabled')?.checked,
          defaultChannelId: hybridVal('slDefaultChannel', 'slDefaultChannelId'),
          modules
        })
      });
      showToast('Server log config saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── MESSAGE DELETE LOG ────────────────────────────────────────────────────
  function renderMsgDeleteLog(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    setChk('mdlEnabled', d.enabled);
    const ch = document.getElementById('mdlChannel');
    if (ch) ch.innerHTML = channelOptions(d.channelId, [0,5]);
    const inp = document.getElementById('mdlChannelId');
    if (inp && d.channelId) inp.placeholder = `Current: ${d.channelId}`;
  }
  document.getElementById('mdlSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/msgdeletelog`, {
        method: 'POST', body: JSON.stringify({
          enabled: document.getElementById('mdlEnabled')?.checked,
          channelId: hybridVal('mdlChannel', 'mdlChannelId')
        })
      });
      showToast('Delete log saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── AUTOROLE ──────────────────────────────────────────────────────────────
  function renderAutorole(d) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
    const hr = document.getElementById('arHumanRole');
    const br = document.getElementById('arBotRole');
    const vr = document.getElementById('arVanityRole');
    if (hr) hr.innerHTML = roleOptions((d.autoroleHuman||[])[0]);
    if (br) br.innerHTML = roleOptions((d.autoroleBot||[])[0]);
    if (vr) vr.innerHTML = roleOptions((d.vanityRole||[])[0]);
    set('arVanityString', d.vanityString);
    // Show existing multi-role lists
    const renderList = (listId, arr) => {
      const el = document.getElementById(listId);
      if (!el) return;
      el.innerHTML = (arr||[]).map(id => {
        const role = (state.guildData?.access?.availableRoles||[]).find(r=>r.id===id);
        return `<div class="flex items-center justify-between bg-surface-container px-2 py-1 rounded text-xs font-mono">
          <span class="text-on-surface">${role ? esc(role.name) : id}</span>
          <button onclick="window._arRemoveRole('${listId}','${id}')" class="text-error hover:text-on-error ml-2">✕</button>
        </div>`;
      }).join('');
    };
    renderList('arHumanList', d.autoroleHuman);
    renderList('arBotList', d.autoroleBot);
    renderList('arVanityList', d.vanityRole);
  }
  document.getElementById('arSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      const cached = _settingsCache['autorole'] || {};
      const addToList = (existingArr, selectId, inputId) => {
        const v = hybridVal(selectId, inputId);
        return v ? [...new Set([...(existingArr||[]), v])] : (existingArr||[]);
      };
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/autorole`, {
        method: 'POST', body: JSON.stringify({
          autoroleHuman: addToList(cached.autoroleHuman, 'arHumanRole', 'arHumanRoleId'),
          autoroleBot:   addToList(cached.autoroleBot,   'arBotRole',   'arBotRoleId'),
          vanityRole:    addToList(cached.vanityRole,    'arVanityRole','arVanityRoleId'),
          vanityString:  document.getElementById('arVanityString')?.value?.trim()
        })
      });
      showToast('AutoRole saved.');
      loadSettingsPanel('autorole');
    } catch (e) { showToast(e.message, 'error'); }
  });
  window._arRemoveRole = async (listId, roleId) => {
    const gid = state.activeGuildId; if (!gid) return;
    const cached = _settingsCache['autorole'] || {};
    const mapKey = listId === 'arHumanList' ? 'autoroleHuman' : listId === 'arBotList' ? 'autoroleBot' : 'vanityRole';
    cached[mapKey] = (cached[mapKey]||[]).filter(id => id !== roleId);
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/autorole`, { method: 'POST', body: JSON.stringify(cached) });
      showToast('Role removed.'); loadSettingsPanel('autorole');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ── VERIFY ────────────────────────────────────────────────────────────────
  function renderVerify(d) {
    const vr = document.getElementById('vrRole');
    if (vr) vr.innerHTML = roleOptions(d.roleId);
    const vm = document.getElementById('vrMode');
    if (vm) vm.value = d.mode || 'button';
    const info = document.getElementById('vrChannelInfo');
    if (info) {
      if (d.channelId) {
        const ch = _guildChannels.find(c=>c.id===d.channelId);
        info.textContent = `Verification panel posted in: ${ch ? '#'+ch.name : d.channelId} (message ID: ${d.messageId || 'unknown'})`;
      } else {
        info.textContent = 'No verification panel set up yet. Use !verify setup in a channel to post the panel.';
      }
    }
    const inp = document.getElementById('vrRoleId');
    if (inp && d.roleId) inp.placeholder = `Current role ID: ${d.roleId}`;
  }
  document.getElementById('vrSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/verify`, {
        method: 'POST', body: JSON.stringify({
          roleId: hybridVal('vrRole', 'vrRoleId'),
          mode: document.getElementById('vrMode')?.value
        })
      });
      showToast('Verification saved.'); loadSettingsPanel('verify');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('vrDeleteBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/verify`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) });
      showToast('Verification setup removed.'); loadSettingsPanel('verify');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── COUNTING ──────────────────────────────────────────────────────────────
  function renderCounting(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    const ch = document.getElementById('ctChannel');
    if (ch) ch.innerHTML = channelOptions(d.channelId, [0]);
    const inp = document.getElementById('ctChannelId');
    if (inp && d.channelId) inp.placeholder = `Current: ${d.channelId}`;
    const cc = document.getElementById('ctCurrentCount'); if (cc) cc.textContent = d.currentCount ?? 0;
    const cs = document.getElementById('ctSaves'); if (cs) cs.textContent = d.saves ?? 0;
    setChk('ctAllowMath', d.allowMath);
    setChk('ctAutoTopic', d.autoTopic);
  }
  document.getElementById('ctSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/counting`, {
        method: 'POST', body: JSON.stringify({
          channelId: hybridVal('ctChannel', 'ctChannelId'),
          allowMath: document.getElementById('ctAllowMath')?.checked,
          autoTopic: document.getElementById('ctAutoTopic')?.checked
        })
      });
      showToast('Counting config saved.'); loadSettingsPanel('counting');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('ctResetBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    if (!confirm('Reset the count to 0?')) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/counting`, { method: 'POST', body: JSON.stringify({ action: 'reset' }) });
      showToast('Count reset to 0.'); loadSettingsPanel('counting');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── LEVELING ──────────────────────────────────────────────────────────────
  function renderLeveling(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    setChk('lvEnabled', d.enabled);
    const am = document.getElementById('lvAnnounceMode'); if (am) am.value = d.announceMode || 'same';
    const ach = document.getElementById('lvAnnounceChannel'); if (ach) ach.innerHTML = channelOptions(d.announceChannelId, [0,5]);
    const inp1 = document.getElementById('lvAnnounceChannelId'); if (inp1 && d.announceChannelId) inp1.placeholder = `Current: ${d.announceChannelId}`;
    const cch = document.getElementById('lvCmdChannel'); if (cch) cch.innerHTML = channelOptions(d.cmdChannelId, [0,5]);
    const inp2 = document.getElementById('lvCmdChannelId'); if (inp2 && d.cmdChannelId) inp2.placeholder = `Current: ${d.cmdChannelId}`;
    const lb = document.getElementById('lvLeaderboard');
    if (lb) {
      const top = d.leaderboard || [];
      lb.innerHTML = top.length ? top.map((u, i) =>
        `<div class="flex items-center gap-3 text-xs font-mono py-1 border-b border-outline-variant/10">
          <span class="text-primary w-5">#${i+1}</span>
          <span class="text-on-surface flex-1">${esc(u.username || u.userId)}</span>
          <span class="text-on-surface-variant">Lv ${u.level} · ${u.xp} XP</span>
        </div>`).join('') : '<p class="text-xs text-on-surface-variant">No XP data yet.</p>';
    }
  }
  document.getElementById('lvSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/leveling`, {
        method: 'POST', body: JSON.stringify({
          enabled: document.getElementById('lvEnabled')?.checked,
          announceMode: document.getElementById('lvAnnounceMode')?.value,
          announceChannelId: hybridVal('lvAnnounceChannel', 'lvAnnounceChannelId'),
          cmdChannelId: hybridVal('lvCmdChannel', 'lvCmdChannelId')
        })
      });
      showToast('Leveling config saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── REACTION ROLES ────────────────────────────────────────────────────────
  function renderReactionRoles(d) {
    const list = document.getElementById('rrList');
    if (!list) return;
    const rrs = d.panels || [];
    list.innerHTML = rrs.length ? rrs.map(p => `
      <div class="bg-surface-container-lowest rounded-lg p-3 border border-outline-variant/20 space-y-1">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-mono text-xs text-primary">${esc(p.title || 'Reaction Role Panel')}</div>
            <div class="text-[10px] text-on-surface-variant">Message ID: ${p.messageId} · ${(p.entries||[]).length} entries</div>
          </div>
          <button onclick="window._rrDelete('${esc(p.messageId)}')" class="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] hover:bg-error hover:text-on-error shrink-0">Delete</button>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">${(p.entries||[]).map(e=>`<span class="bg-surface-container px-1.5 py-0.5 rounded text-[10px] font-mono">${esc(e.emoji)} → ${e.roleId}</span>`).join('')}</div>
      </div>`).join('') : '<p class="text-xs text-on-surface-variant py-2">No reaction role panels set up. Use !rr create in Discord.</p>';
    window._rrDelete = async (msgId) => {
      const gid = state.activeGuildId; if (!gid) return;
      try {
        await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/reactionroles`, { method: 'POST', body: JSON.stringify({ action: 'delete', messageId: msgId }) });
        showToast('Panel deleted.'); loadSettingsPanel('reactionroles');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }

  // ── CUSTOM COMMANDS ───────────────────────────────────────────────────────
  function renderCcmds(d) {
    const list = document.getElementById('ccList');
    if (!list) return;
    const cmds = d.customCommands || {};
    const keys = Object.keys(cmds);
    list.innerHTML = keys.length ? keys.map(alias => `
      <div class="flex items-center justify-between bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/20 gap-2">
        <div class="flex-1 min-w-0">
          <span class="font-mono text-xs text-primary">!${esc(alias)}</span>
          <span class="text-xs text-on-surface-variant ml-2 truncate">${esc(String(cmds[alias]).slice(0,60))}</span>
        </div>
        <button onclick="window._ccDelete('${esc(alias)}')" class="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] hover:bg-error hover:text-on-error shrink-0">Delete</button>
      </div>`).join('') : '<p class="text-xs text-on-surface-variant py-2">No custom commands yet.</p>';
    window._ccDelete = async (alias) => {
      const gid = state.activeGuildId; if (!gid) return;
      try {
        await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/ccmds`, { method: 'POST', body: JSON.stringify({ action: 'delete', alias }) });
        showToast('Command deleted.'); loadSettingsPanel('ccmds');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }
  document.getElementById('ccAddBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    const alias = document.getElementById('ccAlias')?.value?.trim();
    const command = document.getElementById('ccCommand')?.value?.trim();
    if (!alias || !command) return showToast('Alias and response are required.', 'error');
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/ccmds`, { method: 'POST', body: JSON.stringify({ action: 'add', alias, command }) });
      document.getElementById('ccAlias').value = '';
      document.getElementById('ccCommand').value = '';
      showToast('Command added.'); loadSettingsPanel('ccmds');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── YOUTUBE NOTIFIER ──────────────────────────────────────────────────────
  function renderYoutube(d) {
    const list = document.getElementById('ytList');
    if (!list) return;
    const notifiers = d.notifiers || [];
    list.innerHTML = notifiers.length ? notifiers.map(n => `
      <div class="flex items-center justify-between bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/20 gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-mono text-xs text-primary">${esc(n.channelName || n.youtubeId)}</div>
          <div class="text-[10px] text-on-surface-variant truncate">${esc(n.youtubeUrl || '')} → ${n.discordChannelId}</div>
        </div>
        <button onclick="window._ytRemove('${esc(n.youtubeId)}')" class="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] hover:bg-error hover:text-on-error shrink-0">Remove</button>
      </div>`).join('') : '<p class="text-xs text-on-surface-variant py-2">No YouTube notifiers configured yet.</p>';
    // Populate channel dropdown
    const ch = document.getElementById('ytChannel'); if (ch) ch.innerHTML = channelOptions('', [0,5]);
    window._ytRemove = async (ytId) => {
      const gid = state.activeGuildId; if (!gid) return;
      try {
        await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/youtube`, { method: 'POST', body: JSON.stringify({ action: 'remove', youtubeId: ytId }) });
        showToast('Notifier removed.'); loadSettingsPanel('youtube');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }
  document.getElementById('ytAddBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    const url = document.getElementById('ytUrl')?.value?.trim();
    const discordChannelId = hybridVal('ytChannel', 'ytChannelId');
    const customMessage = document.getElementById('ytMsg')?.value?.trim();
    if (!url || !discordChannelId) return showToast('YouTube URL and Discord channel are required.', 'error');
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/youtube`, { method: 'POST', body: JSON.stringify({ action: 'add', youtubeUrl: url, discordChannelId, customMessage }) });
      document.getElementById('ytUrl').value = '';
      showToast('Notifier added.'); loadSettingsPanel('youtube');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── SERVER STATS ──────────────────────────────────────────────────────────
  function renderServerStats(d) {
    const status = document.getElementById('ssStatus');
    if (status) {
      if (d.configured && d.stats) {
        const s = d.stats;
        status.innerHTML = `<span class="text-primary font-mono">DEPLOYED</span> — Category: ${s.categoryId || '—'} · Mode: ${s.mode || 'status'} · Font: ${s.font || 'standard'}<br>Channels: Total=${s.totalId||'—'} Humans=${s.humansId||'—'} Bots=${s.botsId||'—'}`;
        const modeEl = document.getElementById('ssMode'); if (modeEl) modeEl.value = s.mode || 'status';
        const fontEl = document.getElementById('ssFont'); if (fontEl) fontEl.value = s.font || 'standard';
      } else {
        status.textContent = 'Not configured. Click "Setup / Re-deploy" to create the stats channels.';
      }
    }
  }
  document.getElementById('ssSetupBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      showToast('Setting up server stats channels…');
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/serverstats`, {
        method: 'POST', body: JSON.stringify({ action: 'setup', mode: document.getElementById('ssMode')?.value || 'status', font: document.getElementById('ssFont')?.value || 'standard' })
      });
      showToast('Server stats deployed.'); loadSettingsPanel('serverstats');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('ssRefreshBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/serverstats`, { method: 'POST', body: JSON.stringify({ action: 'refresh' }) });
      showToast('Stats refreshed.'); loadSettingsPanel('serverstats');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('ssDisableBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    if (!confirm('Delete the stats category and channels?')) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/serverstats`, { method: 'POST', body: JSON.stringify({ action: 'disable' }) });
      showToast('Server stats removed.'); loadSettingsPanel('serverstats');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── AUTO REACT ────────────────────────────────────────────────────────────
  function renderAutoreact(d) {
    const list = document.getElementById('arctRulesList');
    if (!list) return;
    const reacts = d.reacts || {};
    const keys = Object.keys(reacts);
    list.innerHTML = keys.length ? keys.map(cid => {
      const ch = _guildChannels.find(c=>c.id===cid);
      return `<div class="flex items-center justify-between bg-surface-container-lowest rounded-lg px-3 py-2 border border-outline-variant/20">
        <div class="font-mono text-xs"><span class="text-on-surface-variant">#${ch?esc(ch.name):cid}</span> → <span class="text-on-surface">${esc((reacts[cid]||[]).join(' '))}</span></div>
        <button onclick="window._arRemove('${esc(cid)}')" class="px-2 py-0.5 rounded bg-error-container text-on-error-container font-mono text-[10px] hover:bg-error hover:text-on-error">Remove</button>
      </div>`;
    }).join('') : '<p class="text-xs text-on-surface-variant py-2">No auto-react rules yet.</p>';
    // populate dropdown
    const sel = document.getElementById('arctChannel'); if (sel) sel.innerHTML = channelOptions('', [0,5]);
    window._arRemove = async (cid) => {
      const gid = state.activeGuildId; if (!gid) return;
      try { await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/autoreact`, { method: 'POST', body: JSON.stringify({ action: 'remove', channelId: cid }) }); showToast('Rule removed.'); loadSettingsPanel('autoreact'); } catch (e) { showToast(e.message, 'error'); }
    };
  }
  document.getElementById('arctAddBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      const channelId = hybridVal('arctChannel', 'arctChannelId');
      const emojis = document.getElementById('arctEmojis')?.value?.trim().split(/[\s,]+/).filter(Boolean);
      if (!channelId || !emojis?.length) return showToast('Select a channel and enter at least one emoji.', 'error');
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/autoreact`, { method: 'POST', body: JSON.stringify({ action: 'save', channelId, emojis }) });
      const inp = document.getElementById('arctEmojis'); if (inp) inp.value = '';
      showToast('Auto-react rule saved.'); loadSettingsPanel('autoreact');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── MEDIA DOWNLOADER ──────────────────────────────────────────────────────
  function renderMedia(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    setChk('mdAutoAll', d.autoMediaAll);
    const ch = document.getElementById('mdChannel'); if (ch) ch.innerHTML = channelOptions(d.mediaChannelId, [0,5]);
    const inp = document.getElementById('mdChannelId'); if (inp && d.mediaChannelId) inp.placeholder = `Current: ${d.mediaChannelId}`;
  }
  document.getElementById('mdSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/media`, {
        method: 'POST', body: JSON.stringify({
          autoMediaAll: document.getElementById('mdAutoAll')?.checked,
          mediaChannelId: hybridVal('mdChannel', 'mdChannelId')
        })
      });
      showToast('Media downloader saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── QUARANTINE ────────────────────────────────────────────────────────────
  function renderQuarantine(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v ?? ''; };
    // Status
    const qs = document.getElementById('qtStatus');
    if (qs) {
      qs.textContent = d.quarantineRoleId
        ? `Configured — Role: ${d.quarantineRoleId} | Channel: ${d.quarantineChannelId||'—'} | VC: ${d.quarantineVcId||'—'} | Category: ${d.quarantineCategoryId||'—'}`
        : 'Not configured. Run Auto Setup or fill in Manual Configuration below.';
    }
    const qc = document.getElementById('qtCount'); if (qc) qc.textContent = d.quarantinedCount ?? 0;
    // Role and channel dropdowns
    const qr = document.getElementById('qtRole'); if (qr) qr.innerHTML = roleOptions(d.quarantineRoleId);
    const inp_role = document.getElementById('qtRoleId'); if (inp_role && d.quarantineRoleId) inp_role.placeholder = `Current: ${d.quarantineRoleId}`;
    const qch = document.getElementById('qtChannel'); if (qch) qch.innerHTML = channelOptions(d.quarantineChannelId, [0,5]);
    const inp_ch = document.getElementById('qtChannelId'); if (inp_ch && d.quarantineChannelId) inp_ch.placeholder = `Current: ${d.quarantineChannelId}`;
    const qvc = document.getElementById('qtVcChannel'); if (qvc) qvc.innerHTML = channelOptions(d.quarantineVcId, [2]);
    const inp_vc = document.getElementById('qtVcChannelId'); if (inp_vc && d.quarantineVcId) inp_vc.placeholder = `Current: ${d.quarantineVcId}`;
    set('qtCategoryId', d.quarantineCategoryId);
    // Gatekeeper
    setChk('gkEnabled', d.gatekeeperEnabled);
    set('gkMinAge', d.gatekeeperMinAge ?? 24);
    const ga = document.getElementById('gkAction'); if (ga) ga.value = d.gatekeeperAction || 'quarantine';
    setChk('gkRequireAvatar', d.gatekeeperRequireAvatar);
  }
  document.getElementById('qtAutoSetupBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      showToast('Running quarantine auto-setup…');
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/quarantine`, { method: 'POST', body: JSON.stringify({ action: 'autosetup' }) });
      showToast('Auto-setup complete.'); loadSettingsPanel('quarantine');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('qtManualSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/quarantine`, {
        method: 'POST', body: JSON.stringify({
          quarantineRoleId:     hybridVal('qtRole',      'qtRoleId'),
          quarantineChannelId:  hybridVal('qtChannel',   'qtChannelId'),
          quarantineVcId:       hybridVal('qtVcChannel', 'qtVcChannelId'),
          quarantineCategoryId: document.getElementById('qtCategoryId')?.value?.trim()
        })
      });
      showToast('Quarantine config saved.'); loadSettingsPanel('quarantine');
    } catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('gkSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/quarantine`, {
        method: 'POST', body: JSON.stringify({
          gatekeeperEnabled:       document.getElementById('gkEnabled')?.checked,
          gatekeeperMinAge:        parseInt(document.getElementById('gkMinAge')?.value) || 0,
          gatekeeperAction:        document.getElementById('gkAction')?.value || 'quarantine',
          gatekeeperRequireAvatar: document.getElementById('gkRequireAvatar')?.checked
        })
      });
      showToast('Gatekeeper saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // ── PERSONA ───────────────────────────────────────────────────────────────
  const PERSONA_META = {
    default:   { name: 'Default', desc: 'Neutral, professional, helpful AI assistant.', emoji: '🤖' },
    tsundere:  { name: 'Tsundere', desc: 'Reluctant but secretly helpful. Flustered and sharp.', emoji: '😤' },
    cyberpunk: { name: 'Cyberpunk', desc: 'Street-smart hacker slang. Neon-lit attitude.', emoji: '⚡' },
    butler:    { name: 'Butler', desc: 'Formal, courteous, immaculate service persona.', emoji: '🎩' },
    sensei:    { name: 'Sensei', desc: 'Wise mentor — patient, instructive, calm.', emoji: '📖' }
  };
  function renderPersona(d) {
    const grid = document.getElementById('personaGrid');
    if (!grid) return;
    const available = d.available || Object.keys(PERSONA_META).map(k => ({ key: k, ...PERSONA_META[k] }));
    const current = d.current || 'default';
    grid.innerHTML = available.map(p => {
      const meta = PERSONA_META[p.key] || {};
      const active = p.key === current;
      return `<div class="rounded-xl p-4 border ${active ? 'border-primary bg-primary-container/20' : 'border-outline-variant/25 bg-surface-container-low'} space-y-2 cursor-pointer hover:border-primary transition-colors" onclick="window._setPersona('${esc(p.key)}')">
        <div class="text-2xl">${meta.emoji || '🤖'}</div>
        <div class="font-mono text-sm font-bold text-on-surface">${esc(p.name||p.key)}</div>
        <div class="text-xs text-on-surface-variant">${esc(p.desc||'')}</div>
        ${active ? '<div class="font-mono text-[10px] text-primary uppercase tracking-widest mt-1">ACTIVE</div>' : ''}
      </div>`;
    }).join('');
    window._setPersona = async (key) => {
      const gid = state.activeGuildId; if (!gid) return;
      try {
        await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/persona`, { method: 'POST', body: JSON.stringify({ key }) });
        showToast(`Persona set to ${key}.`); loadSettingsPanel('persona');
      } catch (e) { showToast(e.message, 'error'); }
    };
  }

  // ── MORNING DISPATCHER ────────────────────────────────────────────────────
  function renderMorning(d) {
    const setChk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = Boolean(v); };
    setChk('mnEnabled', d.enabled);
    const ch = document.getElementById('mnChannel'); if (ch) ch.innerHTML = channelOptions(d.channelId, [0,5]);
    const inp = document.getElementById('mnChannelId'); if (inp && d.channelId) inp.placeholder = `Current: ${d.channelId}`;
    const tz = document.getElementById('mnTimezone'); if (tz) tz.value = d.timezone || 'Asia/Kolkata';
  }
  document.getElementById('mnSaveBtn')?.addEventListener('click', async () => {
    const gid = state.activeGuildId; if (!gid) return;
    try {
      await apiFetch(`/api/guilds/${encodeURIComponent(gid)}/settings/morning`, {
        method: 'POST', body: JSON.stringify({
          enabled: document.getElementById('mnEnabled')?.checked,
          channelId: hybridVal('mnChannel', 'mnChannelId'),
          timezone: document.getElementById('mnTimezone')?.value || 'Asia/Kolkata'
        })
      });
      showToast('Morning dispatcher saved.');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Boot
  renderFeatureMatrix('nuke');
  bindEvents();
  loadPublicOverview();
  setInterval(loadPublicOverview, 15000);
  initSession();
})();
