const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve the UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint to load URLs from waymore.txt
app.get('/api/load-urls', (req, res) => {
    try {
        const waymoreFile = path.join(process.cwd(), 'waymore.txt');
        
        if (!fs.existsSync(waymoreFile)) {
            return res.json({
                success: false,
                error: 'waymore.txt file not found'
            });
        }
        
        const fileContent = fs.readFileSync(waymoreFile, 'utf8');
        const urls = fileContent
            .split('\n')
            .filter(url => url.trim() && !url.includes('/u/'))
            .map(url => url.trim());
        
        return res.json({
            success: true,
            urls
        });
    } catch (error) {
        console.error('Error loading URLs:', error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to scrape a URL
app.post('/api/scrape-url', async (req, res) => {
    const { url } = req.body;
    let browser;
    
    if (!url) {
        return res.json({
            success: false,
            error: 'URL is required'
        });
    }
    
    try {
        console.log(`Scraping URL: ${url}`);
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'data', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Launch headless browser with increased timeout
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            timeout: 120000 // 2 minutes timeout
        });
        
        const page = await browser.newPage();
        
        // Set user agent to appear more like a regular browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Add request interception for better handling
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            // Skip loading images, fonts, and other resources to speed up page load
            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });
        
        // Implement retry logic
        const maxRetries = 3;
        let success = false;
        let lastError;
        let content;
        let title;
        
        for (let retry = 0; retry < maxRetries && !success; retry++) {
            try {
                if (retry > 0) {
                    console.log(`Retry attempt ${retry+1}/${maxRetries} for ${url}`);
                }
                
                // First try to navigate to the domain root
                try {
                    const domainMatch = url.match(/^https?:\/\/([^\/]+)/);
                    if (domainMatch && domainMatch[0]) {
                        console.log(`Navigating to domain root: ${domainMatch[0]}`);
                        await page.goto(domainMatch[0], { 
                            waitUntil: 'domcontentloaded',
                            timeout: 30000 
                        });
                        // Wait a moment to let cookies or redirects settle
                        await page.waitForTimeout(2000);
                    }
                } catch (domainError) {
                    console.log(`Error visiting domain root: ${domainError.message}`);
                }
                
                // Navigate to URL with increased timeout and less demanding waitUntil
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded', // Less strict than networkidle0
                    timeout: 90000 // 90 seconds
                });
                
                // Wait for content with explicit timeout
                console.log(`Waiting for content to appear...`);
                await page.waitForSelector('.topic-post article', { timeout: 30000 });
                
                // Extract content
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
                    content = result.content;
                    title = result.title;
                    success = true;
                    break;
                }
            } catch (error) {
                lastError = error;
                console.error(`Error on attempt ${retry+1}: ${error.message}`);
                
                // Take screenshot on error for debugging
                try {
                    const errorScreenshot = path.join(process.cwd(), 'logs', `error-${Date.now()}.png`);
                    await page.screenshot({ path: errorScreenshot });
                    console.log(`Error screenshot saved to: ${errorScreenshot}`);
                } catch (screenshotError) {
                    console.error(`Could not take error screenshot: ${screenshotError.message}`);
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        if (success && content) {
            // Save content to file
            const safeTitle = title
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase()
                .substring(0, 100);
            
            const outputPath = path.join(outputDir, `${safeTitle}.txt`);
            fs.writeFileSync(outputPath, content, 'utf8');
            
            return res.json({
                success: true,
                title,
                content,
                outputPath
            });
        } else {
            return res.json({
                success: false,
                error: lastError ? lastError.message : 'No content found or extraction failed'
            });
        }
    } catch (error) {
        console.error('Error scraping URL:', error);
        return res.json({
            success: false,
            error: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open this URL in your browser to use the UI`);
}); 