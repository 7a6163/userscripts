// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.2.0
// @description  Hides the login/CTA overlay and standalone Login/Open App buttons on Threads
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
  // overlay container with [data-threads-login-overlay] and standalone CTA
  // buttons with [data-threads-cta]; these rules hide them before paint.
  const style = document.createElement('style');
  style.textContent = `
    [data-threads-login-overlay],
    [data-threads-cta] { display: none !important; }
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
  // Standalone button labels that appear outside the main overlay (e.g. in a
  // sticky bottom bar or header): "Log in" / "Login" and "Open App".
  // We match the button's own text, not subtree text, to avoid hiding large
  // containers that merely mention these words.
  const BUTTON_PATTERNS = [
    /^Log ?in$/i,
    /^Open (the )?app$/i,
    /^Get the app$/i,
    /^Open Threads$/i,
    /^Continue with Instagram$/i,
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

  // Hide standalone Login / Open App buttons that live outside the main
  // overlay (e.g. in a sticky bottom bar or header). We target interactive
  // elements whose direct text matches one of BUTTON_PATTERNS.
  function hideStandaloneCTAs(root) {
    const scope = root || document;
    const candidates = scope.querySelectorAll(
      '[role="button"], button, a[href]'
    );
    for (const el of candidates) {
      if (el.hasAttribute('data-threads-cta')) continue;
      // Use the element's own direct text, not subtree text, so we don't
      // accidentally hide large wrappers.
      const ownText = [...el.childNodes]
        .filter(n => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === 'SPAN'))
        .map(n => n.textContent.trim())
        .join(' ')
        .trim();
      const label = ownText || el.textContent.trim();
      if (matchesAny(label, BUTTON_PATTERNS)) {
        // Climb one level up so we hide the button + its decorative wrapper
        // (Threads wraps buttons in extra divs for styling).
        const target = el.parentElement && el.parentElement.childElementCount === 1
          ? el.parentElement
          : el;
        target.setAttribute('data-threads-cta', '');
        target.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // Try immediately in case DOM is already parsed.
  hideOverlay();
  hideStandaloneCTAs();

  // Watch for the overlay / CTAs being injected dynamically.
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType !== 1) continue;
        hideOverlay(added);
        hideStandaloneCTAs(added);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Re-run on client-side navigations.
  function arm() {
    hideOverlay();
    hideStandaloneCTAs();
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
