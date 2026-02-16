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
};

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
  fontSizeInc: document.getElementById("font-size-inc"),
  fontSizeDec: document.getElementById("font-size-dec"),
  bookmarkBtn: document.getElementById("bookmark-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
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

// --- Core Logic: File Fetching & Parsing ---

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
      .filter(item => item.type === "blob" && item.path.endsWith(".md") && item.path !== "README.md")
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

// --- Chapter Loading & Rendering ---

async function loadChapter(path) {
  const index = state.files.findIndex(f => f.path === path);
  if (index === -1) return;

  state.activeIndex = index;
  // Update UI immediately
  els.chapterTitle.textContent = "載入中...";
  els.content.style.opacity = "0.5";
  updateActiveSidebarItem();

  try {
    const url = getApiUrl(path);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Chapter Load Failed");
    const text = await resp.text();

    // Parse Title First
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : state.files[index].title;
    state.files[index].title = title; // Update cache

    // Render
    els.chapterTitle.textContent = title;
    els.content.innerHTML = marked.parse(text);

    // Reset Scroll or Restore
    const savedPos = state.scrollPositions[path];
    if (savedPos) {
      window.scrollTo({ top: savedPos, behavior: "auto" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    // Animation
    els.content.style.opacity = "0";
    requestAnimationFrame(() => {
      els.content.style.transition = "opacity 0.6s ease-out";
      els.content.style.opacity = "1";
    });

    updateNavButtons();
    updateBookmarkUI();

    // History State
    const urlObj = new URL(window.location);
    urlObj.searchParams.set("file", path);
    window.history.replaceState({ path }, "", urlObj);

    // Mobile: Close sidebar
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

// --- Audio/Visual Progress & Interactions ---

function updateReadingProgress() {
  const scrollTop = window.scrollY;
  const docHeight = document.body.scrollHeight - window.innerHeight;
  const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  els.readingProgress.style.width = `${scrollPercent}%`;

  if (state.activeIndex >= 0) {
    const path = state.files[state.activeIndex].path;
    state.scrollPositions[path] = scrollTop;
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
        setTimeout(() => {
          // Scroll sidebar to active item if needed
          // btn.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 100);
      }
      groupDiv.appendChild(btn);
    });

    list.appendChild(groupDiv);
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
}

// --- Main ---

async function init() {
  inferGithubRepo();
  loadState();
  applyTheme();
  applyFontSize();
  bindEvents();

  await loadFileList();
  renderSidebar();

  const params = new URLSearchParams(window.location.search);
  const file = params.get("file");
  if (file) {
    loadChapter(file);
  } else if (state.files.length > 0) {
    // Load current chapter from URL or just show welcome/first
    // Maybe check hash?
    // els.chapterTitle.textContent = "歡迎閱讀";
    // els.content.innerHTML = "<p>請從左側目錄選擇章節開始閱讀。</p>";
  }
}

init();
