function inferGithubRepoFromLocation() {
  const host = window.location.hostname || "";
  if (!host.endsWith(".github.io")) return null;
  const owner = host.replace(/\.github\.io$/, "");
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const repo = pathParts[0] || null;
  if (!owner || !repo) return null;
  return { owner, repo };
}

const inferredGithub = inferGithubRepoFromLocation();
const branchFromQuery = new URL(window.location.href).searchParams.get("branch");
const forceSourceFromQuery = new URL(window.location.href).searchParams.get("source");
const config = {
  includeExtensions: [".md"],
  githubOwner: inferredGithub?.owner || "skydreamer0",
  githubRepo: inferredGithub?.repo || "newtestnovel",
  githubBranch: branchFromQuery || "master",
};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("chapter-list");
const contentEl = document.getElementById("content");
const titleEl = document.getElementById("chapter-title");
const prevButtons = Array.from(document.querySelectorAll(".nav-prev"));
const nextButtons = Array.from(document.querySelectorAll(".nav-next"));
const appEl = document.querySelector(".app");
const menuBtn = document.getElementById("menu-btn");
const themeToggleButtons = Array.from(document.querySelectorAll(".theme-toggle, #theme-toggle"));
const searchInput = document.getElementById("search-input");

let files = [];
let activeIndex = -1;
let filterText = "";
const collapsedFolders = new Set();
let sourceMode = "netlify";

function setStatus(text) {
  statusEl.textContent = text;
}

function isTargetFile(path) {
  const lower = path.toLowerCase();
  return config.includeExtensions.some((ext) => lower.endsWith(ext));
}

function naturalCompare(a, b) {
  return a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" });
}

function parseChineseNumeral(text) {
  const digitMap = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  if (text === "十") return 10;

  const tenIndex = text.indexOf("十");
  if (tenIndex >= 0) {
    const left = text.slice(0, tenIndex);
    const right = text.slice(tenIndex + 1);
    const tens = left ? digitMap[left] ?? Number.NaN : 1;
    const ones = right ? digitMap[right] ?? Number.NaN : 0;
    if (Number.isNaN(tens) || Number.isNaN(ones)) return Number.NaN;
    return tens * 10 + ones;
  }

  if (text.length === 1 && digitMap[text] !== undefined) {
    return digitMap[text];
  }

  return Number.NaN;
}

function extractVolumeOrder(folder) {
  const folderName = folder.split("/").pop() || folder;
  const match = folderName.match(/^第([0-9零一二三四五六七八九十兩〇]+)卷/);
  if (!match) return Number.POSITIVE_INFINITY;
  const order = parseChineseNumeral(match[1]);
  return Number.isNaN(order) ? Number.POSITIVE_INFINITY : order;
}

function compareFolders(a, b) {
  const volumeA = extractVolumeOrder(a);
  const volumeB = extractVolumeOrder(b);
  if (volumeA !== volumeB) return volumeA - volumeB;
  return naturalCompare(a, b);
}

function compareFilePaths(pathA, pathB) {
  const folderA = pathA.includes("/") ? pathA.slice(0, pathA.lastIndexOf("/")) : "(根目錄)";
  const folderB = pathB.includes("/") ? pathB.slice(0, pathB.lastIndexOf("/")) : "(根目錄)";
  const folderResult = compareFolders(folderA, folderB);
  if (folderResult !== 0) return folderResult;
  return naturalCompare(pathA, pathB);
}

function getTreeApiUrl() {
  return "/.netlify/functions/github?mode=tree";
}

function getGithubTreeApiUrl() {
  const branch = encodeURIComponent(config.githubBranch);
  return `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/git/trees/${branch}?recursive=1`;
}

function encodePath(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function toGithubRawUrl(path) {
  const encodedPath = encodePath(path);
  return `https://raw.githubusercontent.com/${config.githubOwner}/${config.githubRepo}/${config.githubBranch}/${encodedPath}`;
}

function toRawUrl(path) {
  if (sourceMode === "github") {
    return toGithubRawUrl(path);
  }
  const params = new URLSearchParams({ path });
  return `/.netlify/functions/github?${params.toString()}`;
}

function getFallbackTitle(path) {
  return path.split("/").pop();
}

function normalizeChapterTitle(rawTitle) {
  const cleaned = rawTitle
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  const withColon = cleaned.match(/^(第[0-9零一二三四五六七八九十百千兩〇]+章)\s*[：:]\s*(.+)$/);
  if (withColon) {
    return `${withColon[1]} ${withColon[2].trim()}`;
  }
  const withSpace = cleaned.match(/^(第[0-9零一二三四五六七八九十百千兩〇]+章)\s+(.+)$/);
  if (withSpace) {
    return `${withSpace[1]} ${withSpace[2].trim()}`;
  }
  return cleaned;
}

function extractChapterTitle(markdown, path) {
  const lines = markdown.split("\n");
  const headings = lines
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^#{1,6}\s+(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  const chapterHeading = headings.find((heading) =>
    /^第[0-9零一二三四五六七八九十百千兩〇]+章/.test(heading),
  );
  if (chapterHeading) return normalizeChapterTitle(chapterHeading);
  if (headings[0]) return normalizeChapterTitle(headings[0]);
  return getFallbackTitle(path);
}

