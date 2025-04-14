const fs = require('fs');
const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

// Helper function for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    let browser;
    try {
        // Launch browser with stealth mode
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: {
                width: 1920,
                height: 1080
            },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--start-maximized'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Add error handling for navigation timeouts
        page.setDefaultNavigationTimeout(2000);
        page.setDefaultTimeout(2000);

        // Read URLs from file
        console.log('Reading URLs from waymore.txt...');
        const urlsFile = path.join(process.cwd(), 'waymore.txt');
        
        if (!fs.existsSync(urlsFile)) {
            throw new Error(`waymore.txt not found at ${urlsFile}`);
        }
        
        const fileContent = fs.readFileSync(urlsFile, 'utf8');
        console.log('File content length:', fileContent.length);
        
        const urls = fileContent
            .split('\n')
            .filter(url => url.trim() && !url.includes('/u/'))
            .map(url => url.trim());
            
        console.log(`Found ${urls.length} URLs to process`);
        console.log('First few URLs:', urls.slice(0, 3));
        
        if (urls.length === 0) {
            throw new Error('No valid URLs found in waymore.txt');
        }
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'data', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log('\nWaiting 45 seconds for you to log in manually...');
        await delay(45000);
        console.log('Starting URL processing...');

        // Process each URL
        for (let [index, url] of urls.entries()) {
            console.log(`\nProcessing URL ${index + 1}/${urls.length}: ${url}`);
            
            try {
                // Set longer timeout for navigation
                page.setDefaultNavigationTimeout(30000);
                
                // Navigate to the page and wait for it to fully load
                console.log(`Navigating to ${url}...`);
                if (index === 0) {
                    console.log('You have 30 seconds to log in on the first URL...');
                }
                await page.goto(url, { 
                    waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
                    timeout: 30000 
                });
                
                // Now set shorter timeout for content extraction
                page.setDefaultTimeout(3000);
                
                // Wait for the content to load
                console.log('Waiting for content...');
                await page.waitForSelector('.topic-post article');
                console.log('Content found, extracting...');
                
                // Wait a bit for any dynamic content
                await delay(500);
                
                const result = await page.evaluate(() => {
                    function formatTimestamp(dataTime) {
                        const date = new Date(parseInt(dataTime));
                        return date.toLocaleString();
                    }

                    function extractContent(element) {
                        let content = '';
                        element.childNodes.forEach(node => {
                            if (node.nodeType === Node.TEXT_NODE) {
                                content += node.textContent;
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.tagName === 'A') {
                                    let linkText = node.textContent;
                                    let linkHref = node.href;
                                    content += `${linkText} (${linkHref})`;
                                } else if (node.tagName === 'PRE' && node.querySelector('code')) {
                                    let codeText = node.querySelector('code').textContent;
                                    content += `\n\`\`\`\n${codeText}\n\`\`\`\n`;
                                } else if (node.tagName === 'IMG') {
                                    let altText = node.alt || 'Image';
                                    let src = node.src;
                                    content += `![${altText}](${src})`;
                                } else {
                                    content += extractContent(node);
                                }
                            }
                        });
                        return content;
                    }

                    const title = document.querySelector('.fancy-title') ? 
                        document.querySelector('.fancy-title').innerText : 'No Title Found';
                    
                    const posts = document.querySelectorAll('.topic-post article');
                    let extractedText = `=== BEGINNING OF TOPIC ===\nTitle: ${title}\n\n`;

                    posts.forEach(post => {
                        let author = post.querySelector('.names .username') ? 
                            post.querySelector('.names .username').innerText.trim() : 'Unknown Author';
                        let dateElement = post.querySelector('.relative-date');
                        let date = dateElement ? 
                            formatTimestamp(dateElement.getAttribute('data-time')) : 'Unknown Date';
                        let contentElement = post.querySelector('.cooked');
                        let content = contentElement ? 
                            extractContent(contentElement).trim() : 'No content';

                        extractedText += `Author: ${author}\nDate: ${date}\n\n${content}\n\n`;
                        extractedText += '=== END OF POST ===\n\n';
                    });

                    extractedText += '====== END OF TOPIC ======\n';
                    return { title, content: extractedText };
                });

                if (result) {
                    const safeTitle = result.title
                        .replace(/[^a-z0-9]/gi, '_')
                        .toLowerCase()
                        .substring(0, 100);
                    
                    const outputPath = path.join(outputDir, `${safeTitle}.txt`);
                    fs.writeFileSync(outputPath, result.content, 'utf8');
                    console.log(`Saved: ${outputPath}`);
                }
            } catch (error) {
                console.error(`Error processing ${url}:`, error.message);
                // Skip screenshot on error - they're causing more problems than they're worth
            }
            
            // Wait between requests to avoid overwhelming the server
            console.log('Waiting before next request...');
            await delay(3000);
        }

        console.log('All URLs processed');
    } catch (error) {
        console.error('Fatal error:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

main().catch(error => console.error('Unhandled error:', error.message)); 