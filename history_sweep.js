/**
 * Routster — Deep History Sweep
 *
 * Parses a browser-history export and keeps only links that are likely
 * research-relevant, bucketed into four categories:
 *   "Science News" · "Articles" · "Books" · "Interest Pages"
 *
 * Everything runs locally; no network calls. Inputs are auto-detected:
 *   - Google Takeout  Chrome/History.json     ({ "Browser History": [...] })
 *   - Raw Chrome/Edge "History" SQLite file    (urls table)
 *   - Netscape bookmark/history HTML           (<A HREF>)
 *   - Plain text / CSV                         (URLs via regex)
 *
 * The ruleset below is intentionally explicit and easy to tune — there is no
 * hidden scoring. KEEP decisions are domain-driven first, then fall back to a
 * transparent heuristic for unknown domains.
 */
const fs = require('fs');

// --- URL helpers -------------------------------------------------------
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
function pathOf(u) { try { return new URL(u).pathname.toLowerCase(); } catch { return ''; } }
function searchOf(u) { try { return new URL(u).search.toLowerCase(); } catch { return ''; } }

// Dedup key: drop fragment + common tracking params + trailing slash.
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'ref_src', 'spm', 'igshid']
      .forEach(p => url.searchParams.delete(p));
    return url.toString().replace(/\/$/, '');
  } catch { return (u || '').trim(); }
}

const BOILERPLATE = /^(\s*$|just a moment|attention required|sign[ -]?in|log[ -]?in|loading|redirecting|access denied|forbidden|403|404|error|page not found|not found|untitled|new tab|home page|google|youtube|facebook)/i;
function isBoilerplateTitle(t) { return !t || BOILERPLATE.test(t.trim()); }

// --- Noise (hard drop) -------------------------------------------------
// Matched on any DNS label, so it survives ccTLD variants (amazon.com.br) and
// subdomains (mail.google.com) without accidentally hitting look-alikes (max.com).
const NOISE_BRANDS = new Set([
  'google', 'gstatic', 'googleusercontent', 'googlesyndication', 'googleadservices', 'doubleclick',
  'facebook', 'fb', 'instagram', 'twitter', 'youtube', 'youtu', 'netflix', 'spotify', 'twitch',
  'hulu', 'disneyplus', 'primevideo', 'vimeo', 'tiktok', 'linkedin', 'pinterest', 'snapchat',
  'whatsapp', 'telegram', 'threads', 'messenger',
  // NOTE: amazon and wikipedia are intentionally NOT here — they must ALWAYS be
  // processed and classified (amazon → often Books, wikipedia → References/Curios by content).
  'mercadolivre', 'mercadolibre', 'ebay', 'aliexpress', 'etsy', 'shopee', 'magazineluiza',
  'americanas', 'shein', 'casasbahia',
  'paypal', 'nubank', 'itau', 'bradesco', 'santander', 'bankofamerica', 'chase', 'wise', 'mercadopago', 'picpay',
  'bing', 'yahoo', 'yandex', 'baidu', 'ecosia',
]);
const NOISE_PATH = ['/login', '/signin', '/sign-in', '/auth', '/oauth', '/sso', '/logout', '/cart', '/checkout', '/account/'];

