// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.4.0
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
  // Exact button labels (matched against the element's own text, not subtree).
  const BUTTON_LABELS = [
    'Continue with Instagram',
    'Open app',
    'Open the app',
    'Get the app',
    'Open Threads',
    'Log in',
    'Login',
    'Sign up',
    'Use the app',
  ];

  function isButtonLabel(text) {
    const t = text.trim().replace(/\s+/g, ' ').toLowerCase();
    return BUTTON_LABELS.some(lbl => t === lbl.toLowerCase());
  }

  // --- Scroll lock removal (overflow only) -------------------------------
  function unlockScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      if (el.style.overflow === 'hidden' || getComputedStyle(el).overflow === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
      }
    }
  }

  // --- Overlay hiding ----------------------------------------------------
  function hideOverlay(root) {
    const scope = root || document;
    const hero = [...scope.querySelectorAll('span[dir="auto"]')].find(el =>
      HERO_PATTERNS.some(p => p.test(el.textContent.trim()))
    );
    if (!hero) return false;

    // Climb to the first ancestor that is a direct child of <body> — that's
    // the overlay container. Don't climb past body.
    let node = hero;
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
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
  // Only hide the button element itself (no climbing). Match against the
  // element's direct text content to avoid hiding large containers.
  function hideStandaloneCTAs(root) {
    const scope = root || document;
    const candidates = scope.querySelectorAll(
      '[role="button"], button, a[href]'
    );
    for (const el of candidates) {
      if (el.closest('[data-threads-overlay]')) continue;
      if (el.hasAttribute('data-threads-cta')) continue;
      // Get the element's own text (direct text nodes + immediate span children).
      const ownText = [...el.childNodes]
        .filter(n => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === 'SPAN'))
        .map(n => n.textContent.trim())
        .join(' ');
      if (isButtonLabel(ownText)) {
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
    let touched = false;
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === 1) {
          run(added);
          touched = true;
        }
      }
    }
    if (!touched) {
      // Maybe Threads re-locked scroll or re-showed a hidden element.
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
