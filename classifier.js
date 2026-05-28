/**
 * Routster Classification Engine
 * Multi-tier classifier: Adaptive Learning → File Type Matching → NLP Semantic Scoring
 */

let learnedRules = {}; // { domain: { category: count } }

function loadLearnedRules(dbModule) {
  try {
    const rows = dbModule.getLearnedRules();
    learnedRules = {};
    for (const row of rows) {
      if (!learnedRules[row.domain]) learnedRules[row.domain] = {};
      learnedRules[row.domain][row.category] = row.hits;
    }
    console.log(`[Classifier] Loaded ${rows.length} learned domain rules from memory.`);
  } catch (e) {}
}

function recordCorrection(dbModule, url, newCategory) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    dbModule.upsertLearnedRule(domain, newCategory);
    loadLearnedRules(dbModule);
    console.log(`[Classifier] Learned: ${domain} → ${newCategory}`);
  } catch (e) {}
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return ''; }
}

const { calculateSemanticScore } = require('./nlp');
const path = require('path');

// Maps media type keys to their associated file extensions
const MEDIA_EXTS = {
  text:  ['.txt', '.md', '.docx', '.rtf', '.pdf', '.doc', '.pages', '.odt', '.epub'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tiff', '.bmp', '.svg', '.ico'],
  video: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv'],
  data:  ['.csv', '.xml', '.json', '.orc', '.tsv', '.hdf5', '.xls', '.xlsx', '.sqlite', '.sql', '.parquet'],
  links: ['.html', '.htm', '.url'],
  presentation: ['.pptx', '.ppt', '.key', '.odp']
};

// Reverse lookup: extension → media type name
const EXT_TO_TYPE = {};
for (const [type, exts] of Object.entries(MEDIA_EXTS)) {
  for (const ext of exts) {
    EXT_TO_TYPE[ext] = type;
  }
}

// Keyword hints in filenames that suggest a media type or topic
const FILENAME_HINTS = {
  audio: ['recording', 'podcast', 'audio', 'episode', 'interview', 'song', 'track', 'music'],
  video: ['video', 'clip', 'movie', 'trailer', 'screencast', 'webinar'],
  presentation: ['slides', 'slide', 'deck', 'presentation', 'pitch', 'keynote'],
  data: ['data', 'dataset', 'report', 'spreadsheet', 'ontology', 'schema', 'table', 'log'],
  text: ['article', 'paper', 'essay', 'thesis', 'manuscript', 'chapter', 'book', 'journal', 'letter', 'memo', 'notes']
};

/**
 * Detect the media type of an item from its file extension.
 * Returns a key from MEDIA_EXTS (e.g. 'audio', 'data', 'text') or null.
 */
function detectMediaType(ext) {
  if (!ext) return null;
  return EXT_TO_TYPE[ext.toLowerCase()] || null;
}

/**
 * Extract semantic hints from a filename.
 * Returns an array of matching media type keys (e.g. ['audio', 'presentation']).
 */
function extractFilenameHints(filename) {
  if (!filename) return [];
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, ' ');
  const matches = [];
  for (const [type, keywords] of Object.entries(FILENAME_HINTS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      matches.push(type);
    }
  }
  return matches;
}

/**
 * Check if a category's mediaType rule is compatible with a detected file type.
 * Returns true if the category should be considered for this file.
 */
function isCategoryCompatible(categoryRules, detectedType, ext) {
  if (!categoryRules || !categoryRules.mediaType || categoryRules.mediaType === 'all' || categoryRules.mediaType === 'any') {
    return true; // No filter = accepts anything
  }

  const ruleType = categoryRules.mediaType.toLowerCase();

  // Direct match: rule says "audio" and file is .mp3
  if (ruleType === detectedType) return true;

  // Extension-in-list match: rule says "pdf" (legacy free-text), check if ext is in that type's list
  if (MEDIA_EXTS[ruleType] && MEDIA_EXTS[ruleType].includes(ext)) return true;

  // If rule is a bare extension like "pdf", check directly
  if (ext === '.' + ruleType) return true;

  return false;
}

