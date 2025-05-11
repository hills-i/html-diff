#!/usr/bin/python3
import cgi, cgitb, requests, sys, io, re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

TIMEOUT = 20
STATUS_CODES = {
    400: 'Bad Request',
    404: 'Not Found',
    500: 'Internal Server Error',
    504: 'Gateway Timeout'
}

cgitb.enable()
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def send_response(status_code, content_type, content):
    status = f"{status_code} {STATUS_CODES.get(status_code, 'Error')}"
    print(f"Status: {status}")
    print(f"Content-Type: {content_type}; charset=utf-8")
    print("Access-Control-Allow-Origin: *\n")
    print(content)

def rewrite_urls(soup, base_url):
    # Add base tag to head
    base_tag = soup.new_tag('base', href=base_url)
    head = soup.find('head') or soup.find('html')
    if head:
        head.insert(0, base_tag)
    else:
        soup.insert(0, base_tag)

    # Rewrite relative URLs in tags
    for tag, attr in [('img', 'src'), ('script', 'src'), ('link', 'href'), 
                     ('a', 'href'), ('iframe', 'src'), ('source', 'src')]:
        for elem in soup.find_all(tag):
            if elem.has_attr(attr):
                url = elem[attr]
                if not urlparse(url).scheme and not url.startswith('data:'):
                    elem[attr] = urljoin(base_url, url)

    # Rewrite URLs in style tags
    for style in soup.find_all('style'):
        if style.string:
            style.string = re.sub(
                r"url\s*\(\s*(['\"]?)([^'\";\)\s]+)\1\s*\)",
                lambda m: f"url({m.group(1)}{urljoin(base_url, m.group(2))}{m.group(1)})" 
                if not urlparse(m.group(2)).scheme and not m.group(2).startswith('data:')
                else m.group(0),
                style.string
            )

try:
    url = cgi.FieldStorage().getvalue('url')
    if not url or not url.startswith(('http://', 'https://')):
        raise ValueError("Invalid URL format")

    response = requests.get(url, timeout=TIMEOUT)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.content, 'html.parser')
    rewrite_urls(soup, url)
    send_response(200, 'text/html', soup.prettify(formatter="html"))

except ValueError as e:
    send_response(400, 'text/plain', f"Bad Request: {str(e)}")
except requests.Timeout:
    send_response(504, 'text/plain', f"Timeout fetching: {url}")
except requests.RequestException as e:
    status = e.response.status_code if e.response else 500
    send_response(status, 'text/plain', f"Failed to fetch {url}: {str(e)}")
except Exception as e:
    send_response(500, 'text/plain', f"Server Error: {str(e)}")
