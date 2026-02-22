#!/usr/bin/env python3
import os
import re
import sys
import time
import hashlib
from urllib.parse import urlparse

import requests
from playwright.sync_api import sync_playwright

GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"

DEFAULT_QUERY = '"Donald Trump"'
DEFAULT_TIMESPAN = "7d"
MAX_ARTICLES_TO_SCAN = 30
IMAGES_TO_CAPTURE = 3
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")

VIEWPORT = {"width": 1920, "height": 1080}

US_DOMAINS = {
    "nytimes.com", "washingtonpost.com", "cnn.com", "foxnews.com",
    "nbcnews.com", "cbsnews.com", "abcnews.go.com", "usatoday.com",
    "politico.com", "thehill.com", "reuters.com", "apnews.com",
    "npr.org", "pbs.org", "bloomberg.com", "wsj.com", "latimes.com",
    "chicagotribune.com", "nypost.com", "newsweek.com", "time.com",
    "axios.com", "thedailybeast.com", "huffpost.com", "vox.com",
    "msnbc.com", "cnbc.com", "bbc.com", "theguardian.com",
}

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def safe_filename(s: str, max_len: int = 80) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[^a-zA-Z0-9._ -]+", "", s)
    s = s.replace(" ", "_")
    return (s[:max_len] if len(s) > max_len else s) or "page"


def is_us_source(domain: str) -> bool:
    domain = domain.lower().strip()
    for us in US_DOMAINS:
        if domain == us or domain.endswith("." + us):
            return True
    return False


def fetch_gdelt_articles(query: str, timespan: str, maxrecords: int) -> list[dict]:
    params = {
        "query": f"{query} sourcelang:eng sourcecountry:US",
        "mode": "ArtList",
        "format": "json",
        "timespan": timespan,
        "maxrecords": maxrecords,
        "sort": "HybridRel",
    }
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        print(f"  GDELT request attempt {attempt}/{max_retries}...")
        r = SESSION.get(GDELT_DOC_ENDPOINT, params=params, timeout=20)
        print(f"  Response: {r.status_code} ({len(r.content)} bytes)")
        if r.status_code == 429:
            wait = 5 * attempt
            print(f"  Rate-limited (429). Retrying in {wait}s...")
            time.sleep(wait)
            continue
        if r.status_code >= 400:
            print(f"  Server error ({r.status_code}). Retrying in {5 * attempt}s...")
            time.sleep(5 * attempt)
            continue
        data = r.json()
        articles = data.get("articles", [])
        print(f"  Got {len(articles)} articles.")
        return articles
    print(f"  All {max_retries} attempts failed (last status: {r.status_code}).")
    r.raise_for_status()
    return []


def screenshot_page(browser, url: str, out_path: str) -> str:
    context = browser.new_context(
        viewport=VIEWPORT,
        user_agent=UA,
        locale="en-US",
    )
    page = context.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        page.screenshot(path=out_path, full_page=False)
    finally:
        context.close()
    return out_path


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    timespan = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TIMESPAN

    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"Query: {query}")
    print(f"Timespan: {timespan}")
    print(f"Output: {OUT_DIR}")
    print("Fetching articles from GDELT (US sources only)...")

    try:
        articles = fetch_gdelt_articles(
            query=query, timespan=timespan, maxrecords=MAX_ARTICLES_TO_SCAN
        )
    except Exception as e:
        print(f"ERROR fetching GDELT results: {e}")
        return 2

    if not articles:
        print("No articles returned.")
        return 1

    us_articles = [
        a for a in articles
        if a.get("domain") and is_us_source(a["domain"])
    ]
    print(f"Found {len(articles)} articles, {len(us_articles)} from US sources.\n")

    if not us_articles:
        print("No US-source articles found. Try a broader query or timespan.")
        return 1

    captured = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)

        for a in us_articles:
            if captured >= IMAGES_TO_CAPTURE:
                break

            url = a.get("url")
            title = a.get("title") or "untitled"
            domain = a.get("domain") or urlparse(url).netloc

            if not url:
                continue

            print(f"[{captured + 1}/{IMAGES_TO_CAPTURE}] {domain} — {title}")
            print(f"  URL: {url}")

            try:
                h = hashlib.sha256(url.encode("utf-8")).hexdigest()[:10]
                stem = f"{safe_filename(domain, 30)}_{h}_{safe_filename(title, 50)}"
                out_path = os.path.join(OUT_DIR, f"{stem}.png")

                screenshot_page(browser, url, out_path)
                captured += 1
                print(f"  Saved: {out_path}\n")

                time.sleep(3)

            except Exception as e:
                print(f"  Error: {e}\n")

        browser.close()

    print(f"Done. Captured {captured} screenshots into {OUT_DIR}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
