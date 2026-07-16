// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.1.0
// @description  Hides the login/CTA overlay on threads.net and threads.com (desktop + mobile)
// @author       zac
// @match        https://www.threads.net/*
// @match        https://www.threads.com/*
// @match        https://www.ig.me/*
// @match        https://www.instagram.com/threads*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Inject CSS early so the overlay never flashes. The JS below tags the
  // overlay container with [data-threads-login-overlay]; this rule hides it
  // before paint whenever the attribute is set.
  const style = document.createElement('style');
  style.textContent = `
    [data-threads-login-overlay] { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Mark + hide the overlay by text content (robust against class renaming).
  // Threads serves different overlays on desktop vs. mobile web:
  //   - Desktop: hero "Say more with Threads" + "Continue with Instagram"
  //   - Mobile:  hero "Get the full app experience in the Threads app" (or
  //              short variant "Get the full app experience") + open-app CTA
  const HERO_PATTERNS = [
    /^Say more with Threads$/,
    /^Get the full app experience( in the Threads app)?$/,
  ];
  // Secondary text that helps confirm we're inside the overlay (not just any
  // banner): the "Continue with Instagram" button (desktop) or the
  // "Open app" / "Get the app" button (mobile).
  const CTA_PATTERNS = [
    /Continue with Instagram/,
    /\bOpen (the )?app\b/,
    /\bGet the app\b/,
    /\bOpen Threads\b/,
  ];

  function matchesAny(text, patterns) {
    return patterns.some(p => p.test(text));
  }

  function hideOverlay(root) {
    const scope = root || document;
    // Find the hero text node that only appears in the login/CTA overlay.
    const hero = [...scope.querySelectorAll('span[dir="auto"]')].find(el =>
      matchesAny(el.textContent.trim(), HERO_PATTERNS)
    );
    if (!hero) return false;

    // Walk up to the outer overlay container. The hero sits inside a chain of
    // wrapper divs; climb until we reach a direct child of <body> or a node
    // that also contains one of the CTA buttons.
    let node = hero;
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
      const spans = [...node.querySelectorAll('span[dir="auto"]')];
      const hasCta = spans.some(s => matchesAny(s.textContent, CTA_PATTERNS));
      const hasButton = node.querySelector('[role="button"], a[href]');
      if (hasButton && hasCta) break;
    }
    if (node && node !== document.body) {
      node.setAttribute('data-threads-login-overlay', '');
      node.style.setProperty('display', 'none', 'important');
      return true;
    }
    return false;
  }

  // Try immediately in case DOM is already parsed.
  hideOverlay();

  // Watch for the overlay being injected dynamically.
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === 1 && hideOverlay(added)) return;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Stop observing once we've hidden it, to avoid ongoing work.
  // (Re-armed on SPA navigation below.)
  function arm() {
    hideOverlay();
  }
  // Re-run on client-side navigations.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      arm();
    }
  }, 1000);
})();
