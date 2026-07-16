// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.3.0
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

  // --- CSS ---------------------------------------------------------------
  // Tag-based rules so the JS can mark elements and they get hidden before
  // the next paint. Also force-restore scrolling: Threads locks body/html
  // overflow when the overlay is open.
  const style = document.createElement('style');
  style.textContent = `
    [data-threads-overlay],
    [data-threads-cta] { display: none !important; }

    /* Restore scrolling that Threads disables when the overlay is shown */
    html[data-threads-scrolllock],
    body[data-threads-scrolllock] {
      overflow: auto !important;
      position: static !important;
      height: auto !important;
      inset: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // --- Patterns ----------------------------------------------------------
  // Hero text that only appears in the login/CTA overlay.
  const HERO_PATTERNS = [
    /^Say more with Threads$/,
    /^Get the full app experience( in the Threads app)?$/,
  ];
  // CTA button text (used to identify the overlay container and standalone
  // buttons). Matched against the button's full text content.
  const CTA_PATTERNS = [
    /Continue with Instagram/i,
    /\bOpen (the )?app\b/i,
    /\bGet the app\b/i,
    /\bOpen Threads\b/i,
    /^Log ?in$/i,
    /^Sign up$/i,
    /^Use the app$/i,
  ];

  function matchesAny(text, patterns) {
    return patterns.some(p => p.test(text));
  }

  // --- Scroll lock removal ----------------------------------------------
  function unlockScroll() {
    const attrs = ['data-threads-scrolllock'];
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      // Remove inline overflow/position locks Threads sets via JS.
      el.style.removeProperty('overflow');
      el.style.removeProperty('position');
      el.style.removeProperty('height');
      el.style.removeProperty('inset');
      el.style.setProperty('overflow', 'auto', 'important');
      // Tag so the CSS rule above keeps it unlocked even if Threads
      // re-applies inline styles.
      el.setAttribute(attrs[0], '');
    }
  }

  // --- Overlay hiding ----------------------------------------------------
  function hideOverlay(root) {
    const scope = root || document;
    const hero = [...scope.querySelectorAll('span[dir="auto"]')].find(el =>
      matchesAny(el.textContent.trim(), HERO_PATTERNS)
    );
    if (!hero) return false;

    // Climb to the outer overlay container: the ancestor that also contains
    // a CTA button.
    let node = hero;
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
      const spans = [...node.querySelectorAll('span[dir="auto"]')];
      const hasCta = spans.some(s => matchesAny(s.textContent, CTA_PATTERNS));
      const hasButton = node.querySelector('[role="button"], a[href], button');
      if (hasButton && hasCta) break;
    }
    if (node && node !== document.body && !node.hasAttribute('data-threads-overlay')) {
      node.setAttribute('data-threads-overlay', '');
      node.style.setProperty('display', 'none', 'important');
      unlockScroll();
      return true;
    }
    return false;
  }

  // --- Standalone CTA hiding --------------------------------------------
  // Hide Login / Open App buttons that live outside the overlay, e.g. in a
  // sticky bottom bar. We look for interactive elements whose text matches,
  // then hide the button and its immediate wrapper.
  function hideStandaloneCTAs(root) {
    const scope = root || document;
    const candidates = scope.querySelectorAll(
      '[role="button"], button, a[href]'
    );
    for (const el of candidates) {
      if (el.closest('[data-threads-overlay]')) continue;
      if (el.hasAttribute('data-threads-cta')) continue;
      const label = el.textContent.trim();
      if (matchesAny(label, CTA_PATTERNS)) {
        // Climb to the nearest wrapper that is a flex/grid item so we hide
        // the button + its decorative padding wrapper, not a huge container.
        let target = el;
        // If the parent only contains this button (plus decorative siblings
        // like icons), hide the parent instead.
        let p = el.parentElement;
        while (p && p !== document.body) {
          const interactive = p.querySelectorAll(':scope > [role="button"], :scope > button, :scope > a[href]');
          if (interactive.length === 1 && interactive[0] === el) {
            target = p;
            p = p.parentElement;
          } else {
            break;
          }
        }
        target.setAttribute('data-threads-cta', '');
        target.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // --- Orchestration -----------------------------------------------------
  function run(root) {
    hideOverlay(root);
    hideStandaloneCTAs(root);
    unlockScroll();
  }

  // Initial pass.
  run();

  // Observe DOM mutations so dynamically injected overlays/CTAs get hidden.
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === 1) run(added);
      }
    }
    // Also catch Threads re-applying scroll locks via attribute changes.
    unlockScroll();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });

  // Re-run on SPA navigations.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      run();
    }
  }, 1000);
})();
