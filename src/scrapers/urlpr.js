const fs = require('fs');
const puppeteer = require('puppeteer');
const os = require('os');
const path = require('path');

// Read and parse URLs from waymore.txt
const urlsFile = path.join(process.cwd(), 'waymore.txt');
if (!fs.existsSync(urlsFile)) {
    console.error(`waymore.txt not found at ${urlsFile}`);
    process.exit(1);
}

const urls = fs.readFileSync(urlsFile, 'utf8')
    .split('\n')
    .filter(url => url.trim() && !url.includes('/u/'))
    .map(url => url.trim());

// Helper function for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    // Get Firefox profile directory
    const firefoxProfileDir = path.join(os.homedir(), '.mozilla/firefox');
    const profiles = fs.readdirSync(firefoxProfileDir);
    const defaultProfile = profiles.find(p => p.endsWith('.default-release'));
    
    if (!defaultProfile) {
        console.error('Could not find Firefox default profile');
        return;
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // Add stealth configurations
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    try {
        // Load cookies from Firefox
        console.log('Loading Firefox cookies...');
        const cookiesDb = path.join(firefoxProfileDir, defaultProfile, 'cookies.sqlite');
        
        // Copy the cookies database (since Firefox might have it locked)
        const tempCookiesDb = path.join(os.tmpdir(), 'cookies.sqlite');
        fs.copyFileSync(cookiesDb, tempCookiesDb);
        
        // Set cookies for the domain
        const { Database } = require('sqlite3').verbose();
        const db = new Database(tempCookiesDb);
        
        await new Promise((resolve, reject) => {
            db.all(
                "SELECT name, value, host from moz_cookies WHERE host LIKE '%ens.domains'",
                async (err, rows) => {
                    if (err) reject(err);
                    for (const cookie of rows) {
                        await page.setCookie({
                            name: cookie.name,
                            value: cookie.value,
                            domain: cookie.host.startsWith('.') ? cookie.host.slice(1) : cookie.host,
                            url: 'https://discuss.ens.domains'
                        });
                    }
                    resolve();
                }
            );
        });
        
        console.log('Cookies loaded successfully');
        
        // Verify we're logged in
        await page.goto('https://discuss.ens.domains', { waitUntil: 'networkidle0' });
        const isLoggedIn = await page.evaluate(() => {
            return document.querySelector('.current-user') !== null;
        });
        
        if (!isLoggedIn) {
            throw new Error('Cookie import failed - not logged in');
        }
        
        console.log('Successfully verified login state');
        
        const outputDir = path.join(process.cwd(), 'data', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        for (let url of urls) {
            console.log(`\nProcessing: ${url}`);
            try {
                console.log(`Navigating to ${url}...`);
                await page.goto(url, { 
                    waitUntil: 'networkidle0', 
                    timeout: 60000 
                });
                
                console.log('Waiting for content to load...');
                await page.waitForSelector('.topic-post article', { timeout: 60000 });
                
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
                    
                    fs.writeFileSync(
                        `${outputDir}/${safeTitle}.txt`,
                        result.content,
                        'utf8'
                    );
                    console.log(`Saved: ${safeTitle}.txt`);
                }
            } catch (error) {
                console.error(`Error processing ${url}:`, error);
                await page.screenshot({
                    path: path.join(process.cwd(), 'logs', `error-${Date.now()}.png`),
                    fullPage: true
                });
            }
            
            console.log('Waiting before next request...');
            await delay(5000);
        }

        console.log('All URLs processed');
    } catch (error) {
        console.error('Fatal error:', error);
        await page.screenshot({
            path: path.join(process.cwd(), 'logs', `fatal-error-${Date.now()}.png`),
            fullPage: true
        });
    } finally {
        await browser.close();
    }
}

main().catch(console.error); 