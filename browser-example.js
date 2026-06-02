/**
 * Example: Using Puppeteer with chrome-proxy wrapper
 * Proxy: 160.250.166.21:10984
 * 
 * Install: npm install puppeteer
 */

const puppeteer = require('puppeteer');
const path = require('path');

async function scrapWithProxy() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: path.join(__dirname, 'chrome-proxy'),
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1366, height: 768 });
    
    // Add headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate
    console.log('Navigating to masothue.com...');
    await page.goto('https://masothue.com', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    console.log('✓ Page loaded successfully via proxy');
    console.log('Current URL:', page.url());
    
    // Example: Scrape search
    // const results = await page.evaluate(() => {
    //   return document.body.innerText;
    // });
    
    await page.screenshot({ path: 'screenshot.png' });
    console.log('✓ Screenshot saved');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

scrapWithProxy().catch(console.error);
