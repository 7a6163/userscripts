// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.7.2
// @description  Hides the login/CTA overlay and standalone Login/Open App buttons on Threads
// @author       zac
// @match        https://www.threads.net/*
// @match        https://www.threads.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    [data-threads-overlay],
    [data-threads-cta] { display: none !important; }
    #barcelona-header,
    nav { display: none !important; }
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
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
        el.style.setProperty('overflow', 'auto', 'important');
      }
    }
  }

  // --- Overlay hiding ----------------------------------------------------
  // The overlay is a [role="dialog"] containing hero text, with a backdrop
  // scrim as a sibling. Climb to the top-level container (direct child of
  // <body>) that includes both, and hide it.
  function hideOverlay() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (dialog.hasAttribute('data-threads-overlay')) continue;
      const hasHero = [...dialog.querySelectorAll('span[dir="auto"]')]
        .some(el => isHeroText(el.textContent));
      if (!hasHero) continue;

      let top = dialog;
      while (top.parentElement && top.parentElement !== document.body) {
        top = top.parentElement;
      }

      top.setAttribute('data-threads-overlay', '');
      top.style.setProperty('display', 'none', 'important');
      unlockScroll();
      return;
    }
  }

  // --- Standalone CTA hiding --------------------------------------------
  // Hide buttons whose textContent matches a known CTA label. Climb to the
  // nearest ancestor that contains ONLY CTA buttons and hide that container
  // so it doesn't leave empty space.
  function hideStandaloneCTAs() {
    for (const el of document.querySelectorAll('[role="button"], button, a[href]')) {
      if (el.closest('[data-threads-overlay]')) continue;
      if (el.closest('[data-threads-cta]')) continue;
      if (!isButtonLabel(el.textContent)) continue;

      let hideTarget = el;
      let node = el.parentElement;
      while (node && node !== document.body) {
        const interactive = [...node.querySelectorAll('[role="button"], button, a[href]')];
        if (interactive.length === 0) {
          node = node.parentElement;
          continue;
        }
        if (interactive.every(e => isButtonLabel(e.textContent))) {
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

  new MutationObserver(() => run()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
