const STORAGE_KEY = "plog-entries"; // { "YYYY-MM-DD": { text, photos: [dataURL,...] } }
const ONBOARD_KEY = "plog-onboarded";

const views = {
  onboarding: document.getElementById("view-onboarding"),
  record: document.getElementById("view-record"),
  "diary-list": document.getElementById("view-diary-list"),
  "diary-calendar": document.getElementById("view-diary-calendar"),
  "day-detail": document.getElementById("view-day-detail"),
};

const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");

const MAX_PHOTOS = 9;

let pendingPhotos = [];
let calendarMonth = new Date(); // first-of-month cursor
calendarMonth.setDate(1);
let detailDate = null;
let calendarOrigin = "diary"; // "diary" | "record" — controls what tapping a calendar day does

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
  const showNav = name === "record" || name === "diary-list" || name === "diary-calendar";
  bottomNav.hidden = !showNav;
  navItems.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
}

// ---------- 引导页 ----------
document.getElementById("btn-start-record").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  openRecord(todayStr());
});

document.getElementById("btn-browse-diary").addEventListener("click", () => {
  localStorage.setItem(ONBOARD_KEY, "1");
  renderTimeline();
  showView("diary-list");
});

// ---------- 底部 Tab ----------
navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "record") openRecord(todayStr());
    if (view === "diary-list") {
      renderTimeline();
      showView("diary-list");
    }
  });
});

// ---------- 记录页 ----------
const recordDateInput = document.getElementById("record-date");
const photoCarousel = document.getElementById("photo-carousel");
const photoInput = document.getElementById("photo-input");
const textInput = document.getElementById("text-input");
const entryForm = document.getElementById("entry-form");

function openRecord(dateStr) {
  recordDateInput.value = dateStr;
  loadRecordForm(dateStr);
  showView("record");
}

function loadRecordForm(dateStr) {
  const entries = loadEntries();
  const entry = entries[dateStr];
  pendingPhotos = entry ? [...entry.photos] : [];
  textInput.value = entry ? entry.text : "";
  renderPhotoCarousel();
}

recordDateInput.addEventListener("change", () => {
  loadRecordForm(recordDateInput.value);
});

document.getElementById("btn-open-calendar-picker").addEventListener("click", () => {
  calendarOrigin = "record";
  renderCalendar();
  showView("diary-calendar");
});

function renderPhotoCarousel(scrollToEnd) {
  photoCarousel.innerHTML = "";

  pendingPhotos.forEach((src, index) => {
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
    photoCarousel.appendChild(card);
  });

  if (pendingPhotos.length < MAX_PHOTOS) {
    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "photo-card add-card";
    addCard.textContent = "+";
    addCard.addEventListener("click", () => photoInput.click());
    photoCarousel.appendChild(addCard);
  }

  if (scrollToEnd) {
    photoCarousel.scrollTo({ left: photoCarousel.scrollWidth, behavior: "smooth" });
  }
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhotos.push(reader.result);
    renderPhotoCarousel(true);
    photoInput.value = "";
  };
  reader.readAsDataURL(file);
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const dateStr = recordDateInput.value || todayStr();
  const text = textInput.value.trim();
  if (!text && pendingPhotos.length === 0) return;

  const entries = loadEntries();
  entries[dateStr] = { text, photos: [...pendingPhotos] };
  saveEntries(entries);

  renderTimeline();
  showView("diary-list");
});

// ---------- 时间线 ----------
const timelineList = document.getElementById("timeline-list");
const timelineEmpty = document.getElementById("timeline-empty");

function renderTimeline() {
  const entries = loadEntries();
  const dates = Object.keys(entries).sort((a, b) => (a < b ? 1 : -1));
  timelineList.innerHTML = "";
  timelineEmpty.hidden = dates.length > 0;

  dates.forEach((dateStr) => {
    const entry = entries[dateStr];
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.addEventListener("click", () => openDayDetail(dateStr));

    const dateEl = document.createElement("div");
    dateEl.className = "timeline-date";
    dateEl.textContent = formatDateLabel(dateStr);
    row.appendChild(dateEl);

    const thumb = document.createElement("div");
    thumb.className = "timeline-thumb" + (entry.photos.length <= 1 ? " single" : "");
    entry.photos.slice(0, 4).forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      thumb.appendChild(img);
    });
    if (entry.photos.length > 0) {
      const count = document.createElement("span");
      count.className = "timeline-count";
      count.textContent = entry.photos.length;
      thumb.appendChild(count);
    }
    row.appendChild(thumb);

    const textEl = document.createElement("div");
    textEl.className = "timeline-text";
    textEl.textContent = entry.text;
    row.appendChild(textEl);

    timelineList.appendChild(row);
  });
}

