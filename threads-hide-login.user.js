// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.0.0
// @description  Hides the "Say more with Threads" login overlay on threads.net
// @author       zac
// @match        https://www.threads.net/*
// @match        https://www.threads.com/*
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
  function hideOverlay(root) {
    const scope = root || document;
    // Find the hero text node that only appears in the login overlay.
    const hero = [...scope.querySelectorAll('span[dir="auto"]')].find(el =>
      el.textContent.trim() === 'Say more with Threads'
    );
    if (!hero) return false;

    // Walk up to the outer overlay container. The hero sits inside a chain of
    // wrapper divs; climb until we reach a direct child of <body> or a node
    // that also contains the "Continue with Instagram" button.
    let node = hero;
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
      if (node.querySelector('[role="button"]') &&
          [...node.querySelectorAll('span[dir="auto"]')].some(s =>
            /Continue with Instagram/.test(s.textContent))) {
        break;
      }
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
