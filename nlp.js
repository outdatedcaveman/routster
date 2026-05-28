/**
 * Routster NLP Engine
 * A lightweight, zero-dependency engine for semantic text classification and categorization based on user prompts.
 */

// Tokenize text into an array of lowercase alphanumeric words, ignoring common stop words
function tokenize(text) {
  if (!text) return [];
  const rawWords = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const stopWords = new Set(['the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'to', 'for', 'it', 'with', 'as', 'by', 'this', 'that']);
  return rawWords.filter(w => w.length > 2 && !stopWords.has(w));
}

// Calculate term frequency for a document
function getTermFrequency(tokens) {
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  return tf;
}

// Calculate Inverse Document Frequency across all category prompts
function getIDF(corpusTokensDict) {
  const idf = {};
  const numDocs = Object.keys(corpusTokensDict).length;
  if (numDocs === 0) return idf;

  const docFreq = {};
  for (const catTokens of Object.values(corpusTokensDict)) {
    const uniqueTokens = new Set(catTokens);
    for (const token of uniqueTokens) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }
  }

  for (const [token, count] of Object.entries(docFreq)) {
    idf[token] = Math.log(numDocs / count); // Standard IDF formula
  }

  return idf;
}

/**
 * Calculates a similarity score (0 to 100) based on how closely an incoming document 
 * matches the description/prompt of a specific category using TF-IDF dot products.
 */
function calculateSemanticScore(targetText, categoryRules) {
  const scores = {};
  
  // 1. Build the corpus dictionaries mapping categoryName -> tokens of its prompt
  const corpusDict = {};
  for (const [catName, rule] of Object.entries(categoryRules)) {
    if (rule.prompt && rule.prompt.trim()) {
      corpusDict[catName] = tokenize(rule.prompt);
    }
  }
  
  // If there are no category prompts defined anywhere, return zeroes
  if (Object.keys(corpusDict).length === 0) return scores;

  // 2. Identify the target text frequencies
  const targetTokens = tokenize(targetText);
  if (targetTokens.length === 0) return scores;
  
  const targetTf = getTermFrequency(targetTokens);
  const idf = getIDF(corpusDict);

  // 3. Score against each category using TF-IDF weights mapped to dot product
  for (const [catName, catTokens] of Object.entries(corpusDict)) {
    const catTf = getTermFrequency(catTokens);
    
    let dotProduct = 0;
    let targetMagnitude = 0;
    let catMagnitude = 0;

    // We only care about words that exist in the category prompt
    const uniqueVocabulary = new Set([...Object.keys(targetTf), ...Object.keys(catTf)]);
    
    for (const word of uniqueVocabulary) {
      const weight = idf[word] || 1; // Default IDF if word only appears here
      
      const tVal = (targetTf[word] || 0) * weight;
      const cVal = (catTf[word] || 0) * weight;
      
      dotProduct += (tVal * cVal);
      targetMagnitude += (tVal * tVal);
      catMagnitude += (cVal * cVal);
    }
    
    targetMagnitude = Math.sqrt(targetMagnitude);
    catMagnitude = Math.sqrt(catMagnitude);

    let similarity = 0;
    if (targetMagnitude > 0 && catMagnitude > 0) {
      similarity = dotProduct / (targetMagnitude * catMagnitude);
    }
    
    scores[catName] = Math.floor(similarity * 100);
  }

  return scores;
}

module.exports = { calculateSemanticScore, tokenize };
