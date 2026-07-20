const STORAGE_KEY = "plog-entries"; // { "YYYY-MM-DD": { photos: [dataURL,...] } }
const ONBOARD_KEY = "plog-onboarded";

const views = {
  onboarding: document.getElementById("view-onboarding"),
  record: document.getElementById("view-record"),
  "record-editor": document.getElementById("view-record-editor"),
  "diary-list": document.getElementById("view-diary-list"),
  "diary-calendar": document.getElementById("view-diary-calendar"),
};

const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");

const MAX_PHOTOS = 9;

let pendingPhotos = [];
let calendarMonth = new Date(); // first-of-month cursor
calendarMonth.setDate(1);
let monthLongImages = {}; // monthKey -> [dataURL, ...] for the current gallery render
let calendarReturnView = "record";

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
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle("active", key === name);
  });
  const showNav = name === "record" || name === "record-editor" || name === "diary-list" || name === "diary-calendar";
  bottomNav.hidden = !showNav;
  navItems.forEach((btn) => {
    const isRecordTab = btn.dataset.view === "record" && (name === "record" || name === "record-editor");
    btn.classList.toggle("active", btn.dataset.view === name || isRecordTab);
  });
}

// ---------- 引导页 ----------
document.getElementById("btn-start-record").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  openRecordEditor(todayStr());
});

document.getElementById("btn-browse-diary").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  renderMonthGallery();
  showView("diary-list");
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
      renderMonthGallery();
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
    entry.photos.slice(0, 9).forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      grid.appendChild(img);
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
const photoCarousel = document.getElementById("photo-carousel");
const photoInput = document.getElementById("photo-input");
const entryForm = document.getElementById("entry-form");
const btnAddPhoto = document.getElementById("btn-add-photo");
const recordDateLabel = document.getElementById("record-date-label");

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
  renderPhotoCarousel();
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

function renderPhotoCarousel(scrollToEnd) {
  photoCarousel.innerHTML = "";
  btnAddPhoto.hidden = pendingPhotos.length >= MAX_PHOTOS;

  if (pendingPhotos.length === 0) {
    const blank = document.createElement("div");
    blank.className = "photo-card blank";
    photoCarousel.appendChild(blank);
    return;
  }

  pendingPhotos.forEach((src, index) => {
    const item = document.createElement("div");
    item.className = "photo-item";

    const card = document.createElement("div");
    card.className = "photo-card";
    const img = document.createElement("img");
    img.src = src;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      pendingPhotos.splice(index, 1);
      renderPhotoCarousel();
    });
    card.appendChild(img);
    card.appendChild(removeBtn);
    item.appendChild(card);

    const footer = document.createElement("div");
    footer.className = "photo-card-footer";
    const textBtn = document.createElement("button");
    textBtn.type = "button";
    textBtn.className = "photo-text-btn";
    textBtn.textContent = "Aa 添加文字";
    textBtn.addEventListener("click", () => openTextEditor(index));
    footer.appendChild(textBtn);
    item.appendChild(footer);

    photoCarousel.appendChild(item);
  });

  if (scrollToEnd) {
    photoCarousel.scrollTo({ left: photoCarousel.scrollWidth, behavior: "smooth" });
  }
}

// ---------- 添加方式菜单 ----------
const addMenuModal = document.getElementById("add-menu-modal");
let photoInputMode = "single"; // "single" | "multi" | "collage"

btnAddPhoto.addEventListener("click", () => {
  addMenuModal.hidden = false;
});

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

photoInput.addEventListener("change", () => {
  const files = Array.from(photoInput.files);
  if (files.length === 0) return;

  if (photoInputMode === "collage") {
    const reader = new FileReader();
    reader.onload = () => {
      collagePhotos[activeCollageCellIndex] = reader.result;
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
  let remaining = toAdd.length;
  if (remaining === 0) {
    photoInput.value = "";
    return;
  }
  toAdd.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      pendingPhotos.push(reader.result);
      remaining -= 1;
      if (remaining === 0) {
        renderPhotoCarousel(true);
        photoInput.value = "";
      }
    };
    reader.readAsDataURL(file);
  });
});

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
let activeCollageCellIndex = null;

function startCollageTemplate(tpl) {
  activeTemplate = tpl;
  collagePhotos = tpl.cells.map(() => null);
  photoInputMode = "collage-bulk";
  photoInput.multiple = true;
  photoInput.click();
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
    drawCover(ctx, img, cell.x * canvasSize, cell.y * canvasSize, cell.w * canvasSize, cell.h * canvasSize);
  }

  pendingPhotos.push(canvas.toDataURL("image/png"));
  renderPhotoCarousel(true);
  collageEditorModal.hidden = true;
});

// ---------- 给照片加文字 ----------
const textEditorModal = document.getElementById("text-editor-modal");
const textEditorPreview = document.getElementById("text-editor-preview");
const textEditorImage = document.getElementById("text-editor-image");
const textEditorOverlayText = document.getElementById("text-editor-overlay-text");
const textEditorInput = document.getElementById("text-editor-input");
const textEditorSize = document.getElementById("text-editor-size");
let textEditorIndex = null;
let textPos = { x: 0.5, y: 0.9 }; // fraction of the preview box, drag target
let textSizeFrac = 0.055; // font size as a fraction of the photo's width

function openTextEditor(index) {
  textEditorIndex = index;
  textEditorImage.src = pendingPhotos[index];
  textEditorInput.value = "";
  textEditorOverlayText.textContent = "";
  textPos = { x: 0.5, y: 0.9 };
  textSizeFrac = 0.055;
  textEditorSize.value = 55;
  updateOverlayPosition();
  updateOverlaySize();
  textEditorModal.hidden = false;
}

