
/// remia-global-performance.js
/*
 * Remia Global Performance v1.0 — uBlock Origin custom resource
 * Firefox / Zen Browser
 *
 * Purpose: modest, low-overhead rendering and media optimizations.
 * Does NOT block CSS/JS downloads or change browser network APIs.
 *
 * uBO filter (broad hostname regex, uBO >= 1.46.1):
 *   /^.+$/##+js(remia-global-performance)
 */
(() => {
    'use strict';

    const CONFIG = {
        lazyImages: true,
        lazyIframes: true,
        asyncImageDecoding: true,
        optimizeLongArticleFeeds: true,

        // Hard work limits: one pass, no MutationObserver / polling.
        maxMediaToCheck: 180,
        maxArticlesToCheck: 160,
        maxArticlesToOptimize: 48,
        minimumArticlesPerFeed: 10,
        offscreenViewportMultiplier: 1.6,
        idleTimeoutMs: 1200,
        debug: false,

        // Sites where this general-purpose scriptlet does not run.
        // YouTube uses the separate remia-youtube-performance scriptlet.
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
        if (window.top !== window.self) return;
    } catch (_) {
        return;
    }

    if (location.protocol !== 'https:' && location.protocol !== 'http:') {
        return;
    }

    const hostname = location.hostname.toLowerCase();
    if (CONFIG.excludedDomains.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
    )) {
        return;
    }

    const stats = { images: 0, iframes: 0, articles: 0 };

    function isFarOffscreen(element, threshold) {
        const rect = element.getBoundingClientRect();
        return rect.width >= 4 && rect.height >= 4 &&
            rect.top > threshold;
    }

    function optimizeMedia(threshold) {
        if (!CONFIG.lazyImages && !CONFIG.lazyIframes) return;

        const media = document.querySelectorAll(
            'img:not([loading]), iframe:not([loading])'
        );
        const limit = Math.min(media.length, CONFIG.maxMediaToCheck);

        for (let i = 0; i < limit; i++) {
            const element = media[i];
            const isImage = element.localName === 'img';

            if (isImage && !CONFIG.lazyImages) continue;
            if (!isImage && !CONFIG.lazyIframes) continue;
            if (element.hasAttribute('fetchpriority') &&
                element.getAttribute('fetchpriority') === 'high') continue;
            if (element.closest('header, nav, [role="banner"]')) continue;
            if (isImage && (!element.getAttribute('src') &&
                            !element.getAttribute('srcset'))) continue;
            if (!isImage && !element.getAttribute('src')) continue;
            if (isImage && element.complete) continue;
            if (!isFarOffscreen(element, threshold)) continue;

            element.setAttribute('loading', 'lazy');
            if (isImage) {
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

    function optimizeArticleFeeds(threshold) {
        if (!CONFIG.optimizeLongArticleFeeds) return;
        if (typeof CSS === 'undefined' || !CSS.supports ||
            !CSS.supports('content-visibility', 'auto') ||
            !CSS.supports('contain-intrinsic-block-size', 'auto 300px')) {
            return;
        }

        // Only independent sibling articles inside a main content area.
        // Do not contain the page, app shell, video, or scrolling viewport.
        const nodes = document.querySelectorAll(
            'main article, [role="main"] article'
        );
        const grouped = new Map();
        const limit = Math.min(nodes.length, CONFIG.maxArticlesToCheck);

        for (let i = 0; i < limit; i++) {
            const article = nodes[i];
            const parent = article.parentElement;
            if (!parent || parent.closest('article')) continue;
            let group = grouped.get(parent);
            if (!group) {
                group = [];
                grouped.set(parent, group);
            }
            group.push(article);
        }

        const candidates = [];
        for (const group of grouped.values()) {
            if (group.length < CONFIG.minimumArticlesPerFeed) continue;
            for (const article of group) {
                if (candidates.length >= CONFIG.maxArticlesToOptimize) break;
                if (article.style.contentVisibility ||
                    article.style.containIntrinsicBlockSize) continue;
                if (article.querySelector(
                    'video, canvas, iframe, [contenteditable="true"]'
                )) continue;
                const rect = article.getBoundingClientRect();
                if (rect.top <= threshold || rect.width < 220 ||
                    rect.height < 100 || rect.height > 1600) continue;
                candidates.push({ article, height: Math.round(rect.height) });
            }
            if (candidates.length >= CONFIG.maxArticlesToOptimize) break;
        }

        // Read sizes first, change style second: avoids layout thrashing.
        for (const { article, height } of candidates) {
            article.style.setProperty(
                'contain-intrinsic-block-size', 'auto ' + height + 'px'
            );
            article.style.setProperty('content-visibility', 'auto');
            stats.articles++;
        }
    }

    function runOnce() {
        if (document.visibilityState === 'hidden') return;
        // Avoid altering editors and forms requiring a password.
        if (document.querySelector(
            'input[type="password"], [contenteditable="true"]'
        )) return;

        const threshold = Math.max(800,
            (window.innerHeight || 800) * CONFIG.offscreenViewportMultiplier
        );
        optimizeMedia(threshold);
        optimizeArticleFeeds(threshold);

        if (CONFIG.debug) {
            console.info('[Remia Global Performance]', hostname, stats);
        }
    }

    function schedule() {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runOnce, {
                timeout: CONFIG.idleTimeoutMs
            });
        } else {
            window.setTimeout(runOnce, 0);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    } else {
        schedule();
    }
})();
