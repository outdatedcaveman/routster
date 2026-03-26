const axios = require('axios');
const cheerio = require('cheerio');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const TurndownService = require('turndown');

/**
 * Fetches the URL and extracts important metadata like title and description
 */
async function fetchAndExtractMetadata(url) {
  try {
    // Add a modern user-agent to bypass basic bot blockers
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Try to get title from og:title, twitter:title, or <title>
    const title = $('meta[property="og:title"]').attr('content') 
      || $('meta[name="twitter:title"]').attr('content')
      || $('title').text()
      || '';

    // Try to get description
    const description = $('meta[property="og:description"]').attr('content')
      || $('meta[name="description"]').attr('content')
      || '';

    // Quick text scrape for advanced classification or full-text indexing later
    const firstParagraph = $('p').first().text();

    // 🌟 SCIENTIFIC NEWS METADATA HUNTER
    let paperLink = '';
    const doiRegex = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;
    
    // 1. Direct Meta Tag scraping (Gold Standard for Academic Publishers)
    const metaDoi = $('meta[name="citation_doi"]').attr('content') 
                 || $('meta[name="dc.identifier"]').attr('content')
                 || $('meta[name="prism.doi"]').attr('content');
                 
    if (metaDoi) {
      const cleanDoi = metaDoi.replace(/^doi:/i, '').trim();
      paperLink = `https://doi.org/${cleanDoi}`;
    }

    // 2. Fallback: Search organic hyperlinks
    if (!paperLink) {
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().toLowerCase();
        
        if (!href) return;
        if (href.includes('doi.org/') || href.match(doiRegex)) {
          paperLink = href.startsWith('http') ? href : `https://doi.org/${href.match(doiRegex)?.[1] || href}`;
          return false; // Break loop
        }
        if (
          (text.includes('journal') || text.includes('source') || text.includes('paper')) && 
          (href.includes('nature.com') || href.includes('science.org') || href.includes('arxiv.org') || href.includes('cell.com'))
        ) {
          paperLink = href;
          return false; // Break loop
        }
      });
    }

    // 🌟 READABILITY FULL-TEXT PARSER
    let cleanText = '';
    let markdownContent = '';
    let doc = null;
    try {
      doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();
      
      if (article && article.content) {
        cleanText = article.textContent || '';
        const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
        markdownContent = turndownService.turndown(article.content);
      }
    } catch (err) {
      console.error(`  [!] Error parsing Readability: ${err.message}`);
    } finally {
      // ⚠️ CRITICAL: JSDOM holds a cyclic reference to window and must be manually closed 
      // otherwise it cascades thousands of virtual browser objects into RAM on bulk imports, 
      // causing the exact memory/crashing behavior observed.
      if (doc && doc.window) {
        doc.window.close();
      }
    }

    return {
      success: true,
      title: title.trim(),
      description: description.trim(),
      firstParagraph: firstParagraph.trim().substring(0, 200),
      paperLink: paperLink, // Export the found deep-link
      fullText: cleanText,
      markdownBody: markdownContent
    };
  } catch (error) {
    console.error(`  [!] Error fetching ${url}: ${error.message}`);
    return {
      success: false,
      title: '',
      description: '',
      firstParagraph: '',
      fullText: '',
      markdownBody: ''
    };
  }
}

module.exports = { fetchAndExtractMetadata };
