
/// remia-youtube-performance.js
/*
 * Remia's YouTube Performance v2.0
 * uBlock Origin custom scriptlet - Zen Browser / Firefox desktop.
 *
 * Keeps the v1 performance options and adds:
 * - Hide Shorts on Home, Search, left guide and Watch related videos.
 * - Keep Shorts visible and manageable in Watch History.
 * - Show complete video titles (no two-line ellipsis).
 * - Responsive grid for Search and History, without moving DOM nodes.
 *
 * uBO My filters:
 *   youtube.com##+js(remia-youtube-performance)
 *
 * Replace the old resource under the same GitHub Raw URL.
 * This is layout/CSS optimization, NOT network-level JS/CSS blocking.
 */
(() => {
    'use strict';

    const CONFIG = {
        // Requested interface changes.
        hideShortsHome: true,
        hideShortsSearch: true,
        hideShortsLeftSidebar: true,
        hideShortsWatchSidebar: true,
        keepShortsInHistory: true,
        showFullTitles: true,
        gridSearch: true,
        gridHistory: true,

        // Responsive card width in CSS pixels. Smaller = more columns.
        gridMinCardWidth: 230,
        gridGap: 16,

        // Previous performance optimizations.
        optimizeGridCards: true,
        optimizeSearchCards: true,
        optimizeWatchRecommendations: false,
        optimizeWatchComments: false,
        hideAmbientBackground: true,
        reduceSkeletonAnimations: true,

        debug: false
    };

    try {
        if (window.top !== window.self) return;
    } catch (_) {
        return;
    }
    if (location.hostname !== 'www.youtube.com' &&
        location.hostname !== 'youtube.com') return;

    const STYLE_ID = 'remia-youtube-performance-style';
    const css = [];

    const hasContentVisibility = typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('content-visibility', 'auto') &&
        CSS.supports('contain-intrinsic-block-size', 'auto 320px');

    const cardMin = Math.max(160, Math.min(420,
        Number(CONFIG.gridMinCardWidth) || 230));
    const cardGap = Math.max(0, Math.min(40,
        Number(CONFIG.gridGap) || 16));

    function addContainment(selectors, px) {
        css.push(`${selectors.join(',\n')} {
            content-visibility: auto !important;
            contain-intrinsic-block-size: auto ${px}px !important;
        }`);
    }

    // Keep the original optimizations. Search gets card-based layout if
    // enabled; avoid offscreen containment on grid cards to reduce jumping.
    if (hasContentVisibility) {
        if (CONFIG.optimizeGridCards) {
            addContainment([
                'ytd-browse ytd-rich-item-renderer',
                'ytd-browse ytd-grid-video-renderer'
            ], 320);
        }
        if (CONFIG.optimizeSearchCards && !CONFIG.gridSearch) {
            addContainment(['ytd-search ytd-video-renderer'], 215);
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
        css.push(`ytd-watch-flexy #cinematics,
            ytd-watch-flexy #cinematics-container {
                display: none !important;
            }`);
    }
    if (CONFIG.reduceSkeletonAnimations) {
        css.push(`ytd-browse #ghost-cards *,
            ytd-search #ghost-cards * {
                animation: none !important;
                transition: none !important;
            }`);
    }

    // Home: Shorts shelves, groups and individual Shorts cards.
    // Exact scopes ensure History is not affected.
    if (CONFIG.hideShortsHome) {
        css.push(`
            ytd-browse[page-subtype="home"] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
            ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer[is-shorts],
            ytd-browse[page-subtype="home"] ytd-reel-shelf-renderer,
            ytd-browse[page-subtype="home"] ytd-rich-grid-group:has(a[href^="/shorts/"]):not(:has(a[href^="/watch"])),
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer[is-slim-media],
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(a[href^="/shorts/"]),
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has([overlay-style="SHORTS"]) {
                display: none !important;
            }`);
    }

    // Search: single Shorts hits and old/new Shorts shelf variants.
    // No selectors target History or other browse pages.
    if (CONFIG.hideShortsSearch) {
        css.push(`
            ytd-search ytd-reel-shelf-renderer,
            ytd-search ytd-video-renderer:has(a[href^="/shorts/"]),
            ytd-search ytd-video-renderer:has([overlay-style="SHORTS"]),
            ytd-search grid-shelf-view-model:has(a[href^="/shorts/"]),
            ytd-search grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
            ytd-search grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2),
            ytd-search ytm-shorts-lockup-view-model,
            ytd-search ytm-shorts-lockup-view-model-v2 {
                display: none !important;
            }`);
    }

    // Left guide = permanent navigation, independent of the current page.
    if (CONFIG.hideShortsLeftSidebar) {
        css.push(`
            ytd-guide-entry-renderer:has(a[href^="/shorts"]),
            ytd-guide-entry-renderer:has(a[title="Shorts"]),
            ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
            ytd-mini-guide-entry-renderer:has(a[aria-label="Shorts"]),
            ytd-mini-guide-entry-renderer[aria-label="Shorts"] {
                display: none !important;
            }`);
    }

    // Watch-page recommendations sidebar (NOT the History page).
    if (CONFIG.hideShortsWatchSidebar) {
        css.push(`
            ytd-watch-flexy #related ytd-reel-shelf-renderer,
            ytd-watch-flexy #related grid-shelf-view-model:has(a[href^="/shorts/"]),
            ytd-watch-flexy #related ytd-compact-video-renderer:has(a[href^="/shorts/"]),
            ytd-watch-flexy #related ytd-compact-video-renderer:has([overlay-style="SHORTS"]),
            ytd-watch-flexy #related yt-lockup-view-model:has(a[href^="/shorts/"]) {
                display: none !important;
            }`);
    }

    // Full titles across browsing, search, history and related videos.
    // Deliberately avoids changing the player's title or subtitles.
    if (CONFIG.showFullTitles) {
        css.push(`
            :is(ytd-browse, ytd-search, ytd-watch-flexy #related)
                :is(#video-title, #video-title-link,
                    .yt-lockup-metadata-view-model-wiz__title,
                    .yt-lockup-metadata-view-model__title,
                    .ytLockupMetadataViewModelTitle) {
                display: block !important;
                -webkit-line-clamp: unset !important;
                line-clamp: unset !important;
                -webkit-box-orient: initial !important;
                max-height: none !important;
                height: auto !important;
                white-space: normal !important;
                overflow: visible !important;
                text-overflow: clip !important;
                overflow-wrap: anywhere !important;
            }
            :is(ytd-browse, ytd-search, ytd-watch-flexy #related)
                :is(h3, #title-wrapper):has(> #video-title) {
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
            }`);
    }

    if (CONFIG.gridSearch || CONFIG.gridHistory) {
        const scopes = [];
        if (CONFIG.gridSearch) scopes.push('ytd-search');
        if (CONFIG.gridHistory) scopes.push('ytd-browse[page-subtype="history"]');
        const scope = `:is(${scopes.join(', ')})`;
        css.push(`
            ${scope} {
                --remia-yt-grid-min: ${cardMin}px;
                --remia-yt-grid-gap: ${cardGap}px;
            }

            /* Every day group / results group retains its own grid. */
            ${scope} ytd-item-section-renderer > #contents {
                display: grid !important;
                grid-template-columns: repeat(auto-fill,
                    minmax(min(100%, var(--remia-yt-grid-min)), 1fr)) !important;
                gap: var(--remia-yt-grid-gap) !important;
                align-items: start !important;
                justify-items: stretch !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }

            /* Leave day headings, channels, playlists, loading and Shorts
               shelf in full-width rows. Important for History. */
            ${scope} ytd-item-section-renderer > #contents > :not(ytd-video-renderer) {
                grid-column: 1 / -1 !important;
                min-width: 0 !important;
            }

            ${scope} ytd-item-section-renderer > #contents > ytd-video-renderer {
                display: block;
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                margin: 0 !important;
                box-sizing: border-box !important;
            }

            /* Convert each horizontal list video into a vertical card. */
            ${scope} ytd-video-renderer #dismissible {
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                gap: 0 !important;
                width: 100% !important;
                min-width: 0 !important;
                height: auto !important;
                box-sizing: border-box !important;
            }

            ${scope} ytd-video-renderer ytd-thumbnail,
            ${scope} ytd-video-renderer yt-thumbnail-view-model,
            ${scope} ytd-video-renderer a.ytLockupViewModelContentImage,
            ${scope} ytd-video-renderer a.yt-lockup-view-model-wiz__content-image {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                height: auto !important;
                flex: none !important;
            }

            ${scope} ytd-video-renderer ytd-thumbnail,
            ${scope} ytd-video-renderer a.ytLockupViewModelContentImage,
            ${scope} ytd-video-renderer a.yt-lockup-view-model-wiz__content-image {
                aspect-ratio: 16 / 9 !important;
            }

            ${scope} ytd-video-renderer .text-wrapper,
            ${scope} ytd-video-renderer #meta,
            ${scope} ytd-video-renderer .ytLockupViewModelMetadata {
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin-left: 0 !important;
                box-sizing: border-box !important;
            }

            ${scope} ytd-video-renderer .text-wrapper {
                padding-top: 8px !important;
            }

            /* Keep title and metadata; remove wide-list descriptions only. */
            ${scope} ytd-video-renderer :is(#description-text,
                .metadata-snippet-container, #expandable-metadata,
                .detailed-metadata-snippets-container) {
                display: none !important;
            }
        `);
    }

    // Search defaults to an unusually narrow centered list. Expand only
    // that page; do not touch Home, History, player, side guide or filters.
    if (CONFIG.gridSearch) {
        css.push(`
            ytd-search ytd-two-column-search-results-renderer,
            ytd-search #primary.ytd-two-column-search-results-renderer,
            ytd-search ytd-section-list-renderer {
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
            }
            ytd-search #primary.ytd-two-column-search-results-renderer {
                flex: 1 1 auto !important;
            }
        `);
    }

    // Optional inverse setting, off by default. This intentionally is not
    // enabled for the requested History exception.
    if (!CONFIG.keepShortsInHistory) {
        css.push(`
            ytd-browse[page-subtype="history"] ytd-reel-shelf-renderer,
            ytd-browse[page-subtype="history"] ytd-video-renderer:has(a[href^="/shorts/"]) {
                display: none !important;
            }
        `);
    }

    // History Shorts are intentionally NOT hidden. Day headings and
    // history controls stay outside the video-card grid.
    if (CONFIG.gridHistory) {
        css.push(`
            ytd-browse[page-subtype="history"] #primary,
            ytd-browse[page-subtype="history"] ytd-section-list-renderer {
                max-width: none !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
            }
            ytd-browse[page-subtype="history"] ytd-item-section-renderer > #header,
            ytd-browse[page-subtype="history"] ytd-item-section-header-renderer {
                width: 100% !important;
                max-width: none !important;
            }
        `);
    }

    if (css.length === 0) return;

    function injectOnce() {
        if (!document.documentElement) return false;
        if (document.getElementById(STYLE_ID)) return true;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css.join('\n');
        (document.head || document.documentElement).appendChild(style);
        if (CONFIG.debug) {
            console.info('[Remia YouTube Performance v2.0]', {
                rules: css.length,
                gridMinCardWidth: cardMin,
                gridGap: cardGap,
                historyShortsPreserved: CONFIG.keepShortsInHistory,
                contentVisibilitySupported: hasContentVisibility
            });
        }
        return true;
    }

    // CSS selectors continue to work across YouTube SPA navigation.
    // No MutationObserver, DOM moves, timer loop or history API patches.
    if (!injectOnce()) {
        document.addEventListener('readystatechange', injectOnce);
        document.addEventListener('DOMContentLoaded', injectOnce, { once: true });
    }
})();
