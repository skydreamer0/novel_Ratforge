/**
 * Ratforge Premium Web Reader
 * Enhanced Logic for Premium UX
 */

// --- Configuration & State ---
const config = {
  githubOwner: "skydreamer0",
  githubRepo: "novel_Ratforge", // default, will try to infer
  githubBranch: "master",
  includeExtensions: [".md"],
};

const state = {
  files: [],
  activeIndex: -1,
  filterText: "",
  collapsedFolders: new Set(),
  bookmarks: new Set(), // Set<path>
  scrollPositions: {}, // Map<path, number>
  theme: "light",
  fontSize: 1.125,
  tts: {
    speaking: false,
    paused: false,
    utterance: null,
    voice: null
  },
  // Infinite scroll state
  loadedChapters: [],   // Array of loaded chapter indices
  isLoadingNext: false, // Prevent duplicate loading
  observer: null,       // IntersectionObserver instance

  // New UI State
  bottomPanelOpen: false,
  ttsRate: 1.0,
  ttsStartMode: "current", // 'beginning', 'current', 'bookmark'
};

// --- Gesture State ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0; // Not strictly needed if using simple delta in move/end
let touchEndY = 0;

// --- DOM Elements ---
const els = {
  app: document.querySelector(".app"),
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.querySelector(".sidebar-overlay"),
  chapterList: document.getElementById("chapter-list"),
  content: document.getElementById("content"),
  chapterTitle: document.getElementById("chapter-title"),
  status: document.getElementById("status"),
  searchInput: document.getElementById("search-input"),
  readingProgress: document.getElementById("reading-progress"),

  // Buttons
  menuBtn: document.getElementById("menu-btn"),
  sidebarCloseBtn: document.getElementById("sidebar-close-btn"),
  themeToggle: document.getElementById("theme-toggle"),
  ttsToggle: document.getElementById("tts-toggle"),
  fontSizeInc: document.getElementById("font-size-inc"),
  fontSizeDec: document.getElementById("font-size-dec"),
  bookmarkBtn: document.getElementById("bookmark-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  wordCount: document.getElementById("word-count"),

  // Bottom Panel & New Controls
  bottomPanel: document.getElementById("bottom-panel"),
  bottomPanelOverlay: document.querySelector(".bottom-panel-overlay"),
  bottomPanelHandle: document.querySelector(".bottom-panel-handle"),

  // Bottom Panel TTS
  ttsPanelToggle: document.getElementById("tts-panel-toggle"),
  ttsStopBtn: document.getElementById("tts-stop-btn"),
  ttsRateInput: document.getElementById("tts-rate"),
  ttsRateLabel: document.getElementById("tts-rate-label"),
  ttsStartSelect: document.getElementById("tts-start-select"),

  // Bottom Panel Settings
  panelThemeToggle: document.getElementById("panel-theme-toggle"),
  panelFontInc: document.getElementById("panel-font-inc"),
  panelFontDec: document.getElementById("panel-font-dec"),
  panelFontLabel: document.getElementById("panel-font-label"),
};

// --- Initialization ---

function inferGithubRepo() {
  const host = window.location.hostname;
  if (host.endsWith(".github.io")) {
    config.githubOwner = host.replace(".github.io", "");
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length > 0) config.githubRepo = parts[0];
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has("branch")) config.githubBranch = params.get("branch");
}

