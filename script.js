const STORAGE_KEY = "plog-entries"; // { "YYYY-MM-DD": { photos: [dataURL,...] } }
const ONBOARD_KEY = "plog-onboarded";

const views = {
  onboarding: document.getElementById("view-onboarding"),
  record: document.getElementById("view-record"),
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
  renderMonthGallery();
  showView("diary-list");
});

// ---------- 底部 Tab ----------
navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "record") openRecord(todayStr());
    if (view === "diary-list") {
      renderMonthGallery();
      showView("diary-list");
    }
  });
});

// ---------- 记录页 ----------
const recordDateInput = document.getElementById("record-date");
const photoCarousel = document.getElementById("photo-carousel");
const photoInput = document.getElementById("photo-input");
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
  renderPhotoCarousel();
}

recordDateInput.addEventListener("change", () => {
  loadRecordForm(recordDateInput.value);
});

document.getElementById("btn-open-calendar-picker").addEventListener("click", () => {
  renderCalendar();
  showView("diary-calendar");
});

function renderPhotoCarousel(scrollToEnd) {
  photoCarousel.innerHTML = "";

  if (pendingPhotos.length === 0) {
    photoCarousel.classList.add("empty");
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "empty-add-btn";
    addBtn.textContent = "+";
    addBtn.addEventListener("click", () => photoInput.click());
    photoCarousel.appendChild(addBtn);
    return;
  }

  photoCarousel.classList.remove("empty");
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
  if (pendingPhotos.length === 0) return;

  const entries = loadEntries();
  entries[dateStr] = { photos: [...pendingPhotos] };
  saveEntries(entries);
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

    cell.addEventListener("click", () => openRecord(dateStr));

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
  showView("record");
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
