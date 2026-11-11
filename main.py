from flask import Flask, request, jsonify, abort
from flask_apispec import FlaskApiSpec
import pandas as pd
from datetime import datetime, timezone, timedelta
from dateutil import parser
import os, json, random, feedparser
from lxml import etree
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from uuid import uuid4
from bs4 import BeautifulSoup
from flask_cors import CORS
from docx import Document
import sqlite3 , requests
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, Inches
import re , time
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity  # Corrected import
import logging
try:
    from sharedcountsdk import SharedCountApi
except Exception:  # optional dependency (not installable on every Python)
    SharedCountApi = None
import time,threading,psutil
from flask import send_from_directory
import openai
from dotenv import load_dotenv
from flask import Response
import newspaper_pdf

# Heavy ML stack is optional: the desktop (.exe) build ships without it.
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
except Exception:
    torch = None
    AutoTokenizer = AutoModelForSequenceClassification = None
# from pygame import mixer  # Add this import at the top of your file
load_dotenv("secret.env")


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration
DATABASE_NAME = os.environ.get("DELON_DB", "news_articles.db")
# Folder that holds the compiled React app (overridden by the desktop launcher).
BUILD_DIR = os.environ.get("DELON_BUILD_DIR", "build")

APP_START_TIME = time.time()
PROCESS = psutil.Process(os.getpid())

db_lock = threading.Lock()
MAX_FIELD_SIZE = 50000

class EnhancedClassifier:
    def __init__(self):
        self.keyword_patterns = {
            "شؤون أمنية": [
                r"أمن|شرطة|مكافحة الإرهاب|جريمة|الدرك الملكي|سرقة|الفرار|تبيض أموال|حريق|متهم|تهشيم|مخدرات|اغتصاب|توقيف|كريساج|تبيض أموال|تحقيق أمني|سجن|حراسة|حماية|دفاع|جيش|استخبارات|تهديد|اعتقال|اعتداء|تفتيش أمني|طوارئ|عملية أمنية",
                r"(أمن|شرطة|مخابرات|طقس)|الأمن العام|الحرس الوطني|استقرار أمني|الآمنة",
            ],
            "شؤون جهوية": [
                r"محافظة|ولاية|إقليم|الرحامنة|عامل إقليم الرحامنة|ياسين الشبلي|منطقة|سيدي بوعثمان|مدينة|زلزال الحوز|دورة تكوينية|الحوز|قرية|احتجاج|بلدة|اسفي|جهة|محلي|تنمية محلية|تخطيط عمراني|خدمات عامة|مشاريع تنموية|سكان|ريف|حضر|مراكش|بركان|وزان|ابن جرير|وجدة|طنجة|فاس|سلا|الرباط|اكادير|الدار البيضاء",
                r"محافظ|والي|بلدية|إدارة محلية|مجلس جهوي|وقفة تضامنية|تنمية مستدامة|ميزانية محلية|تطوير محلي",
            ],
            "مجالس منتخبة": [
                r"مجلس|برلمان|نواب|شورى|انتخاب|تصويت|رئاسة جماعة|اقتراع|مرشح|ترشح|جلسة|قرار مجلس|تشريع|قانون|لجنة|استجواب|حملة انتخابية|دائرة انتخابية|جماعة|جماعات",
                r"مجلس النواب|مجلس الشورى|المجلس البلدي|المجلس التشريعي|المجلس الوطني|تمثيل شعبي",
            ],
            "شؤون سياسية": [
                r"سياسي|حزب|تحالف|حكومة|وزير|الأحزاب|رئيس|معارضة|ائتلاف|بوريطة|دبلوماسية|علاقات دولية|وزارة الداخلية|وزارة وهبي|مؤتمر|اتفاقية|سيادة|دستور|أزمة سياسية|حركة|تيار|وهبي|اخنوش|الاتحاد الاشتراكي",
                r"انتخابات|ترشح|ناخبين|برلمان|النواب|مجلس النواب|حملة انتخابية|استحقاقات|سياسة خارجية|مفاوضات|سلطة سياسية",
            ],
            "مختلفات": [
                r"ثقافة|فن|رياضة|تعليم|صحة|اقتصاد|سياحة|بيئة|تكنولوجيا|إعلام|ترفيه|حفلة|مسابقة|مهرجان|ترامب|مقهى|موسيقى|كوبا|سينما|مسرح|كتاب|لقاء|أدب",
                r"مدرسة|جامعة|مستشفى|ترمب|أمريكا|الاستثمار|بطولة|وزير الخارجية|كأس|مباراة|فيلم|بايدن|صفقة|معرض|مسلسل|برنامج تلفزيوني|راديو|صحافة|مقال|تغريدة|منشور|فيسبوك|تويتر|انستغرام",
            ]
        }

        self.keyword_weights = {
            "شؤون أمنية": {"عملية أمنية": 3,"جثة":15,"انتحار":15,"توقيف":17,"بتوقيف":15,"سرقة":10,"تخريب":10,"تبيض أموال":10,"مخدرات":9,"اغتصاب":10,"استغلال جنسي":10,"أسلحة بيضاء":10,"الاحتلال العشوائي":5,"كريساج":11,"قضية فساد":15,"متهم":10,"تبيض الاموال":10, "مخابرات": 2,"قتل": 16,"الدرك الملكي":6,"قتـ ـل":5,"التراب الوطني": 7,"تحقيق":10,"جرائم الفساد":15,"بالسجن":10,"جريمة":10,"حريق":10,"حملة أمنية": 6,"اعتداء":10,"اعتقال":10, "إرهاب": 10,"الامن":5},
            "شؤون سياسية": {"حزب": 2,"مجلس النواب":15,"الأحزاب":10, "برلمان": 2, "حكومة": 2,"سياسي":20,"النواب":10,"وزارة الداخلية":10,"وزارة":8,"الفيدرالية":10,"وزير":10,"وزير الداخلية":10, "وهبي": 15,"العدالة و التنمية":10,"بوريطة":10,"عبد الوافي":10, "اخنوش": 15},
            "مجالس منتخبة": {"انتخاب":10,"جماعة": 15,"القيادة الجماعية":60,"الجماعات الترابية":20,"الجماعات":30,"رئاسة جماعة":10, "جماعات": 19,"انتخابات": 9,"مرشح":9,"المجلس الجماعي":10,"مجالس منتخبة":10,"موظف الجماعي":10},
            "شؤون جهوية": {"مراكش": 15,"الرحامنة":15,"سيدي بوعثمان":53,"um6p":20,"جامعة محمد السادس":30,"ياسين الشبلي":15,"عامل إقليم الرحامنة":30, "اسفي": 2,"زلزال الحوز":10,"بنية التحتية":10,"صاعقة رعدية":5,"حادث":10,"وقفة تضامنية":10,"احتجاج":10, "ابن جرير": 10,"بنايات عشوائية":5,"الحوز":11,"قلعة السراغنة":5,"ندوة": 4,"الحوز":10},
            "مختلفات":{"الدار البيضاء":30,"الاتحاد الاوروبي":10,"أمريكا":15,"وزير الخارجية":10,"الاستثمار":10,"بريطانيا":15,"إسرائيل":20,"الولايات المتحدة":20,"الجزائر":10,"فيسبوك":5,"تويتر":5,"موريتانيا":15,"انستغرام":5,"مهرجان":5,"موسيقى":5,"فيلم":5,"مسلسل":5,"ترامب":30,"برنامج تلفزيوني":5,"راديو":5,"صحافة":5,"مقال":5,"تغريدة":5,"منشور":5},
        }

        self.city_keywords = r"مراكش|اسفي|ابن جرير|وجدة|طنجة|فاس|سلا|الرباط|اكادير|الدار البيضاء"

        self.categories = list(self.keyword_patterns.keys())
        self.bert_model = None
        self.bert_tokenizer = None
        self._init_bert(disabled=True)  # Disable unless fine-tuned

    def _init_bert(self, disabled=False):
        if disabled or AutoTokenizer is None:
            logger.info("BERT classifier is disabled for performance.")
            return
        try:
            model_name = "aubmindlab/bert-base-arabertv02"
            self.bert_tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.bert_model = AutoModelForSequenceClassification.from_pretrained(
                model_name,
                num_labels=len(self.categories)
            )
            logger.info("AraBERT model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load BERT model: {str(e)}")
            self.bert_model = None

    def _clean_text(self, text):
        text = re.sub(r'<[^>]+>', '', text)
        text = re.sub(r'http\S+|www\S+', '', text)
        text = re.sub(r'[^\w\s\u0600-\u06FF]', '', text)
        return re.sub(r'\s+', ' ', text).strip()

    def _keyword_classify(self, text):
        scores = {category: 0 for category in self.categories}

        for category, patterns in self.keyword_patterns.items():
            base_score = sum(len(re.findall(p, text, re.IGNORECASE)) for p in patterns)

            for keyword, weight in self.keyword_weights.get(category, {}).items():
                if re.search(keyword, text, re.IGNORECASE):
                    base_score += weight

            # Extra boost for "شؤون جهوية" if city name is found
            if category == "شؤون جهوية" and re.search(self.city_keywords, text, re.IGNORECASE):
                base_score += 5

            scores[category] = base_score

        top_score = max(scores.values())
        if top_score >= 4:
            sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
            if len(sorted_scores) > 1 and (sorted_scores[0][1] - sorted_scores[1][1]) < 2:
                return None  # Tie: not confident
            return sorted_scores[0][0]
        return None

    def _bert_classify(self, text):
        if not self.bert_model:
            return None

        try:
            inputs = self.bert_tokenizer(
                text[:512],
                return_tensors="pt",
                padding=True,
                truncation=True
            )
            with torch.no_grad():
                outputs = self.bert_model(**inputs)
            predicted_idx = torch.argmax(outputs.logits).item()
            return self.categories[predicted_idx]
        except Exception as e:
            logger.error(f"BERT classification failed: {str(e)}")
            return None

    def classify(self, text, use_bert=True):
        if not isinstance(text, str) or not text.strip():
            return "مختلفات"

        cleaned = self._clean_text(text)
        if not cleaned:
            return "مختلفات"

        result = self._keyword_classify(cleaned)
        if result:
            return result

        if use_bert:
            result = self._bert_classify(cleaned)
            if result:
                return result

        return "مختلفات"

app = Flask(__name__, static_folder=os.path.abspath(os.path.join(BUILD_DIR, "static")),
            static_url_path="/static")
CORS(app)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    build_dir = os.path.abspath(BUILD_DIR)
    if path != "" and os.path.exists(os.path.join(build_dir, path)):
        return send_from_directory(build_dir, path)
    else:
        return send_from_directory(build_dir, "index.html")
# Initialize Flask-ApiSpec and assign a unique name to avoid conflicts
app.config["APISPEC_SWAGGER_UI_URL"] = "/swagger-ui"
api_spec = FlaskApiSpec(app)

# Global variables
unique_articles = []
all_articles = []
classifier = EnhancedClassifier()

def get_db_connection():
    """Create and return a database connection."""
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    return conn

class SummarizationConfig:
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    OPENROUTER_MODEL = os.getenv(
        "OPENROUTER_MODEL",
    )
    OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

    TEMPERATURE = 0.3
    MIN_DELAY = 2
    MAX_DELAY = 4




def limit_size(value, max_len=MAX_FIELD_SIZE):
    if value is None:
        return None
    if isinstance(value, str) and len(value) > max_len:
        return value[:max_len]
    return value


class SummarizationError(Exception):
    """Custom exception for summarization-specific errors"""
    pass

def load_api_keys():
    """Load API keys from file"""
    try:
        api_key = SummarizationConfig.OPENROUTER_API_KEY
        keys = [key.strip() for key in api_key.split(",") if key.strip()]
        if not keys:
            raise ValueError(f"No API keys found in {SummarizationConfig.API_KEY_FILE}")
        return keys
    except FileNotFoundError:
        raise FileNotFoundError(f"API key file {SummarizationConfig.API_KEY_FILE} not found")

