document.addEventListener('DOMContentLoaded', () => {
    const SCROLL_FRAME_RATE = 16;
    const IFRAME_LOAD_TIMEOUT = 10000;
    const COMPARISON_DELAY = 200;

    // Full URL mode elements
    const url1Input = document.getElementById('url1');
    const url2Input = document.getElementById('url2');
    const fullUrlInputs = document.getElementById('fullurl-inputs');

    // Domain + Path mode elements
    const domain1Input = document.getElementById('domain1');
    const domain2Input = document.getElementById('domain2');
    const pathInput = document.getElementById('path');
    const domainPathInputs = document.getElementById('domain-path-inputs');

    const diffButton = document.getElementById('diffBtn');
    const leftIframe = document.getElementById('iframe1');
    const rightIframe = document.getElementById('iframe2');
    const autoCompareCheckbox = document.getElementById('autoCompare');
    const ignoreDomainCheckbox = document.getElementById('ignoreDomain');
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    const diffHighlightClassName = 'diff-highlight';
    const CHILD_ALIGNMENT_THRESHOLD = 0.45;
    const MAX_CHILD_ALIGNMENT_MATRIX_SIZE = 10000;

    // Domain normalization for ignoring domain differences
    let domainPair = [null, null]; // [domain1, domain2] extracted from URLs
    let normalizedNodeTextCache = new WeakMap();

    function extractDomain(url) {
        try {
            const u = new URL(url);
            return u.origin; // e.g., "https://staging.example.com"
        } catch {
            return null;
        }
    }

    function normalizeDomains(value) {
        if (!ignoreDomainCheckbox.checked || !domainPair[0] || !domainPair[1]) return value;
        // Replace both domains with a common placeholder
        let normalized = value;
        normalized = normalized.split(domainPair[0]).join('__DOMAIN__');
        normalized = normalized.split(domainPair[1]).join('__DOMAIN__');
        return normalized;
    }

    function getMode() {
        return document.querySelector('input[name="mode"]:checked').value;
    }

    // Mode switcher
    modeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const mode = getMode();
            fullUrlInputs.classList.toggle('hidden', mode !== 'fullurl');
            domainPathInputs.classList.toggle('hidden', mode !== 'domain-path');
        });
    });

    function buildDomainPathUrl(domain, path) {
        const d = domain.replace(/\/+$/, '');
        const p = path.startsWith('/') ? path : '/' + path;
        return d + p;
    }

    function getUrls() {
        if (getMode() === 'fullurl') {
            return [url1Input.value.trim(), url2Input.value.trim()];
        }
        const d1 = domain1Input.value.trim();
        const d2 = domain2Input.value.trim();
        const p = pathInput.value.trim() || '/';
        return [buildDomainPathUrl(d1, p), buildDomainPathUrl(d2, p)];
    }

    diffButton.addEventListener('click', () => {
        const [url1, url2] = getUrls();

        if (!isValidUrl(url1) || !isValidUrl(url2)) {
            alert('Please enter valid URLs to compare.');
            return;
        }

        clearHighlights(leftIframe.contentDocument);
        clearHighlights(rightIframe.contentDocument);

        // Set domain pair for normalization
        domainPair = [extractDomain(url1), extractDomain(url2)];
        normalizedNodeTextCache = new WeakMap();

        diffButton.disabled = true;
        diffButton.textContent = 'Comparing...';

        Promise.all([fetchHtmlViaExtension(url1), fetchHtmlViaExtension(url2)])
            .then(([html1, html2]) => {
                const loadPromise1 = loadIframeContent(leftIframe, html1);
                const loadPromise2 = loadIframeContent(rightIframe, html2);
                return Promise.all([loadPromise1, loadPromise2]);
            })
            .then(() => {
                if (leftIframe.contentDocument && rightIframe.contentDocument) {
                    setTimeout(() => {
                        compareNodes(leftIframe.contentDocument.body, rightIframe.contentDocument.body);
                        diffButton.disabled = false;
                        diffButton.textContent = 'Compare';

                        const iframeDocument = rightIframe.contentDocument || rightIframe.contentWindow.document;
                        const highlights = iframeDocument.querySelectorAll('.diff-highlight');
                        highlights.forEach(el => {
                            el.style.color = 'red';
                            el.style.backgroundColor = 'yellow';
                            el.style.outline = '1px solid orange';
                        });

                        setupScrollSynchronization();
                        setupLinkInterception();
                    }, COMPARISON_DELAY);
                } else {
                    throw new Error('Could not access iframe content. Comparison failed.');
                }
            })
            .catch(error => {
                alert(`An error occurred: ${error.message}`);
                diffButton.disabled = false;
                diffButton.textContent = 'Compare';
            });
    });

    function isValidUrl(string) {
        try {
            new URL(string);
            return string.startsWith('http://') || string.startsWith('https://');
        } catch {
            return false;
        }
    }

    function fetchHtmlViaExtension(targetUrl) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'fetchUrl', url: targetUrl },
                response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response.html);
                }
            );
        });
    }

    function loadIframeContent(iframe, htmlContent) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Iframe load timeout'));
            }, IFRAME_LOAD_TIMEOUT);

            iframe.onload = () => {
                clearTimeout(timeout);
                resolve();
            };

            iframe.onerror = (err) => {
                clearTimeout(timeout);
                reject(err);
            };

            iframe.srcdoc = htmlContent;
        });
    }

    function compareAttributes(node1, node2) {
        if (!node1.attributes || !node2.attributes) return node1.attributes === node2.attributes;

        const attrs1 = Array.from(node1.attributes)
            .filter(attr => !['style', 'class'].includes(attr.name))
            .sort((a, b) => a.name.localeCompare(b.name));

        const attrs2 = Array.from(node2.attributes)
            .filter(attr => !['style', 'class'].includes(attr.name))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (attrs1.length !== attrs2.length) return false;
        return attrs1.every((attr, i) =>
            attr.name === attrs2[i].name && normalizeDomains(attr.value) === normalizeDomains(attrs2[i].value));
    }

    function clearHighlights(doc) {
        if (!doc) return;
        try {
            doc.querySelectorAll(`.${diffHighlightClassName}`).forEach(el => {
                el.classList.remove(diffHighlightClassName);
            });
        } catch (e) {
            // Catch potential security errors
        }
    }

    function compareNodes(node1, node2) {
        if (!node1 || !node2) {
            highlightSubtree(node1 || node2);
            return;
        }

        if (node1.parentElement?.tagName === 'SCRIPT' || node1.parentElement?.tagName === 'STYLE' ||
            node2.parentElement?.tagName === 'SCRIPT' || node2.parentElement?.tagName === 'STYLE') {
            return;
        }

        let differencesFound = false;

        if (node1.nodeType !== node2.nodeType) {
            highlightNode(node1);
            highlightNode(node2);
            return;
        }

        if (node1.nodeType === Node.ELEMENT_NODE) {
            if (node1.tagName !== node2.tagName) {
                highlightNode(node1);
                highlightNode(node2);
                return;
            }
            if (!compareAttributes(node1, node2)) {
                differencesFound = true;
            }
        } else if (node1.nodeType === Node.TEXT_NODE) {
            const text1 = node1.nodeValue.trim();
            const text2 = node2.nodeValue.trim();
            if (text1 !== text2 && (text1 || text2)) {
                // Skip if the only difference is the domain name
                if (normalizeDomains(text1) === normalizeDomains(text2)) return;
                highlightTextDifference(node1, node2);
                return;
            }
        }

        if (differencesFound) {
            highlightNode(node1);
            highlightNode(node2);
        }

        if (node1.nodeType === Node.ELEMENT_NODE || node1.nodeType === Node.DOCUMENT_NODE || node1.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            const children1 = Array.from(node1.childNodes);
            const children2 = Array.from(node2.childNodes);
            const alignedChildren = alignChildNodes(children1, children2);

            alignedChildren.forEach(([child1, child2]) => {
                compareNodes(child1, child2);
            });
        }
    }

    function alignChildNodes(children1, children2) {
        if (children1.length * children2.length > MAX_CHILD_ALIGNMENT_MATRIX_SIZE) {
            const maxLen = Math.max(children1.length, children2.length);
            return Array.from({ length: maxLen }, (_, index) => [children1[index], children2[index]]);
        }

        const rows = children1.length + 1;
        const cols = children2.length + 1;
        const score = Array.from({ length: rows }, () => Array(cols).fill(0));
        const direction = Array.from({ length: rows }, () => Array(cols).fill(null));

        for (let i = 1; i < rows; i++) {
            score[i][0] = score[i - 1][0];
            direction[i][0] = 'delete';
        }

        for (let j = 1; j < cols; j++) {
            score[0][j] = score[0][j - 1];
            direction[0][j] = 'insert';
        }

        for (let i = 1; i < rows; i++) {
            for (let j = 1; j < cols; j++) {
                const similarity = getNodeSimilarity(children1[i - 1], children2[j - 1]);
                const matchScore = similarity >= CHILD_ALIGNMENT_THRESHOLD
                    ? score[i - 1][j - 1] + similarity
                    : Number.NEGATIVE_INFINITY;
                const deleteScore = score[i - 1][j];
                const insertScore = score[i][j - 1];

                if (matchScore >= deleteScore && matchScore >= insertScore) {
                    score[i][j] = matchScore;
                    direction[i][j] = 'match';
                } else if (deleteScore >= insertScore) {
                    score[i][j] = deleteScore;
                    direction[i][j] = 'delete';
                } else {
                    score[i][j] = insertScore;
                    direction[i][j] = 'insert';
                }
            }
        }

        const aligned = [];
        let i = children1.length;
        let j = children2.length;

        while (i > 0 || j > 0) {
            const move = direction[i][j];
            if (move === 'match') {
                aligned.unshift([children1[i - 1], children2[j - 1]]);
                i--;
                j--;
            } else if (move === 'delete') {
                aligned.unshift([children1[i - 1], null]);
                i--;
            } else {
                aligned.unshift([null, children2[j - 1]]);
                j--;
            }
        }

        return aligned;
    }

    function getNodeSimilarity(node1, node2) {
        if (!node1 || !node2 || node1.nodeType !== node2.nodeType) return 0;

        if (node1.nodeType === Node.TEXT_NODE) {
            const text1 = getNormalizedNodeText(node1);
            const text2 = getNormalizedNodeText(node2);
            if (!text1 && !text2) return 1;
            if (!text1 || !text2) return 0;
            return 0.5 + (getTextSimilarity(text1, text2) * 0.5);
        }

        if (node1.nodeType !== Node.ELEMENT_NODE) {
            return 0.5;
        }

        if (node1.tagName !== node2.tagName) return 0;

        const textSimilarity = getTextSimilarity(getNormalizedNodeText(node1), getNormalizedNodeText(node2));
        let similarity = 0.45 + (textSimilarity * 0.35);

        if (node1.id && node1.id === node2.id) {
            similarity += 0.15;
        }

        const classSimilarity = getTokenSimilarity(node1.className, node2.className);
        similarity += classSimilarity * 0.05;

        return Math.min(similarity, 1);
    }

    function getNormalizedNodeText(node) {
        const cachedText = normalizedNodeTextCache.get(node);
        if (cachedText !== undefined) return cachedText;

        const normalizedText = normalizeDomains((node.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 120);
        normalizedNodeTextCache.set(node, normalizedText);
        return normalizedText;
    }

    function getTextSimilarity(text1, text2) {
        if (text1 === text2) return 1;
        if (!text1 || !text2) return 0;

        const maxLength = Math.max(text1.length, text2.length);
        const minLength = Math.min(text1.length, text2.length);
        let sharedPrefixLength = 0;

        while (sharedPrefixLength < minLength &&
               text1[sharedPrefixLength] === text2[sharedPrefixLength]) {
            sharedPrefixLength++;
        }

        const lengthSimilarity = minLength / maxLength;
        return (sharedPrefixLength / minLength) * lengthSimilarity;
    }

    function getTokenSimilarity(value1, value2) {
        const tokens1 = new Set(String(value1 || '').split(/\s+/).filter(Boolean));
        const tokens2 = new Set(String(value2 || '').split(/\s+/).filter(Boolean));
        if (!tokens1.size && !tokens2.size) return 1;

        const intersectionSize = [...tokens1].filter(token => tokens2.has(token)).length;
        const unionSize = new Set([...tokens1, ...tokens2]).size;
        return unionSize ? intersectionSize / unionSize : 0;
    }

    function highlightTextDifference(node1, node2) {
        if (!node1 || !node2) return;

        const text1 = node1.nodeValue;
        const text2 = node2.nodeValue;

        let i = 0;
        while (i < text1.length && i < text2.length && text1[i] === text2[i]) {
            i++;
        }

        let j = 1;
        while (j <= text1.length - i && j <= text2.length - i &&
               text1[text1.length - j] === text2[text2.length - j]) {
            j++;
        }

        const prefix = text1.slice(0, i);
        const diff1 = text1.slice(i, text1.length - j + 1);
        const diff2 = text2.slice(i, text2.length - j + 1);
        const suffix = text1.slice(text1.length - j + 1);

        if (diff1) {
            const fragment1 = document.createDocumentFragment();
            if (prefix) fragment1.appendChild(document.createTextNode(prefix));
            if (diff1) {
                const span1 = document.createElement('span');
                span1.classList.add(diffHighlightClassName);
                span1.textContent = diff1;
                fragment1.appendChild(span1);
            }
            if (suffix) fragment1.appendChild(document.createTextNode(suffix));
            node1.parentNode.replaceChild(fragment1, node1);
        }

        if (diff2) {
            const fragment2 = document.createDocumentFragment();
            if (prefix) fragment2.appendChild(document.createTextNode(prefix));
            if (diff2) {
                const span2 = document.createElement('span');
                span2.classList.add(diffHighlightClassName);
                span2.textContent = diff2;
                fragment2.appendChild(span2);
            }
            if (suffix) fragment2.appendChild(document.createTextNode(suffix));
            node2.parentNode.replaceChild(fragment2, node2);
        }
    }

    function highlightNode(node) {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
            if (!node.nodeValue.trim() || !node.parentNode) return;

            const span = document.createElement('span');
            span.classList.add(diffHighlightClassName);
            span.textContent = node.nodeValue;
            node.parentNode.replaceChild(span, node);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (node.tagName !== 'BODY' &&
            node.tagName !== 'HTML' &&
            node.tagName !== 'HEAD' &&
            node.tagName !== 'SCRIPT' &&
            node.tagName !== 'STYLE' &&
            !node.classList.contains(diffHighlightClassName) &&
            node.children.length === 0) {
            node.classList.add(diffHighlightClassName);
        }
    }

    function highlightSubtree(node) {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
            highlightNode(node);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (['BODY', 'HTML', 'HEAD', 'SCRIPT', 'STYLE'].includes(node.tagName)) {
            return;
        }

        if (node.children.length === 0) {
            highlightNode(node);
            return;
        }

        Array.from(node.childNodes).forEach(highlightSubtree);
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    const debouncedSyncScroll = debounce((source, target) => {
        const sourceDoc = source.contentDocument?.documentElement;
        const targetDoc = target.contentDocument?.documentElement;

        if (sourceDoc && targetDoc) {
            Object.assign(targetDoc, {
                scrollTop: sourceDoc.scrollTop,
                scrollLeft: sourceDoc.scrollLeft
            });
        }
    }, SCROLL_FRAME_RATE);

    function setupLinkInterception() {
        const iframes = [
            { iframe: leftIframe, urlInput: url1Input },
            { iframe: rightIframe, urlInput: url2Input }
        ];

        iframes.forEach(({ iframe, urlInput }) => {
            const doc = iframe.contentDocument;
            if (!doc) return;

            doc.addEventListener('click', e => {
                const link = e.target.closest('a[href]');
                if (!link) return;

                e.preventDefault();

                const href = link.href;
                if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) return;

                if (getMode() === 'domain-path') {
                    try {
                        const clickedUrl = new URL(href);
                        pathInput.value = clickedUrl.pathname + clickedUrl.search + clickedUrl.hash;
                    } catch {
                        return;
                    }
                } else {
                    urlInput.value = href;
                }

                if (autoCompareCheckbox.checked) {
                    diffButton.click();
                }
            });
        });
    }

    function setupScrollSynchronization() {
        const [leftDoc, rightDoc] = [leftIframe.contentDocument, rightIframe.contentDocument];
        if (!leftDoc || !rightDoc) return;

        const syncLeft = () => debouncedSyncScroll(leftIframe, rightIframe);
        const syncRight = () => debouncedSyncScroll(rightIframe, leftIframe);

        leftDoc.addEventListener('scroll', syncLeft);
        rightDoc.addEventListener('scroll', syncRight);

        return () => {
            leftDoc.removeEventListener('scroll', syncLeft);
            rightDoc.removeEventListener('scroll', syncRight);
        };
    }
});