function formatDateLabel(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

document.getElementById("btn-switch-calendar").addEventListener("click", () => {
  calendarOrigin = "diary";
  renderCalendar();
  showView("diary-calendar");
});

// ---------- 日历 ----------
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

    cell.addEventListener("click", () => {
      if (calendarOrigin === "record") {
        openRecord(dateStr);
      } else if (entry) {
        openDayDetail(dateStr);
      } else {
        openRecord(dateStr);
      }
    });

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

document.getElementById("btn-switch-list").addEventListener("click", () => {
  renderTimeline();
  showView("diary-list");
});

// ---------- 单日详情 ----------
const detailDateLabel = document.getElementById("detail-date-label");
const detailPhotos = document.getElementById("detail-photos");
const detailText = document.getElementById("detail-text");

function openDayDetail(dateStr) {
  const entries = loadEntries();
  const entry = entries[dateStr];
  if (!entry) return;

  detailDate = dateStr;
  detailDateLabel.textContent = formatDateLabel(dateStr);
  detailPhotos.innerHTML = "";
  entry.photos.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    detailPhotos.appendChild(img);
  });
  detailText.textContent = entry.text;
  showView("day-detail");
}

document.getElementById("btn-back-from-detail").addEventListener("click", () => {
  renderTimeline();
  showView("diary-list");
});

document.getElementById("btn-delete-entry").addEventListener("click", () => {
  if (!detailDate) return;
  if (!confirm("确定要删除这天的日记吗？")) return;
  const entries = loadEntries();
  delete entries[detailDate];
  saveEntries(entries);
  renderTimeline();
  showView("diary-list");
});

// ---------- 导出 ----------
const exportModal = document.getElementById("export-modal");
const exportCanvas = document.getElementById("export-canvas");

document.getElementById("btn-export").addEventListener("click", () => {
  exportModal.hidden = false;
});

document.getElementById("export-close").addEventListener("click", () => {
  exportModal.hidden = true;
});

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

function downloadCanvas(filename) {
  exportCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

document.getElementById("export-single").addEventListener("click", async () => {
  const entries = loadEntries();
  const entry = entries[detailDate];
  if (!entry || entry.photos.length === 0) return;

  const images = await Promise.all(entry.photos.map(loadImage));
  const cellW = 640;
  const cellH = 640;
  const captionH = 60;
  exportCanvas.width = cellW;
  exportCanvas.height = cellH * images.length + captionH;

  const ctx = exportCanvas.getContext("2d");
  ctx.fillStyle = "#faf3e7";
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  images.forEach((img, i) => {
    drawCover(ctx, img, 0, i * cellH, cellW, cellH);
  });

  ctx.fillStyle = "#4a3b2a";
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatDateLabel(detailDate), cellW / 2, cellH * images.length + captionH / 2 + 10);

  downloadCanvas(`plog-${detailDate}.png`);
  exportModal.hidden = true;
});

document.getElementById("export-grid").addEventListener("click", async () => {
  const entries = loadEntries();
  const entry = entries[detailDate];
  if (!entry || entry.photos.length === 0) return;

  const photos = entry.photos.slice(0, 9);
  const images = await Promise.all(photos.map(loadImage));

  const cell = 300;
  exportCanvas.width = cell * 3;
  exportCanvas.height = cell * 3;

  const ctx = exportCanvas.getContext("2d");
  ctx.fillStyle = "#faf3e7";
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    if (images[i]) {
      drawCover(ctx, images[i], col * cell, row * cell, cell, cell);
    }
  }

  downloadCanvas(`plog-${detailDate}-grid.png`);
  exportModal.hidden = true;
});

// ---------- 初始化 ----------
function init() {
  if (localStorage.getItem(ONBOARD_KEY)) {
    renderTimeline();
    showView("diary-list");
  } else {
    showView("onboarding");
  }
}

init();
