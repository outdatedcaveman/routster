/**
 * A fast, heuristic-based classifier for URLs and page metadata.
 * Now with an adaptive learning layer that improves from user corrections.
 */

let learnedRules = {}; // { domain: { category: count } } — loaded from SQLite at boot

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
    loadLearnedRules(dbModule); // Hot-reload into memory
    console.log(`[Classifier] Learned: ${domain} → ${newCategory}`);
  } catch (e) {}
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } 
  catch { return ''; }
}

function classifyLink(url, title = "", description = "") {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const domain = extractDomain(url);

  // ★ ADAPTIVE LEARNING LAYER (Highest Priority)
  // If the user has corrected links from this domain 2+ times to the same category, trust it instantly.
  if (domain && learnedRules[domain]) {
    const domainRules = learnedRules[domain];
    let bestCategory = null;
    let bestHits = 0;
    for (const [cat, hits] of Object.entries(domainRules)) {
      if (hits >= 2 && hits > bestHits) {
        bestCategory = cat;
        bestHits = hits;
      }
    }
    if (bestCategory) return bestCategory;
  }

  // 0. ABSOLUTE PDF OVERRIDE
  if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?') || lowerUrl.includes('.pdf#')) {
    return 'Article/PDF';
  }

  // 1. ACADEMIC BOOKS OVERRIDE
  if (lowerUrl.includes('amazon.com') || lowerUrl.includes('barnesandnoble.com') || lowerUrl.includes('routledge.com') || lowerUrl.includes('/dp/') || lowerUrl.includes('hup.harvard.edu') || lowerUrl.includes('cup.cam.ac.uk') || lowerUrl.includes('oup.com') || lowerUrl.includes('cambridge.org') || lowerUrl.includes('press.princeton.edu') || lowerUrl.includes('mitpress.mit.edu') || lowerUrl.includes('yalebooks.yale.edu') || lowerUrl.includes('press.uchicago.edu')) {
     if (lowerTitle.includes(': book') || lowerTitle.includes('hardcover') || lowerTitle.includes('paperback') || lowerTitle.includes('isbn') || lowerDesc.includes('isbn') || lowerDesc.includes('pages')) {
         return 'Book';
     }
  }

  // 2. ARTICLES, SCIENTIFIC PUBLISHERS, & REPOSITORIES
  const academicDomains = [
    'elsevier.com', 'sciencedirect.com', 'taylorandfrancis.com', 'tandfonline.com', 'pnas.org',
    'arxiv.org', 'nature.com', 'aslonline.org', 'nih.gov', 'nsf.gov', 'plos.org',
    'biorxiv.org', 'medrxiv.org', 'science.org', 'academia.edu', 'philsci-archive.pitt.edu',
    'philpapers.org', 'nber.org', 'jstor.org', 'cambridge.org/core', 'semanticweb.org',
    'journals.sagepub.com', 'aps.org', 'thelancet.com', 'ssrn.com', 'hup.harvard.edu', 'cup.org',
    'global.oup.com', 'academic.oup.com', 'researchgate.net', 'scholar.google.com',
    'doi.org', 'springer.com', 'wiley.com', 'ieee.org', 'acm.org', 'frontiersin.org',
    'mdpi.com', 'hindawi.com', 'cell.com', 'bmj.com', 'nejm.org', 'jamanetwork.com',
    'scopus.com', 'webofscience.com', 'pubmed.ncbi.nlm.nih.gov', 'projectmuse.jhu.edu',
    'mitpressjournals.org', 'brill.com', 'degruyter.com', 'emerald.com', 'karger.com',
    'thieme-connect.com', 'apa.org/pubs', 'iop.org', 'rsc.org', 'acs.org', 'aip.org',
    'osf.io', 'zenodo.org', 'figshare.com', 'dryad.org', 'hal.science'
  ];
  if (academicDomains.some(d => lowerUrl.includes(d)) || lowerUrl.endsWith('.edu') || lowerUrl.includes('.edu/') || lowerTitle.includes('preprint') || lowerTitle.includes('peer-reviewed')) {
    return 'Article/PDF';
  }

  // 3. SCIENTIFIC NEWS / PRESS RELEASES
  const sciNewsDomains = [
    'phys.org', 'scitechdaily.com', 'eurekalert.org', 'sciencedaily.com',
    'neurosciencenews.com', 'medicalxpress.com', 'iflscience.com', 'psypost.org',
    'physicsworld.com', 'sciencealert.com', 'nationalgeographic.com',
    'popularmechanics.com', 'hub.jhu.edu', 'news.mit.edu', 'discovermagazine.com',
    'scientificamerican.com', 'simonsfoundation.org', 'aaas.org', 'smithsonianmag.com',
    'quantamagazine.org', 'newscientist.com', 'livescience.com',
    'huggingface.co', 'techcrunch.com/tag/ai', 'technologyreview.com',
    'spectrum.ieee.org', 'the-decoder.com', 'venturebeat.com/ai'
  ];
  if (sciNewsDomains.some(d => lowerUrl.includes(d)) || lowerUrl.includes('/press-release/')) {
    return 'Scientific News/Press Release';
  }

  // 4. READ LATER (Long-form journalism, philosophy, & deep blogs)
  const readLaterDomains = [
    'aeon.co', 'newyorker.com', 'theatlantic.com', 'substack.com', 'noemamag.com',
    'wired.com', 'medium.com', '.blog', '/blog/', 'slatestarcodex', 'astralcodexten',
    'lesswrong.com', 'nybooks.com', 'lrb.co.uk', 'harpers.org', 'nautil.us',
    'laphamscquarterly.org', 'bostonreview.net', 'foreignaffairs.com', 'economist.com',
    'wsj.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
    'prospectmagazine.co.uk', 'logicmag.io', 'stratechery.com', 'ribbonfarm.com',
    'iai.tv', 'psychologytoday.com', 'philosophynow.org', 'plato.stanford.edu',
    'theparisreview.org', 'lithub.com', 'aldaily.com', 'openculture.com'
  ];
  if (readLaterDomains.some(d => lowerUrl.includes(d))) {
    return 'Instapaper/Read Later';
  }

  // 5. TOOLS, APPS, SERVICES
  if (lowerUrl.includes('github.com') || lowerUrl.includes('gitlab.com') || lowerUrl.includes('npmjs.com') || lowerUrl.includes('docker.com') || lowerUrl.includes('stackoverflow.com')) {
    return 'Tool/App/Service';
  }

  // 6. SHOPPING (Commerce that failed the Book test)
  if (lowerUrl.includes('amazon.com') || lowerUrl.includes('ebay.com') || lowerUrl.includes('bestbuy.com') || lowerUrl.includes('target.com') || lowerUrl.includes('walmart.com') || lowerUrl.includes('/product/') || lowerUrl.includes('/dp/') || lowerUrl.includes('store.')) {
    return 'Shopping';
  }

  // 7. JOBS (Strict: URL-based only, no loose title matching)
  const jobDomains = ['greenhouse.io', 'lever.co', 'linkedin.com/jobs', 'indeed.com', 'workday.com', 'glassdoor.com', 'angel.co/jobs', 'wellfound.com'];
  if (jobDomains.some(d => lowerUrl.includes(d)) || lowerUrl.includes('/careers/') || lowerUrl.includes('/jobs/')) {
    return 'Job Listing';
  }

  // 8. EVENTS
  if (lowerUrl.includes('eventbrite.com') || lowerUrl.includes('meetup.com') || lowerUrl.includes('ticketmaster.com') || lowerUrl.includes('/events/')) {
    return 'Event/Theater';
  }

  // Default fallback
  return 'Instapaper/Read Later';
}

module.exports = { classifyLink, loadLearnedRules, recordCorrection };

