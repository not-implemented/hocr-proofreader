'use strict';

var Util = {
    onReady: function (callback) {
        if (document.readyState != 'loading') callback();
        else document.addEventListener('DOMContentLoaded', callback);
    },

    get: function (url, callback) {
        var request = new XMLHttpRequest();
        request.open('GET', url);
        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                callback(null, request.responseText);
            } else {
                callback(new Error('Error loading url "' + url + '": HTTP error: ' + request.status + ' ' + request.statusText));
            }
        };
        request.onerror = function () {
            callback(new Error('Error loading url "' + url + '": HTTP connection error'));
        };
        request.send();
    },

    handleError: function (err) {
        alert(err.message); // TODO
    },

    createElem: function (name, attributes) {
        var node = document.createElement(name);
        for (var name in attributes) {
            node.setAttribute(name, attributes[name]);
        }
        return node;
    },

    createSvgElem: function (name, attributes) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', name);
        for (var name in attributes) {
            node.setAttribute(name, attributes[name]);
        }
        return node;
    },

    removeChildren: function (node) {
        while (node.hasChildNodes()) {
            node.removeChild(node.lastChild);
        }
    }
};


function HocrProofreader(config) {
    this.config = config;

    this.layoutSvg = Util.createSvgElem('svg', {'class': 'layout'});

    this.layoutBackground = Util.createSvgElem('rect', {'class': 'background', 'x': 0, 'y': 0, 'width': '100%', 'height': '100%', 'style': 'fill: none'});
    this.layoutSvg.appendChild(this.layoutBackground);

    this.layoutImage = Util.createSvgElem('image', {'x': 0, 'y': 0, 'width': '100%', 'height': '100%'});
    this.layoutSvg.appendChild(this.layoutImage);

    this.layoutWords = Util.createSvgElem('g', {'class': 'words'});
    this.layoutSvg.appendChild(this.layoutWords);

    this.layoutRects = Util.createSvgElem('g', {'class': 'rects'});
    this.layoutSvg.appendChild(this.layoutRects);

    this.layoutContainer = document.getElementById(config.layoutContainer);
    this.layoutContainer.appendChild(this.layoutSvg);
    this.layoutContainer.style.overflow = 'scroll';

    this.editorIframe = Util.createElem('iframe', {'class': 'editor', 'frameborder': 0});

    var editorContainer = document.getElementById(config.editorContainer);
    editorContainer.appendChild(this.editorIframe);

    var self = this;
    self.hoveredNode = null;

    this.layoutSvg.addEventListener('mousemove', function (event) {
        var node = event.target.linkedNode;
        if (node !== self.hoveredNode) {
            if (self.hoveredNode) {
                self.hoveredNode.classList.remove('hover');
                self.hoveredNode = null;
            }
            if (node) {
                node.classList.add('hover');
                self.hoveredNode = node;

                self.scrollIntoViewIfNeeded(node, self.editorIframe.contentDocument.documentElement);
            }
        }
    });

    this.editorMoveListener = function (event) {
        var pageNode = event.target;
        while (pageNode && (!pageNode.classList || !pageNode.classList.contains('ocr_page'))) {
            pageNode = pageNode.parentNode;
        }
        if (pageNode && pageNode !== self.currentPage) {
            var backwards = false, tmpNode = self.currentPage;
            while (tmpNode) {
                tmpNode = tmpNode.previousSibling;
                if (tmpNode === pageNode) {
                    backwards = true;
                    break;
                }
            }

            self.currentPage = pageNode;
            self.renderCurrentPage(backwards);
        }

        var node = event.target.linkedNode;
        if (node !== self.hoveredNode) {
            if (self.hoveredNode) {
                self.hoveredNode.classList.remove('hover');
                self.hoveredNode = null;
            }
            if (node) {
                node.classList.add('hover');
                self.hoveredNode = node;

                self.scrollIntoViewIfNeeded(node, self.layoutContainer);
            }
        }
    };

    // init some defaults:
    this.currentPage = null;
    this.toggleLayoutImage();
    this.setZoom('page-width');
}

