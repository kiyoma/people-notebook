import Fuse from 'fuse.js';
import { addEntry, listEntries, updateEntry, deleteEntry, exportAll, bulkImport } from './db.js';

const els = {};
let entries = [];
let fuse = null;

function $(sel) { return document.querySelector(sel); }

function debounce(fn, wait = 200) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function parseTags(s) {
  return (s || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function buildFuse() {
  fuse = new Fuse(entries, {
    keys: [
      { name: 'name', weight: 0.5 },
      { name: 'notes', weight: 0.3 },
      { name: 'whereMet', weight: 0.1 },
      { name: 'tags', weight: 0.1 },
    ],
    threshold: 0.35,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

function highlightValue(value, match) {
  if (!match || typeof value !== 'string') return escapeHtml(String(value ?? ''));
  const indices = match.indices || [];
  let last = 0;
  let out = '';
  for (const [s, e] of indices) {
    out += escapeHtml(value.slice(last, s));
    out += `<mark>${escapeHtml(value.slice(s, e + 1))}</mark>`;
    last = e + 1;
  }
  out += escapeHtml(value.slice(last));
  return out;
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function findFieldMatch(matches, key, arrayIndex = undefined) {
  if (!matches) return null;
  for (const m of matches) {
    if (m.key === key) {
      if (typeof arrayIndex === 'number') {
        if (m.arrayIndex === arrayIndex) return m;
      } else {
        return m;
      }
    }
  }
  return null;
}

async function refresh() {
  entries = await listEntries();
  buildFuse();
  renderList(entries);
}

function renderList(items, fuseResults = null) {
  const container = els.results;
  container.innerHTML = '';

  const rows = fuseResults ? fuseResults : items.map((item) => ({ item }));

  if (!rows.length) {
    container.innerHTML = '<p class="muted">データはまだありません。</p>';
    return;
  }

  for (const r of rows) {
    const entry = r.item;
    const matches = r.matches || [];

    const nameHtml = highlightValue(entry.name || '', findFieldMatch(matches, 'name'));
    const notesHtml = highlightValue(entry.notes || '', findFieldMatch(matches, 'notes'));
    const whereHtml = highlightValue(entry.whereMet || '', findFieldMatch(matches, 'whereMet'));

    const tagSpans = (entry.tags || []).map((t, i) => {
      const m = findFieldMatch(matches, 'tags', i);
      const inner = highlightValue(String(t), m);
      return `<span class="tag">${inner}</span>`;
    }).join('');

    const when = entry.whenMet ? ` / ${escapeHtml(entry.whenMet)}` : '';

    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.id = entry.id;
    row.innerHTML = `
      <div>
        <h3>${nameHtml}</h3>
        <div class="meta">${whereHtml}${when}</div>
        ${entry.notes ? `<div class="notes">${notesHtml}</div>` : ''}
        <div class="tags">${tagSpans}</div>
      </div>
      <div class="actions">
        <button data-action="edit">編集</button>
        <button data-action="delete">削除</button>
      </div>
    `;

    row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (confirm('削除しますか？')) {
        await deleteEntry(entry.id);
        await refresh();
      }
    });

    row.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(row, entry));

    container.appendChild(row);
  }
}

function startEdit(rowEl, entry) {
  const form = document.createElement('div');
  form.className = 'row';
  form.dataset.id = entry.id;
  form.innerHTML = `
    <div class="grid">
      <label>
        名前
        <input name="name" value="${escapeHtml(entry.name)}" required />
      </label>
      <label>
        どこで会った
        <input name="whereMet" value="${escapeHtml(entry.whereMet || '')}" />
      </label>
      <label>
        いつ会った
        <input name="whenMet" type="date" value="${escapeHtml(entry.whenMet || '')}" />
      </label>
      <label class="wide">
        メモ
        <textarea name="notes" rows="2">${escapeHtml(entry.notes || '')}</textarea>
      </label>
      <label class="wide">
        タグ（カンマ区切り）
        <input name="tags" value="${escapeHtml((entry.tags || []).join(', '))}" />
      </label>
    </div>
    <div class="actions">
      <button data-action="save" class="primary">保存</button>
      <button data-action="cancel">キャンセル</button>
    </div>
  `;

  const save = form.querySelector('[data-action="save"]');
  const cancel = form.querySelector('[data-action="cancel"]');

  save.addEventListener('click', async () => {
    const f = form;
    const name = f.querySelector('input[name="name"]').value.trim();
    if (!name) { alert('名前は必須です'); return; }
    const updates = {
      name,
      notes: f.querySelector('textarea[name="notes"]').value.trim(),
      whereMet: f.querySelector('input[name="whereMet"]').value.trim(),
      whenMet: f.querySelector('input[name="whenMet"]').value,
      tags: parseTags(f.querySelector('input[name="tags"]').value),
    };
    await updateEntry(entry.id, updates);
    await refresh();
  });

  cancel.addEventListener('click', async () => {
    await refresh();
  });

  rowEl.replaceWith(form);
}

async function handleAdd(e) {
  e.preventDefault();
  const name = els.name.value.trim();
  if (!name) { alert('名前は必須です'); return; }
  const data = {
    name,
    notes: els.notes.value.trim(),
    whereMet: els.whereMet.value.trim(),
    whenMet: els.whenMet.value,
    tags: parseTags(els.tags.value),
  };
  await addEntry(data);
  e.target.reset();
  await refresh();
}

const doSearch = debounce(() => {
  const q = els.search.value.trim();
  if (!q) {
    renderList(entries);
    return;
  }
  const results = fuse.search(q).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  renderList([], results);
}, 200);

async function exportJSON() {
  const data = await exportAll();
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'people-export.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user cancelled
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'people-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importJSON() {
  const readFile = async (file) => {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { alert('JSON のパースに失敗しました'); return; }
    if (!Array.isArray(data)) { alert('JSON は配列である必要があります'); return; }
    await bulkImport(data, { mode: 'merge' });
    await refresh();
  };

  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      await readFile(file);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user cancelled
    }
  }
  // Fallback to hidden input
  els.fileInput.onchange = async () => {
    const file = els.fileInput.files[0];
    if (file) await readFile(file);
    els.fileInput.value = '';
  };
  els.fileInput.click();
}

async function init() {
  els.form = $('#add-form');
  els.name = $('#name');
  els.notes = $('#notes');
  els.whereMet = $('#whereMet');
  els.whenMet = $('#whenMet');
  els.tags = $('#tags');
  els.search = $('#search');
  els.results = $('#results');
  els.exportBtn = $('#exportBtn');
  els.importBtn = $('#importBtn');
  els.fileInput = $('#fileInput');

  els.form.addEventListener('submit', handleAdd);
  els.search.addEventListener('input', doSearch);
  els.exportBtn.addEventListener('click', exportJSON);
  els.importBtn.addEventListener('click', importJSON);

  await refresh();
}

document.addEventListener('DOMContentLoaded', init);

