// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.6.1
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
    'get app',
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
  // The overlay is wrapped in a [role="dialog"][aria-modal="true"] element,
  // with a backdrop scrim as a sibling. Strategy:
  //  1. Find [role="dialog"] that contains hero text.
  //  2. Climb to the top-level container (direct child of <body>) that
  //     includes both the dialog and its backdrop scrim.
  //  3. Hide that container.
  function hideOverlay() {
    // Find dialog elements containing hero text.
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
      if (dialog.hasAttribute('data-threads-overlay')) continue;
      const hasHero = [...dialog.querySelectorAll('span[dir="auto"], div, span, p, h1, h2')]
        .some(el => el.childElementCount === 0 && isHeroText(el.textContent));
      if (!hasHero) continue;

      // Climb to the direct child of <body> (top-level overlay wrapper
      // that includes both backdrop and dialog).
      let node = dialog;
      let top = dialog;
      while (node && node.parentElement && node.parentElement !== document.body) {
        node = node.parentElement;
        top = node;
      }

      top.setAttribute('data-threads-overlay', '');
      top.style.setProperty('display', 'none', 'important');
      unlockScroll();
      return true;
    }

    // Fallback: no role="dialog" found — use hero text directly.
    let hero = [...document.querySelectorAll('span[dir="auto"]')].find(el =>
      isHeroText(el.textContent)
    );
    if (!hero) {
      const leaves = document.querySelectorAll('div, span, p, h1, h2');
      for (const el of leaves) {
        if (el.childElementCount === 0 && isHeroText(el.textContent)) {
          hero = el;
          break;
        }
      }
    }
    if (!hero) return false;

    let node = hero;
    let top = hero;
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
      top = node;
    }

    if (top && top !== document.body && !top.hasAttribute('data-threads-overlay')) {
      top.setAttribute('data-threads-overlay', '');
      top.style.setProperty('display', 'none', 'important');
      unlockScroll();
      return true;
    }
    return false;
  }

  // --- Standalone CTA hiding --------------------------------------------
  // Hide buttons whose textContent exactly matches a known CTA label.
  // Climb up to the nearest ancestor that contains ONLY CTA buttons (no
  // other interactive elements like back button, logo, etc.) and hide that
  // whole container so it doesn't leave empty space.
  function hideStandaloneCTAs() {
    const candidates = document.querySelectorAll(
      '[role="button"], button, a[href]'
    );
    for (const el of candidates) {
      if (el.closest('[data-threads-overlay]')) continue;
      if (el.closest('[data-threads-cta]')) continue;
      if (!isButtonLabel(el.textContent)) continue;

      // Climb to the nearest ancestor that contains only CTA buttons.
      let hideTarget = el;
      let node = el.parentElement;
      while (node && node !== document.body) {
        const interactive = [...node.querySelectorAll(
          '[role="button"], button, a[href]'
        )];
        if (interactive.length === 0) {
          // Decorative wrapper with no interactive elements — keep climbing.
          node = node.parentElement;
          continue;
        }
        const allCta = interactive.every(e => isButtonLabel(e.textContent));
        if (allCta) {
          hideTarget = node;
          node = node.parentElement;
          continue;
        }
        break;
      }

      if (!hideTarget.hasAttribute('data-threads-cta')) {
        hideTarget.setAttribute('data-threads-cta', '');
        hideTarget.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // --- Orchestration -----------------------------------------------------
  function run() {
    hideOverlay();
    hideStandaloneCTAs();
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