def summarize_article_content(content, max_retries=3):
    """Summarize article content using OpenRouter AI"""

    if not content or len(content.strip()) < 50:
        logger.warning("Content too short for summarization")
        return None

    api_key = SummarizationConfig.OPENROUTER_API_KEY
    model = SummarizationConfig.OPENROUTER_MODEL

    if not api_key:
        logger.error("OPENROUTER_API_KEY is missing")
        return None

    client = openai.OpenAI(
        api_key=api_key,
        base_url=SummarizationConfig.OPENROUTER_BASE_URL
    )

    prompt_template = """
قم بتلخيص النص التالي بشكل واضح ومختصر مع الحفاظ على النقاط الرئيسية.
اكتب الملخص باللغة العربية في فقرة واحدة وبصيغة الماضي:

{content}
"""

    for attempt in range(max_retries):
        try:
            logger.info(
                f"Summarization attempt {attempt + 1}/{max_retries} using model: {model}"
            )

            prompt = prompt_template.format(
                content=content[:3000]  # prevent token overflow
            )

            messages = [
                {"role": "system", "content": "أنت مساعد متخصص في تلخيص النصوص العربية."},
                {"role": "user", "content": prompt}
            ]

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=SummarizationConfig.TEMPERATURE,
                max_tokens=500
            )

            summary = response.choices[0].message.content.strip()

            delay = random.uniform(
                SummarizationConfig.MIN_DELAY,
                SummarizationConfig.MAX_DELAY
            )
            logger.info(f"Summarization successful, waiting {delay:.2f}s")
            time.sleep(delay)

            return summary

        except Exception as e:
            logger.warning(
                f"Summarization attempt {attempt + 1} failed: {e}",
                exc_info=True
            )

            if attempt < max_retries - 1:
                time.sleep(2)

    logger.error(f"Failed to summarize article after {max_retries} attempts")
    return None

    