function loadState() {
  try {
    const savedBookmarks = JSON.parse(localStorage.getItem("reader-bookmarks") || "[]");
    state.bookmarks = new Set(savedBookmarks);

    const savedScroll = JSON.parse(localStorage.getItem("reader-scroll-pos") || "{}");
    state.scrollPositions = savedScroll;

    state.theme = localStorage.getItem("reader-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    state.fontSize = parseFloat(localStorage.getItem("reader-font-size") || "1.125");
  } catch (e) {
    console.warn("Failed to load state", e);
  }
}

function saveState(key) {
  try {
    if (key === "bookmarks") {
      localStorage.setItem("reader-bookmarks", JSON.stringify([...state.bookmarks]));
    } else if (key === "scroll") {
      localStorage.setItem("reader-scroll-pos", JSON.stringify(state.scrollPositions));
    } else if (key === "theme") {
      localStorage.setItem("reader-theme", state.theme);
    } else if (key === "fontSize") {
      localStorage.setItem("reader-font-size", state.fontSize);
    } else if (key === "lastRead") {
      if (state.activeIndex >= 0) {
        localStorage.setItem("reader-last-read", state.files[state.activeIndex].path);
      }
    }
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

// --- Theme & Appearance ---

function applyTheme() {
  document.body.dataset.theme = state.theme;
  // Update icon if needed, but we used CSS variables for colors so mostly auto.
  // We can toggle the icon SVG here if we want different icons for sun/moon.
  const svg = els.themeToggle.querySelector("svg");
  if (state.theme === "dark") {
    // Moon icon
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />';
  } else {
    // Sun icon
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />';
  }
  saveState("theme");
}

function applyFontSize() {
  document.documentElement.style.setProperty("--content-font-size", `${state.fontSize}rem`);
  saveState("fontSize");
}

// --- Text-to-Speech (TTS) ---

function initTTS() {
  // Try to find a Chinese voice
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    // Prefer Google or enhanced voices
    state.tts.voice = voices.find(v => (v.lang === "zh-TW" || v.lang === "zh-HK" || v.lang === "zh-CN") && v.name.includes("Google"))
      || voices.find(v => v.lang === "zh-TW" || v.lang === "zh-HK" || v.lang === "zh-CN");
  };

  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function stopTTS() {
  window.speechSynthesis.cancel();
  state.tts.speaking = false;
  state.tts.paused = false;
  updateTTSIcon();
}

function toggleTTS() {
  if (state.tts.speaking && !state.tts.paused) {
    window.speechSynthesis.pause();
    state.tts.paused = true;
  } else if (state.tts.paused) {
    window.speechSynthesis.resume();
    state.tts.paused = false;
  } else {
    // Start speaking
    let textToSpeak = "";

    if (state.ttsStartMode === "beginning") {
      textToSpeak = els.content.innerText;
    } else if (state.ttsStartMode === "bookmark") {
      // Logic to find bookmark position? For now simple fallback
      // Detailed implementation would require finding the specific element
      textToSpeak = els.content.innerText;
    } else {
      // "current" - Find visible text
      // We'll use a crude approximation: find the first visible paragraph
      const paragraphs = els.content.querySelectorAll("p, h1, h2, h3, blockquote");
      let startIndex = 0;
      const viewportTop = window.scrollY + 100;

      for (let i = 0; i < paragraphs.length; i++) {
        const rect = paragraphs[i].getBoundingClientRect();
        if (rect.top + window.scrollY > viewportTop) {
          startIndex = i;
          break; // Found the first paragraph mostly below top
        }
      }

      // Collect text from here onwards
      for (let i = startIndex; i < paragraphs.length; i++) {
        textToSpeak += paragraphs[i].innerText + "\n";
      }

      if (!textToSpeak) textToSpeak = els.content.innerText; // Fallback
    }

    if (!textToSpeak) return;

    const u = new SpeechSynthesisUtterance(textToSpeak);
    if (state.tts.voice) u.voice = state.tts.voice;
    u.rate = state.ttsRate;
    u.pitch = 1.0;

    u.onend = () => {
      state.tts.speaking = false;
      state.tts.paused = false;
      updateTTSIcon();
    };

    window.speechSynthesis.speak(u);
    state.tts.speaking = true;
    state.tts.paused = false;
  }
  updateTTSIcon();
}

function updateTTSIcon() {
  const isPlaying = state.tts.speaking && !state.tts.paused;

  // Top Nav Icon
  const svg = els.ttsToggle.querySelector("svg");
  if (isPlaying) {
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />';
    els.ttsToggle.classList.add("speaking");
  } else {
    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />';
    els.ttsToggle.classList.remove("speaking");
  }

  // Bottom Panel Button
  if (isPlaying) {
    els.ttsPanelToggle.textContent = "⏸ 暫停朗讀";
    els.ttsPanelToggle.classList.add("playing");
  } else {
    els.ttsPanelToggle.textContent = "▶ 開始朗讀";
    els.ttsPanelToggle.classList.remove("playing");
  }
}


function getApiUrl(path) {
  const branch = config.githubBranch;
  const pathEnc = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${config.githubOwner}/${config.githubRepo}/${branch}/${pathEnc}`;
}

async function loadFileList() {
  els.status.textContent = "正在同步資料...";

  // Try Github API for tree
  const treeUrl = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/git/trees/${config.githubBranch}?recursive=1`;

  try {
    const resp = await fetch(treeUrl);
    if (!resp.ok) throw new Error("API Limit or Net Error");
    const data = await resp.json();

    state.files = data.tree
      .filter(item => item.type === "blob" && item.path.endsWith(".md") && item.path.includes("章稿"))
      .map(item => ({
        path: item.path,
        title: item.path.split("/").pop().replace(".md", ""), // Fallback title
        size: item.size
      }))
      .sort((a, b) => naturalSort(a.path, b.path));

    els.status.textContent = `共 ${state.files.length} 章`;

  } catch (err) {
    console.error(err);
    els.status.textContent = "目錄載入失敗";
    // Fallback?
  }
}

// --- Robust Sorting Logic ---

function parseChineseNumeral(text) {
  const digitMap = {
    零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    十: 10, 百: 100, 千: 1000
  };

  if (/^\d+$/.test(text)) return parseInt(text, 10);

  // Simple check
  if (text === "十") return 10;

  // Complex parsing (e.g. 一百二十三)
  let val = 0;
  let temp = 0; // current digit value

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const num = digitMap[char];

    if (num === undefined) return NaN; // invalid char

    if (num === 10 || num === 100 || num === 1000) {
      val += (temp === 0 ? 1 : temp) * num;
      temp = 0;
    } else {
      temp = num;
    }
  }
  val += temp;
  return val;
}

function extractOrder(text) {
  // Matches "第X章" or "第X卷"
  // Priority: Volume > Chapter
  // But here we usually just sort by path which contains both.
  // Actually, we pass the full path to naturalSort.
  // We should try to extract the number from the filename part.

  const filename = text.split("/").pop();
  const match = filename.match(/第([0-9零一二三四五六七八九十兩〇百千]+)[章卷]/);

  if (!match) return Number.MAX_VALUE;
  const num = parseChineseNumeral(match[1]);
  return isNaN(num) ? Number.MAX_VALUE : num;
}

function naturalSort(a, b) {
  // First compare directory depth/names
  const dirA = a.substring(0, a.lastIndexOf("/"));
  const dirB = b.substring(0, b.lastIndexOf("/"));

  if (dirA !== dirB) {
    // Sort folders by volume number if possible
    const volA = extractOrder(dirA);
    const volB = extractOrder(dirB);
    if (volA !== volB && volA !== Number.MAX_VALUE && volB !== Number.MAX_VALUE) {
      return volA - volB;
    }
    return dirA.localeCompare(dirB, "zh-Hant");
  }

  const orderA = extractOrder(a);
  const orderB = extractOrder(b);

  if (orderA !== orderB && orderA !== Number.MAX_VALUE && orderB !== Number.MAX_VALUE) {
    return orderA - orderB;
  }

  return a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" });
}

function countWords(text) {
  // Count non-whitespace characters
  return (text.match(/\S/g) || []).length;
}

// --- Chapter Loading & Rendering ---

/**
 * Load a chapter fresh (reset mode) — clears existing content.
 * Called when clicking sidebar or navigating directly.
 */
async function loadChapter(path) {
  stopTTS();
  const index = state.files.findIndex(f => f.path === path);
  if (index === -1) return;

  // Reset infinite scroll state
  state.loadedChapters = [];
  state.isLoadingNext = false;
  state.activeIndex = index;

  els.chapterTitle.textContent = "載入中...";
  els.content.style.opacity = "0.5";
  els.content.innerHTML = "";
  updateActiveSidebarItem();

  try {
    const url = getApiUrl(path);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Chapter Load Failed");
    const text = await resp.text();

    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : state.files[index].title;
    state.files[index].title = title;

    // Create chapter section
    const section = createChapterSection(index, title, text);
    els.content.innerHTML = "";
    els.content.appendChild(section);

    // Track loaded chapter
    state.loadedChapters = [index];

    // Add sentinel for infinite scroll
    appendSentinel();

    // Update header
    els.chapterTitle.textContent = title;
    updateWordCount(text);

    // Scroll
    const savedPos = state.scrollPositions[path];
    window.scrollTo({ top: savedPos || 0, behavior: "auto" });

    // Fade in
    els.content.style.opacity = "0";
    requestAnimationFrame(() => {
      els.content.style.transition = "opacity 0.6s ease-out";
      els.content.style.opacity = "1";
    });

    updateNavButtons();
    updateBookmarkUI();

    // History
    const urlObj = new URL(window.location);
    urlObj.searchParams.set("file", path);
    window.history.replaceState({ path }, "", urlObj);
    saveState("lastRead");

    // Mobile: close sidebar
    if (window.innerWidth <= 1024) {
      els.app.classList.add("sidebar-collapsed");
    }

  } catch (err) {
    els.content.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--accent)">
      <h3>讀取失敗</h3><p>${err.message}</p>
      <button onclick="location.reload()" class="nav-btn" style="margin:20px auto; width:auto">重試</button>
    </div>`;
  }
}

/**
 * Create a DOM section for a chapter.
 */
function createChapterSection(index, title, rawText) {
  const section = document.createElement("section");
  section.className = "chapter-section";
  section.dataset.chapterIndex = index;
  section.dataset.chapterPath = state.files[index].path;
  section.innerHTML = marked.parse(rawText);
  return section;
}

/**
 * Create a visual divider between chapters.
 */
function createChapterDivider(title) {
  const divider = document.createElement("div");
  divider.className = "chapter-divider";
  divider.innerHTML = `
    <div class="divider-line"></div>
    <span class="divider-title">${title}</span>
    <div class="divider-line"></div>
  `;
  return divider;
}

/**
 * Append sentinel element for IntersectionObserver.
 */
function appendSentinel() {
  // Remove old sentinel
  const old = document.getElementById("load-sentinel");
  if (old) old.remove();

  const lastLoaded = state.loadedChapters[state.loadedChapters.length - 1];
  // Don't add sentinel if we're at the last chapter
  if (lastLoaded >= state.files.length - 1) return;

  const sentinel = document.createElement("div");
  sentinel.id = "load-sentinel";
  sentinel.className = "load-sentinel";
  sentinel.innerHTML = '<div class="loading-spinner"><div></div><div></div><div></div></div>';
  els.content.appendChild(sentinel);

  // Observe
  if (state.observer) state.observer.disconnect();
  state.observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.isLoadingNext) {
      appendNextChapter();
    }
  }, { rootMargin: "600px" });
  state.observer.observe(sentinel);
}

/**
 * Auto-append the next chapter below current content.
 */
async function appendNextChapter() {
  if (state.isLoadingNext) return;
  const lastLoaded = state.loadedChapters[state.loadedChapters.length - 1];
  const nextIndex = lastLoaded + 1;
  if (nextIndex >= state.files.length) return;

  state.isLoadingNext = true;

  try {
    const file = state.files[nextIndex];
    const url = getApiUrl(file.path);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Load Failed");
    const text = await resp.text();

    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file.title;
    state.files[nextIndex].title = title;

    // Remove old sentinel
    const oldSentinel = document.getElementById("load-sentinel");
    if (oldSentinel) oldSentinel.remove();

    // Add divider + chapter section
    const divider = createChapterDivider(title);
    const section = createChapterSection(nextIndex, title, text);
    els.content.appendChild(divider);
    els.content.appendChild(section);

    // Fade in the new section
    section.style.opacity = "0";
    requestAnimationFrame(() => {
      section.style.transition = "opacity 0.8s ease-out";
      section.style.opacity = "1";
    });

    // Track
    state.loadedChapters.push(nextIndex);

    // Re-add sentinel for next chapter
    appendSentinel();

  } catch (err) {
    console.error("Failed to append next chapter:", err);
  } finally {
    state.isLoadingNext = false;
  }
}

/**
 * Update word count display.
 */
function updateWordCount(text) {
  const wc = countWords(text);
  els.wordCount.textContent = `| ${wc} 字`;
  els.wordCount.title = wc < 3000 ? "字數較少" : "字數充足";
  els.wordCount.style.color = wc < 3000 ? "var(--accent)" : "var(--muted)";
}

// --- Audio/Visual Progress & Interactions ---

function updateReadingProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.body.scrollHeight - window.innerHeight;
  const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  els.readingProgress.style.width = `${scrollPercent}%`;

  // Save scroll position for the first loaded chapter
  if (state.loadedChapters.length > 0) {
    const firstPath = state.files[state.loadedChapters[0]].path;
    state.scrollPositions[firstPath] = scrollTop;
  }

  // Update title based on which chapter section is currently visible
  updateVisibleChapterTitle();
}

/**
 * Detect which chapter section is currently in view and update the header title.
 */
function updateVisibleChapterTitle() {
  const sections = els.content.querySelectorAll(".chapter-section");
  if (sections.length === 0) return;

  const viewportMiddle = window.scrollY + window.innerHeight * 0.3;
  let currentSection = sections[0];

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const sectionTop = rect.top + window.scrollY;
    if (sectionTop <= viewportMiddle) {
      currentSection = section;
    } else {
      break;
    }
  }

  const idx = parseInt(currentSection.dataset.chapterIndex, 10);
  if (!isNaN(idx) && idx !== state.activeIndex) {
    state.activeIndex = idx;
    els.chapterTitle.textContent = state.files[idx].title;
    updateBookmarkUI();
    updateActiveSidebarItem();

    // Update URL silently
    const urlObj = new URL(window.location);
    urlObj.searchParams.set("file", state.files[idx].path);
    window.history.replaceState({ path: state.files[idx].path }, "", urlObj);
    saveState("lastRead");
  }
}

// --- Sidebar Rendering ---

function renderSidebar() {
  const list = els.chapterList;
  list.innerHTML = "";

  // Grouping
  const groups = new Map();
  const filter = state.filterText.toLowerCase();

  state.files.forEach(file => {
    if (filter && !file.path.toLowerCase().includes(filter) && !file.title.toLowerCase().includes(filter)) return;

    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "未分類";

    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(file);
  });

  // Render Groups
  for (const [folder, files] of groups) {
    const isExpanded = !state.collapsedFolders.has(folder) || filter.length > 0;

    // Folder Button
    const folderBtn = document.createElement("button");
    folderBtn.className = "folder";
    folderBtn.onclick = () => {
      if (state.collapsedFolders.has(folder)) state.collapsedFolders.delete(folder);
      else state.collapsedFolders.add(folder);
      renderSidebar();
    };
    folderBtn.setAttribute("aria-expanded", isExpanded);
    folderBtn.innerHTML = `
      <span class="folder-arrow">▶</span>
      <span>${folder}</span>
    `;
    list.appendChild(folderBtn);

    // Files Container
    const groupDiv = document.createElement("div");
    groupDiv.className = "folder-group";
    if (!isExpanded) groupDiv.hidden = true;
    else groupDiv.style.height = "auto";

    files.forEach(file => {
      const btn = document.createElement("button");
      btn.className = "chapter-btn";
      btn.textContent = file.title;
      if (state.bookmarks.has(file.path)) {
        btn.innerHTML += `<span style="color:var(--accent);margin-left:auto">⚑</span>`;
      }
      btn.onclick = () => loadChapter(file.path);
      if (state.activeIndex >= 0 && state.files[state.activeIndex].path === file.path) {
        btn.classList.add("active");
        // Scroll sidebar to active item
        setTimeout(() => {
          if (btn.classList.contains("active")) {
            btn.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }, 300);
      }
      groupDiv.appendChild(btn);
    });

    list.appendChild(groupDiv);
  }
}

// --- Bottom Panel & Gestures ---

function toggleBottomPanel(show) {
  state.bottomPanelOpen = show;
  if (show) {
    els.bottomPanel.classList.add("active");
    els.bottomPanelOverlay.classList.add("active");
    els.panelFontLabel.textContent = state.fontSize.toFixed(1);
  } else {
    els.bottomPanel.classList.remove("active");
    els.bottomPanelOverlay.classList.remove("active");
  }
}

// --- Gesture Handlers ---

function handleTouchStart(e) {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchMove(e) {
  // Optional: Prevent default if gesture is recognized to stop scrolling
  // But we want to be careful not to block scrolling
}

function handleTouchEnd(e) {
  if (e.changedTouches.length !== 1) return;

  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;

  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  // Mobile only check (loose check)
  if (window.innerWidth > 1024) return;

  // 1. Swipe Right: Open Sidebar
  // Condition: Start near left edge (< 30px), Move Right > 60px, Mostly horizontal
  if (touchStartX < 40 && deltaX > 60 && absY < 50) {
    els.app.classList.remove("sidebar-collapsed");
    return;
  }

  // 2. Swipe Left: Close Sidebar
  // Condition: Sidebar is open, Move Left > 60px
  if (!els.app.classList.contains("sidebar-collapsed") && deltaX < -60 && absY < 50) {
    els.app.classList.add("sidebar-collapsed");
    return;
  }

  // 3. Swipe Up: Open Bottom Panel
  // Condition: Start near bottom (last 20% or 100px), Move Up > 60px, Mostly vertical
  const isBottomInternal = touchStartY > window.innerHeight - 120;
  if (isBottomInternal && deltaY < -60 && absX < 50 && !state.bottomPanelOpen) {
    toggleBottomPanel(true);
    return;
  }

  // 4. Swipe Down: Close Bottom Panel
  // Condition: Panel Open, Move Down > 60px
  if (state.bottomPanelOpen && deltaY > 60 && absX < 50) {
    toggleBottomPanel(false);
    return;
  }
}

function updateActiveSidebarItem() {
  renderSidebar(); // Simple re-render to update 'active' class
}

function updateNavButtons() {
  els.prevBtn.disabled = state.activeIndex <= 0;
  els.nextBtn.disabled = state.activeIndex >= state.files.length - 1;
}

function updateBookmarkUI() {
  if (state.activeIndex < 0) return;
  const path = state.files[state.activeIndex].path;
  const isBookmarked = state.bookmarks.has(path);
  // Fill/Unfill bookmark icon
  const svg = els.bookmarkBtn.querySelector("svg");
  if (isBookmarked) {
    svg.style.fill = "currentColor";
  } else {
    svg.style.fill = "none";
  }
}

// --- Event Listeners ---

function bindEvents() {
  // Scroll
  window.addEventListener("scroll", updateReadingProgress, { passive: true });

  // Save scroll on unload
  window.addEventListener("beforeunload", () => {
    saveState("scroll");
    saveState("bookmarks"); // just in case
  });

  // Sidebar Toggles
  const toggleSidebar = () => els.app.classList.toggle("sidebar-collapsed");
  els.menuBtn.onclick = toggleSidebar;
  els.sidebarCloseBtn.onclick = () => els.app.classList.add("sidebar-collapsed");
  els.sidebarOverlay.onclick = () => els.app.classList.add("sidebar-collapsed");

  // Settings
  els.themeToggle.onclick = () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    applyTheme();
  };

  els.ttsToggle.onclick = toggleTTS;

  els.fontSizeInc.onclick = () => {
    state.fontSize = Math.min(state.fontSize + 0.1, 2.0);
    applyFontSize();
  };

  els.fontSizeDec.onclick = () => {
    state.fontSize = Math.max(state.fontSize - 0.1, 0.8);
    applyFontSize();
  };

  // Bookmark
  els.bookmarkBtn.onclick = () => {
    if (state.activeIndex < 0) return;
    const path = state.files[state.activeIndex].path;
    if (state.bookmarks.has(path)) {
      state.bookmarks.delete(path);
    } else {
      state.bookmarks.add(path);
    }
    updateBookmarkUI();
    saveState("bookmarks");
    renderSidebar(); // Update flag in sidebar
  };

  // Navigation
  els.prevBtn.onclick = () => {
    if (state.activeIndex > 0) loadChapter(state.files[state.activeIndex - 1].path);
  };

  els.nextBtn.onclick = () => {
    if (state.activeIndex < state.files.length - 1) loadChapter(state.files[state.activeIndex + 1].path);
  };

  // Search
  els.searchInput.oninput = (e) => {
    state.filterText = e.target.value;
    renderSidebar();
  };

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;

    if (e.key === "ArrowLeft") els.prevBtn.click();
    if (e.key === "ArrowRight") els.nextBtn.click();
    if (e.key.toLowerCase() === "t") els.themeToggle.click();
    if (e.key.toLowerCase() === "b") els.bookmarkBtn.click();
  });

  // Click bottom area to page down (infinite scroll handles next chapter)
  document.querySelector(".main-wrapper").addEventListener("click", (e) => {
    if (e.target.closest("button, a, input, .bottom-nav, .top-nav, .nav-btn, .chapter-divider, .bottom-panel")) return;

    const clickY = e.clientY;
    const windowH = window.innerHeight;

    if (clickY > windowH * 0.7) {
      window.scrollBy({ top: windowH * 0.85, behavior: "smooth" });
    }
  });

  // Gestures
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  // Bottom Panel Interactions
  els.bottomPanelOverlay.onclick = () => toggleBottomPanel(false);
  els.bottomPanelHandle.onclick = () => toggleBottomPanel(false);

  // Panel TTS Controls
  els.ttsPanelToggle.onclick = toggleTTS;
  els.ttsStopBtn.onclick = stopTTS;
  els.ttsRateInput.oninput = (e) => {
    state.ttsRate = parseFloat(e.target.value);
    els.ttsRateLabel.textContent = state.ttsRate.toFixed(1) + "x";

    // Live update if speaking
    if (state.tts.speaking && !state.tts.paused) {
      // SpeechSynthesis API doesn't support changing rate mid-utterance easily
      // We have to restart. A bit abrupt, maybe just let next utterance pick it up?
      // For now, simple let it apply to next.
    }
  };
  els.ttsStartSelect.onchange = (e) => {
    state.ttsStartMode = e.target.value;
  };

  // Panel Settings Controls
  els.panelThemeToggle.onclick = () => els.themeToggle.click();
  els.panelFontInc.onclick = () => {
    els.fontSizeInc.click();
    els.panelFontLabel.textContent = state.fontSize.toFixed(1);
  };
  els.panelFontDec.onclick = () => {
    els.fontSizeDec.click();
    els.panelFontLabel.textContent = state.fontSize.toFixed(1);
  };
}

// --- Main ---

async function init() {
  inferGithubRepo();
  loadState();
  applyTheme();
  applyFontSize();
  bindEvents();

  initTTS();
  await loadFileList();
  renderSidebar();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW Registered!', reg))
      .catch(err => console.error('SW Failed', err));
  }


  const params = new URLSearchParams(window.location.search);
  const file = params.get("file") || localStorage.getItem("reader-last-read");

  if (file) {
    // If the file exists in our list, load it
    const fileExists = state.files.some(f => f.path === file);
    if (fileExists) {
      loadChapter(file);
    }
  } else if (state.files.length > 0) {
    // Optionally load first chapter if nothing else
  }
}

init();
