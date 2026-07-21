const STORAGE_KEY = "plog-entries"; // { "YYYY-MM-DD": { photos: [dataURL,...] } }
const ONBOARD_KEY = "plog-onboarded";

const views = {
  onboarding: document.getElementById("view-onboarding"),
  record: document.getElementById("view-record"),
  "record-editor": document.getElementById("view-record-editor"),
  "diary-list": document.getElementById("view-diary-list"),
  "diary-month": document.getElementById("view-diary-month"),
  "diary-calendar": document.getElementById("view-diary-calendar"),
};

const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");

const MAX_PHOTOS = 18;
const CANVAS_W = 720;
const CANVAS_H = 960; // 3:4

let pendingPhotos = [];
let pendingPhotoSources = []; // parallel to pendingPhotos: original upload, used for re-zooming
let pendingPhotoTransforms = []; // parallel to pendingPhotos: { zoom, x, y }
let calendarMonth = new Date(); // first-of-month cursor
calendarMonth.setDate(1);
let currentMonthKey = null;
let currentMonthLongImage = null;
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

// ---------- 引导页 ----------
document.getElementById("btn-start-record").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  openRecordEditor(todayStr());
});

document.getElementById("btn-browse-diary").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  renderNotebookGrid();
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
const photoCountBadge = document.getElementById("photo-count-badge");
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
  pendingPhotoSources = entry ? [...entry.photos] : [];
  pendingPhotoTransforms = entry ? entry.photos.map(() => ({ zoom: 1, x: 0.5, y: 0.5 })) : [];
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
  photoCountBadge.textContent = `${pendingPhotos.length}/${MAX_PHOTOS}`;

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
    img.addEventListener("click", () => openZoomEditor(index));
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      pendingPhotos.splice(index, 1);
      pendingPhotoSources.splice(index, 1);
      pendingPhotoTransforms.splice(index, 1);
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
    const transform = { zoom: 1, x: 0.5, y: 0.5 };
    const composed = await renderPhotoTransform(raw, transform);
    pendingPhotos.push(composed);
    pendingPhotoSources.push(raw);
    pendingPhotoTransforms.push(transform);
  }
  renderPhotoCarousel(true);
  photoInput.value = "";
});

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function renderPhotoTransform(srcDataUrl, transform) {
  const img = await loadImage(srcDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const containScale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
  const scale = containScale * transform.zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const overflowX = Math.max(0, dw - CANVAS_W);
  const overflowY = Math.max(0, dh - CANVAS_H);
  const dx = overflowX > 0 ? -overflowX * transform.x : (CANVAS_W - dw) / 2;
  const dy = overflowY > 0 ? -overflowY * transform.y : (CANVAS_H - dh) / 2;

  ctx.drawImage(img, dx, dy, dw, dh);
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
  pendingPhotoSources.push(collageResult);
  pendingPhotoTransforms.push({ zoom: 1, x: 0.5, y: 0.5 });
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

  const withText = canvas.toDataURL("image/jpeg", 0.85);
  pendingPhotos[textEditorIndex] = withText;
  pendingPhotoSources[textEditorIndex] = withText;
  renderPhotoCarousel();
});

// ---------- 缩放照片 ----------
const zoomEditorModal = document.getElementById("zoom-editor-modal");
const zoomEditorPreview = document.getElementById("zoom-editor-preview");
const zoomEditorImage = document.getElementById("zoom-editor-image");
const zoomEditorScale = document.getElementById("zoom-editor-scale");
let zoomEditorIndex = null;
let zoomTransform = { zoom: 1, x: 0.5, y: 0.5 };

function openZoomEditor(index) {
  zoomEditorIndex = index;
  zoomTransform = { ...pendingPhotoTransforms[index] };
  zoomEditorScale.value = Math.round(zoomTransform.zoom * 100);
  zoomEditorImage.onload = () => updateZoomPreview();
  zoomEditorImage.src = pendingPhotoSources[index];
  zoomEditorModal.hidden = false;
}

function updateZoomPreview() {
  const previewW = zoomEditorPreview.clientWidth;
  const previewH = zoomEditorPreview.clientHeight;
  const iw = zoomEditorImage.naturalWidth;
  const ih = zoomEditorImage.naturalHeight;
  if (!iw || !ih) return;
  const containScale = Math.min(previewW / iw, previewH / ih);
  const scale = containScale * zoomTransform.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const overflowX = Math.max(0, dw - previewW);
  const overflowY = Math.max(0, dh - previewH);
  const dx = overflowX > 0 ? -overflowX * zoomTransform.x : (previewW - dw) / 2;
  const dy = overflowY > 0 ? -overflowY * zoomTransform.y : (previewH - dh) / 2;
  zoomEditorImage.style.width = `${dw}px`;
  zoomEditorImage.style.height = `${dh}px`;
  zoomEditorImage.style.left = `${dx}px`;
  zoomEditorImage.style.top = `${dy}px`;
}

zoomEditorScale.addEventListener("input", () => {
  zoomTransform.zoom = Number(zoomEditorScale.value) / 100;
  updateZoomPreview();
});

let draggingZoom = false;
let zoomDragStartX = 0;
let zoomDragStartY = 0;
let zoomDragStartOffset = { x: 0.5, y: 0.5 };

zoomEditorImage.addEventListener("pointerdown", (event) => {
  draggingZoom = true;
  zoomDragStartX = event.clientX;
  zoomDragStartY = event.clientY;
  zoomDragStartOffset = { ...zoomTransform };
  zoomEditorImage.setPointerCapture(event.pointerId);
});

zoomEditorImage.addEventListener("pointermove", (event) => {
  if (!draggingZoom) return;
  const previewW = zoomEditorPreview.clientWidth;
  const previewH = zoomEditorPreview.clientHeight;
  const iw = zoomEditorImage.naturalWidth;
  const ih = zoomEditorImage.naturalHeight;
  const containScale = Math.min(previewW / iw, previewH / ih);
  const scale = containScale * zoomTransform.zoom;
  const overflowX = Math.max(0, iw * scale - previewW);
  const overflowY = Math.max(0, ih * scale - previewH);
  const deltaX = event.clientX - zoomDragStartX;
  const deltaY = event.clientY - zoomDragStartY;

  if (overflowX > 0) zoomTransform.x = clamp01(zoomDragStartOffset.x - deltaX / overflowX);
  if (overflowY > 0) zoomTransform.y = clamp01(zoomDragStartOffset.y - deltaY / overflowY);
  updateZoomPreview();
});

zoomEditorImage.addEventListener("pointerup", (event) => {
  draggingZoom = false;
  zoomEditorImage.releasePointerCapture(event.pointerId);
});

document.getElementById("zoom-editor-cancel").addEventListener("click", () => {
  zoomEditorModal.hidden = true;
});

document.getElementById("zoom-editor-confirm").addEventListener("click", async () => {
  pendingPhotoTransforms[zoomEditorIndex] = { ...zoomTransform };
  pendingPhotos[zoomEditorIndex] = await renderPhotoTransform(pendingPhotoSources[zoomEditorIndex], zoomTransform);
  zoomEditorModal.hidden = true;
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

  try {
    saveEntries(entries);
  } catch (err) {
    alert("保存失败：本地存储空间不够了，试试删掉几张照片，或者给部分照片换成压缩率更高的图片再保存。");
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

// ---------- 初始化 ----------
function init() {
  if (localStorage.getItem(ONBOARD_KEY)) {
    renderNotebookGrid();
    showView("diary-list");
  } else {
    showView("onboarding");
  }
}

init();