def get_article_summary(article_id):
    """
    Get or generate summary for an article
    First checks database cache, then generates if needed
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if summary already exists in database
        cursor.execute('''
            SELECT summary, summary_updated 
            FROM articles 
            WHERE id = ? 
        ''', (article_id,))
        
        article = cursor.fetchone()
        
        if article and article['summary']:
            # Check if summary is recent (less than 24 hours old)
            try:
                if article['summary_updated']:
                    last_updated = parser.parse(article['summary_updated'])
                    if (datetime.now(timezone.utc) - last_updated) < timedelta(hours=24):
                        return article['summary']
            except Exception:
                pass  # If timestamp parsing fails, regenerate summary
        
        # Get article content for summarization
        cursor.execute('''
            SELECT content, title, description 
            FROM articles 
            WHERE id = ?
        ''', (article_id,))
        
        article_data = cursor.fetchone()
        if not article_data:
            return None
        
        # Combine title, description, and content for better summarization
        content_to_summarize = f"{article_data['title']}. {article_data['description']}. {article_data['content']}"
        
        # Generate summary
        summary = summarize_article_content(content_to_summarize)
        
        if summary:
            # Save summary to database
            cursor.execute('''
                UPDATE articles 
                SET summary = ?, summary_updated = ?
                WHERE id = ? 
            ''', (
                summary,
                datetime.now(timezone.utc).isoformat(),
                article_id
            ))
            conn.commit()
        
        return summary
        
    except Exception as e:
        logger.error(f"Error getting article summary: {str(e)}")
        return None
    finally:
        conn.close()
# Add near the other routes

@app.route("/keywords/list", methods=["GET"])
def list_keywords():
    """Get all keywords from keywords.json"""
    try:
        keywords_file = "json/keywords.json"
        
        # Try to read the file
        try:
            with open(keywords_file, "r", encoding="utf-8") as f:
                keywords_data = json.load(f)
        except FileNotFoundError:
            # Create the file if it doesn't exist
            keywords_data = {"keywords": []}
            with open(keywords_file, "w", encoding="utf-8") as f:
                json.dump(keywords_data, f, ensure_ascii=False, indent=2)
            return jsonify({
                "success": True,
                "keywords": [],
                "total": 0
            })
        except json.JSONDecodeError:
            # If file is corrupted, reset it
            keywords_data = {"keywords": []}
            with open(keywords_file, "w", encoding="utf-8") as f:
                json.dump(keywords_data, f, ensure_ascii=False, indent=2)
            return jsonify({
                "success": True,
                "keywords": [],
                "total": 0
            })
        
        # Handle different possible structures
        if isinstance(keywords_data, dict):
            # Try to find the keywords list in common keys
            for key in ["keywords", "items", "words"]:
                if key in keywords_data and isinstance(keywords_data[key], list):
                    keywords_list = keywords_data[key]
                    break
            else:
                # If no list found in dict values
                keywords_list = []
                for key, value in keywords_data.items():
                    if isinstance(value, list):
                        keywords_list.extend(value)
                    elif isinstance(value, str):
                        keywords_list.append(value)
        elif isinstance(keywords_data, list):
            keywords_list = keywords_data
        else:
            keywords_list = []
        
        return jsonify({
            "success": True,
            "keywords": keywords_list,
            "total": len(keywords_list)
        })
    except Exception as e:
        logger.error(f"Error listing keywords: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Failed to load keywords: {str(e)}"
        }), 500

@app.route("/keywords/add", methods=["POST"])
def add_keyword():
    """Add a new keyword to keywords.json"""
    try:
        data = request.get_json()
        keyword = data.get('keyword', '').strip()
        
        if not keyword:
            return jsonify({"error": "Keyword is required"}), 400
        
        keywords_file = "json/keywords.json"
        
        # Load existing keywords
        try:
            with open(keywords_file, "r", encoding="utf-8") as f:
                keywords_data = json.load(f)
        except FileNotFoundError:
            keywords_data = {"keywords": []}
        except json.JSONDecodeError:
            keywords_data = {"keywords": []}
        
        # Check if keyword already exists
        if keyword.lower() in [k.lower() for k in keywords_data.get("keywords", [])]:
            return jsonify({
                "success": False,
                "message": f"Keyword '{keyword}' already exists"
            }), 409
        
        # Add new keyword
        keywords_data.setdefault("keywords", []).append(keyword)
        
        # Save back to file
        with open(keywords_file, "w", encoding="utf-8") as f:
            json.dump(keywords_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            "success": True,
            "message": f"Keyword '{keyword}' added successfully",
            "keywords": keywords_data["keywords"],
            "total": len(keywords_data["keywords"])
        })
        
    except Exception as e:
        logger.error(f"Error adding keyword: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to add keyword: {str(e)}"
        }), 500

@app.route("/keywords/delete", methods=["DELETE"])
def delete_keyword():
    """Delete a keyword from keywords.json"""
    try:
        keyword = request.args.get("keyword")
        
        if not keyword:
            return jsonify({"error": "Keyword parameter is required"}), 400
        
        keywords_file = "json/keywords.json"
        
        # Load existing keywords
        try:
            with open(keywords_file, "r", encoding="utf-8") as f:
                keywords_data = json.load(f)
        except FileNotFoundError:
            return jsonify({"error": "Keywords file not found"}), 404
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid keywords file"}), 500
        
        # Find and remove keyword (case insensitive)
        original_keywords = keywords_data.get("keywords", [])
        new_keywords = [k for k in original_keywords if k.lower() != keyword.lower()]
        
        if len(new_keywords) == len(original_keywords):
            return jsonify({"error": f"Keyword '{keyword}' not found"}), 404
        
        # Update keywords
        keywords_data["keywords"] = new_keywords
        
        # Save back to file
        with open(keywords_file, "w", encoding="utf-8") as f:
            json.dump(keywords_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            "success": True,
            "message": f"Keyword '{keyword}' deleted successfully",
            "keywords": new_keywords,
            "total": len(new_keywords)
        })
        
    except Exception as e:
        logger.error(f"Error deleting keyword: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to delete keyword: {str(e)}"
        }), 500

@app.route("/places/list", methods=["GET"])
def list_places():
    """Get all places from places.json"""
    try:
        places_file = "json/places.json"
        
        # Try to read the file
        try:
            with open(places_file, "r", encoding="utf-8") as f:
                places_data = json.load(f)
        except FileNotFoundError:
            # Create the file if it doesn't exist
            places_data = {"keywords": []}
            with open(places_file, "w", encoding="utf-8") as f:
                json.dump(places_data, f, ensure_ascii=False, indent=2)
            return jsonify({
                "success": True,
                "places": [],
                "total": 0
            })
        except json.JSONDecodeError:
            # If file is corrupted, reset it
            places_data = {"keywords": []}
            with open(places_file, "w", encoding="utf-8") as f:
                json.dump(places_data, f, ensure_ascii=False, indent=2)
            return jsonify({
                "success": True,
                "places": [],
                "total": 0
            })
        
        # Debug logging
        logger.info(f"Raw places data: {places_data}")
        logger.info(f"Type of places data: {type(places_data)}")
        
        # Handle different possible structures
        if isinstance(places_data, dict):
            # Try to find the places list in common keys
            for key in ["keywords", "places", "locations", "items"]:
                if key in places_data and isinstance(places_data[key], list):
                    places_list = places_data[key]
                    break
            else:
                # If no list found in dict values, check if dict values are lists
                places_list = []
                for key, value in places_data.items():
                    if isinstance(value, list):
                        places_list.extend(value)
                    elif isinstance(value, str):
                        places_list.append(value)
        elif isinstance(places_data, list):
            places_list = places_data
        else:
            places_list = []
        
        logger.info(f"Processed places list: {places_list}")
        
        return jsonify({
            "success": True,
            "places": places_list,
            "total": len(places_list)
        })
    except Exception as e:
        logger.error(f"Error listing places: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Failed to load places: {str(e)}"
        }), 500

@app.route("/places/add", methods=["POST"])
def add_place():
    """Add a new place to places.json"""
    try:
        data = request.get_json()
        place = data.get('place', '').strip()
        
        if not place:
            return jsonify({"error": "Place is required"}), 400
        
        places_file = "json/places.json"
        
        # Load existing places
        try:
            with open(places_file, "r", encoding="utf-8") as f:
                places_data = json.load(f)
        except FileNotFoundError:
            places_data = {"keywords": []}
        except json.JSONDecodeError:
            places_data = {"keywords": []}
        
        # Check if place already exists
        if place.lower() in [p.lower() for p in places_data.get("keywords", [])]:
            return jsonify({
                "success": False,
                "message": f"Place '{place}' already exists"
            }), 409
        
        # Add new place
        places_data.setdefault("keywords", []).append(place)
        
        # Save back to file
        with open(places_file, "w", encoding="utf-8") as f:
            json.dump(places_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            "success": True,
            "message": f"Place '{place}' added successfully",
            "places": places_data["keywords"],
            "total": len(places_data["keywords"])
        })
        
    except Exception as e:
        logger.error(f"Error adding place: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to add place: {str(e)}"
        }), 500

@app.route("/places/delete", methods=["DELETE"])
def delete_place():
    """Delete a place from places.json"""
    try:
        place = request.args.get("place")
        
        if not place:
            return jsonify({"error": "Place parameter is required"}), 400
        
        places_file = "json/places.json"
        
        # Load existing places
        try:
            with open(places_file, "r", encoding="utf-8") as f:
                places_data = json.load(f)
        except FileNotFoundError:
            return jsonify({"error": "Places file not found"}), 404
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid places file"}), 500
        
        # Find and remove place (case insensitive)
        original_places = places_data.get("keywords", [])
        new_places = [p for p in original_places if p.lower() != place.lower()]
        
        if len(new_places) == len(original_places):
            return jsonify({"error": f"Place '{place}' not found"}), 404
        
        # Update places
        places_data["keywords"] = new_places
        
        # Save back to file
        with open(places_file, "w", encoding="utf-8") as f:
            json.dump(places_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            "success": True,
            "message": f"Place '{place}' deleted successfully",
            "places": new_places,
            "total": len(new_places)
        })
        
    except Exception as e:
        logger.error(f"Error deleting place: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to delete place: {str(e)}"
        }), 500

# Fix the share counts endpoint to handle URL encoding issues
# @app.route("/get-share-counts", methods=["GET"])
# def get_share_counts_endpoint():
#     url = request.args.get("url")
#     if not url:
#         return jsonify({"error": "URL parameter is required"}), 400
    
#     try:
#         # Decode the URL to handle double encoding
#         import urllib.parse
#         decoded_url = urllib.parse.unquote(urllib.parse.unquote(url))
        
#         # First check if we have recent counts in the database
#         conn = get_db_connection()
#         cursor = conn.cursor()
#         cursor.execute('''
#             SELECT share_counts, share_counts_updated 
#             FROM articles 
#             WHERE link = ?
#         ''', (decoded_url,))
#         article = cursor.fetchone()
#         conn.close()
        
#         # If we have recent counts (updated within last 4 hours), return them
#         if article and article['share_counts']:
#             try:
#                 last_updated_str = article['share_counts_updated']
#                 if last_updated_str:  # Only parse if not None
#                     last_updated = parser.parse(last_updated_str)
#                     if (datetime.now(timezone.utc) - last_updated) < timedelta(hours=4):
#                         return jsonify(json.loads(article['share_counts']))
#             except Exception as e:
#                 logger.warning(f"Error parsing timestamp for {decoded_url}: {str(e)}")
        
#         # Otherwise fetch fresh counts using the SDK
#         share_counts = get_share_counts(decoded_url)
        
#         if not share_counts:
#             return jsonify({"error": "No share counts available"}), 404
        
#         # Update the database with fresh counts
#         conn = get_db_connection()
#         cursor = conn.cursor()
#         cursor.execute('''
#             UPDATE articles 
#             SET share_counts = ?, share_counts_updated = ?
#             WHERE link = ?
#         ''', (
#             json.dumps(share_counts),
#             datetime.now(timezone.utc).isoformat(),
#             decoded_url
#         ))
#         conn.commit()
#         conn.close()
        
#         return jsonify(share_counts)
        
#     except Exception as e:
#         logger.error(f"Error in get-share-counts: {str(e)}", exc_info=True)
#         return jsonify({"error": "Failed to get share counts"}), 500

class _FallbackEntry(dict):
    """
    Dict that also supports attribute access (entry.published as well as
    entry.get("published")), matching feedparser.FeedParserDict's behavior.
    Missing attributes return None rather than raising, same as feedparser.
    """
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            return None

    def __setattr__(self, name, value):
        self[name] = value


class _FallbackFeed:
    """
    Minimal stand-in for a feedparser.FeedParserDict result, used only when
    feedparser itself fails to recover any entries from a malformed feed.
    Downstream code only ever touches `.entries` (a list of dict-like items
    accessed via .get(...) or attribute access), so _FallbackEntry covers both.
    """
    def __init__(self, entries):
        self.entries = [e if isinstance(e, _FallbackEntry) else _FallbackEntry(e) for e in entries]
        self.bozo = True


_RSS_NAMESPACES = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "media": "http://search.yahoo.com/mrss/",
}


def _text_or_none(el):
    if el is None:
        return None
    return "".join(el.itertext()).strip()


_INVALID_XML_CHARS_RE = re.compile(
    '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'
)


def _sanitize_xml_bytes(content):
    """
    Strip characters that are illegal in XML 1.0 (control chars other than
    \\t \\n \\r) and cause lxml/expat to raise 'not well-formed (invalid token)'
    even in recover mode. Works on bytes or str and returns bytes (utf-8).
    """
    if content is None:
        return content
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception:
            text = content.decode("latin-1", errors="replace")
    else:
        text = content
    text = _INVALID_XML_CHARS_RE.sub("", text)
    return text.encode("utf-8")


def parse_feed_with_recovery(url):
    """
    Fallback parser for feeds that feedparser can't recover entries from at all
    (e.g. a hard mismatched-tag error that stops it before it reaches any <item>).
    Uses lxml's libxml2 binding with recover=True, which is much better at
    pushing through malformed XML like unclosed/mismatched tags while still
    reconstructing a usable tree.

    Returns a list of dict entries (feedparser-entry-shaped) or [] on failure.
    """
    try:
        resp = requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RSSHealthBot/1.0)"},
        )
        resp.raise_for_status()
        content = resp.content
    except requests.exceptions.SSLError as e:
        logger.warning(f"SSL verification failed for {url} ({str(e)}); retrying without verification")
        try:
            resp = requests.get(
                url,
                timeout=15,
                headers={"User-Agent": "Mozilla/5.0 (compatible; RSSHealthBot/1.0)"},
                verify=False,
            )
            resp.raise_for_status()
            content = resp.content
        except Exception as e2:
            logger.warning(f"Fallback fetch (no-verify) also failed for {url}: {str(e2)}")
            return []
    except Exception as e:
        logger.warning(f"Fallback fetch failed for {url}: {str(e)}")
        return []

    content = _sanitize_xml_bytes(content)

    try:
        parser_ = etree.XMLParser(recover=True, huge_tree=True)
        root = etree.fromstring(content, parser=parser_)
    except Exception as e:
        logger.warning(f"Fallback lxml parse failed for {url}: {str(e)}")
        return []

    if root is None:
        return []

    items = root.findall(".//item")
    entries = []
    for item in items:
        title = _text_or_none(item.find("title")) or "No Title"
        link = _text_or_none(item.find("link")) or "No Link"
        pub_date = _text_or_none(item.find("pubDate")) or ""
        description = _text_or_none(item.find("description")) or ""

        content_encoded_el = item.find("content:encoded", namespaces=_RSS_NAMESPACES)
        content_value = _text_or_none(content_encoded_el) or description

        media_url = None
        media_el = item.find("media:content", namespaces=_RSS_NAMESPACES)
        if media_el is not None:
            media_url = media_el.get("url")

        entries.append({
            "title": title,
            "link": link,
            "published": pub_date,
            "summary": description,
            "content": [{"value": content_value}],
            "media_content": [{"url": media_url}] if media_url else [{}],
        })

    return entries


def safe_parse_feed(url, return_status=False):
    """
    Parse RSS feed and handle malformed XML gracefully.

    feedparser is lenient by design: it will often recover and still populate
    `feed.entries` even when it sets `feed.bozo = True` (e.g. a "mismatched tag"
    warning from a WordPress export). Previously we discarded the whole feed
    whenever bozo was set, which silently dropped feeds that were actually fine.
    Now we only treat a feed as failed if it produced no usable entries.

    On top of that, some malformed feeds cause feedparser to bail out with
    *zero* entries even though the XML is still substantially valid (e.g. a
    mismatched tag near the top stops feedparser's own SAX recovery before it
    ever reaches an <item>). For that case we fall back to an lxml
    recover=True parser, which reconstructs the tree and lets us pull the
    <item> elements out manually.

    Returns:
        - If return_status is False (default): feedparser.FeedParserDict-like or None.
        - If return_status is True: (feed_or_None, status_dict) where status_dict
          has keys: status ("ok" | "ok_with_warnings" | "error"),
          entry_count, error_message.
    """
    status = {"status": "ok", "entry_count": 0, "error_message": ""}
    try:
        feed = feedparser.parse(url)
        entry_count = len(feed.entries) if feed.entries else 0
        status["entry_count"] = entry_count

        if feed.bozo:
            warning_msg = str(feed.bozo_exception) if feed.bozo_exception else "Unknown parse warning"

            if entry_count > 0:
                # feedparser recovered fine, entries are usable - just note the warning.
                logger.warning(f"Feed {url} had a parse warning but recovered ({entry_count} entries): {warning_msg}")
                status["status"] = "ok_with_warnings"
                status["error_message"] = warning_msg
                return (feed, status) if return_status else feed

            # feedparser got nothing - if this looks like an invalid XML token/control
            # character issue, try re-parsing sanitized bytes directly with feedparser
            # first (cheap and often fully recovers the feed, entries and all).
            if "not well-formed" in warning_msg.lower() or "invalid token" in warning_msg.lower():
                try:
                    resp = requests.get(
                        url,
                        timeout=15,
                        headers={"User-Agent": "Mozilla/5.0 (compatible; RSSHealthBot/1.0)"},
                    )
                    sanitized = _sanitize_xml_bytes(resp.content)
                    sanitized_feed = feedparser.parse(sanitized)
                    sanitized_count = len(sanitized_feed.entries) if sanitized_feed.entries else 0
                    if sanitized_count > 0:
                        logger.warning(f"Feed {url} recovered {sanitized_count} entries after stripping invalid XML characters")
                        status["status"] = "ok_with_fallback"
                        status["entry_count"] = sanitized_count
                        status["error_message"] = f"{warning_msg} (recovered by stripping invalid XML characters)"
                        return (sanitized_feed, status) if return_status else sanitized_feed
                except Exception as e2:
                    logger.warning(f"Sanitized re-parse failed for {url}: {str(e2)}")

            # Still nothing - try the lxml recovery fallback before giving up.
            logger.warning(f"Feed {url} parse error, no entries recovered by feedparser ({warning_msg}); trying lxml recovery")
            fallback_entries = parse_feed_with_recovery(url)
            if fallback_entries:
                logger.warning(f"Feed {url} recovered {len(fallback_entries)} entries via lxml fallback")
                status["status"] = "ok_with_fallback"
                status["entry_count"] = len(fallback_entries)
                status["error_message"] = f"{warning_msg} (recovered via lxml fallback)"
                fallback_feed = _FallbackFeed(fallback_entries)
                return (fallback_feed, status) if return_status else fallback_feed

            status["status"] = "error"
            status["error_message"] = warning_msg
            return (None, status) if return_status else None

        if entry_count == 0:
            status["status"] = "error"
            status["error_message"] = "Feed parsed but contains no entries"
            return (None, status) if return_status else None

        return (feed, status) if return_status else feed
    except Exception as e:
        logger.error(f"Failed to parse feed {url}: {str(e)}")
        status["status"] = "error"
        status["error_message"] = str(e)
        return (None, status) if return_status else None
    
def init_db():
    """Initialize the database with required tables."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create articles table with summary fields
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id TEXT PRIMARY KEY,
            title TEXT UNIQUE,
            pubDate TEXT,
            image_url TEXT,
            link TEXT UNIQUE,
            description TEXT,
            content TEXT,
            source TEXT,
            matched_places TEXT,
            category TEXT,
            share_counts TEXT,
            share_counts_updated TEXT,
            summary TEXT,  -- Add this line
            summary_updated TEXT,  -- Add this line
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create command logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS command_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create deleted articles table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT,
            article_title TEXT UNIQUE,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()
conn = sqlite3.connect(DATABASE_NAME)
conn.execute("PRAGMA journal_mode=WAL;")
conn.execute("PRAGMA synchronous=NORMAL;")
conn.close()

def load_json_file(filename):
    with open(filename, "r", encoding="utf-8") as f:
        return json.load(f)
    
def contains_keywords(text, places, keywords):
    text_lower = text.lower()
    matched_places = [place for place in places if place.lower() in text_lower]
    matched_keywords = [kw for kw in keywords if kw.lower() in text_lower]

    if matched_places and matched_keywords:
        return matched_places, matched_keywords
    return [], []

