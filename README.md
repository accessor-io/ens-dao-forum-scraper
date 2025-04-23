# ENS Forum Scraper

A tool for scraping and processing content from ENS forums.

## Project Structure

```
.
├── data/           # Data storage directory
│   └── output/     # Scraped data output
├── src/            # Source code
│   └── scrapers/   # Scraper scripts
└── logs/           # Log files
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Make sure you have the required URLs in a `waymore.txt` file.

## Usage

### Simple Scraper

Run the standard scraper:

```
npm run ui
```
### Bookmarklet

A bookmarklet is also available for manual scraping:

1. Create a new bookmark in your browser
2. Set the name to "ENS Forum Scraper"
3. Copy the content of `src/scrapers/bookmarklet.js` as the URL
4. Navigate to the forum page you want to scrape
5. Click the bookmarklet

## Output

Scraped data is saved in the `data/output` directory in text format with the following structure:

```
=== BEGINNING OF TOPIC ===
Title: [Topic Title]

Author: [Author Name]
Date: [Post Date]

[Post Content]

=== END OF POST ===

Author: [Reply Author]
Date: [Reply Date]

[Reply Content]

=== END OF POST ===

====== END OF TOPIC ======
``` 
