# HTML Diff

> Visual comparison tool for web pages with real-time difference highlighting

Compare two web pages side by side with instant visual feedback. Perfect for tracking changes between website versions or comparing similar pages.

## Quick Start

```bash
git clone https://github.com/hills-i/html-diff.git
cd html-diff
chmod +x src/python-cgi/proxy.cgi
```

## Features

- Side-by-side visual comparison
- Word-level difference highlighting
- Synchronized scrolling
- CORS-friendly with CGI proxy
- Supports both Python and Perl backends
- Handles relative URLs automatically

## Requirements

**Server:**
- Apache/Nginx with CGI enabled
- Python 3.x

**Python Dependencies:**
```bash
pip install beautifulsoup4 requests
```

**Perl Dependencies:**
```bash
cpan CGI LWP::UserAgent URI Encode
apt-get install libcgi-pm-perl libwww-perl liburi-perl
```

## Installation

1. **Deploy to CGI directory:**
   ```bash
   cp -r html-diff /path/to/cgi-bin/
   ```

2. **Set permissions:**
   ```bash
   chmod +x /path/to/cgi-bin/html-diff/src/*/*.cgi
   ```

## Usage

1. Open `http://your-server.com/cgi-bin/html-diff/src/`
2. Enter two URLs to compare
3. Click "Compare"

## License

MIT License
