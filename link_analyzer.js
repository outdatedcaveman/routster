/**
 * Routster — Strict Link Analyzer (precision-first)
 *
 * Classifies a link into one of FOUR priority categories ONLY on a definitive,
 * structural signal — never on fuzzy title similarity alone:
 *   Articles      → DOI, scholarly publisher/repository, or .pdf
 *   Books         → book repository, ISBN, or publisher book page
 *   Science News  → known science-news outlet or a /science section
 *   References    → encyclopedia (nLab, SEP, MathWorld…) or Wikipedia-by-content
 *
 * Obvious junk → 'Trash' (search pages, logins, 404s, social, app shells, trackers).
 * Anything not confidently a priority category and not trash → 'Unsorted'.
 * Nothing is ever dropped.
 */
const { calculateSemanticScore } = require('./nlp');
const { hostOf, pathOf, normalizeUrl } = require('./history_sweep');

const PRIORITY = ['Articles', 'Books', 'Science News', 'References', 'Data & Tools', 'Content & News'];
const labelsOf = (host) => (host || '').split('.');

// ---------------------------------------------------------------- TRASH
const SEARCH_BRANDS = ['google', 'bing', 'duckduckgo', 'yahoo', 'yandex', 'baidu', 'ecosia', 'ask', 'startpage', 'qwant'];
const SOCIAL_BRANDS = ['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'threads', 'tumblr', 'reddit', 'vk', 'weibo'];
const TRACKER_BRANDS = ['doubleclick', 'googlesyndication', 'googleadservices', 'adservice', 'googletagmanager', 'criteo', 'taboola', 'outbrain'];
const APPSHELL_HOSTS = new Set(['mail.google.com', 'calendar.google.com', 'drive.google.com', 'docs.google.com', 'meet.google.com', 'chat.google.com', 'keep.google.com', 'accounts.google.com', 'myaccount.google.com', 'photos.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'login.microsoftonline.com', 'web.whatsapp.com', 'teams.microsoft.com']);
// NOTE: a blank title is NOT trash — real PDFs/articles often have none, so we
// let the structural rules decide those. Only explicit error/auth titles count.
const ERROR_TITLE = /^(sign[ -]?in|log[ -]?in|sign[ -]?up|register|create (an )?account|404|not found|page not found|error|access denied|forbidden|403|page (isn'?t|is not|not) available|content unavailable|site can'?t be reached|no longer available|this content isn'?t available|are you a robot|verify you are human)/i;
const LOGIN_PATH = /\/(login|signin|sign-in|signup|sign-up|register|auth|oauth2?|sso|logout|password|account|session)(\/|$|\?)/i;

function isTrash(host, path, search, title) {
  if (!host) return true;
  if (host === 'localhost' || /^(127\.|192\.168\.|10\.|0\.0\.0\.0)/.test(host) || host === '::1') return true;
  if (host === 'x.com' || host.endsWith('.x.com') || host === 't.co') return true;
  const ls = labelsOf(host);
  if (ls.some(l => TRACKER_BRANDS.includes(l))) return true;
  if (ls.some(l => SOCIAL_BRANDS.includes(l))) return true;
  if (APPSHELL_HOSTS.has(host)) return true;
  // Search-engine result/landing pages (not the rest of the web).
  if (ls.some(l => SEARCH_BRANDS.includes(l)) && (/\/search/.test(path) || /[?&](q|query|search|p)=/.test(search) || path === '/' || path === '')) return true;
  if (LOGIN_PATH.test(path)) return true;
  if (ERROR_TITLE.test((title || '').trim())) return true;
  return false;
}

// ---------------------------------------------------------------- ARTICLES
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>]+/;
const PAPER_DOMAINS = new Set([
  'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'chemrxiv.org', 'ssrn.com', 'papers.ssrn.com',
  'doi.org', 'dx.doi.org', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov',
  'semanticscholar.org', 'researchgate.net', 'academia.edu', 'jstor.org', 'sciencedirect.com',
  'nature.com', 'science.org', 'sciencemag.org', 'link.springer.com', 'springer.com', 'springerlink.com',
  'tandfonline.com', 'onlinelibrary.wiley.com', 'mdpi.com', 'philpapers.org', 'philarchive.org',
  'philsci-archive.pitt.edu', 'projecteuclid.org', 'ams.org', 'journals.aps.org', 'aps.org',
  'iopscience.iop.org', 'dl.acm.org', 'ieeexplore.ieee.org', 'direct.mit.edu', 'academic.oup.com',
  'royalsocietypublishing.org', 'pnas.org', 'cell.com', 'plos.org', 'journals.plos.org',
  'frontiersin.org', 'elifesciences.org', 'annualreviews.org', 'cambridge.org', 'pdcnet.org',
  'muse.jhu.edu', 'journals.sagepub.com', 'degruyter.com', 'jmlr.org', 'openreview.net',
]);
function structuralArticle(host, path, url) {
  if (DOI_RE.test(url)) return true;
  if (PAPER_DOMAINS.has(host)) return true;
  if (/\.pdf($|\?)/i.test(path)) return true;                       // user rule: PDFs count
  if (host.endsWith('.edu') && /\/(paper|article|publication|pubs|preprint|abs)\b/.test(path)) return true;
  return false;
}

// ---------------------------------------------------------------- BOOKS
const ISBN_RE = /\b(97[89][\dxX]{10}|97[89][- ]\d[- ]\d{2,7}[- ]\d{1,7}[- ][\dxX])\b/i;
const BOOK_DOMAINS = new Set(['gutenberg.org', 'openlibrary.org', 'standardebooks.org', 'manybooks.net', 'libgen.is', 'libgen.rs', 'annas-archive.org', 'goodreads.com', 'librarything.com']);
const BOOK_PUBLISHER = /(press\.princeton\.edu|global\.oup\.com|[a-z]+\.oup\.com|cambridge\.org|link\.springer\.com|mitpress\.mit\.edu|yalebooks\.yale\.edu|hup\.harvard\.edu|press\.uchicago\.edu|ucpress\.edu|routledge\.com)$/;
function structuralBook(host, path, url, title) {
  if (BOOK_DOMAINS.has(host)) return /\/(book|ebooks?|details|work|title)/.test(path) || host === 'gutenberg.org' || host === 'standardebooks.org';
  if (host === 'archive.org' && /\/details\//.test(path)) return true;
  if (/^books\.google\./.test(host)) return true;
  if (ISBN_RE.test(url) || ISBN_RE.test(title || '')) return true;
  if (BOOK_PUBLISHER.test(host) && /\/(book|books|product|9\d{12})/.test(path)) return true;
  if (host === 'estantevirtual.com.br' && /\/livro/.test(path)) return true;
  if (/(^|\.)amazon\./.test(host) && /\/(dp|gp\/product)\//.test(path) && /(book|edition|paperback|hardcover|kindle|livro|capa|autor|author|ed\.)/i.test(title || '')) return true;
  return false;
}

// ---------------------------------------------------------------- SCIENCE NEWS
const SCIENCE_NEWS = new Set(['phys.org', 'psypost.org', 'medicalxpress.com', 'sciencedaily.com', 'scitechdaily.com', 'neurosciencenews.com', 'sciencenews.org', 'universetoday.com', 'iflscience.com', 'thetransmitter.org', 'sciencealert.com', 'techxplore.com', 'physicsworld.com', 'quantamagazine.org', 'newscientist.com', 'livescience.com', 'space.com', 'popsci.com', 'discovermagazine.com', 'smithsonianmag.com', 'the-scientist.com', 'cosmosmagazine.com', 'eurekalert.org', 'statnews.com', 'chemistryworld.com', 'futurity.org', 'zmescience.com', 'realclearscience.com', 'nautil.us', 'aeon.co', 'psyche.co', 'quantamagazine.com']);
function structuralScienceNews(host, path) {
  if (SCIENCE_NEWS.has(host)) return true;
  if (/\/science(\/|$)/.test(path) && /(theguardian|nytimes|bbc|washingtonpost|theatlantic|wired|nationalgeographic|scientificamerican)/.test(host)) return true;
  if (host.endsWith('.edu') && /\/news\//.test(path)) return true;
  if (/^news\.[a-z]+\.edu$/.test(host)) return true;
  return false;
}

// ---------------------------------------------------------------- REFERENCES
const REFERENCE_DEFINITIVE = new Set(['ncatlab.org', 'nlab.mathforge.org', 'mathworld.wolfram.com', 'scholarpedia.org', 'encyclopediaofmath.org', 'oeis.org', 'britannica.com', 'plato.stanford.edu']);
function structuralReference(host, path) {
  if (host === 'plato.stanford.edu') return /\/entries\//.test(path);
  if (REFERENCE_DEFINITIVE.has(host)) return true;
  if (/(^|\.)wiktionary\.org$/.test(host)) return true;
  return false;
}

// ---------------------------------------------------------------- DATA & TOOLS
const DEV_DOMAINS = new Set(['gitlab.com', 'bitbucket.org', 'codeberg.org', 'sourceforge.net', 'huggingface.co', 'kaggle.com', 'paperswithcode.com', 'replicate.com', 'npmjs.com', 'pypi.org', 'crates.io', 'rubygems.org', 'pkg.go.dev', 'hub.docker.com', 'packagist.org', 'producthunt.com', 'alternativeto.net', 'data.gov', 'ollama.com', 'civitai.com', 'modelscope.cn']);
const GH_RESERVED = /^\/(search|orgs|topics|marketplace|features|about|pricing|login|join|settings|notifications|sponsors|explore|trending|new|customer-stories|enterprise|team|security|contact|apps|collections|events|sitemap)(\/|$)/;
function structuralDataTools(host, path) {
  if (host === 'github.com') return /^\/[^/]+\/[^/]+/.test(path) && !GH_RESERVED.test(path);
  if (DEV_DOMAINS.has(host)) return true;
  return false;
}

// ------------------------------------------------- CONTENT & NEWS (read-later / longform / general news)
const NEWS_LONGFORM = new Set(['nytimes.com', 'newyorker.com', 'theatlantic.com', 'theguardian.com', 'washingtonpost.com', 'wsj.com', 'economist.com', 'ft.com', 'vox.com', 'slate.com', 'theverge.com', 'wired.com', 'bloomberg.com', 'politico.com', 'npr.org', 'time.com', 'harpers.org', 'lithub.com', 'themarginalian.org', 'restofworld.org', 'technologyreview.com', 'theargumentmag.com', 'asteriskmag.com', 'worksinprogress.co', 'newrepublic.com', 'thenation.com', 'foreignaffairs.com', 'foreignpolicy.com', 'quillette.com', 'unherd.com', 'palladiummag.com', 'thenewatlantis.com', 'noahpinion.blog', 'kellblog.com']);
function structuralContentNews(host, path) {
  if (host.endsWith('substack.com') && /\/p\//.test(path)) return true;
  if ((host === 'medium.com' || host.endsWith('.medium.com')) && path.length > 1) return true;
  if (NEWS_LONGFORM.has(host) && (/\/\d{4}\//.test(path) || /\/[a-z0-9]+(-[a-z0-9]+){2,}/.test(path))) return true;
  return false;
}

function pickRules(categoryRules, names) {
  const out = {};
  for (const n of names) if (categoryRules[n]) out[n] = categoryRules[n];
  return out;
}

/**
 * Analyze one link. Returns { category, via, confidence }.
 * category ∈ Articles | Books | Science News | References | Trash | Unsorted.
 * `refThreshold` gates the Wikipedia→References content check.
 */
function analyze(url, title, model, refThreshold = 8) {
  const norm = normalizeUrl(url);
  const host = hostOf(norm);
  const path = pathOf(norm);
  let search = '';
  try { search = new URL(norm).search.toLowerCase(); } catch (e) {}

  if (!/^https?:\/\//i.test(norm) || !host) return { category: 'Unsorted', via: 'non-web', confidence: 0 };
  if (isTrash(host, path, search, title)) return { category: 'Trash', via: 'trash', confidence: 0 };

  if (structuralArticle(host, path, norm)) return { category: 'Articles', via: 'structural', confidence: 95 };
  if (structuralBook(host, path, norm, title)) return { category: 'Books', via: 'structural', confidence: 92 };
  if (structuralScienceNews(host, path)) return { category: 'Science News', via: 'structural', confidence: 92 };
  if (structuralReference(host, path)) return { category: 'References', via: 'structural', confidence: 95 };

  // Wikipedia: only References when the page content is genuinely theory/science.
  if (/(^|\.)wikipedia\.org$/.test(host) && /\/wiki\//.test(path)) {
    const slug = decodeURIComponent(path.replace(/^\/wiki\//, '').replace(/[\/_]/g, ' '));
    const s = calculateSemanticScore(title + ' ' + slug, pickRules(model.categoryRules, ['References']));
    if ((s['References'] || 0) >= refThreshold) return { category: 'References', via: 'wiki+content', confidence: Math.min(90, 45 + Math.round((s['References'] || 0) * 3)) };
    return { category: 'Unsorted', via: 'wiki-nontheory', confidence: 0 };
  }

  if (structuralDataTools(host, path)) return { category: 'Data & Tools', via: 'structural', confidence: 90 };
  if (structuralContentNews(host, path)) return { category: 'Content & News', via: 'structural', confidence: 88 };

  // A high-purity domain rule the user themselves established for a priority category.
  const rule = model.domainRules[host];
  if (rule && PRIORITY.includes(rule.category) && rule.purity >= 0.85) {
    return { category: rule.category, via: 'your-domain-rule', confidence: Math.round(rule.purity * 100) };
  }

  // Not confidently a priority category → Unsorted (never forced).
  return { category: 'Unsorted', via: 'no-strong-signal', confidence: 0 };
}

// Model-free Article/Book classification for a single URL — used by the science-news
// extractor to type each referenced link without needing a trained model.
function classifyStructural(url, title) {
  const norm = normalizeUrl(url);
  const host = hostOf(norm);
  const path = pathOf(norm);
  if (!/^https?:\/\//i.test(norm) || !host) return null;
  if (path === '' || path === '/') return null; // skip bare homepages (publisher front pages, etc.)
  if (structuralArticle(host, path, norm)) return 'Articles';
  if (structuralBook(host, path, norm, title || '')) return 'Books';
  return null;
}

module.exports = { analyze, isTrash, PRIORITY, classifyStructural };