@app.route("/get-article-summary", methods=["GET"])
def get_article_summary_endpoint():
    article_id = request.args.get("article_id")
    
    if not article_id:
        return jsonify({"error": "article_id parameter is required"}), 400
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # First, check if article exists
        cursor.execute('''
            SELECT id, title, content, description, summary, summary_updated 
            FROM articles 
            WHERE id = ?
        ''', (article_id,))
        
        article = cursor.fetchone()
        conn.close()
        
        if not article:
            logger.warning(f"Article not found with ID: {article_id}")
            return jsonify({
                "success": False,
                "error": "Article not found",
                "article_id": article_id
            }), 404
        
        logger.info(f"Found article: {article['title'][:50]}...")
        
        # Check if we have a recent summary
        if article['summary'] and article['summary_updated']:
            try:
                last_updated = parser.parse(article['summary_updated'])
                if (datetime.now(timezone.utc) - last_updated) < timedelta(hours=24):
                    logger.info("Returning cached summary")
                    return jsonify({
                        "success": True,
                        "summary": article['summary'],
                        "article_id": article_id,
                        "cached": True
                    })
                else:
                    logger.info("Cached summary is outdated")
            except Exception as e:
                logger.warning(f"Error parsing timestamp: {str(e)}")
                # Continue to generate new summary
        
        # Generate new summary
        content_to_summarize = f"{article['title']}. {article['description']}. {article['content']}"
        logger.info(f"Content length for summarization: {len(content_to_summarize)}")
        
        summary = summarize_article_content(content_to_summarize)
        
        if summary:
            # Save summary to database
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE articles 
                SET summary = ?, summary_updated = ?
                WHERE id = ?
            ''', (
                summary,
                datetime.now(timezone.utc).isoformat(),
                article_id
            ))
            conn.commit()
            conn.close()
            
            logger.info("Successfully generated and saved new summary")
            return jsonify({
                "success": True,
                "summary": summary,
                "article_id": article_id,
                "cached": False
            })
        else:
            logger.warning("Could not generate summary for this article")
            return jsonify({
                "success": False,
                "message": "Could not generate summary for this article",
                "article_id": article_id
            }), 500
            
    except Exception as e:
        logger.error(f"Error in get-article-summary: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Failed to get article summary: {str(e)}"
        }), 500
    
def save_dataframe_safe(df, filename):
    """Enhanced function to safely save DataFrame with Arabic content"""
    try:
        # First, clean all text columns
        for col in df.columns:
            if df[col].dtype == 'object':  # Text columns
                df[col] = df[col].apply(safe_excel_text)
        
        # Try saving with openpyxl (better Unicode support)
        try:
            with pd.ExcelWriter(filename, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Articles')
            logger.info(f"Successfully saved {filename} using openpyxl")
            return True
            
        except Exception as openpyxl_error:
            logger.warning(f"openpyxl failed: {openpyxl_error}, trying xlsxwriter")
            
            # Fallback to xlsxwriter
            try:
                with pd.ExcelWriter(filename, engine='xlsxwriter', 
                                  options={'strings_to_numbers': False}) as writer:
                    df.to_excel(writer, index=False, sheet_name='Articles')
                logger.info(f"Successfully saved {filename} using xlsxwriter")
                return True
                
            except Exception as xlsx_error:
                logger.error(f"xlsxwriter also failed: {xlsx_error}")
                return save_dataframe_row_by_row(df, filename)
                
    except Exception as e:
        logger.error(f"Error in save_dataframe_safe: {e}")
        return save_dataframe_row_by_row(df, filename)
    
def save_dataframe_row_by_row(df, filename):
    """Fallback method: save row by row, skipping problematic rows"""
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = "Articles"
        
        # Add headers
        headers = list(df.columns)
        ws.append(headers)
        
        saved_rows = 0
        skipped_rows = 0
        
        for index, row in df.iterrows():
            try:
                # Clean each cell value
                clean_row = []
                for value in row:
                    clean_value = safe_excel_text(str(value)) if value is not None else ""
                    # Additional length check for Excel cell limit
                    if len(clean_value) > 32767:  # Excel cell limit
                        clean_value = clean_value[:32760] + "..."
                    clean_row.append(clean_value)
                
                ws.append(clean_row)
                saved_rows += 1
                
            except Exception as row_error:
                logger.warning(f"Skipped row {index}: {row_error}")
                skipped_rows += 1
                continue
        
        wb.save(filename)
        logger.info(f"Saved {saved_rows} rows, skipped {skipped_rows} rows in {filename}")
        return True
        
    except Exception as e:
        logger.error(f"Row-by-row saving failed: {e}")
        return False
    
def safe_excel_text(text):
    """Enhanced function to safely process Arabic text for Excel"""
    try:
        if not isinstance(text, str):
            return str(text) if text is not None else ""

        # Remove illegal XML characters (including control characters)
        # Keep only valid Unicode characters
        text = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', text)
        
        # Remove or replace problematic Unicode characters
        # Remove zero-width characters that can cause issues
        text = re.sub(r'[\u200B-\u200D\uFEFF]', '', text)
        
        # Replace any remaining problematic characters
        text = re.sub(r'[^\u0000-\uD7FF\uE000-\uFFFF]', '', text)
        
        # Clean HTML tags more thoroughly
        text = re.sub(r'<[^>]+>', '', text)
        
        # Handle Arabic-specific encoding issues
        # Normalize Arabic characters
        text = text.replace('\u0640', '')  # Remove Arabic tatweel
        
        # Escape XML entities properly
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")
        text = text.replace('"', "&quot;")
        text = text.replace("'", "&#39;")

        return text.strip()
        
    except Exception as e:
        logger.error(f"Error in safe_excel_text: {e}")
        return "Encoding Error"
    
def is_same_day(pub_date):
    # try:
    #     pub_date_obj = parser.parse(pub_date)
    #     today = datetime.now(pub_date_obj.tzinfo)
    #     return pub_date_obj.date() == today.date()
    # except Exception:
    #     return False
    try:
        pub_date_obj = parser.parse(pub_date)
        # Get current time with timezone matching pub_date
        now = datetime.now(pub_date_obj.tzinfo)
        # Define the start time as yesterday at 21:00
        yesterday_21h = now.replace(hour=21, minute=0, second=0, microsecond=0) - timedelta(days=1)
        return yesterday_21h <= pub_date_obj <= now
    except Exception:
        return False


def clean_html_tags(text):
    """Enhanced HTML tag cleaning for Arabic content"""
    if not text:
        return ""
    
    try:
        from bs4 import BeautifulSoup
        
        # Use BeautifulSoup for better HTML parsing
        soup = BeautifulSoup(text, "html.parser")
        clean_text = soup.get_text()
        
        # Additional cleanup
        clean_text = re.sub(r'\s+', ' ', clean_text)  # Normalize whitespace
        clean_text = re.sub(r'[\r\n\t]+', ' ', clean_text)  # Remove line breaks and tabs
        
        return clean_text.strip()
        
    except Exception as e:
        logger.warning(f"BeautifulSoup failed, using regex: {e}")
        # Fallback to regex
        clean_text = re.sub(r'<[^>]+>', '', text)
        clean_text = re.sub(r'\s+', ' ', clean_text)
        return clean_text.strip()

def normalize_arabic_text(text):
    """Normalize Arabic text for better processing"""
    if not text:
        return ""
    
    try:
        # Normalize Arabic characters
        text = re.sub(r'[إأآا]', 'ا', text)  # Normalize Alef
        text = re.sub(r'[ؤئ]', 'ء', text)    # Normalize Hamza
        text = re.sub(r'[يى]', 'ي', text)    # Normalize Ya
        text = re.sub(r'[ةه]', 'ة', text)    # Normalize Ta Marbouta
        
        # Remove diacritics
        text = re.sub(r'[\u064B-\u0652\u0670\u0640]', '', text)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
        
    except Exception as e:
        logger.error(f"Error normalizing Arabic text: {e}")
        return text

def remove_latin_chars(text):
    if not text:
        return ""
    arabic_pattern = re.compile(r'[^\u0600-\u06FF0-9\s\.\,\:\;\"\'\?\!\(\)\-\[\]\{\}]')
    return re.sub(arabic_pattern, '', text)

def set_rtl(paragraph):
    p = paragraph._element
    pPr = p.get_or_add_pPr()
    
    bidi = OxmlElement('w:bidi')
    pPr.append(bidi)
    
    rtl = OxmlElement('w:rtl')
    pPr.append(rtl)
    
    jc = OxmlElement('w:jc')
    jc.set(qn('w:val'), 'right')
    pPr.append(jc)
    
    for run in paragraph.runs:
        run_rtl = run._element.get_or_add_rPr()
        rtl_run = OxmlElement('w:rtl')
        run_rtl.append(rtl_run)

def add_cover_page(doc, date_text, title_text="تقرير الأخبار اليومي", is_arabic=True):
    date_paragraph = doc.add_paragraph()
    date_paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT if is_arabic else WD_ALIGN_PARAGRAPH.LEFT
    date_run = date_paragraph.add_run(date_text)
    date_run.font.size = Pt(12)
    date_run.font.bold = True
    
    title_paragraph = doc.add_paragraph()
    title_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_paragraph.add_run(title_text)
    title_run.font.size = Pt(18)
    title_run.font.bold = True
    
    if is_arabic:
        set_rtl(date_paragraph)
        set_rtl(title_paragraph)
    
    doc.add_page_break()

def save_to_excel_and_word_fixed(data):
    """Fixed version of save_to_excel_and_word with better error handling"""
    from datetime import datetime, timezone, timedelta
    from dateutil import parser
    import os
    
    today = datetime.now()
    year_folder = str(today.year)
    month_folder = today.strftime('%m')
    day_folder = today.strftime('%d')
    
    folder_path = os.path.join(os.getcwd(), year_folder, month_folder, day_folder)
    os.makedirs(folder_path, exist_ok=True)
    
    cutoff_time = datetime.strptime(
        f"{today.year}-{today.month}-{today.day} 10:00", 
        "%Y-%m-%d %H:%M"
    ).replace(tzinfo=timezone.utc)
    
    date_str = today.strftime('%Y-%m-%d')
    excel_before_filename = os.path.join(folder_path, f'{date_str}_before_1030.xlsx')
    excel_after_filename = os.path.join(folder_path, f'{date_str}_after_1030.xlsx')
    
    articles_before = []
    articles_after = []
    
    for article in data:
        pub_date_str = article.get("pubDate", "No Date")
        
        try:
            pub_date = parser.parse(pub_date_str)
            if pub_date.tzinfo is None:
                pub_date = pub_date.replace(tzinfo=timezone.utc)
            else:
                pub_date = pub_date.astimezone(timezone.utc)
        except Exception:
            pub_date = datetime.now(timezone.utc)
            
        # Clean and prepare article data
        article_data = {
            **article,
            "description": safe_excel_text(clean_html_tags(article.get("description", ""))),
            "content": safe_excel_text(clean_html_tags(article.get("content", ""))),
            "title": safe_excel_text(article.get("title", "")),
            "category": safe_excel_text(article.get("category", "مختلفات")),
        }

        if pub_date < cutoff_time:
            articles_before.append(article_data)
        else:
            articles_after.append(article_data)

    # Save before 10:30 articles
    if articles_before:
        df_before = pd.DataFrame(articles_before)
        if os.path.exists(excel_before_filename):
            try:
                existing_df = pd.read_excel(excel_before_filename)
                df_before = pd.concat([existing_df, df_before]).drop_duplicates(subset="title")
            except Exception as e:
                logger.warning(f"Could not read existing Excel file {excel_before_filename}: {e}")
        
        success = save_dataframe_safe(df_before, excel_before_filename)
        if not success:
            logger.error(f"Failed to save {excel_before_filename}")
    
    # Save after 10:30 articles
    if articles_after:
        df_after = pd.DataFrame(articles_after)
        if os.path.exists(excel_after_filename):
            try:
                existing_df = pd.read_excel(excel_after_filename)
                df_after = pd.concat([existing_df, df_after]).drop_duplicates(subset="title")
            except Exception as e:
                logger.warning(f"Could not read existing Excel file {excel_after_filename}: {e}")
        
        success = save_dataframe_safe(df_after, excel_after_filename)
        if not success:
            logger.error(f"Failed to save {excel_after_filename}")

def limit_size(value, max_len=MAX_FIELD_SIZE):
    if value is None:
        return None
    if isinstance(value, str) and len(value) > max_len:
        return value[:max_len]
    return value

def save_articles_to_db(articles):
    with db_lock:
        conn = sqlite3.connect(DATABASE_NAME, timeout=30)
        cursor = conn.cursor()
     
        try:
            for article in articles:

                # Skip deleted articles
                cursor.execute(
                    "SELECT 1 FROM deleted_articles WHERE article_title = ?",
                    (article.get("title", ""),)
                )
                if cursor.fetchone():
                    continue

                # FORCE TRUNCATION ON ALL TEXT FIELDS
                title = limit_size(article.get("title", ""), 5000)
                description = limit_size(article.get("description", ""), 20000)
                content = limit_size(clean_html_tags(article.get("content", "")), 20000)
                matched_places = limit_size(article.get("matched_places", ""), 2000)
                category = limit_size(article.get("category", "مختلفات"), 500)
                link = limit_size(article.get("link", "No link"), 2000)
                share_counts_json = limit_size(json.dumps(article.get("share_counts", {})), 5000)

                cursor.execute('''
                    INSERT OR REPLACE INTO articles (
                        id, title, pubDate, image_url, link, 
                        description, content, source, matched_places, category, 
                        share_counts, share_counts_updated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    article.get("id"),
                    title,
                    article.get("pubDate", "No Date"),
                    article.get("image_url", "No Image"),
                    link,
                    description,
                    content,
                    article.get("source", "Unknown"),
                    matched_places,
                    category,
                    share_counts_json,
                    article.get("share_counts_updated", datetime.now(timezone.utc).isoformat())
                ))

            conn.commit()

        finally:
            conn.close()



