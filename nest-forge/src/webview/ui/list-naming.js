(function (root) {
  const ROLES = {
    ctrl: ['', 'admin', 'public', 'internal', 'webhook'],
    srv: ['', 'query', 'command', 'validation', 'mapper'],
    store: ['', 'cache', 'session', 'read', 'write'],
    provider: ['', '.handler', 'auth', 'events.handler'],
    processor: ['', 'notifications', 'sync', 'export'],
    task: ['', 'cleanup', 'report', 'sync'],
    dto: ['create', 'update', 'filter', 'query', 'response'],
    event: ['created', 'updated', 'deleted'],
    listener: ['created', 'updated', 'deleted'],
  };

  function autoName(kebab, suffix, kind) {
    const base = kebab || 'item';
    if (kind === 'dto') {
      const act = suffix || 'create';
      return `${act}-${base}`;
    }
    if (kind === 'event' || kind === 'listener') {
      const act = suffix || 'created';
      return `${base}-${act}`;
    }
    if (!suffix) return base;
    return suffix.startsWith('.') ? base + suffix : `${base}-${suffix}`;
  }

  function itemName(item, kebab, kind) {
    if (!item) return autoName(kebab, '', kind);
    return item.custom != null ? item.custom : autoName(kebab, item.suffix, kind);
  }

  function nextItem(kind, items, kebab) {
    const used = new Set((items || []).map((i) => itemName(i, kebab, kind)));
    const roles = ROLES[kind] || [''];
    for (const s of roles) {
      const candidate = autoName(kebab, s, kind);
      if (!used.has(candidate)) {
        return { suffix: s };
      }
    }
    let n = 2;
    while (used.has(autoName(kebab, String(n), kind))) {
      n++;
    }
    return { suffix: String(n) };
  }

  function applyEdit(item, value, kebab, kind) {
    const trimmed = (value || '').trim();
    if (item && item.suffix != null && trimmed === autoName(kebab, item.suffix, kind)) {
      return { suffix: item.suffix };
    }
    return { suffix: item ? item.suffix : undefined, custom: trimmed };
  }

  function checkSuspiciousPlural(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const uncountables = new Set(['news', 'information', 'feedback', 'data', 'auth']);
    if (uncountables.has(lower)) {
      return `"${trimmed}" is uncountable; singular and plural routes are identical.`;
    }
    // Ending in 's' but not standard 'status', 'bus', 'address'
    if (lower.endsWith('s') && !/(status|bus|address|lens|focus)$/i.test(lower)) {
      return `"${trimmed}" already ends in "s"; double check if pluralization is needed.`;
    }
    return null;
  }

  const api = { ROLES, autoName, itemName, nextItem, applyEdit, checkSuspiciousPlural };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NestForgeListNaming = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
