/**
 * Routster — Bookmark Trainer
 *
 * Learns the user's categories directly from their Chrome bookmark folders:
 *   - Categories  = the user's TOP-LEVEL folders (subfolders are folded into
 *                   their parent; every nested link counts as the user's own
 *                   judgement of what belongs in that category).
 *   - Fingerprint = the most DISTINCTIVE terms (tf-idf across categories) drawn
 *                   from each folder's link titles + URL words. This is what
 *                   lets the classifier capture subtle, beyond-domain signals.
 *   - Domain rules = domain → category when a domain sits overwhelmingly in one
 *                   folder (a strong, cheap prior; mirrors Routster learned_rules).
 *
 * The fingerprints are emitted as category_rules[cat].prompt strings and the
 * domain rules as learned_rules, so the EXACT same nlp.js scorer used in
 * production reproduces these results. Everything runs locally.
 */
const fs = require('fs');
const { tokenize, calculateSemanticScore } = require('./nlp');
const { isNoiseHost, normalizeUrl, hostOf, pathOf } = require('./history_sweep');

// Top-level folders that are NOT user-curated topics (session dumps, tool output).
const EXCLUDE_FOLDERS = new Set(['FreshStart Sessions', 'KMS Input', 'KMS Output', 'Panop']);
const FINGERPRINT_TERMS = 150;     // top distinctive terms kept per category
const MIN_CATEGORY_LINKS = 10;     // ignore tiny folders
const DOMAIN_RULE_MIN = 5;         // a domain needs >= this many links to earn a rule (stricter)
const DOMAIN_RULE_PURITY = 0.85;   // ...and >= this share in a single category (stricter)

const LOGIN_PATH = /\/(login|signin|sign-in|auth|oauth|sso|logout|account)(\/|$)/i;

// Hostname + path turned into searchable words (so "ncatlab.org/nlab/show/topos" contributes "ncatlab nlab show topos").
function urlText(u) {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + ' ' + decodeURIComponent(x.pathname)).replace(/[\/\-_.+%]+/g, ' ');
  } catch { return ''; }
}

// Recursively gather every {url,title} under a folder node.
function collectLinks(node, acc) {
  for (const c of node.children || []) {
    if (c.type === 'url' && c.url) acc.push({ url: c.url, title: c.name || '' });
    else if (c.type === 'folder') collectLinks(c, acc);
  }
  return acc;
}

// Build { categoryName: [ {url,title}, ... ] } from the user's top-level folders.
function extractCategoryFolders(bookmarksJson) {
  const cats = {};
  for (const root of Object.values(bookmarksJson.roots || {})) {
    if (!root || !root.children) continue;
    for (const child of root.children) {
      if (child.type !== 'folder' || EXCLUDE_FOLDERS.has(child.name)) continue;
      const links = collectLinks(child, []);
      if (links.length >= MIN_CATEGORY_LINKS) {
        cats[child.name] = (cats[child.name] || []).concat(links);
      }
    }
  }
  return cats;
}

/**
 * Train a model from a parsed Chrome Bookmarks JSON object.
 * Returns { categories, categoryRules, domainRules, fingerprints, stats }.
 */