function isNoiseHost(host) {
  if (!host) return true;
  if (host === 'x.com' || host.endsWith('.x.com') || host === 't.co') return true;          // X / shorteners
  if (host.startsWith('localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;     // local/dev
  return host.split('.').some(label => NOISE_BRANDS.has(label));
}

// --- Keep lists (drive the bucket) ------------------------------------
const SCIENCE_NEWS = new Set(['phys.org', 'psypost.org', 'medicalxpress.com', 'sciencedaily.com', 'scitechdaily.com', 'neurosciencenews.com', 'sciencenews.org', 'universetoday.com', 'iflscience.com', 'thetransmitter.org', 'science.org', 'sciencealert.com', 'techxplore.com', 'news.mit.edu', 'santafe.edu', 'physicsworld.com', 'quantamagazine.org', 'newscientist.com', 'livescience.com', 'space.com', 'popsci.com', 'discovermagazine.com', 'smithsonianmag.com', 'arstechnica.com', 'the-scientist.com', 'cosmosmagazine.com', 'eurekalert.org', 'statnews.com', 'chemistryworld.com', 'futurity.org', 'zmescience.com', 'realclearscience.com', 'popularmechanics.com', 'nautil.us', 'aeon.co']);
const PAPERS = new Set(['arxiv.org', 'biorxiv.org', 'medrxiv.org', 'doi.org', 'dx.doi.org', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'semanticscholar.org', 'researchgate.net', 'jstor.org', 'sciencedirect.com', 'nature.com', 'link.springer.com', 'springer.com', 'tandfonline.com', 'onlinelibrary.wiley.com', 'mdpi.com', 'ssrn.com', 'papers.ssrn.com', 'philpapers.org', 'projecteuclid.org', 'ams.org', 'journals.aps.org', 'aps.org', 'iopscience.iop.org', 'dl.acm.org', 'ieeexplore.ieee.org', 'direct.mit.edu', 'academic.oup.com', 'cambridge.org', 'royalsocietypublishing.org', 'pnas.org', 'cell.com', 'plos.org', 'journals.plos.org', 'frontiersin.org', 'elifesciences.org', 'annualreviews.org', 'sciencemag.org', 'philarchive.org', 'philsci-archive.pitt.edu']);
const BOOKS = new Set(['gutenberg.org', 'archive.org', 'openlibrary.org', 'goodreads.com', 'annas-archive.org', 'libgen.is', 'libgen.rs', 'library.lol', 'z-lib.org', 'oreilly.com', 'manning.com', 'leanpub.com', 'bookdepository.com', 'standardebooks.org']);
const REFERENCE = new Set(['ncatlab.org', 'plato.stanford.edu', 'scholarpedia.org', 'britannica.com', 'wikiwand.com', 'wikisource.org', 'mathworld.wolfram.com', 'encyclopediaofmath.org', 'oeis.org', 'nlab.mathforge.org']);
const FORUM = new Set(['stackoverflow.com', 'mathoverflow.net', 'news.ycombinator.com', 'lesswrong.com', 'physicsforums.com', 'quora.com', 'reddit.com', 'old.reddit.com']);

// Article-ish path: dated archive, common section, or a multi-word slug.
function looksLikeArticle(p) {
  return /\/(article|articles|blog|blogs|posts?|story|stories|essay|news|p)\//.test(p)
    || /\/\d{4}\/\d{1,2}\//.test(p)
    || /\/[a-z0-9]+(?:-[a-z0-9]+){2,}/.test(p);
}

/**
 * Decide whether to keep a single (url, title, visits) and which bucket.
 * Returns { bucket, reason } or null to drop.
 */
function classifyEntry(url, title, visits) {
  if (!/^https?:\/\//i.test(url)) return null;
  const host = hostOf(url);
  const p = pathOf(url);

  // Explicit allow-list that overrides brand-noise (e.g. Google Books).
  if (/^books\.google\./.test(host)) return { bucket: 'Books', reason: 'Google Books' };

  if (isNoiseHost(host)) return null;
  if (NOISE_PATH.some(n => p.includes(n))) return null;

  // 1. Known domains → direct bucket
  if (SCIENCE_NEWS.has(host)) return { bucket: 'Science News', reason: 'science-news outlet' };
  if (PAPERS.has(host) || /\b10\.\d{4,9}\/[^\s]+/.test(url)) return { bucket: 'Articles', reason: 'journal / preprint / DOI' };
  if (BOOKS.has(host)) return { bucket: 'Books', reason: 'book repository' };
  if (host.endsWith('.wikipedia.org') || REFERENCE.has(host)) return { bucket: 'Interest Pages', reason: 'reference / encyclopedia' };

  // 2. Forums & Q&A — require a specific thread, not the homepage/feed
  if (host.endsWith('.stackexchange.com')) return { bucket: 'Interest Pages', reason: 'Q&A thread' };
  if (FORUM.has(host)) {
    if (host === 'reddit.com' || host === 'old.reddit.com') return /\/comments\//.test(p) ? { bucket: 'Interest Pages', reason: 'forum thread' } : null;
    if (host === 'news.ycombinator.com') return (/item/.test(p) || searchOf(url).includes('id=')) ? { bucket: 'Interest Pages', reason: 'HN thread' } : null;
    if (host === 'stackoverflow.com') return /\/questions\//.test(p) ? { bucket: 'Interest Pages', reason: 'Q&A thread' } : null;
    return { bucket: 'Interest Pages', reason: 'forum / Q&A' };
  }

  // 3. Academic & personal pages
  if (/(^|\.)edu(\.|$)|(^|\.)ac\.[a-z]{2}$|\.github\.io$/.test(host)) return { bucket: 'Interest Pages', reason: 'academic / personal page' };
  if (host === 'github.com' && /^\/[^/]+\/[^/]+/.test(p)
      && !/^\/(search|orgs|topics|marketplace|features|about|pricing|login|join|settings|notifications|sponsors|explore|trending|new)(\/|$)/.test(p))
    return { bucket: 'Interest Pages', reason: 'code repository' };

  // 4. Unknown domain → transparent heuristic
  let score = 0;
  if (looksLikeArticle(p)) score += 2;
  if (!isBoilerplateTitle(title) && title.split(/\s+/).length >= 4 && title.length >= 18 && title.length <= 220) score += 1;
  if (visits >= 3) score += 1;
  if (/\/(blog|posts?|essays?)\//.test(p)) score += 1;
  if (score >= 3) return { bucket: 'Articles', reason: 'article-like (heuristic)' };
  if (score >= 2 && visits >= 2) return { bucket: 'Interest Pages', reason: 'revisited page (heuristic)' };
  return null;
}

// --- Parsers (return array of {url, title, time}) ----------------------
function parseTakeoutJson(text) {
  const data = JSON.parse(text);
  const arr = data['Browser History'] || data.history || (Array.isArray(data) ? data : []);
  return arr.map(e => ({ url: e.url, title: e.title || '', time: e.time_usec ? Math.floor(e.time_usec / 1e6) : 0 }));
}
function parseHistorySqlite(filePath) {
  const Database = require('better-sqlite3');
  const sdb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    // Chrome stores last_visit_time as microseconds since 1601-01-01.
    const rows = sdb.prepare('SELECT url, title, visit_count, last_visit_time FROM urls').all();
    return rows.map(r => ({
      url: r.url, title: r.title || '', visit_count: r.visit_count || 1,
      time: r.last_visit_time ? Math.floor(r.last_visit_time / 1e6 - 11644473600) : 0,
    }));
  } finally { sdb.close(); }
}
function parseHtml(text) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(text);
  const out = [];
  $('a').each((i, el) => {
    const url = $(el).attr('href');
    if (url && /^https?:\/\//i.test(url)) out.push({ url, title: $(el).text() || '', time: 0 });
  });
  return out;
}
function parseText(text) {
  const urls = text.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
  return urls.map(u => ({ url: u, title: '', time: 0 }));
}

function detectAndParse(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head.toString('utf8').startsWith('SQLite format 3')) return { format: 'sqlite', entries: parseHistorySqlite(filePath) };

  const text = fs.readFileSync(filePath, 'utf8');
  const trimmed = text.slice(0, 4096).trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return { format: 'takeout-json', entries: parseTakeoutJson(text) }; } catch { /* fall through */ }
  }
  if (/<a\s|<!doctype|<dl|<html/i.test(trimmed)) return { format: 'html', entries: parseHtml(text) };
  return { format: 'text', entries: parseText(text) };
}

