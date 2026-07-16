// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.8.1
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
    [style*="--header-height"] {
      --header-height: 0px !important;
      padding-top: 0 !important;
      margin-top: 0 !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // --- Patterns ----------------------------------------------------------
  const HERO_PATTERNS = [
    /^Say more with Threads$/,
    /^Get the full app experience( in the Threads app)?$/,
  ];
  const BUTTON_LABELS = new Set([
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
  ]);

  const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const isButtonLabel = el => BUTTON_LABELS.has(norm(el.textContent));
  const isHeroText = el => HERO_PATTERNS.some(p => p.test(el.textContent.trim()));

  // --- Scroll lock removal ----------------------------------------------
  function unlockScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (el) el.style.setProperty('overflow', 'auto', 'important');
    }
  }

  // --- Overlay hiding ----------------------------------------------------
  // Climb from the hero-text dialog to the top-level body child and hide it.
  function hideOverlay() {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (dialog.hasAttribute('data-threads-overlay')) continue;
      if (![...dialog.querySelectorAll('span[dir="auto"]')].some(isHeroText)) continue;

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
  // Hide buttons matching CTA labels; climb to the nearest ancestor that
  // contains ONLY CTA buttons so no empty space is left behind.
  function hideStandaloneCTAs() {
    for (const el of document.querySelectorAll('[role="button"], button, a[href]')) {
      if (el.closest('[data-threads-overlay], [data-threads-cta]')) continue;
      if (!isButtonLabel(el)) continue;

      let hideTarget = el;
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const interactive = [...node.querySelectorAll('[role="button"], button, a[href]')];
        if (!interactive.length) continue;
        if (!interactive.every(isButtonLabel)) break;
        hideTarget = node;
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
