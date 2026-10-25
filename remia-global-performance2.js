
/// remia-global-performance.js
/*
 * Remia Global Performance v2.0
 * uBlock Origin custom scriptlet for Firefox / Zen Browser.
 *
 * IMPORTANT: Keep the resource token above unchanged when replacing v1.
 * uBO filter: /^.+$/##+js(remia-global-performance)
 *
 * Reduces potential offscreen rendering work on long article feeds.
 * Lightly improves media loading hints when requests have not yet begun.
 * Does NOT block/defer third-party scripts, stylesheets or browser APIs.
 */
(() => {
    'use strict';

    const CONFIG = {
        lazyImages: true,
        lazyIframes: true,
        asyncImageDecoding: true,
        optimizeLongArticleFeeds: true,
        watchDynamicFeeds: true,

        minimumArticlesPerFeed: 8,
        maxMediaToCheck: 180,
        maxArticlesToCheck: 180,
        maxArticlesPerPass: 64,
        maxOptimizedArticlesTotal: 120,
        maxObservedFeeds: 2,
        maxDynamicItemsToCheck: 80,
        observerLifetimeMs: 90000,
        offscreenViewportMultiplier: 1.5,
        idleTimeoutMs: 1400,
        debug: false,

        excludedDomains: [
            'accounts.google.com', 'mail.google.com',
            'docs.google.com', 'drive.google.com',
            'paypal.com', 'stripe.com',
            'outlook.live.com', 'outlook.office.com',
            'figma.com'
        ]
    };

    try {
        if (window !== window.top) return;
    } catch (_) {
        return;
    }

    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        return;
    }

    const hostname = location.hostname.toLowerCase();
    if (CONFIG.excludedDomains.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
    )) return;

    if (/(?:^|\/)(?:login|log-in|signin|sign-in|checkout|payment|billing|auth)(?:\/|$)/i.test(
        location.pathname
    )) return;

    const canContain = !!(
        typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 300px')
    );

    const stats = { images: 0, iframes: 0, articles: 0, feeds: 0 };
    const optimized = new WeakSet();
    const observedParents = new Set();
    const observers = [];
    let mediaScanned = false;
    let secondPassScheduled = false;
    let dynamicChecked = 0;
    let dynamicIdlePending = false;
    let observerStopTimer = 0;
    const dynamicQueue = new Set();

    function log(message) {
        if (CONFIG.debug) {
            console.info('[Remia Global v2]', message, { ...stats });
        }
    }

    function idle(callback) {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(callback, {
                timeout: CONFIG.idleTimeoutMs
            });
        } else {
            window.setTimeout(callback, 40);
        }
    }

    function threshold() {
        return Math.max(900,
            (window.innerHeight || 800) * CONFIG.offscreenViewportMultiplier
        );
    }

    function measureOffscreen(element, minWidth, minHeight, maxHeight) {
        const rect = element.getBoundingClientRect();
        if (rect.top <= threshold() || rect.width < minWidth ||
            rect.height < minHeight || rect.height > maxHeight) {
            return 0;
        }
        return Math.round(rect.height);
    }

    function optimizeMediaOnce() {
        if (mediaScanned) return;
        mediaScanned = true;
        if (!CONFIG.lazyImages && !CONFIG.lazyIframes) return;

        // A late loading="lazy" hint cannot undo a request already started.
        // Native resource hints set by the website are never overwritten.
        const media = document.querySelectorAll(
            'img:not([loading]), iframe:not([loading])'
        );
        const pending = [];
        const max = Math.min(media.length, CONFIG.maxMediaToCheck);

        for (let i = 0; i < max; i++) {
            const element = media[i];
            const image = element.localName === 'img';
            if (image ? !CONFIG.lazyImages : !CONFIG.lazyIframes) continue;
            if (element.getAttribute('fetchpriority') === 'high') continue;
            if (element.closest('header, nav, [role="banner"]')) continue;

            if (image) {
                if ((!element.hasAttribute('src') &&
                    !element.hasAttribute('srcset')) || element.complete) continue;
            } else {
                if (!element.hasAttribute('src') ||
                    element.hasAttribute('srcdoc') ||
                    /\bautoplay\b/i.test(element.getAttribute('allow') || '')) {
                    continue;
                }
            }

            if (!measureOffscreen(element, 4, 4, Infinity)) continue;
            pending.push({ element, image });
        }

        // Make DOM changes only after all layout measurements are finished.
        for (const { element, image } of pending) {
            if (!element.isConnected || element.hasAttribute('loading')) continue;
            element.setAttribute('loading', 'lazy');
            if (image) {
                if (CONFIG.asyncImageDecoding &&
                    !element.hasAttribute('decoding')) {
                    element.setAttribute('decoding', 'async');
                }
                stats.images++;
            } else {
                stats.iframes++;
            }
        }
    }

    function safeArticle(article, parent) {
        if (!article.isConnected || article.parentElement !== parent ||
            optimized.has(article)) return false;
        if (article.style.getPropertyValue('content-visibility') ||
            article.style.getPropertyValue('contain-intrinsic-block-size')) {
            return false;
        }
        // Skip items containing complex or actively interactive elements.
        if (article.querySelector(
            'video, audio, canvas, iframe, [contenteditable], ' +
            'input, textarea, select, [role="textbox"]'
        )) return false;
        return true;
    }

    function applyArticleCandidates(articles, parent, limit) {
        const pending = [];
        for (const article of articles) {
            if (pending.length >= limit ||
                stats.articles + pending.length >= CONFIG.maxOptimizedArticlesTotal) {
                break;
            }
            if (!safeArticle(article, parent)) continue;
            const height = measureOffscreen(article, 240, 110, 1500);
            if (height) pending.push({ article, height });
        }

        for (const { article, height } of pending) {
            if (!article.isConnected || optimized.has(article)) continue;
            article.style.setProperty(
                'contain-intrinsic-block-size', 'auto ' + height + 'px'
            );
            article.style.setProperty('content-visibility', 'auto');
            optimized.add(article);
            stats.articles++;
        }
    }

    function stopObservers() {
        for (const observer of observers) observer.disconnect();
        observers.length = 0;
        dynamicQueue.clear();
        if (observerStopTimer) {
            window.clearTimeout(observerStopTimer);
            observerStopTimer = 0;
        }
    }

    function flushDynamicQueue() {
        dynamicIdlePending = false;
        if (document.hidden) {
            dynamicQueue.clear();
            return;
        }
        if (stats.articles >= CONFIG.maxOptimizedArticlesTotal) {
            stopObservers();
            return;
        }

        // Read candidate geometry first, then write styles for each parent.
        const groups = new Map();
        for (const article of dynamicQueue) {
            const parent = article.parentElement;
            if (parent && observedParents.has(parent)) {
                if (!groups.has(parent)) groups.set(parent, []);
                groups.get(parent).push(article);
            }
        }
        dynamicQueue.clear();
        for (const [parent, articles] of groups) {
            applyArticleCandidates(articles, parent, CONFIG.maxArticlesPerPass);
        }
        if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck ||
            stats.articles >= CONFIG.maxOptimizedArticlesTotal) {
            stopObservers();
        }
        log('Dynamic feed pass');
    }

    function queueDynamicWork() {
        if (dynamicIdlePending || dynamicQueue.size === 0) return;
        dynamicIdlePending = true;
        idle(flushDynamicQueue);
    }

    function watchFeed(parent) {
        if (!CONFIG.watchDynamicFeeds ||
            observedParents.has(parent) ||
            observedParents.size >= CONFIG.maxObservedFeeds ||
            typeof MutationObserver === 'undefined') return;

        const observer = new MutationObserver(records => {
            if (!parent.isConnected ||
                dynamicChecked >= CONFIG.maxDynamicItemsToCheck) {
                observer.disconnect();
                return;
            }
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (dynamicChecked >= CONFIG.maxDynamicItemsToCheck) break;
                    if (node.nodeType !== 1 ||
                        !node.matches('article, [role="article"]')) continue;
                    dynamicChecked++;
                    if (dynamicQueue.size < CONFIG.maxArticlesPerPass) {
                        dynamicQueue.add(node);
                    }
                }
            }
            queueDynamicWork();
        });
        observer.observe(parent, { childList: true });
        observers.push(observer);
        observedParents.add(parent);
        stats.feeds++;
        if (!observerStopTimer) {
            observerStopTimer = window.setTimeout(
                stopObservers, CONFIG.observerLifetimeMs
            );
        }
    }

    function optimizeFeeds() {
        if (!CONFIG.optimizeLongArticleFeeds || !canContain ||
            stats.articles >= CONFIG.maxOptimizedArticlesTotal) return;

        const nodes = document.querySelectorAll(
            'main article, [role="main"] article, ' +
            'main [role="article"], [role="main"] [role="article"]'
        );
        const groups = new Map();
        const count = Math.min(nodes.length, CONFIG.maxArticlesToCheck);

        for (let i = 0; i < count; i++) {
            const article = nodes[i];
            const parent = article.parentElement;
            if (!parent || parent.closest('article, [role="article"]')) continue;
            if (!groups.has(parent)) groups.set(parent, []);
            groups.get(parent).push(article);
        }

        for (const [parent, articles] of groups) {
            if (articles.length < CONFIG.minimumArticlesPerFeed) continue;
            applyArticleCandidates(articles, parent, CONFIG.maxArticlesPerPass);
            watchFeed(parent);
        }
    }

    function run() {
        if (document.hidden) {
            document.addEventListener('visibilitychange', function onVisible() {
                if (!document.hidden) idle(run);
            }, { once: true });
            return;
        }
        try {
            // A page with a password field is conservatively left untouched.
            if (document.querySelector('input[type="password"]')) return;
            optimizeMediaOnce();
            optimizeFeeds();
            log('Initial pass');
        } catch (error) {
            if (CONFIG.debug) console.warn('[Remia Global v2]', error);
        }

        // One additional discovery pass accommodates late SPA hydration.
        // No document-wide MutationObserver, URL polling or history patching.
        if (!secondPassScheduled && observedParents.size === 0) {
            secondPassScheduled = true;
            window.setTimeout(() => idle(() => {
                try { optimizeFeeds(); } catch (_) { /* noncritical */ }
                log('Late discovery pass');
            }), 1800);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => idle(run), {
            once: true
        });
    } else {
        idle(run);
    }

})();