SHARED_API_KEY = os.getenv("SHARED_API_KEY")
SHARED_API_ENDPOINT = os.getenv("SHARED_API_ENDPOINT")

sharedcount_api = (
    SharedCountApi(apiToken=SHARED_API_KEY) if (SharedCountApi and SHARED_API_KEY) else None
)

if not sharedcount_api:
    logger.warning("SHARED_API_KEY not set (or sharedcountsdk missing): share counts disabled")


# main.py - Updated AI Agent endpoint with TODAY-ONLY data

@app.route("/ai-agent/chat", methods=["POST"])
def ai_agent_chat():
    """
    AI Agent endpoint that ONLY uses today's articles.
    Reasons, searches, and summarizes before responding.
    """
    data = request.get_json()
    user_query = data.get('query', '').strip()
    
    if not user_query:
        return jsonify({"error": "Query is required"}), 400

    try:
        # Get today's date in local timezone
        today = datetime.now().strftime('%Y-%m-%d')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # STRICT FILTER: Only today's articles
        # We search across title, description, and content
        search_term = f"%{user_query}%"
        
        cursor.execute('''
            SELECT id, title, description, content, source, pubDate, category,
                   matched_places, summary
            FROM articles 
            WHERE DATE(timestamp) = ?
            AND (
                title LIKE ? OR 
                description LIKE ? OR 
                content LIKE ? OR
                category LIKE ? OR
                matched_places LIKE ?
            )
            ORDER BY timestamp DESC
            LIMIT 15
        ''', (today, search_term, search_term, search_term, search_term, search_term))
        
        rows = cursor.fetchall()
        conn.close()
        
        articles = [dict(row) for row in rows]
        
        # If no articles found with keyword, try broader search (all today's articles)
        if not articles and user_query.lower() in ["news", "today", "summary", "what's new", "update"]:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, title, description, content, source, pubDate, category,
                       matched_places, summary
                FROM articles 
                WHERE DATE(timestamp) = ?
                ORDER BY timestamp DESC
                LIMIT 15
            ''', (today,))
            rows = cursor.fetchall()
            conn.close()
            articles = [dict(row) for row in rows]

        # Prepare context for AI (today's articles only)
        if articles:
            articles_context = "\n---\n".join([
                f"Article {i+1}:\n"
                f"Title: {a['title']}\n"
                f"Source: {a['source']}\n"
                f"Category: {a.get('category', 'General')}\n"
                f"Description: {a['description'][:300] if a['description'] else 'N/A'}...\n"
                f"Content Preview: {a['content'][:300] if a['content'] else 'N/A'}..."
                for i, a in enumerate(articles)
            ])
        else:
            articles_context = "No articles found for today matching your query."

        # AI Agent Prompt
        system_prompt = f"""You are an AI news assistant with access ONLY to TODAY's news articles ({today}).
The user speaks Moroccan Darija, Arabic, or English. Respond in the SAME LANGUAGE as the user's query.

CRITICAL RULES:
1. You can ONLY discuss articles from TODAY ({today}). Do not mention or pretend to know about past/future news.
2. If the user asks about something not in today's articles, honestly say "I don't see any articles about that in today's news."
3. When summarizing, explicitly state you're covering "today's news" or "أخبار اليوم".

Your capabilities:
- Search for specific topics in today's articles
- Provide summaries of today's news by category
- Answer questions based ONLY on the provided article content
- Extract key information from specific articles

TODAY'S AVAILABLE ARTICLES:
{articles_context}

Return a JSON object with:
- "response_text": Your spoken response (in user's language)
- "action": "search" (show articles), "summarize" (provide overview), or "read" (focus on specific article)
- "search_query": Refined search term for frontend filtering (if applicable)
- "summary": Concise summary of findings (if applicable)
- "relevant_article_ids": List of relevant article IDs (max 3) that best answer the query
- "category_focus": Main category discussed (e.g., "شؤون أمنية", "Politics")"""

        user_prompt = f"User Query: {user_query}\n\nPlease respond based ONLY on today's articles provided above."

        # Call OpenAI/OpenRouter
        client = openai.OpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1"
        )
        
        completion = client.chat.completions.create(
            model="openai/gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.5,  # Lower temperature for more factual responses
            max_tokens=800
        )
        
        ai_output = json.loads(completion.choices[0].message.content)
        
        # Add metadata about today's data
        ai_output["today_date"] = today
        ai_output["total_today_articles"] = len(articles)
        ai_output["found_articles"] = len(articles) > 0
        
        # If agent identified specific articles, fetch their full summaries if needed
        if ai_output.get('relevant_article_ids') and len(ai_output['relevant_article_ids']) > 0:
            # Could optionally trigger summary generation here
            pass

        return jsonify({
            "success": True,
            "agent_response": ai_output.get('response_text', "I found some articles for you."),
            "action": ai_output.get('action', 'search'),
            "search_query": ai_output.get('search_query', user_query),
            "summary": ai_output.get('summary'),
            "article_ids": ai_output.get('relevant_article_ids', []),
            "category_focus": ai_output.get('category_focus'),
            "today_date": today,
            "articles_found_count": len(articles),
            "timestamp": datetime.now().isoformat()
        })

    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error in AI response: {str(e)}")
        return jsonify({
            "success": False,
            "error": "AI response format error",
            "fallback_query": user_query
        }), 500
    except Exception as e:
        logger.error(f"AI Agent error: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": str(e),
            "fallback_query": user_query
        }), 500


@app.route("/ai-agent/today-stats", methods=["GET"])
def get_today_stats_for_agent():
    """
    Quick endpoint to give the AI agent context about today's news volume
    """
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get category breakdown for today
        cursor.execute('''
            SELECT category, COUNT(*) as count
            FROM articles 
            WHERE DATE(timestamp) = ?
            GROUP BY category
            ORDER BY count DESC
        ''', (today,))
        
        categories = [dict(row) for row in cursor.fetchall()]
        
        # Get total count
        cursor.execute('''
            SELECT COUNT(*) as total FROM articles 
            WHERE DATE(timestamp) = ?
        ''', (today,))
        
        total = cursor.fetchone()['total']
        
        # Get top sources
        cursor.execute('''
            SELECT source, COUNT(*) as count
            FROM articles 
            WHERE DATE(timestamp) = ?
            GROUP BY source
            ORDER BY count DESC
            LIMIT 5
        ''', (today,))
        
        sources = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({
            "success": True,
            "date": today,
            "total_articles": total,
            "categories": categories,
            "top_sources": sources
        })
        
    except Exception as e:
        logger.error(f"Error getting today stats: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
def get_share_counts(url):
    """Fetch social share counts using the SharedCount SDK"""
    try:
        logger.info(f"Fetching share counts for URL: {url}")
        
        if not sharedcount_api:
            return None
        # Make sure the URL is properly formatted for the SDK
        response = sharedcount_api.get(url)
        
        if not response:
            logger.warning(f"No response from SharedCount API for URL: {url}")
            return {"total_shares": 0, "Facebook": 0, "Pinterest": 0}
            
        # Transform the response to match our expected format
        share_data = {
            'total_shares': response.get('total_count', 0),
            'Facebook': response.get('Facebook', {}).get('total_count', 0),
            'Pinterest': response.get('Pinterest', 0),
            # Include detailed Facebook counts if available
            'FacebookDetails': {
                'comments': response.get('Facebook', {}).get('comment_count', 0),
                'reactions': response.get('Facebook', {}).get('reaction_count', 0),
                'shares': response.get('Facebook', {}).get('share_count', 0)
            }
        }
        
        logger.info(f"Share counts for {url}: {share_data}")
        return share_data
        
    except Exception as e:
        logger.error(f"Error fetching share counts for {url}: {str(e)}", exc_info=True)
        # Return empty counts instead of crashing
        return {"total_shares": 0, "Facebook": 0, "Pinterest": 0, "error": str(e)}
    
@app.route("/get-share-counts", methods=["GET"])
def get_share_counts_endpoint():
    import urllib.parse
    
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "URL parameter is required"}), 400
    
    try:
        # Decode the URL properly (it's double-encoded)
        # URL comes as: https%3A%2F%2Fexample.com%2Fpath -> we need to decode it
        decoded_url = urllib.parse.unquote(url)
        
        # Log for debugging
        logger.info(f"Original URL param: {url}")
        logger.info(f"Decoded URL: {decoded_url}")
        
        # First check if we have recent counts in the database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT share_counts, share_counts_updated 
            FROM articles 
            WHERE link = ?
        ''', (decoded_url,))
        article = cursor.fetchone()
        conn.close()
        
        # If we have recent counts (updated within last 4 hours), return them
        if article and article['share_counts']:
            try:
                last_updated_str = article['share_counts_updated']
                if last_updated_str:  # Only parse if not None
                    last_updated = parser.parse(last_updated_str)
                    if (datetime.now(timezone.utc) - last_updated) < timedelta(hours=4):
                        return jsonify(json.loads(article['share_counts']))
            except Exception as e:
                logger.warning(f"Error parsing timestamp for {decoded_url}: {str(e)}")
        
        # Otherwise fetch fresh counts using the SDK
        share_counts = get_share_counts(decoded_url)
        
        if not share_counts:
            return jsonify({"error": "No share counts available"}), 404
        
        # Update the database with fresh counts
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE articles 
            SET share_counts = ?, share_counts_updated = ?
            WHERE link = ?
        ''', (
            json.dumps(share_counts),
            datetime.now(timezone.utc).isoformat(),
            decoded_url
        ))
        conn.commit()
        conn.close()
        
        return jsonify(share_counts)
        
    except Exception as e:
        logger.error(f"Error in get-share-counts: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to get share counts"}), 500
    
def load_deleted_articles():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT article_title FROM deleted_articles')
    deleted_articles = [row['article_title'] for row in cursor.fetchall()]
    conn.close()
    return deleted_articles

def save_deleted_article(article_id, article_title):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR IGNORE INTO deleted_articles (article_id, article_title)
        VALUES (?, ?)
    ''', (article_id, article_title))
    conn.commit()
    conn.close()

EMOJIS = ["🌐", "📝", "📰", "💻", "📚", "📰"]