HocrProofreader.prototype.setHocr = function (hocr, baseUrl) {
    this.hocrBaseUrl = baseUrl;
    var hocrDoc = this.editorIframe.contentDocument;

    // TODO: use baseUrl for images/components in hOCR - use <base>?

    hocrDoc.open();
    hocrDoc.write(hocr);
    hocrDoc.close();

    hocrDoc.addEventListener('mousemove', this.editorMoveListener);

    this.editorStylesheet = Util.createElem('link', {'type': 'text/css', 'rel': 'stylesheet', 'href': 'editor.css'});
    hocrDoc.head.appendChild(this.editorStylesheet);

    hocrDoc.body.contentEditable = true;

    this.setPage('first');
};

HocrProofreader.prototype.getHocr = function () {
    var hocrDoc = this.editorIframe.contentDocument;

    hocrDoc.head.removeChild(this.editorStylesheet);
    hocrDoc.body.contentEditable = 'inherit'; // this removes the attribute from DOM
    // TODO: remove all hover classes

    var serializer = new XMLSerializer();
    var hocr = serializer.serializeToString(hocrDoc);

    hocrDoc.head.appendChild(this.editorStylesheet);
    hocrDoc.body.contentEditable = true;

    return hocr;
};

HocrProofreader.prototype.setZoom = function (zoom) {
    if (zoom === 'page-full') {
        this.layoutSvg.style.width = null;
        this.layoutSvg.style.height = null;
        this.layoutSvg.style.maxWidth = '100%';
        this.layoutSvg.style.maxHeight = '100%';
    } else if (zoom === 'page-width') {
        this.layoutSvg.style.width = null;
        this.layoutSvg.style.height = null;
        this.layoutSvg.style.maxWidth = '100%';
        this.layoutSvg.style.maxHeight = null;
    } else if (zoom === 'original') {
        this.layoutSvg.style.width = '2480px'; // TODO: use bounding box of ocr_page here
        this.layoutSvg.style.height = '3508px'; // TODO: use bounding box of ocr_page here
        this.layoutSvg.style.maxWidth = null;
        this.layoutSvg.style.maxHeight = null;
    }
};

HocrProofreader.prototype.toggleLayoutImage = function () {
    if (!this.layoutWords.style.display || this.layoutWords.style.display === 'block') {
        this.layoutWords.style.display = 'none';
        this.layoutImage.style.display = 'block';
    } else {
        this.layoutWords.style.display = 'block';
        this.layoutImage.style.display = 'none';
    }
};

HocrProofreader.prototype.setPage = function (page) {
    var pageNode, backwards = false, skipCurrent = false;
    var hocrDoc = this.editorIframe.contentDocument;

    if (page === 'first') {
        pageNode = hocrDoc.body.firstChild;
    } else if (page === 'last') {
        pageNode = hocrDoc.body.lastChild;
        backwards = true;
    } else if (page === 'next') {
        pageNode = this.currentPage || hocrDoc.body.firstChild;
        skipCurrent = true;
    } else if (page === 'previous') {
        pageNode = this.currentPage || hocrDoc.body.lastChild;
        backwards = true;
        skipCurrent = true;
    }

    while (pageNode && (skipCurrent || !pageNode.classList || !pageNode.classList.contains('ocr_page'))) {
        pageNode = backwards ? pageNode.previousSibling : pageNode.nextSibling;
        skipCurrent = false;
    }

    this.currentPage = pageNode || null;
    this.renderCurrentPage();
};

