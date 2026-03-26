# Routster

An intelligent, local-first desktop application that automatically classifies, routes, and exports your bookmarks to the right tools — Zotero for papers, Instapaper for long reads, and organized Chrome bookmark folders for everything else.

![Electron](https://img.shields.io/badge/Electron-34-blue) ![SQLite](https://img.shields.io/badge/SQLite-Local--First-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- **🧠 Adaptive Smart Classifier** — Automatically categorizes links into Articles, Books, Scientific News, Read Later, Shopping, Tools, Events, and Jobs using 60+ domain heuristics. Learns from your manual corrections and gets smarter over time.
- **📄 Absolute PDF Detection** — Any URL ending in `.pdf` is instantly routed to your academic pipeline.
- **🔬 4-Layer Paper Extraction** — For science news pages, the engine deep-scans for DOIs, academic journal links, citation sections, and `.edu` references to find the original paper behind the press release.
- **📱 Chrome Android Sync** — Save bookmarks to a `KMS Input` folder on your phone. Pull them into the app with one click when you're back at your desk.
- **🔌 Chrome Extension** — Route individual tabs or vacuum all open tabs with offline queuing (links are saved locally if the app isn't running).
- **📤 One-Click Export** — Articles/Books → Zotero, Read Later → Instapaper, everything → organized Chrome bookmark folders.
- **🛑 Panic Stop** — Safely halt massive export operations mid-execution.
- **⚡ High Performance** — Ingests 10,000+ links in milliseconds using SQLite batch transactions. No RAM exhaustion.
- **🔒 100% Local** — All data stays on your machine. No cloud accounts required (except for the export services you choose to use).

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Google Chrome](https://www.google.com/chrome/) (for the extension and Android sync)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/routster.git
cd routster

# Install dependencies (automatically installs frontend too)
npm install

# Build the frontend
npm run build:frontend

# Copy the environment template and add your credentials
cp .env.example .env
# Edit .env with your API keys (see Configuration below)

# Run the app
npm start
```

### Build a Standalone `.exe`

```bash
npm run build:exe
```

The installer will be generated in the `dist-app/` folder.

## ⚙️ Configuration

All credentials are stored in a local `.env` file (never committed to Git). You can also configure them through the app's built-in Settings panel.

| Service | Required? | How to Get Credentials |
| --- | --- | --- |
| **Zotero** | Recommended | [Create API key](https://www.zotero.org/settings/keys) — enable write access |
| **Instapaper** | Optional | Your Instapaper email/password |
| **Notion** | Optional | [Create integration](https://www.notion.so/my-integrations) |
| **Obsidian** | Optional | Path to your vault's Inbox folder |
| **Paperpile** | Optional | Path to your Google Drive Paperpile sync folder |

## 📱 Chrome Extension Setup

1. Open `chrome://extensions` in Google Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repository
5. The Routster icon will appear in your toolbar

### Offline Resilience

If you capture links while the desktop app isn't running, they're stored in the extension's local storage and automatically synced when the app comes back online.

## 📲 Android Chrome Workflow

1. On your Android phone, create a bookmark folder called exactly **`KMS Input`**
2. Save any tabs you want to process into this folder
3. On your desktop, open Chrome (bookmarks sync automatically)
4. In the Routster app, click **🔄 Pull 'KMS Input' from Mobile Chrome**
5. Your links appear instantly, classified and ready for export

## 🗂️ Export Pipeline

| Category | Export Target | KMS Output Folder |
| --- | --- | --- |
| Article/PDF | Zotero | `Articles` |
| Book | Zotero | `Books` |
| Scientific News | Zotero (after paper extraction) | `Articles` |
| Read Later | Instapaper | `Read It Later` |
| Shopping | Bookmark backup | `Shopping` |
| Tool/App/Service | Bookmark backup | `Tools` |
| Event/Theater | Bookmark backup | `Events` |
| Job Listing | Bookmark backup | `Opportunities` |

## 🧠 Adaptive Learning

Every time you manually correct a link's category, the system remembers. After 2 corrections from the same domain, future links from that domain are automatically routed to your preferred category — permanently, across reboots.

## 🏗️ Architecture

```text
┌──────────────────┐     ┌───────────────┐     ┌──────────────┐
│ Chrome Extension │────▶│               │     │   Zotero     │
│ (Desktop/Mobile) │     │   Routster    │────▶│   Instapaper │
│                  │◀────│  (localhost)  │     │   Notion     │
└──────────────────┘     │               │     └──────────────┘
                         │  SQLite + AI  │
┌──────────────────┐     │  Classifier   │     ┌──────────────┐
│  HTML Bookmark   │────▶│               │────▶│ KMS Output   │
│  File Upload     │     └───────────────┘     │ (Bookmarks)  │
└──────────────────┘                           └──────────────┘
```

## 📄 License

MIT — use it, fork it, make it yours.

## 🤝 Contributing

Pull requests welcome! If you add new domain heuristics to the classifier or new export integrations, please include test cases.
