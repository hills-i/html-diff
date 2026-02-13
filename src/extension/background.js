// Open diff.html in a new tab when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('diff.html') });
});

// Handle fetch requests from the frontend
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'fetchUrl') return false;

  const targetUrl = message.url;

  // Validate URL scheme - only allow http and https
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    sendResponse({ error: 'Invalid URL format.' });
    return false;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    sendResponse({ error: 'Only http:// and https:// URLs are allowed.' });
    return false;
  }

  fetchAndProcess(targetUrl)
    .then(html => sendResponse({ html }))
    .catch(err => sendResponse({ error: err.message }));

  // Return true to indicate we will send a response asynchronously
  return true;
});

async function fetchAndProcess(targetUrl) {
  const response = await fetch(targetUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`);
  }

  let html = await response.text();

  // Determine the base URL from the final (possibly redirected) URL
  const finalUrl = response.url || targetUrl;
  const baseUrl = new URL(finalUrl);
  const baseHref = `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)}`;

  // Remove all <script> tags and their contents for security
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handler attributes (onclick, onload, onerror, etc.)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Insert <base> tag for relative URL resolution
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(
      /(<head[^>]*>)/i,
      `$1<base href="${escapeHtml(finalUrl)}">`
    );
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(
      /(<html[^>]*>)/i,
      `$1<head><base href="${escapeHtml(finalUrl)}"></head>`
    );
  } else {
    html = `<head><base href="${escapeHtml(finalUrl)}"></head>` + html;
  }

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
