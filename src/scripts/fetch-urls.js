const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Create directories if they don't exist
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'scraped');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read URLs from file
const sourceFile = '/home/dot/ensdao/data/forumtool/waymore.txt';
const urlList = fs.readFileSync(sourceFile, 'utf-8')
  .split('\n')
  .filter(url => url.trim() !== '');

// Create a delay function to avoid overwhelming the server
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAndSaveContent(url, index) {
  try {
    console.log(`[${index + 1}/${urlList.length}] Fetching: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Parse HTML content
    const $ = cheerio.load(response.data);
    
    // Extract useful content (customize based on the website structure)
    const title = $('title').text().trim();
    const content = {
      url,
      title,
      h1: $('h1').first().text().trim(),
      metadata: {
        description: $('meta[name="description"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
      },
      mainContent: $('.topic-body').html() || $('.post').html() || $('main').html() || $('body').html(),
      dateScraped: new Date().toISOString()
    };
    
    // Create filename based on URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname.replace(/\//g, '_');
    const sanitizedFilename = `${hostname}${pathname}`.replace(/[^a-z0-9]/gi, '_').substring(0, 200);
    const outputFile = path.join(OUTPUT_DIR, `${sanitizedFilename}.json`);
    
    // Save content to file
    fs.writeFileSync(outputFile, JSON.stringify(content, null, 2));
    console.log(`Saved to ${outputFile}`);
    
    return true;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    return false;
  }
}

async function processUrls() {
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < urlList.length; i++) {
    const url = urlList[i];
    if (!url) continue;
    
    const success = await fetchAndSaveContent(url, i);
    if (success) successCount++;
    else failCount++;
    
    // Add delay between requests to be respectful
    await delay(1000);
  }
  
  console.log(`\nSummary:`);
  console.log(`Total URLs: ${urlList.length}`);
  console.log(`Successfully fetched: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

processUrls().catch(console.error); 