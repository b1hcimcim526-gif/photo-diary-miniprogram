const SUPABASE_URL = "https://jmllhgkfzbrlelqqrvth.supabase.co";
const SUPABASE_KEY = "sb_publishable_RYl5n4MQm3OP3MRFdgbHrQ_TZmQHFx6";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const views = {
  auth: document.getElementById("view-auth"),
  record: document.getElementById("view-record"),
  "record-editor": document.getElementById("view-record-editor"),
  "diary-list": document.getElementById("view-diary-list"),
  "diary-month": document.getElementById("view-diary-month"),
  "diary-calendar": document.getElementById("view-diary-calendar"),
};

const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");

const MAX_PHOTOS = 18;
const CANVAS_RATIOS = [1 / 1, 3 / 4, 4 / 3, 9 / 16, 16 / 9];

function pickBestCanvasRatio(imgRatio) {
  let best = CANVAS_RATIOS[0];
  let bestDiff = Infinity;
  for (const ratio of CANVAS_RATIOS) {
    const diff = Math.abs(Math.log(imgRatio) - Math.log(ratio));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ratio;
    }
  }
  return best;
}

let pendingPhotos = [];
let calendarMonth = new Date(); // first-of-month cursor
calendarMonth.setDate(1);
let currentMonthKey = null;
let currentMonthLongImage = null;
let calendarReturnView = "record";
let entriesCache = {}; // "YYYY-MM-DD" -> { photos: [dataURL,...] }, mirrors the Supabase "entries" table

function todayStr() {
  return formatISO(new Date());
}

function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadEntries() {
  return entriesCache;
}

async function refreshEntriesCache() {
  const { data, error } = await supabaseClient.from("entries").select("date, photos");
  if (error) {
    console.error(error);
    entriesCache = {};
    return;
  }
  const map = {};
  (data || []).forEach((row) => {
    map[row.date] = { photos: row.photos || [] };
  });
  entriesCache = map;
}

async function upsertEntryRemote(dateStr, photos) {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient
    .from("entries")
    .upsert({ user_id: user.id, date: dateStr, photos }, { onConflict: "user_id,date" });
  if (error) throw error;
  entriesCache[dateStr] = { photos };
}

async function deleteEntryRemote(dateStr) {
  const { error } = await supabaseClient.from("entries").delete().eq("date", dateStr);
  if (error) throw error;
  delete entriesCache[dateStr];
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
  const showNav =
    name === "record" ||
    name === "record-editor" ||
    name === "diary-list" ||
    name === "diary-month" ||
    name === "diary-calendar";
  bottomNav.hidden = !showNav;
  navItems.forEach((btn) => {
    const isRecordTab = btn.dataset.view === "record" && (name === "record" || name === "record-editor");
    const isDiaryTab = btn.dataset.view === "diary-list" && (name === "diary-list" || name === "diary-month");
    btn.classList.toggle("active", btn.dataset.view === name || isRecordTab || isDiaryTab);
  });
}

// ---------- 登录 ----------
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authError = document.getElementById("auth-error");

function showAuthError(message) {
  authError.textContent = message;
  authError.hidden = false;
}

function readAuthCredentials() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    showAuthError("请输入邮箱和密码");
    return null;
  }
  return { email, password };
}

document.getElementById("auth-login-btn").addEventListener("click", async () => {
  authError.hidden = true;
  const credentials = readAuthCredentials();
  if (!credentials) return;
  const { error } = await supabaseClient.auth.signInWithPassword(credentials);
  if (error) showAuthError(error.message);
});

document.getElementById("auth-signup-btn").addEventListener("click", async () => {
  authError.hidden = true;
  const credentials = readAuthCredentials();
  if (!credentials) return;
  const { data, error } = await supabaseClient.auth.signUp(credentials);
  if (error) {
    showAuthError(error.message);
    return;
  }
  if (!data.session) {
    showAuthError("注册成功，请去邮箱点验证链接，验证后回来登录");
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

// ---------- 底部 Tab ----------
navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "record") {
      renderRecordFeed();
      showView("record");
    }
    if (view === "diary-list") {
      renderNotebookGrid();
      showView("diary-list");
    }
  });
});

