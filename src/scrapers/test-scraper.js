const fs = require('fs');
const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

// Helper function for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    let browser;
    let page;
    try {
        // Launch browser with stealth mode using system Chrome
        browser = await puppeteer.launch({
            headless: false,
            executablePath: '/usr/bin/google-chrome', // Use system Chrome
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
        
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Add error handling for navigation timeouts
        page.setDefaultNavigationTimeout(120000); // 2 minutes timeout for navigation
        page.setDefaultTimeout(120000); // 2 minutes timeout for other operations

        // Read URLs from file
        console.log('Reading URLs from test-urls.txt...');
        const urlsFile = path.join(process.cwd(), 'test-urls.txt');
        
        if (!fs.existsSync(urlsFile)) {
            throw new Error(`test-urls.txt not found at ${urlsFile}`);
        }
        
        const fileContent = fs.readFileSync(urlsFile, 'utf8');
        console.log('File content length:', fileContent.length);
        
        const urls = fileContent
            .split('\n')
            .filter(url => url.trim() && !url.includes('/u/'))
            .map(url => url.trim());
            
        console.log(`Found ${urls.length} URLs to process`);
        console.log('URLs:', urls);
        
        if (urls.length === 0) {
            throw new Error('No valid URLs found in test-urls.txt');
        }
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'data', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log('Starting URL processing immediately...');

        // Process each URL
        for (let [index, url] of urls.entries()) {
            console.log(`\nProcessing URL ${index + 1}/${urls.length}: ${url}`);
            
            try {
                // Navigate to the page and wait for it to fully load
                console.log(`Navigating to ${url}...`);
                await page.goto(url, { 
                    waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
                    timeout: 120000 // 2 minutes timeout for navigation
                });
                
                // Give time to log in if needed
                if (index === 0) {
                    console.log('Page loaded. You have 3 minutes to log in if needed...');
                    await delay(180000); // 3 minutes for login after page loads
                    console.log('Login time completed, continuing with extraction...');
                }
                
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
                    
                    const outputPath = path.join(outputDir, `test_${safeTitle}.txt`);
                    fs.writeFileSync(outputPath, result.content, 'utf8');
                    console.log(`Saved: ${outputPath}`);
                }
            } catch (error) {
                console.error(`Error processing ${url}:`, error.message);
                // Take screenshot on error for debugging
                const screenshotPath = path.join(process.cwd(), 'logs', `error-${Date.now()}.png`);
                await page.screenshot({
                    path: screenshotPath,
                    fullPage: true
                });
                console.error(`Screenshot saved to: ${screenshotPath}`);
            }
            
            // Wait between requests 
            console.log('Waiting before next request...');
            await delay(1000); // Shorter delay for testing
        }

        console.log('All URLs processed');
    } catch (error) {
        console.error('Fatal error:', error.message);
        // Take screenshot on fatal error
        const screenshotPath = path.join(process.cwd(), 'logs', `fatal-error-${Date.now()}.png`);
        if (page) {
            await page.screenshot({
                path: screenshotPath,
                fullPage: true
            });
            console.error(`Screenshot saved to: ${screenshotPath}`);
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

main().catch(error => console.error('Unhandled error:', error.message)); 