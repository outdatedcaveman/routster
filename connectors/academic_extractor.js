const axios = require('axios');
const linkAnalyzer = require('../link_analyzer');

/**
 * Academic Paper/Book Extractor (multi-link)
 *
 * Scans a science-news page and collects ALL referenced scholarly links, typing
 * each as 'Articles' or 'Books' via link_analyzer's structural rules (DOI /
 * publisher / repository / ISBN / book repository). Results are attached as
 *   link._extracted = [{ url, title, type }]
 * so the export pipeline can fan each one out through the real Articles/Books
 * flows (Zotero + KMS Output bookmarks).
 *
 * Falls back to CrossRef / Semantic Scholar (by page title) when no explicit
 * scholarly hrefs are present, so a single underlying paper is still recovered.
 * Sets link._paperFound = false so the news page itself is NOT sent to Zotero.
 */
module.exports = {
  id: 'academic_extractor',
  name: 'Extract Academic Papers & Books',
  icon: '🎓',
  description: 'Scans a science-news page for ALL referenced papers/books (DOI, publishers, repositories, ISBN) and routes each as a conventional Article/Book. Falls back to CrossRef + Semantic Scholar.',
  category: 'processor',
  configFields: [],

  async test() { return { success: true, message: 'Multi-link extractor ready.' }; },

  async execute(link, config) {
    const originalUrl = link.url;
    const extracted = [];
    const seen = new Set();
    const add = (url, title, type) => {
      try {
        const u = new URL(url).toString();
        const key = u.replace(/\/$/, '');
        if (seen.has(key)) return;
        seen.add(key);
        extracted.push({ url: u, title: title || '', type });
      } catch (e) {}
    };

    let pageHtml = '';
    try {
      const resp = await axios.get(originalUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Routster/1.2; academic extractor)' }
      });
      pageHtml = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    } catch (e) {
      console.log(`[Academic Extractor] Could not fetch ${originalUrl}: ${e.message}`);
    }

    const originalDomain = (() => { try { return new URL(originalUrl).hostname.replace('www.', ''); } catch (e) { return ''; } })();

    if (pageHtml) {
      // Explicit DOIs anywhere on the page → Articles
      const doiRe = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/ig;
      let dm, doiCount = 0;
      while ((dm = doiRe.exec(pageHtml)) !== null && doiCount < 25) {
        add(`https://doi.org/${dm[0].replace(/[).,;]+$/, '')}`, link.title, 'Articles');
        doiCount++;
      }

      // All external hrefs → type each structurally. Strict rules keep nav/ads out.
      const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
      let hm, scanned = 0;
      while ((hm = hrefRe.exec(pageHtml)) !== null && scanned < 5000 && extracted.length < 40) {
        scanned++;
        const href = hm[1];
        if (!/^https?:\/\//i.test(href)) continue;
        try { if (new URL(href).hostname.replace('www.', '') === originalDomain) continue; } catch (e) { continue; }
        const type = linkAnalyzer.classifyStructural(href, '');
        if (type) add(href, '', type);
      }
    }

    // Fallback: nothing explicit found → recover the single underlying paper by title.
    if (extracted.length === 0) {
      const titleMeta = pageHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{10,})["']/i)
        || pageHtml.match(/<title>([^<]{10,})<\/title>/i);
      const pageTitle = (titleMeta ? titleMeta[1] : (link.title || '')).replace(/\s*[-|].*$/, '').trim();
      try {
        const params = new URLSearchParams({ query: pageTitle.substring(0, 120), rows: '3', select: 'DOI,title,score', mailto: 'routster@kms.app' });
        const cr = await axios.get(`https://api.crossref.org/works?${params}`, { timeout: 10000 });
        const items = cr.data?.message?.items || [];
        if (items.length && items[0].score > 60) add(`https://doi.org/${items[0].DOI}`, pageTitle, 'Articles');
      } catch (e) { console.log(`[Academic Extractor] CrossRef fallback: ${e.message}`); }
      if (extracted.length === 0) {
        try {
          const ssQ = encodeURIComponent((link.title || pageTitle).substring(0, 120));
          const ss = await axios.get(`https://api.semanticscholar.org/graph/v1/paper/search?query=${ssQ}&fields=title,externalIds,url&limit=3`,
            { timeout: 10000, headers: { 'User-Agent': 'Routster/1.2 mailto:routster@kms.app' } });
          const papers = ss.data?.data || [];
          if (papers.length) {
            const best = papers[0];
            const u = best.externalIds?.DOI ? `https://doi.org/${best.externalIds.DOI}`
              : best.externalIds?.ArXiv ? `https://arxiv.org/abs/${best.externalIds.ArXiv}`
              : best.url;
            if (u) add(u, best.title || pageTitle, 'Articles');
          }
        } catch (e) { console.log(`[Academic Extractor] Semantic Scholar fallback: ${e.message}`); }
      }
    }

    link._extracted = extracted.slice(0, 40);
    link._paperFound = false; // the news page itself is never sent to Zotero; the extracted papers are
    console.log(`[Academic Extractor] ${originalUrl} -> ${link._extracted.length} article/book link(s).`);
    return link._extracted.length > 0;
  }
};