/**
 * Main entry point. Returns { kept: [...], stats: {...} }.
 *   kept item: { url, title, bucket, reason, visits, lastVisit }
 */
function sweepHistoryFile(filePath) {
  const { format, entries } = detectAndParse(filePath);

  // Dedup by normalized URL; aggregate visits; keep best (non-boilerplate, longest) title.
  const unique = new Map();
  for (const e of entries) {
    if (!e.url) continue;
    const key = normalizeUrl(e.url);
    if (!key) continue;
    const prev = unique.get(key);
    if (!prev) {
      unique.set(key, { url: key, title: e.title || '', visits: e.visit_count || 1, lastVisit: e.time || 0 });
    } else {
      prev.visits += (e.visit_count || 1);
      if (e.time > prev.lastVisit) prev.lastVisit = e.time;
      if (isBoilerplateTitle(prev.title) && !isBoilerplateTitle(e.title)) prev.title = e.title;
      else if (!isBoilerplateTitle(e.title) && (e.title || '').length > prev.title.length) prev.title = e.title;
    }
  }

  const kept = [];
  const perBucket = { 'Science News': 0, 'Articles': 0, 'Books': 0, 'Interest Pages': 0 };
  const droppedDomains = {};
  for (const item of unique.values()) {
    const verdict = classifyEntry(item.url, item.title, item.visits);
    if (verdict) {
      let title = item.title;
      if (isBoilerplateTitle(title)) {
        // Fall back to a readable title from the URL slug.
        const slug = decodeURIComponent(pathOf(item.url).split('/').filter(Boolean).pop() || hostOf(item.url));
        title = slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').trim() || hostOf(item.url);
      }
      kept.push({ url: item.url, title, bucket: verdict.bucket, reason: verdict.reason, visits: item.visits, lastVisit: item.lastVisit });
      perBucket[verdict.bucket] = (perBucket[verdict.bucket] || 0) + 1;
    } else {
      const h = hostOf(item.url);
      if (h) droppedDomains[h] = (droppedDomains[h] || 0) + 1;
    }
  }

  // Rank: bucket priority, then most-revisited, then most-recent.
  const order = { 'Science News': 0, 'Articles': 1, 'Books': 2, 'Interest Pages': 3 };
  kept.sort((a, b) => (order[a.bucket] - order[b.bucket]) || (b.visits - a.visits) || (b.lastVisit - a.lastVisit));

  const topDropped = Object.entries(droppedDomains).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([domain, count]) => ({ domain, count }));

  return {
    kept,
    stats: {
      format,
      rawEntries: entries.length,
      uniqueUrls: unique.size,
      kept: kept.length,
      dropped: unique.size - kept.length,
      perBucket,
      topDroppedDomains: topDropped,
    },
  };
}