function trainModel(bookmarksJson) {
  const catLinks = extractCategoryFolders(bookmarksJson);
  const categories = Object.keys(catLinks);

  // 1. Token frequencies per category + domain → category tallies.
  const catTf = {};                 // cat -> { token: count }
  const domainTally = {};           // host -> { cat: count }
  for (const cat of categories) {
    const tf = {};
    for (const { url, title } of catLinks[cat]) {
      for (const tok of tokenize(title + ' ' + urlText(url))) tf[tok] = (tf[tok] || 0) + 1;
      const h = hostOf(url);
      if (h) {
        domainTally[h] = domainTally[h] || {};
        domainTally[h][cat] = (domainTally[h][cat] || 0) + 1;
      }
    }
    catTf[cat] = tf;
  }

  // 2. Cross-category IDF (a category = one document) → distinctive-term weighting.
  const df = {};
  for (const cat of categories) for (const tok of Object.keys(catTf[cat])) df[tok] = (df[tok] || 0) + 1;
  const N = categories.length;
  const idf = {};
  for (const [tok, d] of Object.entries(df)) idf[tok] = Math.log(N / d);

  // 3. Each category's fingerprint = its top tf*idf terms.
  const fingerprints = {};
  const categoryRules = {};
  for (const cat of categories) {
    const scored = Object.entries(catTf[cat])
      .map(([tok, tf]) => [tok, tf * (idf[tok] || 0)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, FINGERPRINT_TERMS)
      .map(([tok]) => tok);
    fingerprints[cat] = scored;
    categoryRules[cat] = { mediaType: 'all', prompt: scored.join(' ') };
  }

  // 4. Domain rules: a domain that lives overwhelmingly in one category.
  const domainRules = {};
  for (const [host, tally] of Object.entries(domainTally)) {
    const entries = Object.entries(tally);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const [bestCat, bestN] = entries.sort((a, b) => b[1] - a[1])[0];
    if (total >= DOMAIN_RULE_MIN && bestN / total >= DOMAIN_RULE_PURITY) domainRules[host] = { category: bestCat, purity: bestN / total };
  }

  return {
    categories,
    categoryRules,
    domainRules,
    fingerprints,
    stats: {
      categories: categories.map(c => ({ name: c, links: catLinks[c].length, topTerms: fingerprints[c].slice(0, 12) })),
      domainRules: Object.keys(domainRules).length,
    },
  };
}

/**
 * Classify one link with a trained model. Domain is NEVER the sole criterion:
 * the page's content score is always computed and always blended in.
 *
 * - Category = argmax of (content share + 0.5 × domain prior). A domain rule is a
 *   strong but OVERRIDABLE prior, so a clearly different content signal can win.
 * - confidence (0-100) blends the domain prior (how exclusively you file that
 *   domain) with content coherence, and DROPS when content disagrees with the
 *   domain — flagging that link for your review.
 *
 * Returns { category, confidence, coherence, via, runnerUp }. NEVER drops a link:
 * anything without a confident category is labelled 'Unsorted' (kept for posterity).
 */
function classify(model, url, title, threshold = 5) {
  const norm = normalizeUrl(url);
  const host = hostOf(norm);

  // Nothing is ever dropped. Non-web links (chrome://, etc.) are still recorded → Unsorted.
  if (!/^https?:\/\//i.test(norm) || !host) return { category: 'Unsorted', confidence: 0, coherence: 0, via: 'unsorted', runnerUp: null };

  const scores = calculateSemanticScore(title + ' ' + urlText(norm), model.categoryRules);
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const rule = model.domainRules[host]; // { category, purity } | undefined

  // Content's own pick, independent of any domain rule (used for agreement + drop).
  let contentTop = null, contentTopScore = 0;
  for (const [c, s] of Object.entries(scores)) if (s > contentTopScore) { contentTop = c; contentTopScore = s; }

  // Blend: content share is ALWAYS in play; a domain rule is a strong, overridable prior.
  const DOMAIN_PRIOR_WEIGHT = 0.5;
  let best = null, bestCombined = -1;
  for (const c of model.categories) {
    const share = sum > 0 ? (scores[c] || 0) / sum : 0;
    const prior = (rule && rule.category === c) ? rule.purity : 0;
    const combined = share + DOMAIN_PRIOR_WEIGHT * prior;
    if (combined > bestCombined) { bestCombined = combined; best = c; }
  }

  // No confident category → Unsorted (kept for posterity, never dropped).
  if (!best || (!rule && contentTopScore < threshold)) return { category: 'Unsorted', confidence: 0, coherence: contentTopScore, via: 'unsorted', runnerUp: contentTop };

  const coherence = scores[best] || 0;
  const shareBest = sum > 0 ? coherence / sum : 0;
  const contentComponent = 0.6 * shareBest + 0.4 * Math.min(1, coherence / 15);

  let confidence, via;
  if (rule) {
    const domainComponent = (rule.category === best) ? rule.purity : 0;
    confidence = Math.round(100 * (0.6 * domainComponent + 0.4 * contentComponent));
    via = (best !== rule.category) ? 'content>domain'
        : (best === contentTop ? 'domain+content' : 'domain (weak content)');
  } else {
    confidence = Math.round(100 * contentComponent);
    via = 'content';
  }
  return { category: best, confidence, coherence, via, runnerUp: (contentTop && contentTop !== best) ? contentTop : null };
}

module.exports = { trainModel, classify, extractCategoryFolders, urlText };