// ---------- 创作栏首页：朋友圈式列表 ----------
const recordFeed = document.getElementById("record-feed");

function formatFeedMonth(dateStr) {
  return `${parseInt(dateStr.split("-")[1], 10)}月`;
}

function renderRecordFeed() {
  const entries = loadEntries();
  const dates = Object.keys(entries).sort((a, b) => (a < b ? 1 : -1));
  recordFeed.innerHTML = "";

  const today = todayStr();
  const rows = [];
  if (!entries[today]) {
    rows.push(today);
  }
  dates.forEach((dateStr) => rows.push(dateStr));

  let lastYear = null;
  rows.forEach((dateStr) => {
    const year = dateStr.split("-")[0];
    if (year !== lastYear) {
      recordFeed.appendChild(buildYearDivider(year));
      lastYear = year;
    }
    recordFeed.appendChild(buildFeedRow(dateStr, entries[dateStr] || null));
  });
}

function buildYearDivider(year) {
  const div = document.createElement("div");
  div.className = "feed-year-divider";
  div.textContent = `${year}年`;
  return div;
}

function buildFeedRow(dateStr, entry) {
  const row = document.createElement("div");
  row.className = "feed-row";
  row.addEventListener("click", () => openRecordEditor(dateStr));

  const dateEl = document.createElement("div");
  dateEl.className = "feed-date";
  const monthEl = document.createElement("span");
  monthEl.className = "feed-date-month";
  monthEl.textContent = formatFeedMonth(dateStr);
  const dayEl = document.createElement("span");
  dayEl.className = "feed-date-day";
  dayEl.textContent = dateStr.split("-")[2];
  dateEl.appendChild(monthEl);
  dateEl.appendChild(dayEl);
  row.appendChild(dateEl);

  const content = document.createElement("div");
  content.className = "feed-content";

  if (entry) {
    const grid = document.createElement("div");
    grid.className = "feed-grid";
    const visible = entry.photos.slice(0, 9);
    const hiddenCount = entry.photos.length - visible.length;
    visible.forEach((src, index) => {
      const cell = document.createElement("div");
      cell.className = "feed-grid-cell";
      const img = document.createElement("img");
      img.src = src;
      cell.appendChild(img);
      if (index === visible.length - 1 && hiddenCount > 0) {
        const more = document.createElement("span");
        more.className = "feed-grid-more";
        more.textContent = `+${hiddenCount}`;
        cell.appendChild(more);
      }
      grid.appendChild(cell);
    });
    content.appendChild(grid);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "feed-add-placeholder";
    const addBtn = document.createElement("span");
    addBtn.className = "feed-add-btn";
    addBtn.textContent = "+";
    placeholder.appendChild(addBtn);
    content.appendChild(placeholder);
  }

  row.appendChild(content);
  return row;
}

document.getElementById("btn-back-to-feed").addEventListener("click", () => {
  renderRecordFeed();
  showView("record");
});

// ---------- 创作栏编辑页 ----------
let currentRecordDate = todayStr();
let activePhotoIndex = 0;
const photoInput = document.getElementById("photo-input");
const entryForm = document.getElementById("entry-form");
const photoCountBadge = document.getElementById("photo-count-badge");
const recordDateLabel = document.getElementById("record-date-label");
const editorPreviewImg = document.getElementById("editor-preview-img");
const editorPreviewEmpty = document.getElementById("editor-preview-empty");
const editorThumbRow = document.getElementById("editor-thumb-row");
const btnRemoveCurrent = document.getElementById("btn-remove-current");

function formatFullDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function openRecordEditor(dateStr) {
  currentRecordDate = dateStr;
  recordDateLabel.textContent = formatFullDateLabel(dateStr);
  loadRecordForm(dateStr);
  showView("record-editor");
}

function loadRecordForm(dateStr) {
  const entries = loadEntries();
  const entry = entries[dateStr];
  pendingPhotos = entry ? [...entry.photos] : [];
  activePhotoIndex = 0;
  renderPhotoEditor();
}

