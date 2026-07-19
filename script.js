const STORAGE_KEY = "photo-diary-entries";

const form = document.getElementById("entry-form");
const photoInput = document.getElementById("photo-input");
const photoPreview = document.getElementById("photo-preview");
const photoPlaceholder = document.getElementById("photo-placeholder");
const textInput = document.getElementById("text-input");
const entryList = document.getElementById("entry-list");
const emptyState = document.getElementById("empty-state");

let pendingPhoto = null;

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderEntries() {
  const entries = loadEntries();
  entryList.innerHTML = "";
  emptyState.hidden = entries.length > 0;

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const card = document.createElement("article");
      card.className = "entry-card";

      if (entry.photo) {
        const img = document.createElement("img");
        img.src = entry.photo;
        img.alt = "日记照片";
        card.appendChild(img);
      }

      const body = document.createElement("div");
      body.className = "entry-body";

      const date = document.createElement("p");
      date.className = "entry-date";
      date.textContent = formatDate(entry.createdAt);
      body.appendChild(date);

      if (entry.text) {
        const text = document.createElement("p");
        text.className = "entry-text";
        text.textContent = entry.text;
        body.appendChild(text);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "entry-delete";
      deleteBtn.textContent = "删除";
      deleteBtn.addEventListener("click", () => deleteEntry(entry.id));
      body.appendChild(deleteBtn);

      card.appendChild(body);
      entryList.appendChild(card);
    });
}

function deleteEntry(id) {
  const entries = loadEntries().filter((entry) => entry.id !== id);
  saveEntries(entries);
  renderEntries();
}

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    pendingPhoto = reader.result;
    photoPreview.src = pendingPhoto;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
  };
  reader.readAsDataURL(file);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = textInput.value.trim();
  if (!text && !pendingPhoto) return;

  const entries = loadEntries();
  entries.push({
    id: crypto.randomUUID(),
    text,
    photo: pendingPhoto,
    createdAt: new Date().toISOString(),
  });
  saveEntries(entries);

  form.reset();
  pendingPhoto = null;
  photoPreview.src = "";
  photoPreview.hidden = true;
  photoPlaceholder.hidden = false;

  renderEntries();
});

renderEntries();
