# Tracuuthue2026 API - Scraper Tool

API Node.js để tìm kiếm và lấy dữ liệu thông tin thuế 

## Installation

```bash
npm install
```

## Usage

### Start server (Development)

```bash
npm run dev
```

### Start server (Production)

```bash
npm start
```

Server sẽ chạy trên port 3000 (hoặc port được định nghĩa trong `.env`)

## API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "Server is running"
}
```

### Tax Search
```
POST /api/search/tax
```

Request body:
```json
{
  "query": "search keyword",
  "type": "auto"
}
```

**Query Parameters:**
- `query` (required): Keyword để tìm kiếm (mã số thuế, CMND, tên công ty, etc.)
- `type` (optional): Loại tìm kiếm. Các giá trị hợp lệ:
  - `auto` - Tìm tự động (mặc định)
  - `enterpriseTax` - Mã số thuế công ty
  - `personalTax` - Mã số thuế cá nhân
  - `identity` - CMND, căn cước
  - `enterpriseName` - Tên công ty
  - `legalName` - Giám đốc công ty

**Response:**
```json
{
  "success": true,
  "query": "search keyword",
  "type": "auto",
  "results": [
    {
      "index": 1,
      "taxCode": "...",
      "enterpriseName": "...",
      "address": "...",
      "tradeGroup": "...",
      "registrationDate": "...",
      "status": "..."
    }
  ]
}
```

## Examples

### Search by Enterprise Tax Code
```bash
curl -X POST http://localhost:3000/api/search/tax \
  -H "Content-Type: application/json" \
  -d '{
    "query": "1234567890",
    "type": "enterpriseTax"
  }'
```

### Auto Search
```bash
curl -X POST http://localhost:3000/api/search/tax \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Google",
    "type": "auto"
  }'
```

### Search by Personal Tax Code
```bash
curl -X POST http://localhost:3000/api/search/tax \
  -H "Content-Type: application/json" \
  -d '{
    "query": "0123456789",
    "type": "personalTax"
  }'
```

### Search by Identity Number
```bash
curl -X POST http://localhost:3000/api/search/tax \
  -H "Content-Type: application/json" \
  -d '{
    "query": "0123456789",
    "type": "identity"
  }'
```

## Project Structure

```
tracuuthue2026/
├── src/
│   ├── server.js              # Main server entry point
│   ├── routes/
│   │   └── search.js          # Search API routes
│   ├── scrapers/
│   │   └── taxScraper.js      # Web scraper logic
│   └── utils/
│       └── parser.js          # HTML parser utilities
├── package.json
├── .env                       # Environment variables
└── README.md
```

## Error Handling

API sẽ trả về error message với HTTP status code thích hợp:

```json
{
  "success": false,
  "error": "Error message"
}
```

Các status code:
- `200` - Success
- `400` - Bad request (invalid parameters)
- `500` - Server error

## Configuration

Chỉnh sửa file `.env`:

```
PORT=3000
NODE_ENV=development
BASE_URL=https://masothue.com
MASOTHUE_PROXY_URL=http://160.250.166.21:10984
```

Nếu không muốn dùng biến riêng cho dự án, bạn cũng có thể đặt `HTTP_PROXY` hoặc `HTTPS_PROXY` theo cùng định dạng `http://host:port`.

Lưu ý: proxy này áp dụng cho API scraper dùng `axios` trong `src/scrapers/taxScraper.js`. Nếu không khai báo gì thêm, dự án sẽ tự dùng proxy mặc định khi chạy `npm start`. File `chrome-proxy` và `browser-example.js` chỉ dành cho luồng chạy Chrome/Puppeteer.

## Dependencies

- **express** - Web framework
- **axios** - HTTP client
- **cheerio** - HTML parser
- **dotenv** - Environment variables
- **cors** - CORS middleware
- **helmet** - Security headers
- **nodemon** - Auto-reload during development

## Notes

- API automatically extracts token từ search page
- Hỗ trợ multiple search types
- Parsed results trả về dạng JSON chuẩn
- Chỉ lấy data có content (bỏ qua empty results)

## License

MIT
# mastnew2026