function openCalendarFromRecord(returnView) {
  calendarReturnView = returnView;
  renderCalendar();
  showView("diary-calendar");
}

document.getElementById("btn-open-calendar-picker").addEventListener("click", () => {
  openCalendarFromRecord("record-editor");
});

document.getElementById("btn-open-calendar-picker-home").addEventListener("click", () => {
  openCalendarFromRecord("record");
});

function renderPhotoEditor(selectIndex) {
  if (typeof selectIndex === "number") {
    activePhotoIndex = selectIndex;
  }
  if (activePhotoIndex >= pendingPhotos.length) {
    activePhotoIndex = pendingPhotos.length - 1;
  }
  if (activePhotoIndex < 0) {
    activePhotoIndex = 0;
  }

  photoCountBadge.hidden = pendingPhotos.length === 0;
  photoCountBadge.textContent = `${pendingPhotos.length}/${MAX_PHOTOS}`;

  if (pendingPhotos.length === 0) {
    editorPreviewImg.hidden = true;
    editorPreviewImg.removeAttribute("src");
    editorPreviewEmpty.hidden = false;
    btnRemoveCurrent.hidden = true;
  } else {
    editorPreviewEmpty.hidden = true;
    editorPreviewImg.hidden = false;
    editorPreviewImg.src = pendingPhotos[activePhotoIndex];
    btnRemoveCurrent.hidden = false;
  }

  editorThumbRow.innerHTML = "";

  const addThumb = document.createElement("button");
  addThumb.type = "button";
  addThumb.className = "editor-thumb-add";
  addThumb.textContent = "+";
  addThumb.hidden = pendingPhotos.length >= MAX_PHOTOS;
  addThumb.addEventListener("click", () => {
    addMenuModal.hidden = false;
  });
  editorThumbRow.appendChild(addThumb);

  pendingPhotos.forEach((src, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "editor-thumb" + (index === activePhotoIndex ? " active" : "");
    const img = document.createElement("img");
    img.src = src;
    thumb.appendChild(img);
    thumb.addEventListener("click", () => renderPhotoEditor(index));
    editorThumbRow.appendChild(thumb);
  });
}

btnRemoveCurrent.addEventListener("click", () => {
  if (pendingPhotos.length === 0) return;
  pendingPhotos.splice(activePhotoIndex, 1);
  renderPhotoEditor();
});

// ---------- 添加方式菜单 ----------
const addMenuModal = document.getElementById("add-menu-modal");
let photoInputMode = "single"; // "single" | "multi" | "collage"

document.getElementById("add-menu-close").addEventListener("click", () => {
  addMenuModal.hidden = true;
});

document.getElementById("add-menu-single").addEventListener("click", () => {
  addMenuModal.hidden = true;
  photoInputMode = "single";
  photoInput.multiple = false;
  photoInput.click();
});

document.getElementById("add-menu-multi").addEventListener("click", () => {
  addMenuModal.hidden = true;
  photoInputMode = "multi";
  photoInput.multiple = true;
  photoInput.click();
});

document.getElementById("add-menu-collage").addEventListener("click", () => {
  addMenuModal.hidden = true;
  renderTemplateGrid();
  templateModal.hidden = false;
});

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files);
  if (files.length === 0) return;

  if (photoInputMode === "collage") {
    const reader = new FileReader();
    reader.onload = () => {
      collagePhotos[activeCollageCellIndex] = reader.result;
      collagePhotoOffsets[activeCollageCellIndex] = { x: 0.5, y: 0.5 };
      renderCollageEditor();
      photoInput.value = "";
    };
    reader.readAsDataURL(files[0]);
    return;
  }

  if (photoInputMode === "collage-bulk") {
    const capacity = activeTemplate.cells.length;
    const toFill = files.slice(0, capacity);
    if (toFill.length === 0) {
      photoInput.value = "";
      return;
    }
    let remaining = toFill.length;
    toFill.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        collagePhotos[index] = reader.result;
        collagePhotoOffsets[index] = { x: 0.5, y: 0.5 };
        remaining -= 1;
        if (remaining === 0) {
          renderCollageEditor();
          collageEditorModal.hidden = false;
          photoInput.value = "";
        }
      };
      reader.readAsDataURL(file);
    });
    return;
  }

  const toAdd = files.slice(0, MAX_PHOTOS - pendingPhotos.length);
  if (toAdd.length === 0) {
    photoInput.value = "";
    return;
  }
  for (const file of toAdd) {
    const raw = await readFileAsDataUrl(file);
    const composed = await renderPhotoOriginal(raw);
    pendingPhotos.push(composed);
  }
  renderPhotoEditor(pendingPhotos.length - 1);
  photoInput.value = "";
});

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