// A readable title: fall back to a humanised URL slug when the page title is boilerplate.
function displayTitle(url, title) {
  if (!isBoilerplateTitle(title)) return title;
  const slug = decodeURIComponent(pathOf(url).split('/').filter(Boolean).pop() || hostOf(url));
  return slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').trim() || hostOf(url);
}

// Parse + dedupe a history file into unique links (no classification).
// Returns { format, rawEntries, unique: [{url, title, visits, lastVisit}] }.
function parseAndDedupe(filePath) {
  const { format, entries } = detectAndParse(filePath);
  const unique = new Map();
  for (const e of entries) {
    if (!e.url) continue;
    const key = normalizeUrl(e.url);
    if (!key) continue;
    const prev = unique.get(key);
    if (!prev) {
      unique.set(key, { url: key, title: e.title || '', visits: e.visit_count || 1, lastVisit: e.time || 0 });
    } else {
      prev.visits += (e.visit_count || 1);
      if (e.time > prev.lastVisit) prev.lastVisit = e.time;
      if (isBoilerplateTitle(prev.title) && !isBoilerplateTitle(e.title)) prev.title = e.title;
      else if (!isBoilerplateTitle(e.title) && (e.title || '').length > prev.title.length) prev.title = e.title;
    }
  }
  return { format, rawEntries: entries.length, unique: [...unique.values()] };
}

module.exports = { sweepHistoryFile, classifyEntry, normalizeUrl, isNoiseHost, hostOf, pathOf, displayTitle, parseAndDedupe };
