// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      2.0.0
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
  // 設計原則
  //
  // 1. 每次執行都重新計算「現在該隱藏哪些元素」，再與目前已隱藏的集合比對。
  //    不再符合條件的元素會被還原。Threads 是 SPA，React 會回收 DOM 節點，
  //    一旦標記黏著就會發生「節點被換去裝影片但仍保持隱藏」的問題。
  //
  // 2. 絕不隱藏 body 的直接子元素（portal root），也絕不隱藏含有影片或
  //    媒體播放器的容器。往上尋找容器時一律限制層數。
  //
  // 3. 往上找容器是最危險的操作：Threads 的版面幾乎整條鏈都是 flex，
  //    對 flex 子項下 display:none 會讓兄弟節點重新分配空間而塌陷。
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // CSS injection
  // document-start 時 document.head / document.documentElement 可能尚未存在，
  // 因此不能直接 appendChild，必須等 DOM 根節點可用後再注入。
  // -----------------------------------------------------------------------

  const HIDDEN_ATTR = 'data-threads-hidden';

  const STYLE_ID = 'threads-hide-login-style';

  // nav 不放在 CSS，因為媒體播放器內也可能有 nav，必須在 JS 逐一判斷。
  const STYLE_TEXT = `
    [${HIDDEN_ATTR}] {
      display: none !important;
    }

    #barcelona-header {
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

  // 右側邊欄登入面板的標題文字。
  const SIDEBAR_PATTERNS = [
    /^Log in or sign up for Threads$/i,
    /^登入或註冊 Threads$/,
    /^登录或注册 Threads$/,
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
    'log in with username instead',
    'log in with username instead.',

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
    '改用使用者名稱登入',
    '改用使用者名稱登入。',

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
    '改用用户名登录',
    '改用用户名登录。',
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
    if (getElementLabels(element).some(value => {
      return BUTTON_LABELS.has(norm(value));
    })) {
      return true;
    }

    // 按鈕的 textContent 可能會把 icon 文字串接在一起（如
    // "InstagramContinue with Instagram"），逐一檢查直接子節點的文字。
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const t = norm(child.textContent);
        if (t && BUTTON_LABELS.has(t)) return true;
      }
    }

    return false;
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
  // Media viewer detection
  //
  // 媒體播放器控制項的 aria-label 與播放器外殼一起渲染，早於 <video>
  // 插入 DOM，因此比偵測 video 更不受 SPA 導航時序影響。
  // -----------------------------------------------------------------------

  const MEDIA_CONTROL_LABELS = [
    'play video',
    'play',
    'pause',
    'mute',
    'unmute',
    'playback speed',

    '播放影片',
    '播放',
    '暫停',
    '靜音',
    '取消靜音',
    '播放速度',

    '播放视频',
    '暂停',
    '静音',
    '取消静音',
  ];

  function isMediaControlLabel(label) {
    return MEDIA_CONTROL_LABELS.some(name => {
      return (
        label === name ||
        label.startsWith(name + ':') ||
        label.startsWith(name + '：')
      );
    });
  }

  // 判斷元素是否為（或包含）媒體播放器。
  function isMediaViewer(element) {
    if (element.querySelector('video')) {
      return true;
    }

    const controls = element.querySelectorAll(
      '[role="button"], button'
    );

    for (const control of controls) {
      const label = norm(control.getAttribute('aria-label'));

      if (label && isMediaControlLabel(label)) {
        return true;
      }
    }

    return false;
  }

  // 隱藏任何元素前的共同底線。
  function isSafeToHide(element) {
    if (!element || element === document.body) {
      return false;
    }

    // body 的直接子元素是 React portal root，SPA 導航時會被回收再利用。
    if (element.parentElement === document.body) {
      return false;
    }

    return !isMediaViewer(element);
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
    // 媒體播放器不是登入彈窗。訪客模式下 Threads 會在播放器內放置
    // 登入 CTA，因此必須先排除播放器，否則會誤判並把播放器隱藏。
    if (isMediaViewer(dialog)) {
      return false;
    }

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

  // -----------------------------------------------------------------------
  // Scroll lock removal
  // -----------------------------------------------------------------------

  function setImportant(element, property, value) {
    if (!element) return;

    const currentValue = element.style.getPropertyValue(property);
    const currentPriority = element.style.getPropertyPriority(property);

    if (currentValue === value && currentPriority === 'important') {
      return;
    }

    element.style.setProperty(property, value, 'important');
  }

  function unlockScroll() {
    setImportant(document.documentElement, 'overflow', 'auto');
    setImportant(document.body, 'overflow', 'auto');

    // Threads 某些版本會用 overflow-y 或 overscroll-behavior 鎖定頁面。
    setImportant(document.documentElement, 'overflow-y', 'auto');
    setImportant(document.body, 'overflow-y', 'auto');
  }

  // -----------------------------------------------------------------------
  // 收集這一輪應該隱藏的元素
  // -----------------------------------------------------------------------

  // 往上尋找容器的最大層數。Threads 版面很深，無上限往上爬會直接
  // 爬到 portal root，把整頁（含影片）一起隱藏。
  const MAX_CLIMB = 6;

  // 從登入 dialog 往上找到遮罩層，讓半透明背景一起消失。
  // 撞到播放器、含影片的容器或 portal root 就停止。
  function overlayTargetFor(dialog) {
    let target = dialog;
    let node = dialog;

    for (let i = 0; i < MAX_CLIMB; i += 1) {
      const parent = node.parentElement;

      if (!parent || parent === document.body) {
        break;
      }

      if (!isSafeToHide(parent)) {
        break;
      }

      node = parent;

      // 固定定位的那一層通常就是包住遮罩與彈窗的整個 overlay。
      if (getComputedStyle(node).position === 'fixed') {
        target = node;
        break;
      }
    }

    return target;
  }

  function collectLoginDialogs(targets) {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"]'
    );

    for (const dialog of dialogs) {
      if (!isLoginDialog(dialog)) {
        continue;
      }

      const target = overlayTargetFor(dialog);

      if (isSafeToHide(target)) {
        targets.add(target);
      }
    }
  }

  function collectSidebarPanels(targets) {
    const candidates = document.querySelectorAll(
      'span[dir="auto"], div[dir="auto"], h1, h2, h3, span'
    );

    // 以視窗寬度為基準。原本寫死 500px，在手機（約 390px）永遠不成立，
    // 會一路往上爬到 portal root 而把含影片的整個容器隱藏。
    const widthLimit = Math.min(window.innerWidth * 0.9, 500);

    for (const el of candidates) {
      const text = String(el.textContent || '').trim();

      if (!SIDEBAR_PATTERNS.some(p => p.test(text))) {
        continue;
      }

      // 彈窗內的登入面板由 collectLoginDialogs 處理。
      if (el.closest('[role="dialog"], [aria-modal="true"]')) {
        continue;
      }

      let panel = el;

      for (let i = 0; i < MAX_CLIMB; i += 1) {
        const parent = panel.parentElement;

        if (!parent || parent === document.body) {
          break;
        }

        if (parent.getBoundingClientRect().width > widthLimit) {
          break;
        }

        if (!isSafeToHide(parent)) {
          break;
        }

        panel = parent;
      }

      if (isSafeToHide(panel)) {
        targets.add(panel);
      }
    }
  }

  function collectStandaloneCTAs(targets) {
    const controls = document.querySelectorAll(
      '[role="button"], button, a[href]'
    );

    for (const element of controls) {
      if (!isButtonLabel(element)) {
        continue;
      }

      // 播放器內的 CTA 只隱藏按鈕本身。若往上隱藏容器會壓垮播放器的
      // flex 版面，導致影片被擠成一條細線。
      const enclosingDialog = element.closest(
        '[role="dialog"], [aria-modal="true"]'
      );

      const insideMediaViewer =
        enclosingDialog && isMediaViewer(enclosingDialog);

      let hideTarget = element;

      if (!insideMediaViewer) {
        let node = element;

        // 往上尋找只包含登入/App CTA 的容器，避免隱藏後留下空白。
        for (let i = 0; i < MAX_CLIMB; i += 1) {
          const parent = node.parentElement;

          if (!parent || parent === document.body) {
            break;
          }

          if (!isSafeToHide(parent)) {
            break;
          }

          const interactive = Array.from(
            parent.querySelectorAll(
              '[role="button"], button, a[href]'
            )
          );

          // 容器中若有非登入 CTA，就不能再往上隱藏。
          if (
            !interactive.length ||
            !interactive.every(isButtonLabel)
          ) {
            break;
          }

          node = parent;
          hideTarget = parent;
        }
      }

      if (isSafeToHide(hideTarget)) {
        targets.add(hideTarget);
      }
    }
  }

  function collectNav(targets) {
    for (const nav of document.querySelectorAll('nav')) {
      // 播放器內的 nav 是它版面的一部分，隱藏會讓影片塌陷。
      if (nav.closest('[role="dialog"], [aria-modal="true"]')) {
        continue;
      }

      if (isSafeToHide(nav)) {
        targets.add(nav);
      }
    }
  }

  function collectTargets() {
    const targets = new Set();

    collectLoginDialogs(targets);
    collectSidebarPanels(targets);
    collectStandaloneCTAs(targets);
    collectNav(targets);

    return targets;
  }

  // -----------------------------------------------------------------------
  // 套用：與上一輪比對，還原不再符合條件的元素
  // -----------------------------------------------------------------------

  const hiddenElements = new Set();

  function hideElement(element) {
    if (hiddenElements.has(element)) {
      return;
    }

    element.setAttribute(HIDDEN_ATTR, '');
    setImportant(element, 'display', 'none');
    hiddenElements.add(element);
  }

  function showElement(element) {
    element.removeAttribute(HIDDEN_ATTR);
    element.style.removeProperty('display');
    hiddenElements.delete(element);
  }

  function run() {
    // CSS 可能尚未注入，或被 Threads hydration 移除。
    ensureStyle();

    if (!document.documentElement || !document.body) {
      return;
    }

    const targets = collectTargets();

    // 還原：已從 DOM 移除，或這一輪不再符合條件的元素。
    for (const element of Array.from(hiddenElements)) {
      if (!element.isConnected) {
        hiddenElements.delete(element);
        continue;
      }

      if (!targets.has(element)) {
        showElement(element);
      }
    }

    for (const element of targets) {
      hideElement(element);
    }

    if (targets.size) {
      unlockScroll();
    }
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

  window.addEventListener('load', scheduleRun, { passive: true });

  document.addEventListener('DOMContentLoaded', scheduleRun, {
    passive: true,
  });

  window.addEventListener('pageshow', scheduleRun, { passive: true });

  window.addEventListener('focus', scheduleRun, { passive: true });

  document.addEventListener('readystatechange', scheduleRun, {
    passive: true,
  });

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
