
/// remia-youtube-performance.js
/*
 * Remia's YouTube Performance — uBlock Origin custom scriptlet
 * Target: YouTube desktop (www.youtube.com) on Zen Browser / Firefox
 * Version: 1.0.0 (2026-10-23)
 *
 * INSTALL:
 *   1. Host THIS EXACT FILE as raw text over HTTPS (GitHub Raw, for example).
 *   2. In uBO Advanced settings, add its raw URL to userResourcesLocation.
 *   3. In uBO > My filters, add:
 *        www.youtube.com##+js(remia-youtube-performance)
 *   4. Apply changes and reload YouTube.
 *
 * The FIRST line ('/// ... .js') is REQUIRED by uBO's resource parser.
 *
 * IMPORTANT:
 * - YouTube core JS/CSS bundles are coupled to the player and SPA router.
 *   We intentionally NEVER block/defer these bundles or patch browser APIs.
 * - This scriptlet reduces potential rendering/painting work. It does not
 *   remove JS downloads, reduce JS bundle byte-size, or guarantee faster LCP.
 * - YouTube frequently changes its markup. If a page jumps while scrolling,
 *   disable that specific optimization below and reload.
 */
(function () {
    'use strict';

    // ===================== SETTINGS =====================
    // Balanced settings; edit only the values in this object.
    const CONFIG = {
        // Home, subscriptions, channel grids and similar browsing pages.
        optimizeGridCards: true,

        // Search results, including long lists of video results.
        optimizeSearchCards: true,

        // More aggressive options; may affect scroll position on long pages.
        optimizeWatchRecommendations: false,
        optimizeWatchComments: false,

        // Suppress YouTube's GPU-intensive ambient background VISUALLY.
        // Prefer YouTube video Settings > Ambient mode > Off to disable it
        // at the application's own level.
        hideAmbientBackground: true,

        // Stop the animation of non-interactive loading placeholders only.
        // Does not touch the video player, progress bar, or hover controls.
        reduceSkeletonAnimations: true,

        // Diagnostic logging (only when installing, no polling).
        debug: false
    };
    // ====================================================

    if (window.top !== window.self) return;
    if (location.hostname !== 'www.youtube.com' &&
        location.hostname !== 'youtube.com') return;

    const STYLE_ID = 'remia-youtube-performance-style';
    const rules = [];
    const supportsContentVisibility = typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 320px');

    function addContainment(selectors, estimatedBlockSize) {
        // Do NOT target ytd-app, page-manager, ytd-watch-flexy, the player,
        // scrolling containers, or the actual video element.
        rules.push(
            selectors.join(',\n') + ' {\n' +
            '  content-visibility: auto !important;\n' +
            '  contain-intrinsic-block-size: auto ' + estimatedBlockSize + 'px !important;\n' +
            '}\n'
        );
    }

    if (supportsContentVisibility) {
        if (CONFIG.optimizeGridCards) {
            addContainment([
                'ytd-browse ytd-rich-item-renderer',
                'ytd-browse ytd-grid-video-renderer'
            ], 320);
        }

        if (CONFIG.optimizeSearchCards) {
            addContainment([
                'ytd-search ytd-video-renderer'
            ], 215);
        }

        if (CONFIG.optimizeWatchRecommendations) {
            addContainment([
                'ytd-watch-flexy #related ytd-compact-video-renderer'
            ], 110);
        }

        if (CONFIG.optimizeWatchComments) {
            addContainment([
                'ytd-watch-flexy #comments ytd-comment-thread-renderer'
            ], 165);
        }
    }

    if (CONFIG.hideAmbientBackground) {
        rules.push(
            'ytd-watch-flexy #cinematics,\n' +
            'ytd-watch-flexy #cinematics-container {\n' +
            '  display: none !important;\n' +
            '}\n'
        );
    }

    if (CONFIG.reduceSkeletonAnimations) {
        rules.push(
            'ytd-browse #ghost-cards *,\n' +
            'ytd-search #ghost-cards * {\n' +
            '  animation: none !important;\n' +
            '  transition: none !important;\n' +
            '}\n'
        );
    }

    if (rules.length === 0) return;

    function installStyleOnce() {
        if (!document.documentElement) return false;
        if (document.getElementById(STYLE_ID)) return true;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = rules.join('\n');
        (document.head || document.documentElement).appendChild(style);

        if (CONFIG.debug) {
            console.info('[Remia YouTube Performance] CSS installed once.', {
                rules: rules.length,
                supportsContentVisibility,
                url: location.href
            });
        }
        return true;
    }

    // Inject as early as possible. The CSS selectors keep working on all
    // YouTube SPA navigations without any DOM observer, timers or API patches.
    if (installStyleOnce()) return;

    // Rare document-start case: <html> has not yet been created.
    // Listen once; no long-lived observers or polling.
    document.addEventListener('readystatechange', installStyleOnce, { once: true });
    document.addEventListener('DOMContentLoaded', installStyleOnce, { once: true });
})();
