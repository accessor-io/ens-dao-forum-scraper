const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const multer = require('multer');
const { spawn } = require('child_process');

// Set up file upload using multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(process.cwd(), 'data'));
    },
    filename: function (req, file, cb) {
        cb(null, 'imported-urls.txt');
    }
});
const upload = multer({ storage: storage });

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

// New API endpoint to import URLs from a file
app.post('/api/import-urls', upload.single('urlFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({
                success: false,
                error: 'No file uploaded'
            });
        }
        
        const filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const urls = fileContent
            .split('\n')
            .filter(url => url.trim() && !url.includes('/u/'))
            .map(url => url.trim());
        
        // Merge with existing waymore.txt or create a new one
        const waymoreFile = path.join(process.cwd(), 'waymore.txt');
        let existingUrls = [];
        
        if (fs.existsSync(waymoreFile)) {
            existingUrls = fs.readFileSync(waymoreFile, 'utf8')
                .split('\n')
                .filter(url => url.trim() && !url.includes('/u/'))
                .map(url => url.trim());
        }
        
        // Combine and remove duplicates
        const combinedUrls = [...new Set([...existingUrls, ...urls])];
        
        // Write back to waymore.txt
        fs.writeFileSync(waymoreFile, combinedUrls.join('\n'), 'utf8');
        
        return res.json({
            success: true,
            message: `Added ${urls.length} URLs. Waymore.txt now has ${combinedUrls.length} URLs.`,
            urls: combinedUrls
        });
    } catch (error) {
        console.error('Error importing URLs:', error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// New API endpoint to run WayMore and only grab URLs
app.post('/api/run-waymore', (req, res) => {
    try {
        const { urls } = req.body;
        
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.json({
                success: false,
                error: 'No URLs provided'
            });
        }
        
        // Create a temporary file to hold the URLs
        const tempFile = path.join(process.cwd(), 'data', 'waymore-input.txt');
        fs.writeFileSync(tempFile, urls.join('\n'), 'utf8');
        
        // Run WayMore command to only grab URLs without downloading
        const waymoreProcess = spawn('python3', [
            '-m', 'waymore',
            '-i', tempFile,
            '-mode', 'urls-only',
            '-oU', path.join(process.cwd(), 'waymore.txt')
        ]);
        
        let output = '';
        let errorOutput = '';
        
        waymoreProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log(data.toString());
        });
        
        waymoreProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(data.toString());
        });
        
        waymoreProcess.on('close', (code) => {
            if (code === 0) {
                // Successfully ran WayMore, now read the output file
                try {
                    const waymoreFile = path.join(process.cwd(), 'waymore.txt');
                    
                    if (fs.existsSync(waymoreFile)) {
                        const fileContent = fs.readFileSync(waymoreFile, 'utf8');
                        const newUrls = fileContent
                            .split('\n')
                            .filter(url => url.trim() && !url.includes('/u/'))
                            .map(url => url.trim());
                        
                        return res.json({
                            success: true,
                            message: `WayMore found ${newUrls.length} URLs`,
                            urls: newUrls
                        });
                    } else {
                        return res.json({
                            success: false,
                            error: 'WayMore ran but no output file was found'
                        });
                    }
                } catch (readError) {
                    return res.json({
                        success: false,
                        error: readError.message
                    });
                }
            } else {
                return res.json({
                    success: false,
                    error: `WayMore failed with code ${code}. Error: ${errorOutput}`
                });
            }
        });
    } catch (error) {
        console.error('Error running WayMore:', error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint to scrape a URL
app.post('/api/scrape-url', async (req, res) => {
    const { url, skipWaiting } = req.body;
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
        
        // Launch headless browser with optimized settings
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--js-flags=--max-old-space-size=2048' // Increase memory limit
            ],
            timeout: 60000 // Reduced timeout to 1 minute
        });
        
        const page = await browser.newPage();
        
        // Set user agent to appear more like a regular browser
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Block unnecessary resources to speed up loading
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            // Skip loading images, fonts, stylesheets and other resources to speed up page load
            const blockedResourceTypes = ['image', 'stylesheet', 'font', 'media', 'other'];
            if (blockedResourceTypes.includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });
        
        let success = false;
        let lastError;
        let content;
        let title;
        
        try {
            // Navigate directly to URL with reduced timeout
            await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 30000 // 30 seconds
            });
            
            // Either wait for content or proceed immediately based on skipWaiting parameter
            if (!skipWaiting) {
                console.log(`Waiting for content to appear...`);
                try {
                    await page.waitForSelector('.topic-post article', { timeout: 15000 });
                } catch (waitError) {
                    console.log(`Selector wait timed out, proceeding anyway: ${waitError.message}`);
                    // Continue anyway after timeout
                }
            } else {
                // Give a short delay for basic rendering
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Extract content
            const result = await page.evaluate(() => {
                function formatTimestamp(dataTime) {
                    try {
                        const date = new Date(parseInt(dataTime));
                        return date.toLocaleString();
                    } catch (e) {
                        return 'Unknown Date';
                    }
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

                // If no posts found, try to extract whatever content is available
                if (posts.length === 0) {
                    const mainContent = document.querySelector('main') || document.querySelector('body');
                    if (mainContent) {
                        extractedText += `Content extracted from page:\n\n${mainContent.innerText}\n\n`;
                    } else {
                        extractedText += `No structured content found on this page.\n\n`;
                    }
                } else {
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
                }

                extractedText += '====== END OF TOPIC ======\n';
                return { title, content: extractedText };
            });
            
            if (result) {
                content = result.content;
                title = result.title || 'No Title Found';
                success = true;
            }
        } catch (error) {
            lastError = error;
            console.error(`Error scraping: ${error.message}`);
            
            // Take screenshot on error for debugging
            try {
                const errorScreenshot = path.join(process.cwd(), 'logs', `error-${Date.now()}.png`);
                await page.screenshot({ path: errorScreenshot });
                console.log(`Error screenshot saved to: ${errorScreenshot}`);
            } catch (screenshotError) {
                console.error(`Could not take error screenshot: ${screenshotError.message}`);
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
                outputPath,
                filepath: outputPath
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

// New API endpoint to download scraped content
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(process.cwd(), 'data', 'output', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        
        res.download(filePath);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send('Error downloading file');
    }
});

// Add a new API endpoint for downloading HTML
app.post('/api/download-html', async (req, res) => {
    const { urls, indices } = req.body;
    let browser;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.json({
            success: false,
            error: 'No valid URLs provided'
        });
    }
    
    try {
        // Create output directory for HTML files
        const outputDir = path.join(process.cwd(), 'data', 'html');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-web-security'
            ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        // Process URLs
        const results = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`Downloading HTML for: ${url}`);
            
            try {
                // Navigate to URL
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000 
                });
                
                // Get the HTML content
                const html = await page.content();
                
                // Create filename based on URL
                const urlObj = new URL(url);
                const filename = `${urlObj.hostname.replace(/\./g, '_')}_${urlObj.pathname.replace(/\//g, '_')}.html`;
                const filePath = path.join(outputDir, filename);
                
                // Save HTML to file
                fs.writeFileSync(filePath, html);
                
                results.push({
                    url,
                    success: true,
                    filename
                });
                
                console.log(`Saved HTML for ${url} to ${filename}`);
            } catch (error) {
                console.error(`Error downloading HTML for ${url}: ${error.message}`);
                results.push({
                    url,
                    success: false,
                    error: error.message
                });
            }
            
            // Wait a moment before the next request
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return res.json({
            success: true,
            outputDir,
            results
        });
    } catch (error) {
        console.error('Error in bulk HTML download:', error);
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