function groupByFolder(fileList) {
  const groups = new Map();
  fileList.forEach((file) => {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(根目錄)";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(file);
  });
  return [...groups.entries()].sort((a, b) => compareFolders(a[0], b[0]));
}

function updateNavButtons() {
  const disablePrev = activeIndex <= 0;
  const disableNext = activeIndex < 0 || activeIndex >= files.length - 1;
  prevButtons.forEach((button) => {
    button.disabled = disablePrev;
  });
  nextButtons.forEach((button) => {
    button.disabled = disableNext;
  });
}

function setActiveButton(path) {
  const buttons = listEl.querySelectorAll(".chapter-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.path === path);
  });
}

function updateQueryString(path) {
  const url = new URL(window.location.href);
  url.searchParams.set("file", path);
  window.history.replaceState({}, "", url);
}

async function loadChapter(path) {
  const index = files.findIndex((f) => f.path === path);
  if (index < 0) return;
  activeIndex = index;
  updateNavButtons();
  setActiveButton(path);
  updateQueryString(path);
  titleEl.textContent = files[index].title || getFallbackTitle(path);
  contentEl.innerHTML = "<p>章節載入中...</p>";
  setStatus(`讀取中: ${path}`);

  try {
    const resp = await fetch(toRawUrl(path));
    if (!resp.ok) {
      const message = await resp.text();
      throw new Error(message || `HTTP ${resp.status}`);
    }
    const markdown = await resp.text();
    const parsedTitle = extractChapterTitle(markdown, path);
    files[index].title = parsedTitle;
    titleEl.textContent = parsedTitle;
    contentEl.innerHTML = marked.parse(markdown);
    setStatus(`已載入 ${files.length} 個檔案`);
    closeSidebarOnMobile();
    scrollToTopOnDesktop();
    renderList();
  } catch (err) {
    contentEl.innerHTML = `<p>讀取失敗：${String(err)}</p>`;
    setStatus("讀取章節失敗");
  }
}

function renderList() {
  listEl.innerHTML = "";
  const normalized = filterText.trim().toLowerCase();
  const visibleFiles = normalized
    ? files.filter((file) => file.path.toLowerCase().includes(normalized))
    : files;
  const groups = groupByFolder(visibleFiles);

  if (visibleFiles.length === 0) {
    listEl.innerHTML = "<p>找不到符合條件的章節。</p>";
    return;
  }

  groups.forEach(([folder, folderFiles]) => {
    const isSearchMode = normalized.length > 0;
    const hasActive = folderFiles.some((file) => files[activeIndex]?.path === file.path);
    if (hasActive) {
      collapsedFolders.delete(folder);
    }
    const isCollapsed = !isSearchMode && collapsedFolders.has(folder);

    const folderBtn = document.createElement("button");
    folderBtn.className = "folder";
    folderBtn.type = "button";
    folderBtn.dataset.folder = folder;
    folderBtn.setAttribute("aria-expanded", String(!isCollapsed));
    folderBtn.innerHTML = `<span class="folder-arrow">▸</span><span class="folder-name">${folder}</span>`;
    folderBtn.addEventListener("click", () => {
      if (collapsedFolders.has(folder)) {
        collapsedFolders.delete(folder);
      } else {
        collapsedFolders.add(folder);
      }
      renderList();
    });
    listEl.appendChild(folderBtn);

    const groupEl = document.createElement("div");
    groupEl.className = "folder-group";
    if (isCollapsed) {
      groupEl.hidden = true;
    }

    folderFiles.sort((a, b) => naturalCompare(a.path, b.path)).forEach((file) => {
      const btn = document.createElement("button");
      btn.className = "chapter-btn";
      btn.type = "button";
      btn.dataset.path = file.path;
      btn.textContent = file.title || getFallbackTitle(file.path);
      btn.addEventListener("click", () => loadChapter(file.path));
      groupEl.appendChild(btn);
    });
    listEl.appendChild(groupEl);
  });

  if (activeIndex >= 0) {
    setActiveButton(files[activeIndex].path);
  }
}

