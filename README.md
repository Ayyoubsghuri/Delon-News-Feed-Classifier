# 📰 Arabic News Aggregation & Analysis Platform

A full-featured **Arabic news aggregation, classification, summarization, and analytics platform** built with **Flask**, **SQLite**, and **AI/NLP tools**.  
The system automatically collects news from RSS feeds, processes Arabic content, classifies articles, generates summaries, tracks social media shares, and exports structured reports.
it can fo up to 100 websites in 10min

---
### Screenshot
![Dylon](https://github.com/Ayyoubsghuri/Delon-News-Feed-Classifier/blob/main/screenshots/screenshot1.png)
## 🚀 Key Features

### 1. RSS News Aggregation
- Parses multiple RSS feeds safely (handles malformed XML).
- Avoids duplicate articles using titles and links.
- Stores articles in a local **SQLite database**.

### 2. Arabic Text Processing
- HTML cleaning with BeautifulSoup.
- Arabic normalization (Alef, Hamza, diacritics, Tatweel).
- Safe handling of long Arabic text for DB & Excel.

### 3. Intelligent Article Classification
Categories:
- شؤون أمنية
- شؤون سياسية
- شؤون جهوية
- مجالس منتخبة
- مختلفات

Uses weighted Arabic keywords, city detection, and optional AraBERT support.

### 4. AI Arabic Summarization
- Automatic Arabic summaries using AI (OpenRouter models).
- Cached for 24 hours.
- Multi-key retry system.

Endpoint:
GET /get-article-summary?article_id=UUID

### 5. Keyword Management
- List, add, delete keywords dynamically.
- Stored in json/keywords.json.

### 6. Places Management
- Location-based news detection.
- Stored in json/places.json.

### 7. Social Media Share Analytics
- Facebook & Pinterest share tracking via SharedCount.
- Cached for 4 hours.

### 8. Excel & Word Reports
- Daily Excel reports (before/after 10:30).
- Arabic-safe Excel export.
- Organized by year/month/day folders.

### 9. SQLite Database
Tables:
- articles
- deleted_articles
- command_logs

Thread-safe with WAL mode.

### 10. REST API & Frontend
- Flask REST API with CORS.
- React frontend served from /build.
- Swagger UI support.

---

## 🛠️ Tech Stack
- Flask, SQLite
- Transformers, Sentence-Transformers
- OpenRouter AI
- Pandas, OpenPyXL, python-docx
- SharedCount API

---

## ▶️ Run Project

```bash
pip install -r requirements.txt
python main.py
```

Server:
http://localhost:5000

---

## 📌 Use Cases
- News monitoring
- Arabic media analysis
- Daily press reports
- Social media impact tracking

---

## 📄 License
Private / Internal Use
"# Delon---News-Feed" 
