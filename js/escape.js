// HTML-escaping helpers. Loaded as a classic script, same pattern as
// js/utils.js — a separate file rather than an addition to Fmt because
// admin.html loads store.js but not utils.js.
//
// esc() covers text content and attribute values. escUrl() is separate
// and required for href/src — escaping alone does not stop a
// javascript: URL from executing; only a scheme allowlist does.

window.esc = function esc(value){
  if(value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
};

window.escUrl = function escUrl(value){
  if(!value) return '';
  const raw = String(value).trim();
  // Strip control chars so scheme checks can't be fooled by embedded nulls, etc.
  // eslint-disable-next-line no-control-regex
  const scheme = raw.toLowerCase().replace(/[\u0000-\u001f]/g, '');
  const allowed = scheme.startsWith('http://') || scheme.startsWith('https://')
    || scheme.startsWith('mailto:') || scheme.startsWith('tel:')
    || scheme.startsWith('data:image/') || scheme.startsWith('/')
    || scheme.startsWith('./');
  if(!allowed) return '';
  return window.esc(raw);
};