function classifyLink(url, title = "", description = "") {
  const db = require('./db');
  const lowerUrl = url.toLowerCase();
  const domain = extractDomain(url);
  
  // Extract extension from URL first, then fall back to title (which is the filename for uploads)
  let ext = '';
  try {
    ext = path.extname(new URL(url, 'http://dummy.com').pathname).toLowerCase();
  } catch (e) {}
  if (!ext && title) {
    // For uploaded files, the title IS the filename (e.g. "KMS Ontology.xlsx")
    ext = path.extname(title).toLowerCase();
  }

  // 1. ADAPTIVE LEARNING LAYER (Highest Priority)
  if (domain && learnedRules[domain]) {
    const domainRules = learnedRules[domain];
    let bestCat = null, bestHits = 0;
    for (const [cat, hits] of Object.entries(domainRules)) {
      if (hits >= 2 && hits > bestHits) { bestCat = cat; bestHits = hits; }
    }
    if (bestCat) return bestCat;
  }

  // 1.5 DOMAIN SHORTCUT LAYER: Known science news outlets → Scientific News category
  // This fires AFTER adaptive learning (which can override it) but BEFORE NLP scoring.
  // If the user has renamed their "Scientific News" category, NLP will still catch it below.
  const userCats = db.getCategories() || [];
  const categoryRules = db.getSetting('category_rules') || {};

  if (userCats.length === 0) return 'Uncategorized';

  const SCIENCE_NEWS_DOMAINS = new Set([
    // User-specified outlets
    'phys.org', 'psypost.org', 'medicalxpress.com', 'sciencedaily.com',
    'scitechdaily.com', 'neurosciencenews.com', 'popularmechanics.com',
    'sciencenews.org', 'universetoday.com', 'iflscience.com',
    'thetransmitter.org', 'science.org', 'sciencealert.com', 'techxplore.com',
    'news.mit.edu', 'santafe.edu', 'physicsworld.com',
    // Other major science news sources
    'quantamagazine.org', 'newscientist.com', 'livescience.com', 'space.com',
    'popsci.com', 'discovermagazine.com', 'smithsonianmag.com',
    'arstechnica.com', 'the-scientist.com', 'cosmosmagazine.com',
    'eurekalert.org', 'aaas.org', 'statnews.com', 'chemistryworld.com',
    'futurity.org', 'zmescience.com', 'realclearscience.com',
    'huggingface.co', 'paperswithcode.com',
  ]);

  // Broad pattern match for university/institute press offices and major outlet science sections
  const SCIENCE_URL_PATTERNS = [
    /theguardian\.com\/science/, /nytimes\.com\/section\/science/,
    /bbc\.(com|co\.uk)\/news\/science/, /theatlantic\.com\/science/,
    /wired\.com/, /technologyreview\.com/, /washingtonpost\.com\/science/,
    /nationalgeographic\.com/, /scientificamerican\.com/,
    // University / research institution press pages (.edu, .ac.uk, etc.)
    /\w+\.edu\/news/, /\w+\.ac\.uk\/news/, /news\.\w+\.edu/,
    /newsroom\.\w+/, /press\.\w+/, /research\.\w+\.edu/,
  ];

  const scienceNewsCategoryName = userCats.find(c =>
    /scientific\s*news|press\s*release|science\s*news/i.test(c)
  );

  if (scienceNewsCategoryName && domain) {
    const domainMatch = SCIENCE_NEWS_DOMAINS.has(domain) || SCIENCE_NEWS_DOMAINS.has(domain.replace(/^www\./, ''));
    const patternMatch = !domainMatch && SCIENCE_URL_PATTERNS.some(p => p.test(lowerUrl));
    if (domainMatch || patternMatch) {
      console.log(`[Classifier] Domain shortcut: ${domain} → ${scienceNewsCategoryName}`);
      return scienceNewsCategoryName;
    }
  }



  // 2. FILE TYPE MATCHING (For uploaded files with clear extensions)
  const detectedType = detectMediaType(ext);
  const filenameHints = extractFilenameHints(title || url);

  if (detectedType) {
    // Find categories whose mediaType MATCHES this file's detected type
    const matchingCats = userCats.filter(cat => {
      const rules = categoryRules[cat];
      return isCategoryCompatible(rules, detectedType, ext);
    });

    // Among matching categories, prefer ones that explicitly declare this media type
    const strictMatches = matchingCats.filter(cat => {
      const rules = categoryRules[cat];
      if (!rules || !rules.mediaType) return false;
      const ruleType = rules.mediaType.toLowerCase();
      return ruleType === detectedType || (MEDIA_EXTS[ruleType] && MEDIA_EXTS[ruleType].includes(ext)) || ext === '.' + ruleType;
    });

    if (strictMatches.length === 1) {
      console.log(`[Classifier] File type match: ${ext} → ${detectedType} → ${strictMatches[0]}`);
      return strictMatches[0];
    }

    // If multiple strict matches, use filename hints to disambiguate
    if (strictMatches.length > 1 && filenameHints.length > 0) {
      for (const hint of filenameHints) {
        const hintMatch = strictMatches.find(cat => {
          const rules = categoryRules[cat];
          return rules && rules.mediaType && rules.mediaType.toLowerCase() === hint;
        });
        if (hintMatch) {
          console.log(`[Classifier] Filename hint match: "${hint}" → ${hintMatch}`);
          return hintMatch;
        }
      }
    }

    // If there's exactly one strict match category, use it
    if (strictMatches.length > 0) {
      console.log(`[Classifier] Best strict type match: ${strictMatches[0]}`);
      return strictMatches[0];
    }
  }

  // 3. HARD FILTER: Eliminate categories incompatible with this file type
  let eligibleCategories = userCats.filter(cat => {
    const rules = categoryRules[cat];
    if (!rules || !rules.mediaType || rules.mediaType === 'all' || rules.mediaType === 'any') return true;
    if (!ext && domain) return true; // URLs without extensions pass through to NLP
    const allowedExts = MEDIA_EXTS[rules.mediaType] || [];
    // Also check if the rule directly names the extension
    if (ext === '.' + rules.mediaType) return true;
    return allowedExts.includes(ext);
  });

  if (eligibleCategories.length === 0) return 'Uncategorized';
  if (eligibleCategories.length === 1) return eligibleCategories[0];

  // 4. NLP SEMANTIC SCORING (TF-IDF)
  const targetText = `${title} ${description} ${url}`;

  const filteredRules = {};
  for (const cat of eligibleCategories) {
    if (categoryRules[cat]) filteredRules[cat] = categoryRules[cat];
  }

  const scores = calculateSemanticScore(targetText, filteredRules);

  let topCategory = null;
  let topScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topCategory = cat;
    }
  }

  // 5. FILENAME HINT FALLBACK (before random first-category fallback)
  if (!topCategory || topScore === 0) {
    if (filenameHints.length > 0) {
      for (const hint of filenameHints) {
        const hintCat = eligibleCategories.find(cat => {
          const rules = categoryRules[cat];
          if (!rules || !rules.prompt) return false;
          return rules.prompt.toLowerCase().includes(hint);
        });
        if (hintCat) {
          console.log(`[Classifier] Fallback filename hint: "${hint}" → ${hintCat}`);
          return hintCat;
        }
      }
    }
  }

  if (topCategory && topScore > 0) {
    console.log(`[Classifier] NLP match: "${title}" → ${topCategory} (score: ${topScore})`);
    return topCategory;
  }

  // 6. FINAL FALLBACK: Uncategorized (NOT a random category)
  console.log(`[Classifier] No confident match for "${title || url}", marking Uncategorized`);
  return 'Uncategorized';
}

module.exports = { classifyLink, loadLearnedRules, recordCorrection, MEDIA_EXTS, EXT_TO_TYPE };
