
/// remia-global-performance.js
/*
 * Remia Global Performance v2.1 - Smooth Scrolling Edition
 * uBlock Origin custom scriptlet | Firefox / Zen Browser
 *
 * Filter:
 *   /^.+$/##+js(remia-global-performance)
 *
 * Safety changes from v2.0:
 * - Excludes image-heavy sites (including nhentai.net).
 * - Avoids geometry work during active scrolling.
 * - Disables late image lazy-loading and persistent DOM observers by default.
 * - Only applies content-visibility to simple, text-only article cards.
 * - Small, bounded batches; measurements before style changes.
 * - No network/JS API patches, CSS bundle changes or timer loops.
 */
(() => {
    'use strict';

    const CONFIG = {
        // Smooth scrolling takes priority over aggressive optimization.
        optimizeLongArticleFeeds: true,
        watchDynamicFeeds: false,
        lazyImages: false,
        lazyIframes: false,
        asyncImageDecoding: false,

        // Optional features have strict limits.
        minimumArticlesPerFeed: 10,
        maxArticlesToCheck: 80,
        maxArticlesPerPass: 24,
        maxOptimizedArticlesTotal: 48,
        maxMediaToCheck: 40,
        imageHeavyPageThreshold: 100,
        minDistanceFromViewport: 2,
        scrollQuietMs: 650,
        maxIdleRetries: 5,
        observerLifetimeMs: 25000,
        maxDynamicItems: 40,
        debug: false,

        excludedDomains: [
            'youtube.com', 'youtube-nocookie.com',
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
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;

    const host = location.hostname.toLowerCase();
    if (CONFIG.excludedDomains.some(domain =>
        host === domain || host.endsWith('.' + domain)
    )) return;
    if (/(?:^|\/)(?:login|log-in|signin|sign-in|checkout|payment|billing|auth)(?:\/|$)/i.test(location.pathname)) return;

    const supportsContainment = !!(
        typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 300px')
    );
    const stats = { images: 0, iframes: 0, articles: 0, observedFeeds: 0 };
    const processed = new WeakSet();
    const observers = [];
    let observedCount = 0;
    let stopped = false;
    let lastScroll = -Infinity;
    let observerTimer = 0;

    const clock = () => (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();

    function onScroll() {
        lastScroll = clock();
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });

    function scrolling() {
        return clock() - lastScroll < CONFIG.scrollQuietMs;
    }

    function log(message) {
        if (CONFIG.debug) {
            console.info('[Remia Global v2.1] ' + message, { ...stats });
        }
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        for (const observer of observers) observer.disconnect();
        observers.length = 0;
        if (observerTimer) clearTimeout(observerTimer);
        window.removeEventListener('scroll', onScroll, true);
        log('Stopped and cleaned up');
    }

    function scheduleQuietWork(callback, attempt = 0) {
        if (stopped) return;
        const run = () => {
            if (stopped) return;
            if (document.hidden || scrolling()) {
                if (!document.hidden && attempt < CONFIG.maxIdleRetries) {
                    window.setTimeout(() => scheduleQuietWork(callback, attempt + 1), 320);
                } else if (observers.length === 0) {
                    stop();
                }
                return;
            }
            try {
                callback();
            } catch (error) {
                if (CONFIG.debug) console.warn('[Remia Global v2.1]', error);
                stop();
            }
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout: 1400 });
        } else {
            window.setTimeout(run, 120);
        }
    }

    function offscreenHeight(element, minimumWidth, minimumHeight, maximumHeight) {
        const box = element.getBoundingClientRect();
        const viewHeight = window.innerHeight || 800;
        if (box.top < viewHeight * CONFIG.minDistanceFromViewport ||
            box.width < minimumWidth || box.height < minimumHeight ||
            box.height > maximumHeight) return 0;
        return Math.round(box.height);
    }

    function optimizeMedia() {
        if (!CONFIG.lazyImages && !CONFIG.lazyIframes) return;
        const candidates = [];
        let remaining = CONFIG.maxMediaToCheck;
        for (const tag of ['img', 'iframe']) {
            if (tag === 'img' && !CONFIG.lazyImages) continue;
            if (tag === 'iframe' && !CONFIG.lazyIframes) continue;
            const collection = document.getElementsByTagName(tag);
            const length = Math.min(collection.length, remaining);
            for (let i = 0; i < length; i++) {
                const item = collection[i];
                if (item.hasAttribute('loading') ||
                    item.getAttribute('fetchpriority') === 'high' ||
                    item.closest('header, nav, [role="banner"]')) continue;
                // Avoid layout shifts from lazy-loading unsized media.
                if (!item.hasAttribute('width') || !item.hasAttribute('height')) continue;
                if (tag === 'img' && (item.complete ||
                    (!item.hasAttribute('src') && !item.hasAttribute('srcset')))) continue;
                if (tag === 'iframe' && (!item.hasAttribute('src') ||
                    item.hasAttribute('srcdoc'))) continue;
                if (offscreenHeight(item, 8, 8, Infinity)) {
                    candidates.push({ item, tag });
                }
            }
            remaining -= length;
            if (remaining <= 0) break;
        }
        for (const { item, tag } of candidates) {
            if (!item.isConnected || item.hasAttribute('loading')) continue;
            item.setAttribute('loading', 'lazy');
            if (tag === 'img') {
                if (CONFIG.asyncImageDecoding && !item.hasAttribute('decoding')) {
                    item.setAttribute('decoding', 'async');
                }
                stats.images++;
            } else {
                stats.iframes++;
            }
        }
    }

    function safeTextArticle(article, parent) {
        return article.isConnected && article.parentElement === parent &&
            !processed.has(article) &&
            !article.style.getPropertyValue('content-visibility') &&
            !article.style.getPropertyValue('contain-intrinsic-block-size') &&
            // Skip image-heavy and interactive cards; these are likely to
            // reflow or redraw when they enter the viewport.
            !article.querySelector(
                'img, picture, video, audio, canvas, iframe, input, textarea, select, ' +
                '[contenteditable], [role="textbox"]'
            );
    }

    function optimizeArticles(items, parent) {
        const candidates = [];
        const remaining = Math.min(
            CONFIG.maxArticlesPerPass,
            CONFIG.maxOptimizedArticlesTotal - stats.articles
        );
        if (remaining <= 0) return;
        for (const article of items) {
            if (candidates.length >= remaining) break;
            if (!safeTextArticle(article, parent)) continue;
            const height = offscreenHeight(article, 260, 160, 1400);
            if (height) candidates.push({ article, height });
        }
        // Write styles only after finishing all geometry reads.
        for (const { article, height } of candidates) {
            if (!article.isConnected || processed.has(article)) continue;
            article.style.setProperty('contain-intrinsic-block-size', 'auto ' + height + 'px');
            article.style.setProperty('content-visibility', 'auto');
            processed.add(article);
            stats.articles++;
        }
    }

    function watchFeed(parent) {
        if (!CONFIG.watchDynamicFeeds ||
            typeof MutationObserver === 'undefined' ||
            observers.length >= 1) return;

        const pending = new Set();
        let scheduled = false;
        const observer = new MutationObserver(records => {
            if (stopped || observedCount >= CONFIG.maxDynamicItems ||
                !parent.isConnected) {
                stop();
                return;
            }
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (observedCount >= CONFIG.maxDynamicItems) break;
                    if (node.nodeType !== 1 ||
                        !node.matches('article, [role="article"]')) continue;
                    observedCount++;
                    pending.add(node);
                }
            }
            if (scheduled || pending.size === 0) return;
            scheduled = true;
            scheduleQuietWork(() => {
                scheduled = false;
                const added = Array.from(pending);
                pending.clear();
                optimizeArticles(added, parent);
                if (observedCount >= CONFIG.maxDynamicItems ||
                    stats.articles >= CONFIG.maxOptimizedArticlesTotal) stop();
            });
        });
        observer.observe(parent, { childList: true });
        observers.push(observer);
        stats.observedFeeds++;
        observerTimer = window.setTimeout(stop, CONFIG.observerLifetimeMs);
    }

    function optimizeFeeds() {
        if (!CONFIG.optimizeLongArticleFeeds || !supportsContainment) return;
        const nodes = document.querySelectorAll(
            'main article, [role="main"] article, main [role="article"], ' +
            '[role="main"] [role="article"]'
        );
        const groups = new Map();
        const limit = Math.min(nodes.length, CONFIG.maxArticlesToCheck);
        for (let i = 0; i < limit; i++) {
            const article = nodes[i];
            const parent = article.parentElement;
            if (!parent || parent.closest('article, [role="article"]')) continue;
            if (!groups.has(parent)) groups.set(parent, []);
            groups.get(parent).push(article);
        }
        for (const [parent, items] of groups) {
            if (items.length < CONFIG.minimumArticlesPerFeed) continue;
            optimizeArticles(items, parent);
            watchFeed(parent);
        }
    }

    function initialPass() {
        if (document.querySelector('input[type="password"], [contenteditable="true"]')) {
            stop();
            return;
        }
        // Many image-heavy sites already have their own lazy loader.
        // Avoid adding competition for network and image decoding.
        const imageCount = document.images ? document.images.length : 0;
        if (imageCount >= CONFIG.imageHeavyPageThreshold) {
            log('Skipped image-heavy page (' + imageCount + ' images)');
            stop();
            return;
        }
        optimizeMedia();
        optimizeFeeds();
        log('Initial pass completed');
        if (observers.length === 0) stop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => scheduleQuietWork(initialPass), {
            once: true
        });
    } else {
        scheduleQuietWork(initialPass);
    }
})();