async function loadFileList() {
  setStatus("正在抓取檔案列表...");
  let tree = null;
  let netlifyError = null;
  let githubError = null;
  const preferGithub =
    forceSourceFromQuery === "github" ||
    (forceSourceFromQuery !== "netlify" && window.location.hostname.endsWith(".github.io"));

  const loadFromNetlify = async () => {
    const resp = await fetch(getTreeApiUrl());
    if (!resp.ok) {
      const message = await resp.text();
      throw new Error(message || `讀取檔案列表失敗: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (!data.tree) throw new Error("Git tree 格式不正確");
    sourceMode = "netlify";
    return data.tree;
  };

  const loadFromGithub = async () => {
    const resp = await fetch(getGithubTreeApiUrl());
    if (!resp.ok) {
      const message = await resp.text();
      throw new Error(message || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (!data.tree) throw new Error("GitHub tree 格式不正確");
    sourceMode = "github";
    return data.tree;
  };

  if (preferGithub) {
    try {
      tree = await loadFromGithub();
    } catch (err) {
      githubError = err;
      try {
        tree = await loadFromNetlify();
      } catch (fallbackErr) {
        netlifyError = fallbackErr;
      }
    }
  } else {
    try {
      tree = await loadFromNetlify();
    } catch (err) {
      netlifyError = err;
      try {
        tree = await loadFromGithub();
      } catch (fallbackErr) {
        githubError = fallbackErr;
      }
    }
  }

  if (!tree) {
    throw new Error(
      `Netlify 與 GitHub 皆讀取失敗。Netlify: ${String(netlifyError)} | GitHub: ${String(githubError)}`,
    );
  }

  files = tree
    .filter((item) => item.type === "blob" && isTargetFile(item.path))
    .filter((item) => item.path !== "README.md")
    .sort((a, b) => compareFilePaths(a.path, b.path));

  if (files.length === 0) throw new Error("目前分支找不到可讀取的 Markdown 檔");
}

async function loadChapterTitles() {
  await Promise.allSettled(
    files.map(async (file) => {
      const resp = await fetch(toRawUrl(file.path));
      if (!resp.ok) return;
      const markdown = await resp.text();
      file.title = extractChapterTitle(markdown, file.path);
    }),
  );
}

function bindNavigation() {
  prevButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (activeIndex > 0) loadChapter(files[activeIndex - 1].path);
    });
  });

  nextButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (activeIndex >= 0 && activeIndex < files.length - 1) {
        loadChapter(files[activeIndex + 1].path);
      }
    });
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggleButtons.forEach((button) => {
    button.textContent = theme === "dark" ? "淺色" : "深色";
  });
  try {
    localStorage.setItem("reader-theme", theme);
  } catch (_) {
    // Ignore storage errors and keep in-memory theme.
  }
}

function initializeTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem("reader-theme");
  } catch (_) {
    saved = null;
  }
  const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (preferredDark ? "dark" : "light"));
  themeToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const current = document.body.dataset.theme === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  });
}

function closeSidebarOnMobile() {
  if (window.matchMedia("(max-width: 980px)").matches) {
    appEl.classList.add("sidebar-collapsed");
  }
}

function scrollToTopOnDesktop() {
  if (!window.matchMedia("(min-width: 981px)").matches) return;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function bindSidebarToggle() {
  menuBtn.addEventListener("click", () => {
    appEl.classList.toggle("sidebar-collapsed");
  });
  if (window.matchMedia("(max-width: 980px)").matches) {
    appEl.classList.add("sidebar-collapsed");
  }
}

function bindSearch() {
  searchInput.addEventListener("input", (event) => {
    filterText = event.target.value;
    renderList();
  });
}

function bindKeyboardNavigation() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      if (activeIndex > 0) {
        event.preventDefault();
        loadChapter(files[activeIndex - 1].path);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (activeIndex >= 0 && activeIndex < files.length - 1) {
        event.preventDefault();
        loadChapter(files[activeIndex + 1].path);
      }
    }
  });
}

async function init() {
  initializeTheme();
  bindSidebarToggle();
  bindSearch();
  bindNavigation();
  bindKeyboardNavigation();
  try {
    await loadFileList();
    setStatus("正在解析章節標題...");
    await loadChapterTitles();
    renderList();
    const fromQuery = new URL(window.location.href).searchParams.get("file");
    const firstPath = files[0]?.path;
    const target = files.find((f) => f.path === fromQuery)?.path || firstPath;
    if (target) {
      await loadChapter(target);
    } else {
      setStatus("沒有可讀取檔案");
      contentEl.innerHTML = "<p>沒有找到 Markdown 檔案。</p>";
    }
  } catch (err) {
    setStatus("初始化失敗");
    contentEl.innerHTML = `<p>${String(err)}</p>`;
  }
}

init();