@app.route("/json-keys", methods=["GET"])
def get_keys():
    with open("json/links.json") as file:
        links_data = json.load(file)

    feeds = []
    for idx, (key, links) in enumerate(links_data.items(), start=1):
        feed = {
            "id": idx,
            "name": key,
            "count": len(links),
            "icon": random.choice(EMOJIS)
        }
        feeds.append(feed)

    return jsonify({"feeds": feeds})
# mixer.init()
def balance_categories(unique_articles, non_unique_articles):
    """
    Balance categories to ensure each has at least 5 articles.
    If a category is missing or has less than 5 articles, it will be filled
    with articles from non_unique_articles.
    
    Args:
        unique_articles (list): List of unique articles
        non_unique_articles (list): List of non-unique articles
        
    Returns:
        list: Balanced list of articles with each category having at least 5 articles
    """
    # Count articles per category in unique_articles
    category_counts = {}
    for article in unique_articles:
        category = article.get('category', 'مختلفات')
        category_counts[category] = category_counts.get(category, 0) + 1
    
    # Get all possible categories
    all_categories = [
        "شؤون أمنية",
        "شؤون جهوية",
        "مجالس منتخبة",
        "شؤون سياسية",
        "مختلفات"
    ]
    
    # Initialize balanced articles with unique articles
    balanced_articles = unique_articles.copy()
    
    # For each category, check if we need to add more articles
    for category in all_categories:
        current_count = category_counts.get(category, 0)
        
        # If category is missing or has less than 5 articles
        if current_count < 5:
            needed = 5 - current_count
            
            # Find articles in non_unique_articles with this category
            candidates = [
                art for art in non_unique_articles 
                if art.get('category', 'مختلفات') == category
            ]
            
            # Add up to needed articles (but not more than available)
            added = 0
            for candidate in candidates:
                if added >= needed:
                    break
                if candidate not in balanced_articles:  # Ensure we don't add duplicates
                    balanced_articles.append(candidate)
                    added += 1
            
            logger.info(f"Added {added} articles to category '{category}' from non-unique pool")
    
    # Print final counts for verification
    final_counts = {}
    for article in balanced_articles:
        category = article.get('category', 'مختلفات')
        final_counts[category] = final_counts.get(category, 0) + 1
    
    logger.info("Final category counts:")
    for category, count in final_counts.items():
        logger.info(f"{category}: {count} articles")
    
    return balanced_articles

def normalize_arabic(text):
    """Optimized Arabic text normalizer for better performance"""
    # Basic normalization (faster than full normalization)
    text = re.sub(r'[إأآا]', 'ا', text)  # Standardize Alef
    text = re.sub(r'[ئؤ]', 'ء', text)    # Standardize Hamza
    return text

@app.route('/validate-rss', methods=['POST'])
def validate_rss():
    data = request.get_json()
    url = data.get('url')
    
    # Your RSS validation logic here
    # Check if the website has RSS feeds
    # Return appropriate response
    
    return jsonify({
        'valid': True,
        'message': 'RSS feed found successfully',
        'feed'
        '_url': f'{url.value}/feed'
    })
def remove_similar_articles(articles, similarity_threshold=0.25):
    """Returns: 
    - List of unique articles (keeping 1 per similar group)
    - List of similar groups (for logging)
    """
    if not articles:
        return [], []

    try:
        texts = [normalize_arabic(f"{a['title'][:900]}") for a in articles]
        vectorizer = TfidfVectorizer(max_features=10000, ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform(texts)
        similarity_matrix = cosine_similarity(tfidf_matrix)

        to_keep = set(range(len(articles)))
        similar_groups = []

        for i in range(len(similarity_matrix)):
            if i not in to_keep:
                continue

            group = [i]  # Include itself
            for j in range(i + 1, len(similarity_matrix)):
                if similarity_matrix[i][j] > similarity_threshold and j in to_keep:
                    group.append(j)
                    to_keep.discard(j)  # Mark as duplicate

            if len(group) > 1:
                similar_groups.append([articles[idx] for idx in group])

        # For each group, keep the "best" article (e.g., longest content)
        selected_articles = []
        for idx in sorted(to_keep):
            selected_articles.append(articles[idx])

        # Add 1 article from each similar group (pick the most detailed)
        for group in similar_groups:
            best_article = max(group, key=lambda x: len(x.get("content", "")))
            selected_articles.append(best_article)

        return selected_articles, similar_groups

    except Exception as e:
        print(f"Similarity detection error: {str(e)}")
        return articles, []  # Fallback: Return all if error occurs


def basic_deduplication(articles):
    """Fallback deduplication when memory is constrained"""
    seen = set()
    unique = []
    for article in articles:
        identifier = f"{article['title'][:150]}_{article['source']}"
        if identifier not in seen:
            seen.add(identifier)
            unique.append(article)
    return unique

def save_feed_health_report(feed_statuses):
    """
    Save an Excel report listing every RSS feed URL checked during this run,
    whether it's currently working, working with warnings, or failing, plus
    the error message and how many entries were found.

    feed_statuses: list of dicts with keys:
        source, url, status, entry_count, error_message, checked_at
    """
    if not feed_statuses:
        return None

    today = datetime.now()
    folder_path = os.path.join(os.getcwd(), str(today.year), today.strftime('%m'), today.strftime('%d'))
    os.makedirs(folder_path, exist_ok=True)

    filename = os.path.join(folder_path, f"feed_health_{today.strftime('%Y-%m-%d_%H%M%S')}.xlsx")

    status_labels = {
        "ok": "يعمل بشكل طبيعي",
        "ok_with_warnings": "يعمل مع تحذيرات (XML غير سليم لكن تم استرجاع المقالات)",
        "ok_with_fallback": "يعمل عبر معالجة احتياطية (feedparser فشل، تم الاسترجاع عبر lxml)",
        "error": "متوقف / خطأ",
    }

    rows = []
    for item in feed_statuses:
        rows.append({
            "source": item.get("source", ""),
            "url": item.get("url", ""),
            "status": status_labels.get(item.get("status"), item.get("status", "")),
            "status_code": item.get("status", ""),
            "entry_count": item.get("entry_count", 0),
            "error_message": item.get("error_message", ""),
            "checked_at": item.get("checked_at", ""),
        })

    df = pd.DataFrame(rows)
    # Put the broken feeds first so they're easy to spot
    order = {"error": 0, "ok_with_fallback": 1, "ok_with_warnings": 2, "ok": 3}
    df["_sort"] = df["status_code"].map(order).fillna(3)
    df = df.sort_values("_sort").drop(columns="_sort")

    try:
        from openpyxl.styles import PatternFill

        red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        green_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")

        def _color_sheet(worksheet, sheet_df):
            for row_idx, status_code in enumerate(sheet_df["status_code"], start=2):  # row 1 is header
                fill = red_fill if status_code == "error" else green_fill
                for col_idx in range(1, len(sheet_df.columns) + 1):
                    worksheet.cell(row=row_idx, column=col_idx).fill = fill

        with pd.ExcelWriter(filename, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="feed_health")
            working_df = df[df["status_code"] != "error"]
            broken_df = df[df["status_code"] == "error"]
            working_df.to_excel(writer, index=False, sheet_name="working_feeds")
            broken_df.to_excel(writer, index=False, sheet_name="broken_feeds")

            _color_sheet(writer.sheets["feed_health"], df)
            _color_sheet(writer.sheets["working_feeds"], working_df)
            _color_sheet(writer.sheets["broken_feeds"], broken_df)

        logger.info(f"Feed health report saved to {filename} "
                    f"({len(broken_df)} broken / {len(df)} total)")
        return filename
    except Exception as e:
        logger.error(f"Failed to save feed health report: {str(e)}")
        return None


@app.route("/check-feeds", methods=["GET"])
def check_feeds():
    """
    Standalone RSS health check: goes through every feed URL in json/links.json,
    tries to parse it, and saves an Excel report of which ones are working,
    which are working with warnings (recovered from malformed XML), and which
    are broken - without doing any article scraping/classification.
    """
    try:
        links = load_json_file("json/links.json")
    except Exception as e:
        return jsonify({"status": "error", "message": f"Could not load json/links.json: {str(e)}"}), 500

    feed_statuses = []
    for src, urls in links.items():
        for url in urls:
            _, status = safe_parse_feed(url, return_status=True)
            feed_statuses.append({
                "source": src,
                "url": url,
                "status": status["status"],
                "entry_count": status["entry_count"],
                "error_message": status["error_message"],
                "checked_at": datetime.now(timezone.utc).isoformat(),
            })

    feed_health_path = save_feed_health_report(feed_statuses)

    return jsonify({
        "status": "success",
        "feed_health_report": feed_health_path,
        "feeds_total": len(feed_statuses),
        "feeds_ok": sum(1 for f in feed_statuses if f["status"] == "ok"),
        "feeds_ok_with_warnings": sum(1 for f in feed_statuses if f["status"] == "ok_with_warnings"),
        "feeds_broken": sum(1 for f in feed_statuses if f["status"] == "error"),
        "broken_feeds": [f for f in feed_statuses if f["status"] == "error"]
    })


@app.route("/fetch-rss", methods=["GET"])
def fetch_rss():
    # Load configuration files
    links = load_json_file("json/links.json")
    places = load_json_file("json/places.json").get("keywords", [])
    keywords = load_json_file("json/keywords.json").get("keywords", [])
    deleted_articles = load_deleted_articles()

    all_articles = []
    all_articles_notunique = []
    processed_count = 0
    feed_statuses = []

    try:
        # Process feeds with memory monitoring
        for src, urls in links.items():
            for url in urls:
                print(f"Processing: {url}")
                feed, status = safe_parse_feed(url, return_status=True)
                feed_statuses.append({
                    "source": src,
                    "url": url,
                    "status": status["status"],
                    "entry_count": status["entry_count"],
                    "error_message": status["error_message"],
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                })
                if not feed:
                    continue
                
                for entry in feed.entries:
                    if not entry.get("published"):
                        continue
                        
                    if not is_same_day(entry.published):
                        continue
                        
                    processed_count += 1
                    
                    # Extract article content
                    title = entry.get("title", "No Title")
                    if title in deleted_articles:
                        continue
                        
                    content = entry.get("content", [{"value": entry.get("summary", "")}])[0]["value"]
                    text = f"{title} {entry.get('summary', '')} {content}"
                    
                    # Check keywords
                    matched_places, matched_keywords = contains_keywords(text, places, keywords)
                    
                    # FIRST: Check if article already exists in database by link
                    article_link = entry.get("link", "No Link")
                    existing_article_id = None
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT id, share_counts FROM articles WHERE link = ?",
                        (article_link,)
                    )
                    if existing := cursor.fetchone():
                        existing_article_id = existing['id']
                        existing_share_counts = existing['share_counts']
                    conn.close()
                    
                    # Use existing ID if article exists, otherwise generate new one
                    article_id = existing_article_id if existing_article_id else str(uuid4())
                    
                    article = {
                        "id": article_id,  # Use consistent ID
                        "title": title,
                        "pubDate": entry.get("published", "No Date"),
                        "image_url": entry.get("media_content", [{}])[0].get("url", "No Image"),
                        "link": article_link,
                        "description": entry.get("summary", "No Description"),
                        "content": content,
                        "source": src,
                        "matched_places": ", ".join(matched_places) if matched_places else "",
                        "matched_keywords": ", ".join(matched_keywords) if matched_keywords else "",
                        "share_counts": existing_share_counts if existing_article_id else {},
                        "share_counts_updated": datetime.now(timezone.utc).isoformat()
                    }
                    
                    if matched_places and matched_keywords:
                        all_articles.append(article)
                    else:
                        all_articles_notunique.append(article)
        
        # Rest of your deduplication and processing logic remains the same
        if all_articles:
            # First pass: Exact duplicates (by title)
            seen_titles = set()
            unique_articles = []
            for article in all_articles:
                norm_title = normalize_arabic(article["title"])
                if norm_title not in seen_titles:
                    seen_titles.add(norm_title)
                    unique_articles.append(article)

            # Second pass: Remove similar articles (keeping 1 per group)
            final_articles, similar_groups = remove_similar_articles(unique_articles)

            # Classify and balance categories
            for article in final_articles:
                article["category"] = classifier.classify(f"{article['title']} {article['description']}")

            balanced_articles = balance_categories(final_articles, all_articles_notunique)

            # Save to DB & Excel
            save_articles_to_db(balanced_articles)
            save_to_excel_and_word_fixed(balanced_articles)
            feed_health_path = save_feed_health_report(feed_statuses)

            return jsonify({
                "status": "success",
                "article_count": len(balanced_articles),
                "processed_count": processed_count,
                "articles": balanced_articles,
                "feed_health_report": feed_health_path,
                "feeds_broken": sum(1 for f in feed_statuses if f["status"] == "error"),
                "feeds_total": len(feed_statuses)
            })

        feed_health_path = save_feed_health_report(feed_statuses)
        return jsonify({
            "status": "success",
            "message": "No matching articles found today",
            "processed_count": processed_count,
            "feed_health_report": feed_health_path,
            "feeds_broken": sum(1 for f in feed_statuses if f["status"] == "error"),
            "feeds_total": len(feed_statuses)
        })
        
    except Exception as e:
        logger.error(f"Error in fetch_rss: {str(e)}", exc_info=True)
        feed_health_path = save_feed_health_report(feed_statuses)
        return jsonify({
            "status": "error",
            "message": str(e),
            "processed_count": processed_count,
            "feed_health_report": feed_health_path
        }), 500


