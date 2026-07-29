// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      1.9.0
// @description  Hides the login/CTA overlay and standalone Login/Open App buttons on Threads
// @author       zac
// @match        https://www.threads.net/*
// @match        https://www.threads.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/7a6163/userscripts/main/threads-hide-login.user.js
// @downloadURL  https://raw.githubusercontent.com/7a6163/userscripts/main/threads-hide-login.user.js
// ==/UserScript==

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // CSS injection
  // document-start 時 document.head / document.documentElement 可能尚未存在，
  // 因此不能直接 appendChild，必須等 DOM 根節點可用後再注入。
  // -----------------------------------------------------------------------

  const STYLE_ID = 'threads-hide-login-style';

  const STYLE_TEXT = `
    [data-threads-overlay],
    [data-threads-cta] {
      display: none !important;
    }

    #barcelona-header,
    nav {
      display: none !important;
    }

    [style*="--header-height"] {
      --header-height: 0px !important;
      padding-top: 0 !important;
      margin-top: 0 !important;
    }
  `;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return true;
    }

    const parent = document.head || document.documentElement;

    // iOS Userscripts App 在 document-start 時可能兩者都還不存在。
    if (!parent) {
      return false;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    parent.appendChild(style);

    return true;
  }

  // -----------------------------------------------------------------------
  // Text matching
  // -----------------------------------------------------------------------

  const HERO_PATTERNS = [
    /^Say more with Threads$/i,
    /^Get the full app experience(?: in the Threads app)?$/i,

    // 繁體中文可能出現的標題
    /^在 Threads 上暢所欲言$/,
    /^使用 Threads，暢所欲言$/,
    /^取得完整的應用程式體驗$/,
    /^在 Threads 應用程式中享受完整體驗$/,

    // 簡體中文可能出現的標題
    /^在 Threads 上畅所欲言$/,
    /^使用 Threads，畅所欲言$/,
    /^获取完整的应用体验$/,
    /^在 Threads 应用中享受完整体验$/,
  ];

  const BUTTON_LABELS = new Set([
    // English
    'continue with instagram',
    'open app',
    'open the app',
    'get the app',
    'get app',
    'open threads',
    'log in',
    'login',
    'sign in',
    'sign up',
    'use the app',

    // 繁體中文
    '使用 instagram 繼續',
    '繼續使用 instagram',
    '透過 instagram 繼續',
    '開啟 app',
    '開啟應用程式',
    '打開 app',
    '取得 app',
    '取得應用程式',
    '開啟 threads',
    '登入',
    '登錄',
    '註冊',
    '使用 app',
    '使用應用程式',

    // 簡體中文
    '使用 instagram 继续',
    '继续使用 instagram',
    '通过 instagram 继续',
    '打开 app',
    '打开应用',
    '获取 app',
    '获取应用',
    '打开 threads',
    '登录',
    '注册',
    '使用 app',
    '使用应用',
  ]);

  function norm(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function getElementLabels(element) {
    return [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
    ];
  }

  function isButtonLabel(element) {
    return getElementLabels(element).some(value => {
      return BUTTON_LABELS.has(norm(value));
    });
  }

  function isHeroText(element) {
    const values = [
      element.textContent,
      element.getAttribute('aria-label'),
    ];

    return values.some(value => {
      const text = String(value || '').trim();
      return HERO_PATTERNS.some(pattern => pattern.test(text));
    });
  }

  // -----------------------------------------------------------------------
  // Safe style modification
  // 避免每次 run 都重設 style，否則 observer 監聽 style 時可能不斷觸發。
  // -----------------------------------------------------------------------

  function setImportant(element, property, value) {
    if (!element) return;

    const currentValue = element.style.getPropertyValue(property);
    const currentPriority = element.style.getPropertyPriority(property);

    if (
      currentValue === value &&
      currentPriority === 'important'
    ) {
      return;
    }

    element.style.setProperty(property, value, 'important');
  }

  // -----------------------------------------------------------------------
  // Scroll lock removal
  // -----------------------------------------------------------------------

  function unlockScroll() {
    setImportant(document.documentElement, 'overflow', 'auto');
    setImportant(document.body, 'overflow', 'auto');

    // Threads 某些版本會用 overflow-y 或 overscroll-behavior 鎖定頁面。
    setImportant(document.documentElement, 'overflow-y', 'auto');
    setImportant(document.body, 'overflow-y', 'auto');
  }

  // -----------------------------------------------------------------------
  // Login overlay detection
  // -----------------------------------------------------------------------

  function dialogContainsHero(dialog) {
    const candidates = dialog.querySelectorAll(
      'span[dir="auto"], div[dir="auto"], h1, h2, [aria-label]'
    );

    return Array.from(candidates).some(isHeroText);
  }

  function dialogContainsLoginCTA(dialog) {
    const controls = dialog.querySelectorAll(
      '[role="button"], button, a[href]'
    );

    return Array.from(controls).some(isButtonLabel);
  }

  function isLoginDialog(dialog) {
    // 優先使用 Threads 的 hero 標題辨識。
    if (dialogContainsHero(dialog)) {
      return true;
    }

    // Threads 有時在 hydration 後不再提供原本的 hero span。
    // 此時必須同時滿足：
    // 1. 是 modal/dialog
    // 2. 內含已知登入或開啟 App CTA
    const isModal =
      dialog.getAttribute('aria-modal') === 'true' ||
      dialog.getAttribute('role') === 'dialog';

    return isModal && dialogContainsLoginCTA(dialog);
  }

  // 從登入 dialog 向上尋找 body 的直接子元素，隱藏整個 overlay portal。
  function hideOverlay() {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"]'
    );

    for (const dialog of dialogs) {
      if (dialog.hasAttribute('data-threads-overlay')) {
        continue;
      }

      if (!isLoginDialog(dialog)) {
        continue;
      }

      let top = dialog;

      while (
        top.parentElement &&
        top.parentElement !== document.body
      ) {
        top = top.parentElement;
      }

      top.setAttribute('data-threads-overlay', '');
      setImportant(top, 'display', 'none');

      unlockScroll();
    }
  }

  // -----------------------------------------------------------------------
  // Standalone CTA hiding
  // -----------------------------------------------------------------------

  function hideStandaloneCTAs() {
    const controls = document.querySelectorAll(
      '[role="button"], button, a[href]'
    );

    for (const element of controls) {
      if (
        element.closest(
          '[data-threads-overlay], [data-threads-cta]'
        )
      ) {
        continue;
      }

      if (!isButtonLabel(element)) {
        continue;
      }

      let hideTarget = element;

      // 往上尋找只包含登入/App CTA 的容器，避免隱藏後留下空白。
      for (
        let node = element.parentElement;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const interactive = Array.from(
          node.querySelectorAll(
            '[role="button"], button, a[href]'
          )
        );

        if (!interactive.length) {
          continue;
        }

        // 如果容器中包含非登入 CTA，就不能再往上隱藏。
        if (!interactive.every(isButtonLabel)) {
          break;
        }

        hideTarget = node;
      }

      if (!hideTarget.hasAttribute('data-threads-cta')) {
        hideTarget.setAttribute('data-threads-cta', '');
        setImportant(hideTarget, 'display', 'none');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Main routine
  // -----------------------------------------------------------------------

  function run() {
    // CSS 可能尚未注入，或被 Threads hydration 移除。
    ensureStyle();

    if (!document.documentElement) {
      return;
    }

    hideOverlay();
    hideStandaloneCTAs();
    unlockScroll();
  }

  // -----------------------------------------------------------------------
  // Scheduling
  // 將同一批 mutation 合併成一次檢查。
  // -----------------------------------------------------------------------

  let scheduled = false;

  function scheduleRun() {
    if (scheduled) {
      return;
    }

    scheduled = true;

    Promise.resolve().then(() => {
      scheduled = false;

      try {
        run();
      } catch (error) {
        console.warn(
          '[Threads Hide Login Overlay] run failed:',
          error
        );
      }
    });
  }

  // -----------------------------------------------------------------------
  // Mutation observer
  //
  // 監聽 document 而不是 document.documentElement，因為在 document-start
  // 時 documentElement 可能還不存在。
  //
  // Threads hydration 有時只修改 class/style/role，不會新增節點，因此也要
  // 監聽特定 attributes。
  // -----------------------------------------------------------------------

  const observer = new MutationObserver(scheduleRun);

  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'class',
      'style',
      'role',
      'aria-label',
      'aria-modal',
      'title',
    ],
  });

  // -----------------------------------------------------------------------
  // Lifecycle events
  // -----------------------------------------------------------------------

  window.addEventListener('load', scheduleRun, {
    passive: true,
  });

  document.addEventListener(
    'DOMContentLoaded',
    scheduleRun,
    { passive: true }
  );

  window.addEventListener('pageshow', scheduleRun, {
    passive: true,
  });

  window.addEventListener('focus', scheduleRun, {
    passive: true,
  });

  document.addEventListener(
    'readystatechange',
    scheduleRun,
    { passive: true }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        scheduleRun();
      }
    },
    { passive: true }
  );

  // 第一次執行。即使此時 DOM 還不存在，observer 也會在建立 DOM 時再次觸發。
  scheduleRun();

  // -----------------------------------------------------------------------
  // iOS hydration settle poll
  //
  // iOS Safari / WKWebView 冷啟動時 hydration 可能延遲十幾秒。
  // 每 300ms 檢查一次，共約 30 秒。
  // -----------------------------------------------------------------------

  let settleTicks = 0;

  const settleTimer = window.setInterval(() => {
    scheduleRun();
    settleTicks += 1;

    if (settleTicks >= 100) {
      window.clearInterval(settleTimer);
    }
  }, 300);
})();
