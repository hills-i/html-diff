document.addEventListener('DOMContentLoaded', () => {
    // Timing constants - moved to top
    const SCROLL_FRAME_RATE = 16;
    const IFRAME_LOAD_TIMEOUT = 10000;
    const COMPARISON_DELAY = 200;

    const firstUrlInput = document.getElementById('url1');
    const secondUrlInput = document.getElementById('url2');
    const diffButton = document.getElementById('diffBtn');
    const leftIframe = document.getElementById('iframe1');
    const rightIframe = document.getElementById('iframe2');
    const diffHighlightClassName = 'diff-highlight';
    
    // Get URL parameters and populate input fields
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.has('url1') && (firstUrlInput.value = urlParams.get('url1'));
    urlParams.has('url2') && (secondUrlInput.value = urlParams.get('url2'));

    const proxyEndpoint = `${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/python-cgi/proxy.cgi?url=`;
    //const proxyEndpoint = `${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/perl-cgi/proxy.cgi?url=`;

    diffButton.addEventListener('click', () => {
        const [url1, url2] = [firstUrlInput.value.trim(), secondUrlInput.value.trim()];

        if (!url1 || !url2 || !isValidUrl(url1) || !isValidUrl(url2)) {
            alert('Please enter valid URLs to compare.');
            return;
        }

        // Reset previous highlights
        clearHighlights(leftIframe.contentDocument);
        clearHighlights(rightIframe.contentDocument);

        // Disable button during fetch
        diffButton.disabled = true;
        diffButton.textContent = 'Comparing...';

        // Fetch HTML via proxy, then load and compare
        Promise.all([fetchHtmlViaProxy(url1), fetchHtmlViaProxy(url2)])
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
                        const iframe = document.getElementById("iframe2");
                        const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                        const highlights = iframeDocument.querySelectorAll(".diff-highlight");

                        highlights.forEach(function (el) {
                            el.style.color = "red";
                            el.style.backgroundColor = "yellow";
                            el.style.outline= "1px solid orange"; 
                        });
                        
                        // Setup scroll synchronization after comparison
                        setupScrollSynchronization();
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

    async function fetchHtmlViaProxy(targetUrl) {
        const proxyUrl = `${proxyEndpoint}${encodeURIComponent(targetUrl)}`;
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Proxy fetch failed for ${targetUrl}: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();
            // Basic check if the proxy returned an error message instead of HTML
            if (html.startsWith('Error fetching URL:')) {
                 throw new Error(html);
            }
            return html;
        } catch (error) {
            // Modify error message to reflect CGI setup
            throw new Error(`Failed to fetch ${targetUrl} via CGI. Ensure the web server is running, CGI is configured correctly, the script has execute permissions, and the URL is accessible. ${error.message}`);
        }
    }

    function loadIframeContent(iframe, htmlContent) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Iframe load timeout'));
            }, IFRAME_LOAD_TIMEOUT); // 10 second timeout

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
            attr.name === attrs2[i].name && attr.value === attrs2[i].value);
    }

    function clearHighlights(doc) {
        if (!doc) return;
        try {
            doc.querySelectorAll(`.${diffHighlightClassName}`).forEach(el => {
                el.classList.remove(diffHighlightClassName);
            });
        } catch (e) {
            // Catch potential security errors if the iframe content somehow restricts querySelectorAll
         }
    }

    function compareNodes(node1, node2) {
        // Skip comparison if either node is null or undefined
        if (!node1 || !node2) {
            highlightNode(node1); // Highlight the one that exists
            highlightNode(node2); // Attempt to highlight (will be ignored if null)
            return;
        }

        // Ignore comparison if nodes are inside script or style tags
        if (node1.parentElement?.tagName === 'SCRIPT' || node1.parentElement?.tagName === 'STYLE' ||
            node2.parentElement?.tagName === 'SCRIPT' || node2.parentElement?.tagName === 'STYLE') {
            return;
        }

        let differencesFound = false;

        // 1. Compare Node Type
        if (node1.nodeType !== node2.nodeType) {
            highlightNode(node1);
            highlightNode(node2);
            return;
        }

        // 2. Compare Element Nodes
        if (node1.nodeType === Node.ELEMENT_NODE) {
            // Compare Tag Name
            if (node1.tagName !== node2.tagName) {
                highlightNode(node1);
                highlightNode(node2);
                return;
            }
            // Compare Attributes
            if (!compareAttributes(node1, node2)) {
                differencesFound = true;
            }
        }
        // 3. Compare Text Nodes (ignore whitespace-only nodes)
        else if (node1.nodeType === Node.TEXT_NODE) {
            const text1 = node1.nodeValue.trim();
            const text2 = node2.nodeValue.trim();
            if (text1 !== text2 && (text1 || text2)) {
                highlightTextDifference(node1, node2);
                return;
            }
        }

        if (differencesFound) {
            highlightNode(node1);
            highlightNode(node2);
        }

        // Recursively Compare Children
        if (node1.nodeType === Node.ELEMENT_NODE || node1.nodeType === Node.DOCUMENT_NODE || node1.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            const children1 = Array.from(node1.childNodes);
            const children2 = Array.from(node2.childNodes);
            const maxLen = Math.max(children1.length, children2.length);

            for (let i = 0; i < maxLen; i++) {
                compareNodes(children1[i], children2[i]);
            }
        }
    }

    function highlightTextDifference(node1, node2) {
        if (!node1 || !node2) return;
        
        const text1 = node1.nodeValue;
        const text2 = node2.nodeValue;
        
        // Find common and different parts
        let i = 0;
        while (i < text1.length && i < text2.length && text1[i] === text2[i]) {
            i++;
        }
        
        let j = 1;
        while (j <= text1.length - i && j <= text2.length - i && 
               text1[text1.length - j] === text2[text2.length - j]) {
            j++;
        }
        
        // Split text into three parts: common prefix, different part, common suffix
        const prefix = text1.slice(0, i);
        const diff1 = text1.slice(i, text1.length - j + 1);
        const diff2 = text2.slice(i, text2.length - j + 1);
        const suffix = text1.slice(text1.length - j + 1);
        
        // Update node1
        if (diff1) {
            const fragment1 = document.createDocumentFragment();
            if (prefix) {
                fragment1.appendChild(document.createTextNode(prefix));
            }
            if (diff1) {
                const span1 = document.createElement('span');
                span1.classList.add(diffHighlightClassName);
                span1.textContent = diff1;
                fragment1.appendChild(span1);
            }
            if (suffix) {
                fragment1.appendChild(document.createTextNode(suffix));
            }
            node1.parentNode.replaceChild(fragment1, node1);
        }
        
        // Update node2
        if (diff2) {
            const fragment2 = document.createDocumentFragment();
            if (prefix) {
                fragment2.appendChild(document.createTextNode(prefix));
            }
            if (diff2) {
                const span2 = document.createElement('span');
                span2.classList.add(diffHighlightClassName);
                span2.textContent = diff2;
                fragment2.appendChild(span2);
            }
            if (suffix) {
                fragment2.appendChild(document.createTextNode(suffix));
            }
            node2.parentNode.replaceChild(fragment2, node2);
        }
    }

    function highlightNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

        // Only highlight elements that are not containers
        if (node.tagName !== 'BODY' &&
            node.tagName !== 'HTML' &&
            node.tagName !== 'HEAD' &&
            node.tagName !== 'SCRIPT' &&
            node.tagName !== 'STYLE' &&
            !node.classList.contains(diffHighlightClassName) &&
            node.children.length === 0) // Only highlight leaf nodes
        {
            node.classList.add(diffHighlightClassName);
        }
    }

    // Add scroll synchronization
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

    // Auto-compare if URLs are present
    urlParams.has('url1') && urlParams.has('url2') && diffButton.click();
});