const MAX_PHOTO_EDGE = 1600; // cap long edge so a day's worth of photos stays a reasonable upload size

async function renderPhotoOriginal(srcDataUrl) {
  const img = await loadImage(srcDataUrl);
  const ratio = img.width / img.height;
  const targetRatio = pickBestCanvasRatio(ratio);

  let cropW = img.width;
  let cropH = img.height;
  if (ratio > targetRatio) {
    cropW = img.height * targetRatio;
  } else if (ratio < targetRatio) {
    cropH = img.width / targetRatio;
  }

  const downscale = Math.min(1, MAX_PHOTO_EDGE / Math.max(cropW, cropH));
  const outW = Math.round(cropW * downscale);
  const outH = Math.round(cropH * downscale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const sx = (img.width - cropW) / 2;
  const sy = (img.height - cropH) / 2;
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ---------- 拼图模板 ----------
const TEMPLATES = [
  { id: "v2", cells: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
  { id: "h2", cells: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
  {
    id: "l1r2",
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "t1b2",
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "grid4",
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "grid9",
    cells: (() => {
      const cells = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          cells.push({ x: col / 3, y: row / 3, w: 1 / 3, h: 1 / 3 });
        }
      }
      return cells;
    })(),
  },
];

const templateModal = document.getElementById("template-modal");
const templateGrid = document.getElementById("template-grid");

function renderTemplateGrid() {
  templateGrid.innerHTML = "";
  TEMPLATES.forEach((tpl) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "template-thumb";
    tpl.cells.forEach((cell) => {
      const seg = document.createElement("span");
      seg.className = "template-thumb-cell";
      seg.style.left = cell.x * 100 + "%";
      seg.style.top = cell.y * 100 + "%";
      seg.style.width = cell.w * 100 + "%";
      seg.style.height = cell.h * 100 + "%";
      thumb.appendChild(seg);
    });
    thumb.addEventListener("click", () => {
      templateModal.hidden = true;
      startCollageTemplate(tpl);
    });
    templateGrid.appendChild(thumb);
  });
}

document.getElementById("template-close").addEventListener("click", () => {
  templateModal.hidden = true;
});

// ---------- 拼图编辑器 ----------
const collageEditorModal = document.getElementById("collage-editor-modal");
const collageEditorGrid = document.getElementById("collage-editor-grid");
let activeTemplate = null;
let collagePhotos = [];
let collagePhotoOffsets = []; // parallel to collagePhotos: {x, y} in 0..1, like object-position
let activeCollageCellIndex = null;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function startCollageTemplate(tpl) {
  activeTemplate = tpl;
  collagePhotos = tpl.cells.map(() => null);
  collagePhotoOffsets = tpl.cells.map(() => ({ x: 0.5, y: 0.5 }));
  photoInputMode = "collage-bulk";
  photoInput.multiple = true;
  photoInput.click();
}

function attachCollageDrag(imgEl, index) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startOffset = { x: 0.5, y: 0.5 };

  imgEl.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startOffset = { ...collagePhotoOffsets[index] };
    imgEl.setPointerCapture(event.pointerId);
  });

  imgEl.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = imgEl.getBoundingClientRect();
    const scale = Math.max(rect.width / imgEl.naturalWidth, rect.height / imgEl.naturalHeight);
    const overflowX = imgEl.naturalWidth * scale - rect.width;
    const overflowY = imgEl.naturalHeight * scale - rect.height;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    const next = { ...collagePhotoOffsets[index] };
    if (overflowX > 0) next.x = clamp01(startOffset.x - deltaX / overflowX);
    if (overflowY > 0) next.y = clamp01(startOffset.y - deltaY / overflowY);
    collagePhotoOffsets[index] = next;
    imgEl.style.objectPosition = `${next.x * 100}% ${next.y * 100}%`;
  });

  imgEl.addEventListener("pointerup", (event) => {
    dragging = false;
    imgEl.releasePointerCapture(event.pointerId);
  });
}

