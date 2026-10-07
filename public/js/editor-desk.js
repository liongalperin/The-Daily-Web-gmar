/**
 * Editor desk (Vanilla JS + Ajax). Runs on two pages:
 *
 *   /editor               - status tabs and search (GET /api/admin/articles), "Load more",
 *                           delete with an inline confirmation (DELETE /api/admin/articles/:id)
 *   /editor/articles/:id  - review: highlights what changed between the published version and the
 *                           submitted one (word-level diff), approve / return with note / delete
 *
 * Depends on window.DW from main.js.
 */
(function () {
  'use strict';

  const DW = window.DW;
  if (!DW) return;
  const t = DW.t;
  const PAGE_SIZE = 20;

  function errorMessage(error) {
    return DW.errorText(error);
  }

  function statusBadge(status) {
    const template = document.getElementById('status-template-' + status);
    return template ? template.content.firstElementChild.cloneNode(true) : document.createTextNode(status);
  }

  /**
   * Inline "Are you sure?" instead of window.confirm(): shows the confirm template inside `host`
   * and resolves true (Delete) or false (Cancel).
   */
  function confirmInline(host) {
    return new Promise(function (resolve) {
      const box = document.getElementById('confirm-template').content.firstElementChild.cloneNode(true);
      const hidden = Array.prototype.filter.call(host.children, function (child) { return !child.hidden; });
      hidden.forEach(function (child) { child.hidden = true; });
      host.appendChild(box);
      box.querySelector('[data-confirm-no]').focus();

      function finish(answer) {
        box.remove();
        hidden.forEach(function (child) { child.hidden = false; });
        resolve(answer);
      }
      box.querySelector('[data-confirm-yes]').addEventListener('click', function () { finish(true); });
      box.querySelector('[data-confirm-no]').addEventListener('click', function () { finish(false); });
      box.addEventListener('keydown', function (event) { if (event.key === 'Escape') finish(false); });
    });
  }

  function deleteArticle(id) {
    return DW.api('/api/admin/articles/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  /* ======================================================================
     Desk list
     ====================================================================== */
  function initDesk(root) {
    const rows = document.getElementById('desk-rows');
    const tabs = document.getElementById('desk-tabs');
    const form = document.getElementById('desk-search');
    const search = document.getElementById('desk-q');
    const more = document.getElementById('desk-more');
    const loader = document.getElementById('desk-loader');
    const empty = document.getElementById('desk-empty');
    const errorBox = document.getElementById('desk-error');
    const template = document.getElementById('desk-row-template');

    const state = { status: form.elements.status.value || 'Pending', q: search.value.trim(), page: 1 };
    let controller = null;

    function normalize(item) {
      const draft = item.draftVersion || {};
      const pub = item.publicVersion || {};
      const author = item.author || item.authorId;
      return {
        id: String(item._id || item.id),
        status: item.status,
        category: item.category || '',
        title: item.title || draft.title || pub.title || '',
        authorName: item.authorName || (author && author.username) || '',
        updatedAt: item.updatedAt || item.submittedAt || pub.publishedAt,
        isLive: typeof item.isLive === 'boolean' ? item.isLive : Boolean(pub.publishedAt || item.publishedAt)
      };
    }

    function renderRow(item) {
      const a = normalize(item);
      const row = template.content.firstElementChild.cloneNode(true);
      row.dataset.id = a.id;
      row.dataset.status = a.status;
      row.querySelector('.status').replaceWith(statusBadge(a.status));

      const flag = row.querySelector('.row__flag');
      flag.hidden = a.status !== 'Pending';
      flag.textContent = '· ' + (a.isLive ? t('status.isUpdate') : t('status.isNew'));

      const link = row.querySelector('.row__title a');
      link.href = '/editor/articles/' + encodeURIComponent(a.id);
      link.textContent = a.title || t('desk.untitled');

      const section = row.querySelector('.kicker__sec');
      section.dataset.section = a.category;
      section.textContent = a.category ? t('cat.' + a.category) : '';
      row.querySelector('.row__author').textContent = t('desk.by', { name: a.authorName });
      const time = row.querySelector('.row__time');
      time.dateTime = DW.fmt.iso(a.updatedAt);
      time.textContent = DW.fmt.date(a.updatedAt);

      const review = row.querySelector('.row__review');
      review.href = link.href;
      review.textContent = a.status === 'Pending' ? t('desk.review') : t('desk.view');
      review.classList.toggle('btn--primary', a.status === 'Pending');
      review.classList.toggle('btn--ghost', a.status !== 'Pending');

      const analytics = row.querySelector('.row__analytics');
      analytics.href = '/editor/analytics?article=' + encodeURIComponent(a.id);
      analytics.hidden = !a.isLive;
      return row;
    }

    function updateUrl() {
      const params = new URLSearchParams({ status: state.status });
      if (state.q) params.set('q', state.q);
      window.history.replaceState(null, '', '/editor?' + params.toString());
    }

    async function load(page) {
      if (controller) controller.abort();
      controller = new AbortController();
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (state.status !== 'all') params.set('status', state.status);
      if (state.q) params.set('q', state.q);

      loader.hidden = false;
      more.hidden = true;
      errorBox.hidden = true;
      rows.setAttribute('aria-busy', 'true');
      try {
        const data = await DW.api('/api/admin/articles?' + params.toString(), { signal: controller.signal });
        const items = Array.isArray(data) ? data : ((data && (data.articles || data.items)) || []);
        const hasMore = data && typeof data.hasMore === 'boolean' ? data.hasMore : items.length >= PAGE_SIZE;
        if (page === 1) rows.replaceChildren();
        const fragment = document.createDocumentFragment();
        items.forEach(function (item) { fragment.appendChild(renderRow(item)); });
        rows.appendChild(fragment);
        state.page = page;
        more.hidden = !hasMore;
        empty.hidden = rows.children.length > 0;
      } catch (error) {
        if (error.name === 'AbortError') return;
        // A failed first page belongs to the new tab/search: drop the previous list so the
        // highlighted tab never sits above another tab's articles.
        if (page === 1) {
          rows.replaceChildren();
          empty.hidden = true;
        }
        errorBox.querySelector('span').textContent = errorMessage(error);
        errorBox.hidden = false;
        more.hidden = page === 1; // a failed "Load more" can be retried with the same button
      } finally {
        loader.hidden = true;
        rows.setAttribute('aria-busy', 'false');
      }
    }

    tabs.addEventListener('click', function (event) {
      const tab = event.target.closest('.tab');
      if (!tab || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      state.status = tab.dataset.filter;
      form.elements.status.value = state.status;
      tabs.querySelectorAll('.tab').forEach(function (other) {
        other.setAttribute('aria-current', String(other === tab));
      });
      updateUrl();
      load(1);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      state.q = search.value.trim();
      updateUrl();
      load(1);
    });
    search.addEventListener('input', DW.debounce(function () {
      const q = search.value.trim();
      if (q === state.q) return;
      state.q = q;
      updateUrl();
      load(1);
    }, 300));

    more.addEventListener('click', function () { load(state.page + 1); });

    rows.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-delete]');
      if (!button) return;
      const row = button.closest('.row');
      const side = row.querySelector('.row__side');
      if (!(await confirmInline(side))) return;

      side.querySelectorAll('button, a').forEach(function (el) { el.setAttribute('aria-disabled', 'true'); });
      try {
        await deleteArticle(row.dataset.id);
        ['all', row.dataset.status].forEach(function (key) {
          const count = tabs.querySelector('[data-count-for="' + key + '"]');
          if (count) count.textContent = DW.fmt.number(Math.max(0, parseInt(count.textContent.replace(/\D/g, ''), 10) - 1), {});
        });
        row.classList.add('is-removing');
        setTimeout(function () {
          row.remove();
          empty.hidden = rows.children.length > 0;
        }, 250);
      } catch (error) {
        side.querySelectorAll('[aria-disabled]').forEach(function (el) { el.removeAttribute('aria-disabled'); });
        errorBox.querySelector('span').textContent = errorMessage(error);
        errorBox.hidden = false;
      }
    });
  }

  /* ======================================================================
     Word-level diff (longest common subsequence), no libraries
     ====================================================================== */
  const MAX_DIFF_CELLS = 4000000; // ~2000 x 2000 tokens; beyond that just mark the whole field

  /** Returns [{ type: 'equal' | 'del' | 'ins', value }] turning `a` into `b`. */
  function diffSequences(a, b) {
    const n = a.length;
    const m = b.length;
    if (n * m > MAX_DIFF_CELLS) {
      return a.map(function (v) { return { type: 'del', value: v }; })
        .concat(b.map(function (v) { return { type: 'ins', value: v }; }));
    }
    // lengths[i][j] = LCS length of a[i..] and b[j..], stored in one flat typed array.
    const width = m + 1;
    const lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i * width + j] = a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ type: 'equal', value: a[i] }); i++; j++; }
      else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) { ops.push({ type: 'del', value: a[i] }); i++; }
      else { ops.push({ type: 'ins', value: b[j] }); j++; }
    }
    while (i < n) ops.push({ type: 'del', value: a[i++] });
    while (j < m) ops.push({ type: 'ins', value: b[j++] });
    return ops;
  }

  function tokenize(text) {
    return String(text || '').match(/\s+|[^\s]+/g) || [];
  }

  /**
   * One side of a diff as [{ changed, text }]: whitespace between two changed words joins the change,
   * so "never stopped believing" becomes one highlight instead of three.
   */
  function sidePieces(ops, side) {
    const skip = side === 'old' ? 'ins' : 'del';
    const pieces = ops.filter(function (op) { return op.type !== skip; })
      .map(function (op) { return { changed: op.type !== 'equal', text: op.value }; });
    for (let k = 1; k < pieces.length - 1; k++) {
      if (!pieces[k].changed && /^\s+$/.test(pieces[k].text) && pieces[k - 1].changed && pieces[k + 1].changed) {
        pieces[k].changed = true;
      }
    }
    const merge = function (list) {
      const out = [];
      list.forEach(function (piece) {
        if (!piece.text) return;
        const last = out[out.length - 1];
        if (last && last.changed === piece.changed) last.text += piece.text;
        else out.push({ changed: piece.changed, text: piece.text });
      });
      return out;
    };
    // Join neighbours first, then keep spaces at the edges of a change unhighlighted
    // (mark "stoppage time", not " stoppage time ").
    const trimmed = [];
    merge(pieces).forEach(function (piece) {
      if (!piece.changed) return trimmed.push(piece);
      const match = piece.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      trimmed.push({ changed: false, text: match[1] }, { changed: true, text: match[2] }, { changed: false, text: match[3] });
    });
    return merge(trimmed);
  }

  /** Fill `element` with text, wrapping changed pieces in <ins> or <del> (textContent only). */
  function renderPieces(element, pieces, side) {
    const fragment = document.createDocumentFragment();
    pieces.forEach(function (piece) {
      if (!piece.changed) {
        fragment.appendChild(document.createTextNode(piece.text));
        return;
      }
      const mark = document.createElement(side === 'old' ? 'del' : 'ins');
      mark.textContent = piece.text;
      fragment.appendChild(mark);
    });
    element.replaceChildren(fragment);
  }

  function diffInline(oldEl, newEl) {
    const ops = diffSequences(tokenize(oldEl.textContent), tokenize(newEl.textContent));
    renderPieces(oldEl, sidePieces(ops, 'old'), 'old');
    renderPieces(newEl, sidePieces(ops, 'new'), 'new');
  }

  /** Paragraph-level diff first, then word-level inside paragraphs that were edited. */
  function diffParagraphs(oldEl, newEl) {
    const texts = function (el) { return Array.prototype.map.call(el.querySelectorAll('p'), function (p) { return p.textContent; }); };
    const ops = diffSequences(texts(oldEl), texts(newEl));
    const oldOut = document.createDocumentFragment();
    const newOut = document.createDocumentFragment();
    const paragraph = function (text) { const p = document.createElement('p'); p.textContent = text; return p; };

    let k = 0;
    while (k < ops.length) {
      if (ops[k].type === 'equal') {
        oldOut.appendChild(paragraph(ops[k].value));
        newOut.appendChild(paragraph(ops[k].value));
        k++;
        continue;
      }
      // Collect a run of removed and added paragraphs; pair them up as "edited" paragraphs.
      const removed = [];
      const added = [];
      while (k < ops.length && ops[k].type !== 'equal') {
        (ops[k].type === 'del' ? removed : added).push(ops[k].value);
        k++;
      }
      const pairs = Math.min(removed.length, added.length);
      for (let p = 0; p < pairs; p++) {
        const before = paragraph(removed[p]);
        const after = paragraph(added[p]);
        diffInline(before, after);
        oldOut.appendChild(before);
        newOut.appendChild(after);
      }
      removed.slice(pairs).forEach(function (text) {
        const p = paragraph('');
        const mark = document.createElement('del');
        mark.textContent = text;
        p.appendChild(mark);
        oldOut.appendChild(p);
      });
      added.slice(pairs).forEach(function (text) {
        const p = paragraph('');
        const mark = document.createElement('ins');
        mark.textContent = text;
        p.appendChild(mark);
        newOut.appendChild(p);
      });
    }
    oldEl.replaceChildren(oldOut);
    newEl.replaceChildren(newOut);
  }

  /* ======================================================================
     Review page
     ====================================================================== */
  function initReview(root) {
    const id = root.dataset.articleId;
    const compare = document.getElementById('compare');

    // A broken image link shows the placeholder, like on the feed, not the browser's broken-image icon.
    const image = compare.querySelector('.review__image');
    if (image) {
      const usePlaceholder = function () { image.src = '/images/placeholder.svg'; };
      if (image.complete && image.naturalWidth === 0) usePlaceholder();
      else image.addEventListener('error', usePlaceholder, { once: true });
    }

    ['title', 'summary', 'content'].forEach(function (field) {
      const oldEl = compare.querySelector('[data-diff="' + field + '"][data-side="old"]');
      const newEl = compare.querySelector('[data-diff="' + field + '"][data-side="new"]');
      if (!oldEl || !newEl) return;
      if (field === 'content') diffParagraphs(oldEl, newEl);
      else diffInline(oldEl, newEl);
    });

    const toggle = document.getElementById('diff-toggle');
    if (toggle) toggle.addEventListener('change', function () { compare.classList.toggle('no-marks', !toggle.checked); });

    const approve = document.getElementById('approve');
    const returnToggle = document.getElementById('return-toggle');
    const noteForm = document.getElementById('return-note');
    const noteText = document.getElementById('return-text');
    const noteFeedback = document.getElementById('return-feedback');
    const sendBack = document.getElementById('return-send');
    const deleteButton = document.getElementById('delete-article');
    const result = document.getElementById('decision-result');
    const resultText = document.getElementById('decision-result-text');
    const errorBox = document.getElementById('decision-error');
    const errorText = document.getElementById('decision-error-text');
    const statusHolder = document.getElementById('review-status');

    function showError(error) {
      errorText.textContent = errorMessage(error);
      errorBox.hidden = false;
    }

    function decided(status, message) {
      statusHolder.replaceChildren(statusBadge(status));
      root.dataset.status = status;
      approve.disabled = true;
      returnToggle.disabled = true;
      noteForm.hidden = true;
      returnToggle.setAttribute('aria-expanded', 'false');
      errorBox.hidden = true;
      result.classList.add('alert--success');
      resultText.textContent = message;
      result.hidden = false;
      result.setAttribute('tabindex', '-1');
      result.focus();
    }

    async function setStatus(body) {
      return DW.api('/api/admin/articles/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: body });
    }

    approve.addEventListener('click', async function () {
      approve.disabled = true;
      errorBox.hidden = true;
      try {
        await setStatus({ status: 'Published' });
        decided('Published', t('review.approved'));
      } catch (error) {
        approve.disabled = false;
        showError(error);
      }
    });

    returnToggle.addEventListener('click', function () {
      const open = noteForm.hidden;
      noteForm.hidden = !open;
      returnToggle.setAttribute('aria-expanded', String(open));
      if (open) noteText.focus();
    });

    noteForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const note = noteText.value.trim();
      if (!note) {
        noteFeedback.textContent = t('review.noteRequired');
        noteFeedback.classList.add('is-error');
        noteText.focus();
        return;
      }
      noteFeedback.textContent = '';
      sendBack.disabled = true;
      errorBox.hidden = true;
      try {
        await setStatus({ status: 'Returned', editorNote: note });
        decided('Returned', t('review.returned'));
      } catch (error) {
        showError(error);
      } finally {
        sendBack.disabled = false;
      }
    });
    noteText.addEventListener('input', function () {
      if (noteFeedback.classList.contains('is-error')) {
        noteFeedback.textContent = '';
        noteFeedback.classList.remove('is-error');
      }
    });

    deleteButton.addEventListener('click', async function () {
      const host = deleteButton.parentElement;
      if (!(await confirmInline(host))) return;
      errorBox.hidden = true;
      try {
        await deleteArticle(id);
        window.location.assign('/editor');
      } catch (error) {
        showError(error);
      }
    });
  }

  const desk = document.getElementById('desk');
  if (desk) initDesk(desk);

  const review = document.getElementById('review');
  if (review) initReview(review);

  // Exposed for testing the diff in the browser console.
  DW.diff = { diffSequences: diffSequences, tokenize: tokenize, sidePieces: sidePieces };
})();
