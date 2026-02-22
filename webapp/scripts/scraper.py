#!/usr/bin/env python3
import os
import re
import sys
import time
import json
import hashlib
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"

DEFAULT_QUERY = '"Donald Trump"'
DEFAULT_TIMESPAN = "7d"  # recent window (e.g., 1d, 7d, 1w, 1m)
MAX_ARTICLES_TO_SCAN = 50  # scan this many article URLs to find 5 images
IMAGES_TO_DOWNLOAD = 5
OUT_DIR = "headline_images"

UA = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 (HeadlineImageDownloader/1.0)"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def safe_filename(s: str, max_len: int = 120) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[^a-zA-Z0-9._ -]+", "", s)
    s = s.replace(" ", "_")
    return (s[:max_len] if len(s) > max_len else s) or "image"


def fetch_gdelt_articles(query: str, timespan: str, maxrecords: int) -> list[dict]:
    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "timespan": timespan,
        "maxrecords": maxrecords,
        "sort": "HybridRel",  # try "DateDesc" if you prefer newest-first
    }
    r = SESSION.get(GDELT_DOC_ENDPOINT, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    return data.get("articles", [])


def extract_social_image(url: str) -> Optional[str]:
    """
    Returns best-effort social image URL from meta tags:
    og:image, twitter:image, etc.
    """
    r = SESSION.get(url, timeout=20, allow_redirects=True)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "lxml")

    # Prefer OG image
    for key in ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]:
        tag = soup.find("meta", attrs={"property": key}) or soup.find(
            "meta", attrs={"name": key}
        )
        if tag and tag.get("content"):
            img = tag["content"].strip()
            if img:
                return img

    return None


def guess_ext_from_headers(resp: requests.Response, fallback_url: str) -> str:
    ctype = (resp.headers.get("Content-Type") or "").lower()
    if "image/jpeg" in ctype or "image/jpg" in ctype:
        return ".jpg"
    if "image/png" in ctype:
        return ".png"
    if "image/webp" in ctype:
        return ".webp"
    if "image/gif" in ctype:
        return ".gif"

    # fallback: parse url path
    path = urlparse(fallback_url).path.lower()
    for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext

    return ".img"


def download_image(img_url: str, out_path_no_ext: str) -> str:
    r = SESSION.get(img_url, stream=True, timeout=25, allow_redirects=True)
    r.raise_for_status()

    ext = guess_ext_from_headers(r, img_url)
    out_path = out_path_no_ext + ext

    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 64):
            if chunk:
                f.write(chunk)

    return out_path


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    timespan = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TIMESPAN

    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"Query: {query}")
    print(f"Timespan: {timespan}")
    print("Fetching articles from GDELT...")

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

    downloaded = 0
    scanned = 0

    for a in articles:
        if downloaded >= IMAGES_TO_DOWNLOAD:
            break

        url = a.get("url")
        title = a.get("title") or "untitled"
        domain = a.get("domain") or urlparse(url).netloc if url else "unknown"

        if not url:
            continue

        scanned += 1
        print(f"\n[{scanned}/{len(articles)}] {domain} — {title}")
        print(f"URL: {url}")

        try:
            img = extract_social_image(url)
            if not img:
                print("  No og:image/twitter:image found; skipping.")
                continue

            # stable file stem: domain + hash(url) + title snippet
            h = hashlib.sha256(url.encode("utf-8")).hexdigest()[:10]
            stem = f"{domain}_{h}_{safe_filename(title, 70)}"
            out_no_ext = os.path.join(OUT_DIR, stem)

            path = download_image(img, out_no_ext)
            downloaded += 1
            print(f"  Downloaded: {path}")
            print(f"  Image URL:  {img}")

            # be polite
            time.sleep(0.5)

        except requests.HTTPError as e:
            print(f"  HTTP error: {e}")
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\nDone. Downloaded {downloaded} images into ./{OUT_DIR}/")
    if downloaded < IMAGES_TO_DOWNLOAD:
        print("Tip: try a larger timespan (e.g. 14d) or loosen query to 'Trump'.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