function renderCollageEditor() {
  collageEditorGrid.innerHTML = "";
  activeTemplate.cells.forEach((cell, index) => {
    const cellEl = document.createElement("div");
    cellEl.className = "collage-cell";
    cellEl.style.left = cell.x * 100 + "%";
    cellEl.style.top = cell.y * 100 + "%";
    cellEl.style.width = cell.w * 100 + "%";
    cellEl.style.height = cell.h * 100 + "%";

    if (collagePhotos[index]) {
      const img = document.createElement("img");
      img.src = collagePhotos[index];
      const offset = collagePhotoOffsets[index] || { x: 0.5, y: 0.5 };
      img.style.objectPosition = `${offset.x * 100}% ${offset.y * 100}%`;
      attachCollageDrag(img, index);
      cellEl.appendChild(img);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "collage-cell-add";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => {
      activeCollageCellIndex = index;
      photoInputMode = "collage";
      photoInput.multiple = false;
      photoInput.click();
    });
    cellEl.appendChild(addBtn);

    collageEditorGrid.appendChild(cellEl);
  });
}

document.getElementById("collage-close").addEventListener("click", () => {
  collageEditorModal.hidden = true;
});

document.getElementById("collage-done").addEventListener("click", async () => {
  if (collagePhotos.every((p) => !p)) return;
  if (pendingPhotos.length >= MAX_PHOTOS) {
    collageEditorModal.hidden = true;
    return;
  }

  const canvasSize = 640;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf3e7";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  for (let i = 0; i < activeTemplate.cells.length; i++) {
    const src = collagePhotos[i];
    if (!src) continue;
    const cell = activeTemplate.cells[i];
    const img = await loadImage(src);
    const offset = collagePhotoOffsets[i] || { x: 0.5, y: 0.5 };
    drawCover(
      ctx,
      img,
      cell.x * canvasSize,
      cell.y * canvasSize,
      cell.w * canvasSize,
      cell.h * canvasSize,
      offset.x,
      offset.y
    );
  }

  const collageResult = canvas.toDataURL("image/jpeg", 0.85);
  pendingPhotos.push(collageResult);
  renderPhotoEditor(pendingPhotos.length - 1);
  collageEditorModal.hidden = true;
});

entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    if (pendingPhotos.length === 0) {
      await deleteEntryRemote(currentRecordDate);
    } else {
      await upsertEntryRemote(currentRecordDate, [...pendingPhotos]);
    }
  } catch (err) {
    alert("保存失败：" + (err.message || "网络或云端存储出错，请重试"));
    return;
  }

  renderRecordFeed();
  showView("record");
});

