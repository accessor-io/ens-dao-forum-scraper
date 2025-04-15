# ENS Forum Content Scraper

This tool scrapes content from ENS Forum URLs listed in the `waymore.txt` file and creates a structured database of the content.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Make sure the source file exists at:
   ```
   /home/dot/ensdao/data/forumtool/waymore.txt
   ```

## Scripts

### Fetch URLs

This script fetches and saves content from all URLs in the source file:

```bash
npm run start
```

The content from each URL is saved as a separate JSON file in the `data/scraped` directory.

### Generate Database

After fetching content from individual URLs, this script compiles everything into a single database file:

```bash
npm run generate
```

This creates a structured JSON database at `data/ens-forum-content.json`.

## Data Structure

Each scraped URL page is saved with the following structure:

```json
{
  "url": "https://discuss.ens.domains/...",
  "title": "Page title",
  "h1": "Primary heading",
  "metadata": {
    "description": "Meta description",
    "keywords": "Meta keywords"
  },
  "mainContent": "HTML content of the page",
  "dateScraped": "2023-11-15T12:34:56.789Z"
}
```

The compiled database has the following structure:

```json
{
  "meta": {
    "totalDocuments": 1000,
    "createdAt": "2023-11-15T12:34:56.789Z",
    "source": "ENS Forum"
  },
  "documents": [
    {
      "url": "https://discuss.ens.domains/...",
      "title": "Page title",
      "h1": "Primary heading",
      "description": "Meta description",
      "keywords": "Meta keywords",
      "content": "Cleaned text content",
      "dateScraped": "2023-11-15T12:34:56.789Z"
    }
  ]
}
```

## Notes

- The script uses a 1-second delay between requests to be respectful to the server
- Content scraping is focused on ENS forum structure (looking for `.topic-body` and `.post` classes)
- If scraping fails for some URLs, they will be logged but the process will continue 