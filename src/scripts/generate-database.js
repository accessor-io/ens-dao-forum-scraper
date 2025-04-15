const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data', 'scraped');
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'ens-forum-content.json');

// Function to create searchable database from scraped content
async function generateDatabase() {
  // Check if data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    return;
  }

  console.log(`Reading files from: ${DATA_DIR}`);
  const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
  
  console.log(`Found ${files.length} content files`);
  
  // Initialize database structure
  const database = {
    meta: {
      totalDocuments: files.length,
      createdAt: new Date().toISOString(),
      source: 'ENS Forum'
    },
    documents: []
  };

  // Process each file
  for (const file of files) {
    try {
      const filePath = path.join(DATA_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // Extract clean text content using basic HTML stripping
      let cleanText = '';
      if (content.mainContent) {
        cleanText = content.mainContent
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Add document to database
      database.documents.push({
        url: content.url,
        title: content.title,
        h1: content.h1,
        description: content.metadata?.description || '',
        keywords: content.metadata?.keywords || '',
        content: cleanText,
        dateScraped: content.dateScraped
      });
    } catch (error) {
      console.error(`Error processing file ${file}:`, error.message);
    }
  }

  // Save database to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));
  console.log(`Database saved to: ${OUTPUT_FILE}`);
  console.log(`Total documents: ${database.documents.length}`);
}

generateDatabase().catch(console.error); 