@app.route("/search", methods=["GET"])
def search_articles():
    query = request.args.get("query", "").strip().lower()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    category_map = {
        "1": "شؤون سياسية",
        "2": "شؤون أمنية",
        "3": "شؤون جهوية",
        "4": "مجالس منتخبة",
        "5": "مختلفات"
    }
    try:
        # Get today's date in the same format as stored in your database
        today = datetime.now().strftime('%Y-%m-%d')  # Adjust format if needed
        
        # Special case: return all articles when query is "all"
        if query == "all":
            cursor.execute('''
                SELECT * FROM articles 
                WHERE DATE(timestamp) = ?
                ORDER BY timestamp DESC
            ''', (today,))
        elif query in category_map:
            # Filter by category shortcut
            category = category_map[query]
            cursor.execute('''
                SELECT * FROM articles 
                WHERE DATE(timestamp) = ? AND category = ?
                ORDER BY timestamp DESC
            ''', (today, category))
        else:
            # Normal search with query
            if not query:
                return jsonify({"articles": [], "message": "Empty search query"})

            # Clean and prepare Arabic search query
            cleaned_query = re.sub(r'[^\w\s\u0600-\u06FF]', '', query)
            search_terms = cleaned_query.split()
            
            # Build dynamic query with multiple terms
            conditions = []
            params = []
            for term in search_terms:
                term_pattern = f"%{term}%"
                conditions.append("(title LIKE ? OR description LIKE ? OR content LIKE ?)")
                params.extend([term_pattern]*3)
            
            # Build the complete WHERE clause
            where_clause = "DATE(timestamp) = ?"
            params = [today] + params  # Add today's date as first parameter
            
            if conditions:
                where_clause += " AND (" + " OR ".join(conditions) + ")"
            
            sql = f'''
                SELECT * FROM articles 
                WHERE {where_clause}
                ORDER BY timestamp DESC
            '''
            cursor.execute(sql, params)
        
        results = cursor.fetchall()
        
        # Format the results to match frontend expectations
        articles = [{
            "id": row['id'],
            "link": row['link'],
            "title": row['title'],
            "description": row['description'],
            "content": row['content'],
            "author": row['source'],  # Using source as author
            "pubDate": row['pubDate'],   # Using pubDate as time
            "isUnread": True,
            "source": row['source'],
            "matched_places": row['matched_places'],
            "category": row['category']
        } for row in results]
        
        return jsonify({
            "articles": articles,
            "message": f"Found {len(articles)} articles from today"
        })
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({"articles": [], "error": "Search failed"}), 500
        
    finally:
        conn.close()