HocrProofreader.prototype.renderCurrentPage = function (scrollBottom) {
    this.layoutContainer.scrollTop = 0;
    this.layoutContainer.scrollLeft = 0;

    // TODO: remove linkedNode attributes to avoid memleaks

    Util.removeChildren(this.layoutWords);
    Util.removeChildren(this.layoutRects);

    if (!this.currentPage) {
        // TODO: hide completely? reset image/font/viewBox/...?
        return;
    }

    var pageOptions = this.getNodeOptions(this.currentPage);

    this.layoutSvg.setAttribute('viewBox', pageOptions.bbox.join(' ')); // TODO: handle missing bbox (use image dimensions then)
    this.layoutWords.style.fontFamily = 'Liberation Serif, serif'; // TODO: use font from hOCR (per page)

    this.layoutImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', this.hocrBaseUrl + pageOptions.image);
    // TODO: handle skew:
    //this.layoutImage.setAttribute('transform', 'rotate(' + degree + ' ' + (pageOptions.bbox[2] / 2) + ' ' + (pageOptions.bbox[3] / 2) + ')');

    var wordNodes = this.currentPage.getElementsByClassName('ocrx_word');
    // TODO: handle tree hierarchically and render all rects, not only for words

    for (var i = 0; i < wordNodes.length; i++) {
        var wordNode = wordNodes[i];
        var options = this.getNodeOptions(wordNode);

        // TODO: do real inheritance for options:
        var lineOptions = this.getNodeOptions(wordNode.parentNode);
        if (!lineOptions.baseline) {
            lineOptions = this.getNodeOptions(wordNode.parentNode.parentNode);
        }

        if (options.bbox) {
            var word = wordNode.textContent;

            // TODO: calculate font-size correctly and calculate y based on bbox, not baseline (font-metrics needed):
            var textNode = Util.createSvgElem('text', {'x': options.bbox[0], 'y': parseFloat(lineOptions.bbox[3]) + parseFloat(lineOptions.baseline[1]),
                'font-size': 42, 'textLength': options.bbox[2] - options.bbox[0], 'lengthAdjust': 'spacingAndGlyphs'});
            textNode.textContent = word;
            this.layoutWords.appendChild(textNode);

            var rectNode = Util.createSvgElem('rect', {'x': options.bbox[0], 'y': options.bbox[1],
                'width': options.bbox[2] - options.bbox[0], 'height': options.bbox[3] - options.bbox[1]});
            this.layoutRects.appendChild(rectNode);

            // cross-link:
            rectNode.linkedNode = wordNode;
            wordNode.linkedNode = rectNode;
        }
    }

    if (scrollBottom) {
        this.layoutContainer.scrollTop = this.layoutContainer.scrollHeight - this.layoutContainer.clientHeight;
    }
};

HocrProofreader.prototype.getNodeOptions = function (node) {
    var asArray = ['bbox', 'baseline'];
    var optionsStr = node.title ? node.title : '';
    var match, regex = /(?:^|;)\s*(\w+)\s+(?:([^;"']+?)|"((?:\\"|[^"])+?)"|'((?:\\'|[^'])+?)')\s*(?=;|$)/g;

    var options = {};
    while (match = regex.exec(optionsStr)) {
        var name = match[1];
        var value = match[4] || match[3] || match[2];

        if (asArray.indexOf(name) !== -1) {
            value = value.split(/\s+/);
        }

        options[name] = value;
    }

    return options;
};

HocrProofreader.prototype.scrollIntoViewIfNeeded = function (node, scrollParentNode) {
    var nodeRect;

    if (node.namespaceURI === 'http://www.w3.org/2000/svg') {
        // SVG elements have no offsetLeft/Top/...
        var rect = node.getBoundingClientRect();
        var parentRect = scrollParentNode.getBoundingClientRect();
        nodeRect = {
            left: rect.left - parentRect.left + scrollParentNode.scrollLeft,
            top: rect.top - parentRect.top + scrollParentNode.scrollTop,
            right: rect.right - parentRect.left + scrollParentNode.scrollLeft,
            bottom: rect.bottom - parentRect.top + scrollParentNode.scrollTop
        };
    } else {
        nodeRect = {
            left: node.offsetLeft,
            top: node.offsetTop,
            right: node.offsetLeft + node.offsetWidth,
            bottom: node.offsetTop + node.offsetHeight
        };
    }

    if (nodeRect.bottom > scrollParentNode.scrollTop + scrollParentNode.clientHeight) {
        node.scrollIntoView({behavior: 'smooth', block: 'end'});
    } else if (nodeRect.top < scrollParentNode.scrollTop) {
        node.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
};