// ---------- 日记本：书架首页 + 单月长图详情 ----------
const notebookGrid = document.getElementById("notebook-grid");
const galleryEmpty = document.getElementById("gallery-empty");
const monthDetailTitle = document.getElementById("month-detail-title");
const monthDetailImage = document.getElementById("month-detail-image");

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function buildMonthMap() {
  const entries = loadEntries();
  const dates = Object.keys(entries).sort(); // ascending, so photos read chronologically within a month
  const monthMap = {};
  dates.forEach((dateStr) => {
    const monthKey = dateStr.slice(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = { photos: [], lastDate: dateStr };
    monthMap[monthKey].photos.push(...entries[dateStr].photos);
    monthMap[monthKey].lastDate = dateStr;
  });
  return monthMap;
}

async function buildLongImage(photoSrcs) {
  const images = await Promise.all(photoSrcs.map(loadImage));
  const cellSize = 360;
  const canvas = document.createElement("canvas");
  canvas.width = cellSize;
  canvas.height = cellSize * images.length;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf3e7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((img, i) => drawCover(ctx, img, 0, i * cellSize, cellSize, cellSize));
  return canvas.toDataURL("image/png");
}

function renderNotebookGrid() {
  const monthMap = buildMonthMap();
  const monthKeys = Object.keys(monthMap).sort((a, b) => (a < b ? 1 : -1));

  notebookGrid.innerHTML = "";
  galleryEmpty.hidden = monthKeys.length > 0;

  monthKeys.forEach((monthKey) => {
    const { photos, lastDate } = monthMap[monthKey];

    const item = document.createElement("div");
    item.className = "notebook-item";
    item.addEventListener("click", () => openMonthDetail(monthKey, photos));

    const cover = document.createElement("div");
    cover.className = "notebook-cover";
    const coverImg = document.createElement("img");
    coverImg.src = photos[photos.length - 1];
    cover.appendChild(coverImg);
    const spine = document.createElement("div");
    spine.className = "notebook-spine";
    cover.appendChild(spine);
    const star = document.createElement("span");
    star.className = "notebook-star";
    star.textContent = "★";
    cover.appendChild(star);
    item.appendChild(cover);

    const title = document.createElement("div");
    title.className = "notebook-title";
    title.textContent = formatMonthLabel(monthKey);
    item.appendChild(title);

    const timestamp = document.createElement("div");
    timestamp.className = "notebook-timestamp";
    timestamp.textContent = formatShortDate(lastDate);
    item.appendChild(timestamp);

    notebookGrid.appendChild(item);
  });
}

async function openMonthDetail(monthKey, photos) {
  currentMonthKey = monthKey;
  currentMonthLongImage = null;
  monthDetailTitle.textContent = formatMonthLabel(monthKey);
  monthDetailImage.removeAttribute("src");
  showView("diary-month");
  currentMonthLongImage = await buildLongImage(photos);
  monthDetailImage.src = currentMonthLongImage;
}

document.getElementById("btn-back-to-notebooks").addEventListener("click", () => {
  renderNotebookGrid();
  showView("diary-list");
});

// ---------- 日历（仅记录模式下用于选日期） ----------
const calendarMonthLabel = document.getElementById("calendar-month-label");
const calendarGrid = document.getElementById("calendar-grid");

function renderCalendar() {
  const entries = loadEntries();
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calendarMonthLabel.textContent = `${year}年${month + 1}月`;

  calendarGrid.innerHTML = "";
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatISO(new Date(year, month, day));
    const entry = entries[dateStr];
    const cell = document.createElement("div");
    cell.className = "calendar-cell" + (entry ? " has-entry" : "");

    if (entry && entry.photos[0]) {
      const img = document.createElement("img");
      img.src = entry.photos[0];
      cell.appendChild(img);
    }
    const dayLabel = document.createElement("span");
    dayLabel.className = "cell-day";
    dayLabel.textContent = day;
    cell.appendChild(dayLabel);

    cell.addEventListener("click", () => openRecordEditor(dateStr));

    calendarGrid.appendChild(cell);
  }
}

document.getElementById("btn-prev-month").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("btn-next-month").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

document.getElementById("btn-back-to-record").addEventListener("click", () => {
  if (calendarReturnView === "record") {
    renderRecordFeed();
  }
  showView(calendarReturnView);
});

// ---------- 导出（按当前浏览到的月份，导出该月全部长图） ----------
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) * offsetX;
  const sy = (img.height - sh) * offsetY;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

document.getElementById("btn-export-month").addEventListener("click", () => {
  if (!currentMonthLongImage || !currentMonthKey) return;
  downloadDataUrl(currentMonthLongImage, `plog-${currentMonthKey}.png`);
});

// ---------- 初始化 / 登录状态 ----------
async function enterApp() {
  await refreshEntriesCache();
  renderRecordFeed();
  showView("record");
}

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN") {
    enterApp();
  } else if (event === "SIGNED_OUT") {
    entriesCache = {};
    authEmailInput.value = "";
    authPasswordInput.value = "";
    showView("auth");
  }
});

async function init() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    await enterApp();
  } else {
    showView("auth");
  }
}

init();
