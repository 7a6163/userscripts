// ==UserScript==
// @name         Threads Hide Login Overlay
// @namespace    https://github.com/zac/userscripts
// @version      2.1.1
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
  const UNLOCK_ATTR = 'data-threads-scroll-unlock';

  const STYLE_ID = 'threads-hide-login-style';

  // nav 不放在 CSS，因為媒體播放器內也可能有 nav，必須在 JS 逐一判斷。
  const STYLE_TEXT = `
    [${HIDDEN_ATTR}] {
      display: none !important;
    }

    /* 以屬性搭配 CSS 解鎖捲動，不寫 inline style，
       這樣 element.style 讀到的永遠是 Threads 自己的設定。 */
    html[${UNLOCK_ATTR}],
    body[${UNLOCK_ATTR}] {
      overflow: auto !important;
      overflow-y: auto !important;
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

  // 只在 Threads 真的鎖住捲動時才解鎖。沒鎖時絕不能改寫 overflow：
  // body 原本是 overflow: visible，改成 auto 會讓它變成獨立的捲動容器，
  // 在行動裝置上與頁面內容的觸控捲動互搶事件，留言就拖不動了。
  let scrollUnlocked = false;

  // 判斷 Threads 是否鎖住捲動。
  //
  // 直接讀 computed style 會讀到我們自己的解鎖規則，形成「套用後就再也
  // 測不到鎖」的循環。因此量測前先移除自己的屬性，量完再放回去；整段在
  // 同一個同步區塊內完成，瀏覽器不會在中間繪製，不會閃爍。
  function isScrollLocked() {
    const elements = [document.documentElement, document.body];
    const restore = [];

    for (const el of elements) {
      if (el.hasAttribute(UNLOCK_ATTR)) {
        el.removeAttribute(UNLOCK_ATTR);
        restore.push(el);
      }
    }

    let locked = false;

    for (const el of elements) {
      const style = getComputedStyle(el);

      if (
        style.overflow === 'hidden' ||
        style.overflowY === 'hidden'
      ) {
        locked = true;
        break;
      }
    }

    for (const el of restore) {
      el.setAttribute(UNLOCK_ATTR, '');
    }

    return locked;
  }

  function unlockScroll() {
    if (scrollUnlocked) {
      return;
    }

    document.documentElement.setAttribute(UNLOCK_ATTR, '');
    document.body.setAttribute(UNLOCK_ATTR, '');
    scrollUnlocked = true;
  }

  function restoreScroll() {
    if (!scrollUnlocked) {
      return;
    }

    document.documentElement.removeAttribute(UNLOCK_ATTR);
    document.body.removeAttribute(UNLOCK_ATTR);
    scrollUnlocked = false;
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

  // 登入彈窗的遮罩不在 dialog 的祖先鏈上，而是它旁邊的兄弟節點，
  // 因此往上尋找容器永遠碰不到它，只能靠外觀特徵辨識。
  //
  // 遮罩特徵：fixed/absolute + 半透明 + 近乎滿版 + 葉節點（無子節點也無文字）。
  // 播放器的黑色底也是滿版 fixed，但它不透明且含子節點與 video，不會誤中。
  const COLOR_PATTERN =
    /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([\d.]+)\s*)?\)$/;

  function isBackdrop(element) {
    // 由便宜到昂貴排序，讓絕大多數元素在前兩步就被排除。
    if (element.children.length) {
      return false;
    }

    if (String(element.textContent || '').trim()) {
      return false;
    }

    // 已被我們隱藏的元素量不到版面（display:none 會讓 rect 歸零），
    // 若在此重新套用滿版條件就會判定它不再是遮罩而還原，下一輪又
    // 符合條件再隱藏，造成畫面明暗交替閃爍。
    // 隱藏後 position 與 background 仍可正確讀取，因此改以這些條件判斷；
    // 若節點被 React 回收去裝別的內容，上面的子節點與文字檢查會攔下。
    if (!hiddenElements.has(element)) {
      const rect = element.getBoundingClientRect();

      if (
        rect.width < window.innerWidth * 0.9 ||
        rect.height < window.innerHeight * 0.9
      ) {
        return false;
      }
    }

    const style = getComputedStyle(element);

    if (
      style.position !== 'fixed' &&
      style.position !== 'absolute'
    ) {
      return false;
    }

    const match = COLOR_PATTERN.exec(style.backgroundColor);

    if (!match) {
      return false;
    }

    const alpha = match[1] === undefined ? 1 : parseFloat(match[1]);

    // 完全不透明的滿版元素是實體背景（例如播放器底色），不是遮罩。
    return alpha > 0 && alpha < 1;
  }

  function collectBackdrops(targets) {
    for (const element of document.querySelectorAll('div')) {
      if (!isBackdrop(element)) {
        continue;
      }

      if (isSafeToHide(element)) {
        targets.add(element);
      }
    }
  }

  function collectLoginDialogs(targets) {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"]'
    );

    let found = false;

    for (const dialog of dialogs) {
      if (!isLoginDialog(dialog)) {
        continue;
      }

      found = true;

      const target = overlayTargetFor(dialog);

      if (isSafeToHide(target)) {
        targets.add(target);
      }
    }

    return found;
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

      // 若此文字已位於我們隱藏的容器內，直接沿用原本的目標，不要重新
      // 往上爬：容器被隱藏後量到的寬度是 0，寬度上限永遠不成立，迴圈
      // 會一路往上爬而每輪隱藏更大的容器。
      // 若 React 把容器回收去裝別的內容，文字就不再符合 SIDEBAR_PATTERNS，
      // 這個候選不再出現，容器便會被還原。
      const hiddenAncestor = el.closest('[' + HIDDEN_ATTR + ']');

      if (hiddenAncestor) {
        targets.add(hiddenAncestor);
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

  // 只隱藏按鈕本身，絕不往上隱藏容器。
  //
  // 原本會往上尋找「只含登入 CTA 的容器」來一併隱藏，理由是避免留下空白。
  // 但那個最佳化的代價遠大於收益：容器是結構性的，隱藏它會讓版面重排，
  // 絕對定位的元素跟著位移、事件層錯位，在行動裝置上會出現看不見卻擋住
  // 拖曳的區塊。留言底部的「Log in to see more replies.」整塊被吃掉就是
  // 這樣來的。留下空白容器遠比破壞版面安全。
  function collectStandaloneCTAs(targets) {
    const controls = document.querySelectorAll(
      '[role="button"], button, a[href]'
    );

    for (const element of controls) {
      if (!isButtonLabel(element)) {
        continue;
      }

      if (isSafeToHide(element)) {
        targets.add(element);
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

    const hasLoginDialog = collectLoginDialogs(targets);

    // 遮罩掃描必須逐一取得版面與樣式，會觸發同步 reflow，是所有
    // collector 中最貴的。遮罩只會與登入彈窗同時出現，因此只在確實
    // 有登入彈窗時才掃描。彈窗被隱藏後仍留在 DOM，判斷依然成立。
    if (hasLoginDialog) {
      collectBackdrops(targets);
    }

    collectSidebarPanels(targets);
    collectStandaloneCTAs(targets);
    collectNav(targets);

    return { targets, hasLoginDialog };
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

    // Threads 尚未完成初始化時什麼都不做，避免與 hydration 爭用主執行緒。
    // 啟動畫面結束後 Threads 會把它收成 0 高度。
    const splash = document.getElementById('barcelona-splash-screen');

    if (splash && splash.getBoundingClientRect().height > 0) {
      return;
    }

    const { targets, hasLoginDialog } = collectTargets();

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

    // 以捲動是否真的被鎖住為準。登入牆不一定用 role="dialog" 實作，
    // 只看有沒有彈窗會漏掉純 div 覆蓋層 + body{overflow:hidden} 的情況。
    if (hasLoginDialog || isScrollLocked()) {
      unlockScroll();
    } else {
      restoreScroll();
    }
  }

  // -----------------------------------------------------------------------
  // Scheduling
  // 將同一批 mutation 合併成一次檢查。
  // -----------------------------------------------------------------------

  // hydration 期間 Threads 會產生大量 mutation。若用 microtask 排程，
  // microtask 佇列必須清空才會讓出主執行緒，掃描會把 CPU 佔滿而讓
  // Threads 初始化跑不完（畫面卡在啟動畫面）。
  // 改用 rAF 並限制最小間隔，確保每次掃描之間都把主執行緒讓回去。
  const MIN_INTERVAL_MS = 150;

  let scheduled = false;
  let lastRunAt = 0;

  function scheduleRun() {
    if (scheduled) {
      return;
    }

    scheduled = true;

    const fire = () => {
      scheduled = false;
      lastRunAt = Date.now();

      try {
        run();
      } catch (error) {
        console.warn(
          '[Threads Hide Login Overlay] run failed:',
          error
        );
      }
    };

    const wait = Math.max(
      0,
      MIN_INTERVAL_MS - (Date.now() - lastRunAt)
    );

    if (wait > 0) {
      window.setTimeout(
        () => window.requestAnimationFrame(fire),
        wait
      );
    } else {
      window.requestAnimationFrame(fire);
    }
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

  // 不要監聽 class / style / characterData。Threads 會為了動畫、播放進度、
  // hover 等持續改寫它們，實測閒置時每秒就有約 4 次觸發，其中 9 成是 style，
  // 而這些變動與登入彈窗完全無關。每次觸發都會排一次全頁掃描，在手機上
  // 累積成持續卡頓。改為只監聽真正代表彈窗出現的訊號後，閒置時降為 0 次。
  //
  // 登入彈窗出現時必定伴隨 childList（React 掛載 portal）或 role/aria-modal
  // 變動；hydration 期間才有的 class/style 變化則由下方的 poll 涵蓋。
  //
  // 附帶好處：我們自己寫 inline style 不再回頭觸發 observer。
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'role',
      'aria-modal',
      'aria-label',
    ],
  });

  // -----------------------------------------------------------------------
  // Lifecycle events
  // -----------------------------------------------------------------------

  window.addEventListener('load', scheduleRun, { passive: true });

  document.addEventListener('DOMContentLoaded', scheduleRun, {
    passive: true,
  });

  // 登入牆常在捲動一段後才跳出，此時可能只改寫 overflow 而不動 DOM，
  // observer 收不到，settle poll 也已結束，因此必須在捲動時檢查。
  //
  // 但捲動時只查捲動鎖，不做完整掃描。完整掃描排在 rAF 上執行會直接
  // 推遲當前這一幀，捲動就會一頓一頓的。isScrollLocked 只讀 html 與
  // body 兩個元素的 computed style，成本極低。
  // 登入牆的視覺元素仍由 observer 觸發的完整掃描處理。
  window.addEventListener(
    'scroll',
    () => {
      if (isScrollLocked()) {
        unlockScroll();
      }
    },
    { passive: true }
  );

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
