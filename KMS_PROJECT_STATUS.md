(# KMS Auto-Router: Project Status & Log

*This file serves as our centralized memory and project tracker. No matter where a conversation starts, we refer here for our source of truth.*

## Current Architecture

- **Data Capture**: Chrome Extension & Android PWA (to be finalized) sending links to our backend.
- **Backend Service (The Brain)**: `server.js` acting as the main ingest endpoint, backed by `fetcher.js` to scrape URL content, `classifier.js` to determine intent, and `router.js`/`export-engine.js` to push to third-party tools.
- **Integrations**: Zotero, Notion, Instapaper, Obsidian (via Drive synced markdown), Paperpile.

## Completed Work

1. **Core API Server (`server.js`)**: Endpoints available for bookmark ingestion and credential injection. Protected with strict CORS (allowing only `chrome-extension://` and `file://`) to prevent local data exfiltration.
2. **Persistent Local Database (`db.js`)**: Swapped out the in-memory array with an SQLite backend (`better-sqlite3`) utilizing WAL mode for robust asynchronous tracking on the desktop.
3. **Metadata Fetcher (`fetcher.js`)**: Extracts basic OG tags, title, description, and actively hunts for DOIs embedded in scientific news articles/press releases (`paperLink`). **(UPDATED: Now includes Mozilla Readability and Turndown to extract full, clean article markdown).**
4. **Classification Engine (`classifier.js`)**: Basic heuristic & keyword mapping to match URLs against our ontology (Articles, GitHub, Shopping, etc.).
5. **Export Engine (`export-engine.js`)**: Outbound HTTP clients fully wired up for Notion, Zotero (includes CrossRef automatic DOI enrichment and specific folder targeting), Instapaper. Also handles full-text local file generation for Obsidian and Paperpile RIS files. *(UPDATED: Includes a Universal Backup Mirror that drops every exported item into a `KMS_Mirror/kms_universal_backup.jsonl` file in Google Drive for offline/anytime access).*
6. **Chrome Extension (`extension/`)**: Instantly ingests targeted pages. *(UPDATED: Natively captures "Shopping" items and injects them directly into the browser's bookmark tree under `KMS Shopping` so they remain 'always online' via Chrome Sync).*

## Pending Work & Next Steps

- **Polish & Testing**: The system is structurally complete. Final step is to boot the Electron app (`npm start`), test the full pipeline (Extension -> Backend -> SQLite -> Obisidian/Notion/Zotero), and confirm edge cases work as expected.

## Log

* **2026-03-24**: Initial architecture plan formed. Core backend engines (fetcher, classifier, exporter) scaffolded out. Focus on scientific press release link scraping for DOIs.
- **2026-03-25**: Project status centralized to this file. Overhauled Zotero integration with Crossref DOI enrichment and Folder Targeting. Integrated Mozilla Readability + JSDOM to extract full text of pages into clean Markdown for Obsidian/Notion. Swapped from in-memory arrays to persistent SQLite Database (`db.js`). Patched a critical CORS local-exfiltration vulnerability. Upgraded Chrome Extension with native `chrome.bookmarks` synchronization for 'always online' Shopping categories. Wired up a Universal Google Drive JSONL mirror backup for all exported records.