function updateOverlayPosition() {
  textEditorOverlayText.style.left = `${textPos.x * 100}%`;
  textEditorOverlayText.style.top = `${textPos.y * 100}%`;
}

function updateOverlaySize() {
  const px = Math.max(10, textEditorPreview.clientWidth * textSizeFrac);
  textEditorOverlayText.style.fontSize = `${px}px`;
}

textEditorInput.addEventListener("input", () => {
  textEditorOverlayText.textContent = textEditorInput.value;
});

textEditorSize.addEventListener("input", () => {
  textSizeFrac = Number(textEditorSize.value) / 1000;
  updateOverlaySize();
});

let draggingText = false;

textEditorOverlayText.addEventListener("pointerdown", (event) => {
  draggingText = true;
  textEditorOverlayText.setPointerCapture(event.pointerId);
});

textEditorOverlayText.addEventListener("pointermove", (event) => {
  if (!draggingText) return;
  const rect = textEditorPreview.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  textPos = { x, y };
  updateOverlayPosition();
});

textEditorOverlayText.addEventListener("pointerup", (event) => {
  draggingText = false;
  textEditorOverlayText.releasePointerCapture(event.pointerId);
});

document.getElementById("text-editor-cancel").addEventListener("click", () => {
  textEditorModal.hidden = true;
});

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  text.split("\n").forEach((paragraph) => {
    let line = "";
    for (const ch of paragraph) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  });
  return lines;
}

document.getElementById("text-editor-confirm").addEventListener("click", async () => {
  const text = textEditorInput.value.trim();
  textEditorModal.hidden = true;
  if (!text) return;

  const img = await loadImage(pendingPhotos[textEditorIndex]);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const fontSize = Math.max(14, Math.round(img.width * textSizeFrac));
  ctx.font = `700 ${fontSize}px -apple-system, "PingFang SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";

  const maxWidth = img.width * 0.86;
  const lines = wrapTextLines(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.3;
  const centerX = textPos.x * img.width;
  const centerY = textPos.y * img.height;
  const startY = centerY - (lineHeight * (lines.length - 1)) / 2 + fontSize * 0.35;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.lineWidth = fontSize * 0.18;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.strokeText(line, centerX, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(line, centerX, y);
  });

  pendingPhotos[textEditorIndex] = canvas.toDataURL("image/png");
  renderPhotoCarousel();
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const entries = loadEntries();
  if (pendingPhotos.length === 0) {
    delete entries[currentRecordDate];
  } else {
    entries[currentRecordDate] = { photos: [...pendingPhotos] };
  }
  saveEntries(entries);

  renderRecordFeed();
  showView("record");
});

// ---------- 日记本：按月长图预览 ----------
const monthGallery = document.getElementById("month-gallery");
const galleryEmpty = document.getElementById("gallery-empty");

function distributeEven(total, groups) {
  const base = Math.floor(total / groups);
  const remainder = total % groups;
  const sizes = [];
  for (let i = 0; i < groups; i++) {
    sizes.push(base + (i < remainder ? 1 : 0));
  }
  return sizes;
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return `${y}年${parseInt(m, 10)}月`;
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

async function renderMonthGallery() {
  const entries = loadEntries();
  const dates = Object.keys(entries).sort(); // ascending, so photos read chronologically within a month

  const monthMap = {};
  dates.forEach((dateStr) => {
    const monthKey = dateStr.slice(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = [];
    monthMap[monthKey].push(...entries[dateStr].photos);
  });

  const monthKeys = Object.keys(monthMap).sort((a, b) => (a < b ? 1 : -1));

  monthGallery.innerHTML = "";
  galleryEmpty.hidden = monthKeys.length > 0;
  monthLongImages = {};

  for (const monthKey of monthKeys) {
    const photos = monthMap[monthKey];
    const sizes = distributeEven(photos.length, Math.min(9, photos.length));

    const section = document.createElement("div");
    section.className = "month-section";
    section.dataset.monthKey = monthKey;

    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = formatMonthLabel(monthKey);
    section.appendChild(title);

    const carousel = document.createElement("div");
    carousel.className = "month-carousel";
    section.appendChild(carousel);
    monthGallery.appendChild(section);

    const longImages = [];
    let offset = 0;
    for (const size of sizes) {
      const groupPhotos = photos.slice(offset, offset + size);
      offset += size;
      const dataUrl = await buildLongImage(groupPhotos);
      longImages.push(dataUrl);

      const img = document.createElement("img");
      img.className = "month-card";
      img.src = dataUrl;
      carousel.appendChild(img);
    }

    monthLongImages[monthKey] = longImages;
  }
}

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

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function findActiveMonthSection() {
  const sections = [...document.querySelectorAll(".month-section")];
  let active = null;
  let minDist = Infinity;
  sections.forEach((sec) => {
    const rect = sec.getBoundingClientRect();
    const dist = Math.abs(rect.top);
    if (rect.bottom > 0 && dist < minDist) {
      minDist = dist;
      active = sec;
    }
  });
  return active;
}

document.getElementById("btn-export-month").addEventListener("click", () => {
  const active = findActiveMonthSection();
  if (!active) return;
  const monthKey = active.dataset.monthKey;
  const images = monthLongImages[monthKey] || [];
  images.forEach((dataUrl, i) => {
    downloadDataUrl(dataUrl, `plog-${monthKey}-part${i + 1}.png`);
  });
});

// ---------- 初始化 ----------
function init() {
  if (localStorage.getItem(ONBOARD_KEY)) {
    renderMonthGallery();
    showView("diary-list");
  } else {
    showView("onboarding");
  }
}

init();
