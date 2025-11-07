# AI Atlas - AIToolVerse.ai

<div align="center">
  
![AIToolVerse Banner](https://github.com/user-attachments/assets/74a3fe74-376e-414a-b900-ecc1d8c5f97a)

### 🌟 Endless AI Tools. Infinite Possibilities. 🌟

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE-MIT)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE-APACHE)
[![GitHub stars](https://img.shields.io/github/stars/dileepkumarnie1/AI-Atlas?style=social)](https://github.com/dileepkumarnie1/AI-Atlas/stargazers)

</div>

---

## 📖 About AIToolVerse.ai

**AIToolVerse.ai** is a comprehensive platform that curates and showcases **400+ AI tools** across multiple domains. Whether you're looking for AI tools for content creation, development, design, or productivity, AIToolVerse provides a centralized discovery platform to explore the best AI has to offer.

### 🎯 Mission

To create an endless catalog of AI tools with infinite possibilities, making it easier for developers, creators, and businesses to discover and leverage cutting-edge AI technologies.

---

## ✨ Features

### 🔍 **Smart Discovery**
- **400+ Curated AI Tools** across diverse domains
- **Domain-based Organization** - Browse tools by category (Video, Audio, Text, Code, Design, and more)
- **Most Popular Tools** - Featured section highlighting trending AI solutions
- **Advanced Search** - Find tools by name, tag, or description
- **Smart Filtering** - Refine results based on your specific needs

### 🎨 **User Experience**
- **Modern UI/UX** - Clean, intuitive interface with smooth animations
- **Dark/Light Mode** - Theme toggle for comfortable browsing
- **Favorites System** - Save and manage your preferred tools
- **Responsive Design** - Seamless experience across all devices
- **Real-time Updates** - Regular tool additions and popularity rankings

### 📊 **Popularity & Rankings**
- **Dynamic Popularity Metrics** - Computed from GitHub stars, npm downloads, and user engagement
- **Trending Tools** - Stay updated with the latest AI innovations
- **User Count Display** - See adoption rates for each tool
- **Automated Updates** - Daily refresh of popularity data

### 🤖 **Automated Pipelines**
- **Tool Discovery** - Automated scanning and proposal of new AI tools every 3 days
- **Popularity Refresh** - Daily updates to ensure accurate rankings
- **Quality Control** - Security scanning and reliability checks for all tools
- **Non-product Archival** - Maintains catalog quality by archiving non-products

---

## 🚀 Quick Start

### Visit the Live Site
🌐 **[AIToolVerse.ai](https://aitoolverse.ai)** - Start exploring 400+ AI tools now!

### Local Development

```bash
# Clone the repository
git clone https://github.com/dileepkumarnie1/AI-Atlas.git
cd AI-Atlas

# Install dependencies
npm install

# Run locally (static server)
npx serve .
```

The site will be available at `http://localhost:3000`

---

## 🗂️ Project Structure

```
AI-Atlas/
├── index.html              # Main application entry point
├── public/
│   ├── tools.json          # AI tools catalog
│   ├── popularity.json     # Popularity counts
│   └── popularity_ranks.json # Ranking data
├── scripts/
│   ├── discover-tools.mjs  # Automated tool discovery
│   ├── update-popularity.mjs # Popularity updater
│   └── export-tools.mjs    # Firestore exporter
├── data/
│   ├── tools-sources.json  # Tool metadata sources
│   ├── discovery-sources.json # Discovery configuration
│   └── popularity-overrides.json # Manual popularity overrides
└── images/                 # Project assets and logos
```

---

## 🔧 Key Workflows

### 1️⃣ **Popularity Updates** (Daily)
Automatically computes tool popularity based on:
- GitHub stars and forks
- npm weekly downloads  
- User engagement metrics
- Manual overrides for verified user counts

```bash
npm run update:popularity
```

### 2️⃣ **Tool Discovery** (Every 3 Days)
Scans multiple sources for new trending AI tools:
- GitHub trending repositories
- npm package registry
- Hacker News discussions
- Domain-specific AI filters

```bash
npm run discover:tools
```

### 3️⃣ **Firestore Export** (On-Demand)
Syncs approved tools from Firestore to static JSON:

```bash
npm run export:tools
```

---

## 🛡️ Security & Quality

- **Reliability Checks** - Automated spam/scam detection
- **Link Verification** - HTTPS and integrity validation
- **Google Safe Browsing** - Optional URL safety checks
- **GitHub Exclusion Policy** - Filters non-web tools automatically
- **CodeQL Scanning** - Security vulnerability detection
- **Duplicate Prevention** - Advanced normalization and alias mapping

---

## 📊 Data Sources

AIToolVerse aggregates data from multiple trusted sources:

- **GitHub** - Repository metrics and trending projects
- **npm** - Package downloads and popularity
- **Hacker News** - Community discussions and trends
- **Aixploria** - Curated AI tool categories
- **Manual Curation** - Expert-reviewed additions

---

## 🎯 Domain Coverage

AIToolVerse organizes tools across key domains:

- 🎥 **Video Tools** - AI video generation, editing, and enhancement
- 🎵 **Audio Tools** - Music generation, voice synthesis, and audio processing
- ✍️ **Text & Writing** - Content generation, copywriting, and editing
- 💻 **Code & Development** - Programming assistants, code generation, debugging
- 🎨 **Design & Creative** - Image generation, design automation, creative tools
- 📊 **Productivity** - Workflow automation, task management, analytics
- 🔬 **Research** - Data analysis, academic tools, knowledge management
- And many more...

---

## 👥 Contributing

We welcome contributions! Here's how you can help:

1. **Submit New Tools** - Propose AI tools via the Submit Tool feature
2. **Report Issues** - Found a bug or broken link? Open an issue
3. **Improve Documentation** - Help make our docs better
4. **Code Contributions** - Submit pull requests for features or fixes

See our [Code of Conduct](CODE_OF_CONDUCT.md) for community guidelines.

---

## 📜 License

This project is dual-licensed under:

- **MIT License** - See [LICENSE-MIT](LICENSE-MIT)
- **Apache License 2.0** - See [LICENSE-APACHE](LICENSE-APACHE)

You may choose either license for your use of this software.

---

## 🔗 Links

- **Website**: [AIToolVerse.ai](https://aitoolverse.ai)
- **GitHub**: [dileepkumarnie1/AI-Atlas](https://github.com/dileepkumarnie1/AI-Atlas)
- **Issues**: [Report a Bug](https://github.com/dileepkumarnie1/AI-Atlas/issues)
- **Discussions**: [Join the Conversation](https://github.com/dileepkumarnie1/AI-Atlas/discussions)

---

## 🙏 Acknowledgments

Special thanks to:
- The open-source community for their invaluable tools and libraries
- All contributors who help maintain and improve this catalog
- AI tool developers who continue to push the boundaries of innovation

---

## 📧 Contact

For questions, suggestions, or partnerships:
- **GitHub Issues**: [Create an issue](https://github.com/dileepkumarnie1/AI-Atlas/issues)
- **GitHub Discussions**: [Start a discussion](https://github.com/dileepkumarnie1/AI-Atlas/discussions)

---

<div align="center">

### ⭐ Star this repo if you find it useful!

**Made with ❤️ for the AI community**

</div>
