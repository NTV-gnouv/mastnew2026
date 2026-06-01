# Integration Examples

## Web Application (React/Vue/Angular)

### React Example
```jsx
import React, { useState } from 'react';
import axios from 'axios';

const TaxSearchForm = () => {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('auto');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchTypes = [
    { value: 'auto', label: 'Tìm tự động' },
    { value: 'enterpriseTax', label: 'Mã số thuế công ty' },
    { value: 'personalTax', label: 'Mã số thuế cá nhân' },
    { value: 'identity', label: 'CMND, căn cước' },
    { value: 'enterpriseName', label: 'Tên công ty' },
    { value: 'legalName', label: 'Giám đốc công ty' }
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const response = await axios.post(
        'http://localhost:3001/api/search/tax',
        { query, type }
      );

      if (response.data.success) {
        setResults(response.data.results);
      } else {
        setError(response.data.error);
      }
    } catch (err) {
      setError('Tìm kiếm thất bại. Vui lòng thử lại.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tax-search-container">
      <form onSubmit={handleSearch}>
        <div className="search-controls">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhập mã số thuế, CMND, tên công ty..."
            required
          />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {searchTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={loading}>
            {loading ? 'Đang tìm...' : 'Tìm kiếm'}
          </button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      {results.length > 0 && (
        <div className="results">
          <h3>Kết quả tìm kiếm: {results.length} kết quả</h3>
          <table>
            <thead>
              <tr>
                <th>Mã số thuế</th>
                <th>Tên doanh nghiệp</th>
                <th>Địa chỉ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, idx) => (
                <tr key={idx}>
                  <td>{result.taxCode}</td>
                  <td>{result.enterpriseName}</td>
                  <td>{result.address}</td>
                  <td>{result.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TaxSearchForm;
```

### Vue.js Example
```vue
<template>
  <div class="tax-search">
    <form @submit.prevent="searchTax">
      <input
        v-model="query"
        type="text"
        placeholder="Nhập mã số thuế, CMND, tên công ty..."
        required
      />
      <select v-model="type">
        <option value="auto">Tìm tự động</option>
        <option value="enterpriseTax">Mã số thuế công ty</option>
        <option value="personalTax">Mã số thuế cá nhân</option>
        <option value="identity">CMND, căn cước</option>
        <option value="enterpriseName">Tên công ty</option>
        <option value="legalName">Giám đốc công ty</option>
      </select>
      <button :disabled="loading">{{ loading ? 'Đang tìm...' : 'Tìm kiếm' }}</button>
    </form>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="results.length > 0" class="results">
      <h3>Kết quả: {{ results.length }} kết quả</h3>
      <table>
        <thead>
          <tr>
            <th>Mã số thuế</th>
            <th>Tên công ty</th>
            <th>Địa chỉ</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(result, idx) in results" :key="idx">
            <td>{{ result.taxCode }}</td>
            <td>{{ result.enterpriseName }}</td>
            <td>{{ result.address }}</td>
            <td>{{ result.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  data() {
    return {
      query: '',
      type: 'auto',
      results: [],
      loading: false,
      error: ''
    };
  },
  methods: {
    async searchTax() {
      this.loading = true;
      this.error = '';
      this.results = [];

      try {
        const response = await axios.post(
          'http://localhost:3001/api/search/tax',
          { query: this.query, type: this.type }
        );

        if (response.data.success) {
          this.results = response.data.results;
        } else {
          this.error = response.data.error;
        }
      } catch (err) {
        this.error = 'Tìm kiếm thất bại. Vui lòng thử lại.';
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
.tax-search {
  padding: 20px;
}

form {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input, select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
}

.error {
  color: red;
  margin: 10px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
}

table th, table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

table th {
  background: #f5f5f5;
}
</style>
```

## Backend Integration (Express.js)

```javascript
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const TAX_API = 'http://localhost:3001';

// Middleware to search tax info
app.post('/api/company/search', async (req, res) => {
  try {
    const { query, type = 'auto' } = req.body;

    const response = await axios.post(`${TAX_API}/api/search/tax`, {
      query,
      type
    });

    if (response.data.success) {
      // Store results in database if needed
      return res.json({
        success: true,
        data: response.data.results
      });
    }

    res.status(400).json({
      success: false,
      error: response.data.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get company details
app.get('/api/company/:taxCode', async (req, res) => {
  try {
    const { taxCode } = req.params;

    const response = await axios.post(`${TAX_API}/api/search/tax`, {
      query: taxCode,
      type: 'enterpriseTax'
    });

    if (response.data.success && response.data.results.length > 0) {
      return res.json({
        success: true,
        data: response.data.results[0]
      });
    }

    res.status(404).json({
      success: false,
      error: 'Company not found'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3000, () => {
  console.log('Backend server running on port 3000');
});
```

## Database Integration

### Save search results to database
```javascript
const mongoose = require('mongoose');

// Define schema
const searchResultSchema = new mongoose.Schema({
  query: String,
  type: String,
  taxCode: String,
  enterpriseName: String,
  address: String,
  status: String,
  createdAt: { type: Date, default: Date.now }
});

const SearchResult = mongoose.model('SearchResult', searchResultSchema);

// Save results
async function saveSearchResults(query, type, results) {
  const documents = results.map((result) => ({
    query,
    type,
    ...result
  }));

  await SearchResult.insertMany(documents);
}

// Search in database
async function getStoredResults(query) {
  return await SearchResult.find({ query });
}
```

## Webhook Integration

```javascript
// Send webhook notification when search completes
async function notifyWebhook(webhookUrl, results) {
  try {
    await axios.post(webhookUrl, {
      timestamp: new Date(),
      results
    });
  } catch (error) {
    console.error('Webhook notification failed:', error);
  }
}
```

---

## Notes
- Thay đổi `localhost:3001` với URL thực tế của server
- Implement proper error handling và retry logic
- Respect rate limits của masothue.com
- Cache kết quả tìm kiếm để tránh duplicate requests