@app.route("/add-rss-feed", methods=["POST"])
def add_rss_feed():
    """
    Detect RSS feed from a URL, check for duplicates in links.json, 
    and stop at the first working path.
    """
    try:
        data = request.get_json()
        website_url = data.get('url', '').strip()
        if not website_url:
            return jsonify({"error": "URL is required"}), 400

        # 1. Auto-normalize URL (e.g., "hespress.com" -> "https://hespress.com/")
        if not website_url.startswith(('http://', 'https://')):
            website_url = 'https://' + website_url
            
        from urllib.parse import urlparse
        parsed_url = urlparse(website_url)
        domain = parsed_url.netloc.replace('www.', '')

        # 2. Check if domain already exists in links.json
        links_file = "json/links.json"
        try:
            with open(links_file, "r", encoding="utf-8") as f:
                links_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            links_data = {}

        if domain in links_data:
            return jsonify({
                "success": False, 
                "message": f"Domain '{domain}' already exists in your feed list.",
                "existing_feeds": links_data[domain]
            }), 409

        # 3. Check paths and STOP as soon as one works
        common_feed_paths = [
            '/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml'
        ]
        
        found_feed = None
        # Try the base URL itself first in case it's a direct feed link
        if check_rss_feed(website_url):
            found_feed = website_url
        else:
            # Try sub-paths
            base_url = f"{parsed_url.scheme}://{parsed_url.netloc}".rstrip('/')
            for path in common_feed_paths:
                test_url = f"{base_url}{path}"
                if check_rss_feed(test_url):
                    found_feed = test_url
                    break # Stop trying other paths once one works

        if not found_feed:
            return jsonify({
                "success": False,
                "message": "No valid RSS feed found for the provided URL"
            }), 404

        # 4. Save to links.json
        links_data[domain] = [found_feed]
        with open(links_file, "w", encoding="utf-8") as f:
            json.dump(links_data, f, ensure_ascii=False, indent=2)

        return jsonify({
            "success": True,
            "message": f"Successfully added feed for {domain}",
            "domain": domain,
            "feed": found_feed
        })

    except Exception as e:
        logger.error(f"Error adding RSS feed: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

def check_rss_feed(url):
    """
    Check if a URL is a valid RSS feed
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        content_type = response.headers.get('content-type', '').lower()
        
        # Check content type
        if any(xml_type in content_type for xml_type in ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml']):
            return True
        
        # Try to parse as XML
        try:
            root = ET.fromstring(response.content)
            if root.tag in ['rss', 'feed', 'rdf:RDF']:
                return True
        except ET.ParseError:
            pass
        
        # Check for common RSS indicators in content
        content_start = response.text[:500].lower()
        if '<rss' in content_start or '<feed' in content_start:
            return True
            
        return False
        
    except Exception as e:
        logger.debug(f"Feed check failed for {url}: {str(e)}")
        return False

@app.route("/list-feeds", methods=["GET"])
def list_feeds():
    """
    Get all currently configured RSS feeds
    """
    try:
        links_file = "json/links.json"
        with open(links_file, "r", encoding="utf-8") as f:
            links_data = json.load(f)
        
        return jsonify({
            "success": True,
            "feeds": links_data,
            "total_domains": len(links_data),
            "total_feeds": sum(len(feeds) for feeds in links_data.values())
        })
        
    except Exception as e:
        logger.error(f"Error listing feeds: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to load feeds"
        }), 500

@app.route("/delete-feed", methods=["DELETE"])
def delete_feed():
    """
    Delete a feed from links.json
    """
    try:
        domain = request.args.get("domain")
        feed_url = request.args.get("feed_url")
        
        if not domain:
            return jsonify({"error": "Domain parameter is required"}), 400
        
        links_file = "json/links.json"
        
        with open(links_file, "r", encoding="utf-8") as f:
            links_data = json.load(f)
        
        if domain not in links_data:
            return jsonify({"error": "Domain not found"}), 404
        
        if feed_url:
            # Delete specific feed URL
            if feed_url in links_data[domain]:
                links_data[domain].remove(feed_url)
                # If no feeds left, remove the domain
                if not links_data[domain]:
                    del links_data[domain]
                message = f"Feed URL deleted successfully"
            else:
                return jsonify({"error": "Feed URL not found"}), 404
        else:
            # Delete entire domain
            del links_data[domain]
            message = f"Domain {domain} deleted successfully"
        
        # Save back to file
        with open(links_file, "w", encoding="utf-8") as f:
            json.dump(links_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            "success": True,
            "message": message,
            "remaining_domains": len(links_data)
        })
        
    except Exception as e:
        logger.error(f"Error deleting feed: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Failed to delete feed: {str(e)}"
        }), 500


@app.route("/filter-by-time", methods=["GET"])
def filter_by_time():
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Get current time
        now = datetime.now()
        today = now.strftime('%Y-%m-%d')
        current_hour = now.hour
        current_minute = now.minute

        # Determine if it's after 10:30 AM
        time_threshold = (current_hour > 10) or (current_hour == 10 and current_minute >= 30)

        if time_threshold:
            # After 10:30 → show only articles from today AFTER 10:30
            cursor.execute('''
                SELECT * FROM articles 
                WHERE DATE(timestamp) = ? AND TIME(timestamp) >= '10:30:00'
                ORDER BY timestamp DESC
            ''', (today,))
        else:
            # Before 10:30 → show only articles from today BEFORE 10:30
            cursor.execute('''
                SELECT * FROM articles 
                WHERE DATE(timestamp) = ? AND TIME(timestamp) < '10:30:00'
                ORDER BY timestamp DESC
            ''', (today,))

        results = cursor.fetchall()

        articles = [{
            "id": row['id'],
            "link": row['link'],
            "title": row['title'],
            "description": row['description'],
            "content": row['content'],
            "author": row['source'],
            "pubDate": row['pubDate'],
            "isUnread": True,
            "source": row['source'],
            "matched_places": row['matched_places'],
            "category": row['category']
        } for row in results]

        return jsonify({
            "articles": articles,
            "filter_time": "10:30",
            "current_time": now.strftime("%H:%M"),
            "time_filter": "after 10:30" if time_threshold else "before 10:30",
            "count": len(articles)
        })

    except Exception as e:
        logger.error(f"Time filter error: {str(e)}")
        return jsonify({"articles": [], "error": "Filter failed"}), 500

    finally:
        conn.close()

categories = [
    "شؤون سياسية",
    "شؤون أمنية", 
    "شؤون جهوية",
    "مجالس منتخبة",
    "مختلفات"
]

@app.route('/available-categories', methods=['GET'])
def available_categories():
    return jsonify({
        'response': 200,
        'results': categories
    })


@app.route("/delete", methods=["DELETE"])
def delete_article():
    global unique_articles

    article_id = request.args.get("article_id")
    article_title = request.args.get("article_title")

    if not article_id or not article_title:
        return jsonify({"error": "Missing parameters"}), 400

    save_deleted_article(article_id, article_title)

    new_articles = [article for article in unique_articles if article["title"] != article_title]
    
    if len(new_articles) == len(unique_articles):
        return jsonify({"error": "Article not found"}), 404

    unique_articles = new_articles

    filename = f"{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    if os.path.exists(filename):
        try:
            df = pd.read_excel(filename)
            df = df[df["title"] != article_title]
            df.to_excel(filename, index=False)
            return jsonify({"message": f"Article '{article_title}' deleted successfully"}), 200
        except Exception as e:
            return jsonify({"error": f"Could not update Excel file: {str(e)}"}), 500

    return jsonify({"message": "Article deleted but no Excel file was found for today."}), 200

@app.route("/analytics/pubdate-stats", methods=["GET"])
def get_pubdate_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT date(pubDate) as pub_date, COUNT(*) as count 
        FROM articles 
        WHERE pubDate >= date('now', '-30 days')
        GROUP BY pub_date 
        ORDER BY count DESC
        LIMIT 7
    ''')
    results = cursor.fetchall()
    conn.close()
    
    labels = [row['pub_date'] for row in results]
    data = [row['count'] for row in results]
    
    return jsonify({
        "labels": labels,
        "data": data
    })

@app.route("/analytics/article-timeline", methods=["GET"])
def get_article_timeline():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    months = []
    counts = []
    
    for i in range(6):
        month = (datetime.now() - timedelta(days=30*i)).strftime('%Y-%m')
        cursor.execute('''
            SELECT COUNT(*) 
            FROM articles 
            WHERE strftime('%Y-%m', timestamp) = ?
        ''', (month,))
        count = cursor.fetchone()[0]
        months.append(month)
        counts.append(count)
    
    conn.close()
    
    return jsonify({
        "labels": months[::-1],
        "data": counts[::-1]
    })

@app.route("/analytics/source-distribution", methods=["GET"])
def get_source_distribution():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT source, COUNT(*) as count 
        FROM articles 
        GROUP BY source 
        ORDER BY count DESC
    ''')
    results = cursor.fetchall()
    conn.close()
    
    labels = [row['source'] for row in results]
    data = [row['count'] for row in results]
    
    return jsonify({
        "labels": labels,
        "data": data
    })

@app.route("/analytics/matched-places", methods=["GET"])
def get_matched_places():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT matched_places, COUNT(*) as count 
        FROM articles 
        WHERE matched_places != ''
        GROUP BY matched_places 
        ORDER BY count DESC
        LIMIT 5
    ''')
    results = cursor.fetchall()
    conn.close()
    
    places = [row['matched_places'] for row in results]
    counts = [row['count'] for row in results]
    
    return jsonify({
        "places": places,
        "counts": counts
    })
def format_timedelta(delta):
    """Convert timedelta to human-readable format"""
    days = delta.days
    hours, remainder = divmod(delta.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{days}d {hours}h {minutes}m {seconds}s"

@app.route("/analytics/daily-stats", methods=["GET"])
def get_daily_stats():
    """Improved analytics with caching"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT date(timestamp) as day, 
                       COUNT(*) as count,
                       GROUP_CONCAT(DISTINCT source) as sources,
                       GROUP_CONCAT(DISTINCT category) as categories
                FROM articles
                WHERE timestamp >= date('now', '-30 days')
                GROUP BY day
                ORDER BY day DESC
                LIMIT 7
            ''')
            
            results = cursor.fetchall()
            
            stats = [{
                "date": row['day'],
                "articles": row['count'],
                "sources": row['sources'].split(',') if row['sources'] else [],
                "categories": row['categories'].split(',') if row['categories'] else []
            } for row in results]
            
        return jsonify({
            "status": "success",
            "data": stats,
            "generated_at": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Analytics error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to generate analytics"
        }), 500


@app.route("/analytics/overview", methods=["GET"])
def analytics_overview():
    """Everything the analytics dashboard needs, for the last `days` days."""
    from collections import Counter

    days = max(1, min(int(request.args.get("days", 30) or 30), 365))
    today = datetime.now().date()
    since = today - timedelta(days=days - 1)

    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT title, description, content, pubDate, source, category, matched_places, "
            "DATE(timestamp) AS day FROM articles WHERE DATE(timestamp) >= ?",
            (since.isoformat(),),
        ).fetchall()
        total_all = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    finally:
        conn.close()

    terms = newspaper_pdf.load_terms("json")
    per_day = Counter()
    reh_day = Counter()
    cats = Counter()
    srcs = Counter()
    hours = Counter()
    places = Counter()
    for r in rows:
        per_day[r["day"]] += 1
        cats[r["category"] or "مختلفات"] += 1
        srcs[r["source"] or "unknown"] += 1
        blob = f"{r['title'] or ''} {r['description'] or ''} {r['content'] or ''}"
        if newspaper_pdf.matches_terms(blob, terms):
            reh_day[r["day"]] += 1
        try:
            hours[parser.parse(r["pubDate"]).hour] += 1
        except Exception:
            pass
        for place in (r["matched_places"] or "").split(","):
            place = place.strip()
            if place:
                places[place] += 1

    timeline = []
    for i in range(days):
        d = (since + timedelta(days=i)).isoformat()
        timeline.append({"date": d, "articles": per_day.get(d, 0), "rehamna": reh_day.get(d, 0)})

    try:
        feeds = sum(len(v) for v in load_json_file("json/links.json").values())
    except Exception:
        feeds = 0

    uptime = timedelta(seconds=int(time.time() - APP_START_TIME))
    t = today.isoformat()
    y = (today - timedelta(days=1)).isoformat()
    return jsonify({
        "days": days,
        "kpis": {
            "total": total_all,
            "period": len(rows),
            "today": per_day.get(t, 0),
            "yesterday": per_day.get(y, 0),
            "rehamna": sum(reh_day.values()),
            "sources": len(srcs),
            "feeds": feeds,
            "uptime": format_timedelta(uptime),
        },
        "timeline": timeline,
        "categories": [{"name": k, "value": v} for k, v in cats.most_common()],
        "sources": [{"name": k, "value": v} for k, v in srcs.most_common(10)],
        "hours": [{"hour": h, "value": hours.get(h, 0)} for h in range(24)],
        "places": [{"name": k, "value": v} for k, v in places.most_common(14)],
    })

@app.route("/analytics/quick-stats", methods=["GET"])
def get_quick_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get article stats
    cursor.execute('SELECT COUNT(*) FROM articles')
    total_articles = cursor.fetchone()[0]
    
    cursor.execute('''
        SELECT COUNT(*) 
        FROM articles 
        WHERE date(timestamp) = date('now')
    ''')
    articles_today = cursor.fetchone()[0]
    
    # Get popular categories
    cursor.execute('''
        SELECT category, COUNT(*) as count 
        FROM articles 
        GROUP BY category 
        ORDER BY count DESC 
        LIMIT 3
    ''')
    top_categories = [{"category": row[0], "count": row[1]} for row in cursor.fetchall()]
    
    conn.close()
    
    # Calculate system metrics
    uptime_seconds = time.time() - APP_START_TIME
    uptime_delta = timedelta(seconds=uptime_seconds)
    memory_usage = PROCESS.memory_info().rss / (1024 * 1024)  # in MB
    
    return jsonify({
        "articles": {
            "total": total_articles,
            "today": articles_today,
            "dailyAverage": round(total_articles / max(1, uptime_delta.days), 2),
            "topCategories": top_categories
        },
        "system": {
            "uptime": format_timedelta(uptime_delta),
            "uptimeSeconds": uptime_seconds,
            "startTime": datetime.fromtimestamp(APP_START_TIME).isoformat(),
            "memoryUsageMB": round(memory_usage, 2),
            "cpuPercent": psutil.cpu_percent(),
            "activeThreads": threading.active_count()
        },
        "performance": {
            "status": "optimal" if memory_usage < 800 else "warning",
            "lastUpdated": datetime.now().isoformat()
        }
    })


# ---------------------------------------------------------------------------
# Reader API (used by the redesigned 3-pane UI)
# ---------------------------------------------------------------------------

def _row_to_article(row):
    a = dict(row)
    return {
        "id": a.get("id"),
        "link": a.get("link"),
        "title": a.get("title"),
        "description": a.get("description"),
        "content": a.get("content"),
        "author": a.get("source"),
        "source": a.get("source"),
        "pubDate": a.get("pubDate"),
        "time": a.get("pubDate"),
        "image_url": a.get("image_url"),
        "matched_places": a.get("matched_places"),
        "category": a.get("category"),
        "timestamp": a.get("timestamp"),
        "isUnread": True,
    }


@app.route("/articles", methods=["GET"])
def list_articles():
    """Articles already stored in the DB (fast, no RSS fetching).

    Query params: days (default 1), category, source, q
    """
    days = max(1, min(int(request.args.get("days", 1) or 1), 365))
    category = request.args.get("category")
    source = request.args.get("source")
    q = (request.args.get("q") or "").strip()
    since = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    sql = "SELECT * FROM articles WHERE DATE(timestamp) >= ?"
    params = [since]
    if category:
        sql += " AND category = ?"
        params.append(category)
    if source:
        sql += " AND source = ?"
        params.append(source)
    for term in q.split():
        sql += " AND (title LIKE ? OR description LIKE ? OR content LIKE ?)"
        params += [f"%{term}%"] * 3
    sql += " ORDER BY timestamp DESC LIMIT 1000"

    conn = get_db_connection()
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    articles = [_row_to_article(r) for r in rows]
    return jsonify({"articles": articles, "count": len(articles), "days": days})


# ---------------------------------------------------------------------------
# Rehamna newspaper (front-page style PDF with photos)
# ---------------------------------------------------------------------------

def _ai_rehamna_editorial(digest):
    """Write one Arabic newspaper article from all Rehamna stories (optional)."""
    api_key = SummarizationConfig.OPENROUTER_API_KEY
    model = SummarizationConfig.OPENROUTER_MODEL
    if not api_key or not model:
        return None
    client = openai.OpenAI(api_key=api_key.split(",")[0].strip(),
                           base_url=SummarizationConfig.OPENROUTER_BASE_URL)
    prompt = (
        "أنت محرر صحفي في جريدة محلية بإقليم الرحامنة. اعتمادا فقط على الأخبار التالية، "
        "اكتب مقالا افتتاحيا واحدا بالعربية الفصحى (بين 150 و250 كلمة) يلخص أبرز ما جرى "
        "في الإقليم، بأسلوب صحفي محايد، دون عناوين أو تعداد نقطي ودون اختلاق معلومات:\n\n"
        f"{digest}"
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=700,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"AI editorial failed: {e}")
        return None


def _rehamna_params():
    days = max(1, min(int(request.args.get("days", 1) or 1), 90))
    limit = max(1, min(int(request.args.get("limit", 40) or 40), 120))
    return days, limit


@app.route("/rehamna/articles", methods=["GET"])
def rehamna_articles():
    days, limit = _rehamna_params()
    terms = newspaper_pdf.load_terms("json")
    found = newspaper_pdf.collect_articles(DATABASE_NAME, days=days, terms=terms, limit=limit)
    articles = []
    for a in found:
        item = _row_to_article(a)
        item["matched_terms"] = a.get("matched_terms", [])
        articles.append(item)
    return jsonify({"articles": articles, "count": len(articles), "days": days, "terms": terms})


@app.route("/rehamna/newspaper.pdf", methods=["GET"])
def rehamna_newspaper_pdf():
    """Generate the Rehamna front-page newspaper.

    Query params: days (1..90), limit, ai (1 = let the LLM write the editorial),
    download (1 = force download instead of inline view)
    """
    days, limit = _rehamna_params()
    use_ai = request.args.get("ai", "1") != "0"
    terms = newspaper_pdf.load_terms("json")
    articles = newspaper_pdf.collect_articles(DATABASE_NAME, days=days, terms=terms, limit=limit)

    editorial = None
    if use_ai and articles:
        editorial = newspaper_pdf.ai_editorial(articles, _ai_rehamna_editorial)

    pdf_bytes = newspaper_pdf.build_pdf(articles, days=days, editorial=editorial)

    # Keep an archived copy next to the daily Excel/Word reports.
    try:
        now = datetime.now()
        folder = os.path.join("reports", "rehamna", now.strftime("%Y"), now.strftime("%m"))
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, f"rehamna-{now:%Y-%m-%d}-{days}d.pdf"), "wb") as f:
            f.write(pdf_bytes)
    except Exception as e:
        logger.warning(f"Could not archive newspaper PDF: {e}")

    filename = f"rehamna-{datetime.now():%Y-%m-%d}.pdf"
    disposition = "attachment" if request.args.get("download") == "1" else "inline"
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)