// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.5.0
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

  const style = document.createElement('style');
  style.textContent = `
    [data-threads-overlay],
    [data-threads-cta] { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // --- Patterns ----------------------------------------------------------
  const HERO_PATTERNS = [
    /^Say more with Threads$/,
    /^Get the full app experience( in the Threads app)?$/,
  ];
  const BUTTON_LABELS = [
    'continue with instagram',
    'open app',
    'open the app',
    'get the app',
    'open threads',
    'log in',
    'login',
    'sign up',
    'use the app',
  ];

  function isButtonLabel(text) {
    return BUTTON_LABELS.includes(text.trim().replace(/\s+/g, ' ').toLowerCase());
  }

  function isHeroText(text) {
    return HERO_PATTERNS.some(p => p.test(text.trim()));
  }

  // --- Scroll lock removal ----------------------------------------------
  function unlockScroll() {
    // Remove overflow:hidden from html, body, and any ancestor that might
    // be locking scroll. Only touch overflow, nothing else.
    const targets = [document.documentElement, document.body];
    for (const el of targets) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
      }
    }
  }

  // --- Overlay hiding ----------------------------------------------------
  // Strategy: find hero text, then climb to the nearest position:fixed
  // ancestor (the overlay layer). If none, climb to the nearest ancestor
  // that is a direct child of <body>. This avoids hiding the main content.
  function hideOverlay(root) {
    const scope = root || document;
    const hero = [...scope.querySelectorAll('span[dir="auto"]')].find(el =>
      isHeroText(el.textContent)
    );
    if (!hero) return false;

    let node = hero;
    let fixedAncestor = null;
    while (node && node.parentElement) {
      node = node.parentElement;
      if (node === document.body) break;
      const pos = getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'absolute') {
        fixedAncestor = node;
        break;
      }
    }

    const target = fixedAncestor || node;
    if (target && target !== document.body && !target.hasAttribute('data-threads-overlay')) {
      target.setAttribute('data-threads-overlay', '');
      target.style.setProperty('display', 'none', 'important');
      unlockScroll();
      return true;
    }
    return false;
  }

  // --- Standalone CTA hiding --------------------------------------------
  // Hide buttons whose textContent exactly matches a known CTA label.
  // Using full textContent is safe because we match exact strings only.
  function hideStandaloneCTAs(root) {
    const scope = root || document;
    const candidates = scope.querySelectorAll(
      '[role="button"], button, a[href]'
    );
    for (const el of candidates) {
      if (el.closest('[data-threads-overlay]')) continue;
      if (el.hasAttribute('data-threads-cta')) continue;
      if (isButtonLabel(el.textContent)) {
        el.setAttribute('data-threads-cta', '');
        el.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // --- Orchestration -----------------------------------------------------
  function run(root) {
    hideOverlay(root);
    hideStandaloneCTAs(root);
    unlockScroll();
  }

  run();

  const observer = new MutationObserver(mutations => {
    let needsRun = false;
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === 1) {
          needsRun = true;
          break;
        }
      }
      if (needsRun) break;
    }
    if (needsRun) {
      run();
    } else {
      // Check for scroll re-lock or buttons re-rendered.
      unlockScroll();
      hideStandaloneCTAs();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      run();
    }
  }, 1000);
})();
