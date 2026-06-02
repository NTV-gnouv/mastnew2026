# Proxy Setup Guide

## Proxy Configuration
- **Proxy Server**: 160.250.166.21:10984
- **Type**: HTTP

## Using chrome-proxy Wrapper

### File: `chrome-proxy`
Đã create wrapper script tại `./chrome-proxy` - tự động thêm proxy khi chạy Chrome.

### Installation

#### 1. Install Puppeteer (nếu chưa có)
```bash
npm install puppeteer
```

#### 2. Verify chrome-proxy
```bash
./chrome-proxy --version
```

### Usage Examples

#### Simple Usage
```javascript
const puppeteer = require('puppeteer');
const path = require('path');

const browser = await puppeteer.launch({
  headless: false,
  executablePath: path.join(__dirname, 'chrome-proxy'),
  args: ['--start-maximized']
});
```

#### With Headless Mode
```javascript
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: path.join(__dirname, 'chrome-proxy'),
  args: ['--disable-gpu', '--no-sandbox']
});
```

#### Running as Root (VPS/Server)
```javascript
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: path.join(__dirname, 'chrome-proxy'),
  args: [
    '--no-sandbox',              // Required for root
    '--disable-setuid-sandbox',  // Additional safety
    '--disable-gpu',
    '--disable-dev-shm-usage'    // Prevent /dev/shm errors
  ]
});
```

#### Run Example
```bash
node browser-example.js
```

### Current Project
- **Scraper**: `src/scrapers/taxScraper.js` (uses axios)
- **Server**: `src/server.js` (Express)

### If You Need to Add Puppeteer to taxScraper

For JavaScript-heavy pages on masothue.com, you can create a new scraper:

```javascript
const puppeteer = require('puppeteer');
const path = require('path');

async function scrapeWithPuppeteer(url) {
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, '../..', 'chrome-proxy'),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // ... scraping logic
    return data;
  } finally {
    await browser.close();
  }
}
```

### Troubleshooting

#### Chrome not found
```bash
which google-chrome
# or
which chromium-browser
```

Update `chrome-proxy` path if needed:
```bash
#!/bin/bash
exec /usr/bin/chromium-browser "$@" \
  --proxy-server=http://160.250.166.21:10984
```

#### Proxy not working
1. Test: `./chrome-proxy --proxy-server=http://160.250.166.21:10984 https://masothue.com`
2. Check proxy connectivity: `curl -x http://160.250.166.21:10984 https://ipinfo.io`
3. Verify IP: Should show 42.115.194.35 or 116.98.153.132

#### Timeout issues
- Increase timeout in Puppeteer: `{ timeout: 60000 }`
- Check proxy server status
- Try without proxy temporarily

---
**Created**: 2026-06-02
**Proxy Updated**: 10:52 12/06/26
