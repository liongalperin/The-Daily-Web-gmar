/**
 * Reporter workspace (Vanilla JS + Ajax). Runs on two pages:
 *
 *   /reporter                     - "My articles": filter by status without reloading, create a new
 *                                   article (POST /api/articles), submit for approval (PATCH .../status)
 *   /reporter/articles/:id/edit   - live word count, image preview, section color, and
 *   /editor/articles/:id/edit       "Submit for approval", which first waits for the auto-save to finish
 *
 * Auto-saving itself lives in main.js (AutoSave). Depends on window.DW.
 */
(function () {
  'use strict';

  const DW = window.DW;
  if (!DW) return;
  const t = DW.t;

  /** Put a button into a busy state and return a function that restores it. */
  function busy(button) {
    const label = button.querySelector('.btn__label');
    const original = label ? label.textContent : '';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (label && button.dataset.labelBusy) label.textContent = button.dataset.labelBusy;
    return function restore(keepDisabled) {
      button.disabled = Boolean(keepDisabled);
      button.removeAttribute('aria-busy');
      if (label) label.textContent = original;
    };
  }

  function errorMessage(error) {
    // 4xx messages come from our own API and describe the problem; anything else gets the generic text.
    return error && error.status >= 400 && error.status < 500 && error.message ? error.message : t('desk.actionFailed');
  }

  function submitArticle(id) {
    return DW.api('/api/articles/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: { status: 'Pending' } });
  }

  function pendingBadge() {
    const template = document.getElementById('pending-badge-template');
    return template ? template.content.firstElementChild.cloneNode(true) : null;
  }

  /* ======================================================================
     "My articles" dashboard
     ====================================================================== */
  function initDashboard(list) {
    const tabs = document.getElementById('status-tabs');
    const empty = document.getElementById('rows-empty');
    const errorBox = document.getElementById('desk-error');
    const errorText = document.getElementById('desk-error-text');
    const newButton = document.getElementById('new-article');
    let filter = '';

    function showError(message) {
      errorText.textContent = message;
      errorBox.hidden = false;
    }

    function applyFilter() {
      let visible = 0;
      list.querySelectorAll('.row').forEach(function (row) {
        const show = !filter || row.dataset.status === filter;
        row.hidden = !show;
        if (show) visible += 1;
      });
      empty.hidden = visible > 0;
      empty.textContent = list.children.length ? empty.dataset.emptyFilter : empty.dataset.emptyAll;
    }

    function changeCount(status, delta) {
      const el = tabs.querySelector('[data-count-for="' + status + '"]');
      if (el) el.textContent = String(Math.max(0, (Number(el.textContent) || 0) + delta));
    }

    tabs.addEventListener('click', function (event) {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      filter = tab.dataset.filter;
      tabs.querySelectorAll('.tab').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === tab));
      });
      applyFilter();
    });

    newButton.addEventListener('click', async function () {
      const restore = busy(newButton);
      errorBox.hidden = true;
      try {
        const created = await DW.api('/api/articles', { method: 'POST', body: {} });
        const id = created && (created._id || created.id || (created.article && created.article._id));
        window.location.assign('/reporter/articles/' + encodeURIComponent(id) + '/edit');
      } catch (error) {
        restore();
        showError(errorMessage(error));
      }
    });

    list.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-submit]');
      if (!button) return;
      const row = button.closest('.row');
      const previous = row.dataset.status;
      const restore = busy(button);
      errorBox.hidden = true;

      try {
        await submitArticle(button.dataset.submit);
        // The article is now waiting for an editor: show the new state, lock editing.
        row.dataset.status = 'Pending';
        const badge = row.querySelector('.status');
        const fresh = pendingBadge();
        if (badge && fresh) badge.replaceWith(fresh);
        const flag = row.querySelector('.row__flag');
        if (flag) flag.remove();
        const link = row.querySelector('.row__title a');
        if (link) link.replaceWith(document.createTextNode(link.textContent));
        const note = row.querySelector('.row__note');
        if (note) note.remove();
        const side = row.querySelector('.row__side');
        side.replaceChildren(document.getElementById('locked-note-template').content.firstElementChild.cloneNode(true));
        changeCount(previous, -1);
        changeCount('Pending', 1);
        applyFilter();
      } catch (error) {
        restore();
        showError(errorMessage(error));
      }
    });
  }

  /* ======================================================================
     Article editor page
     ====================================================================== */
  function initEditor(form) {
    const content = form.elements.content;
    const counter = document.getElementById('word-count');
    const imageInput = form.elements.imageUrl;
    const thumb = document.getElementById('f-image-thumb');
    const category = form.elements.category;
    const submit = document.getElementById('submit-article');
    const feedback = document.getElementById('submit-feedback');
    const autosave = (DW.autosaves || []).find(function (instance) { return instance.form === form; });

    function updateCount() {
      const text = content.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      let label = t('desk.words', { count: DW.fmt.number(words, {}) });
      if (words > 0) label += ' · ' + t('desk.readTime', { count: DW.fmt.number(Math.max(1, Math.round(words / 200)), {}) });
      counter.textContent = label;
    }
    content.addEventListener('input', updateCount);
    updateCount();

    // Image preview: only http(s) URLs; a broken link falls back to the placeholder.
    thumb.addEventListener('error', function () {
      if (!thumb.src.endsWith('/images/placeholder.svg')) thumb.src = '/images/placeholder.svg';
    });
    imageInput.addEventListener('input', DW.debounce(function () {
      const url = imageInput.value.trim();
      thumb.src = /^https?:\/\//i.test(url) ? url : '/images/placeholder.svg';
    }, 400));

    // The page's top rule takes the section color, like on the public site.
    category.addEventListener('change', function () { form.dataset.section = category.value; });

    if (!submit) return;

    // A published article can only be re-submitted once something changed.
    if (submit.hasAttribute('data-enable-on-change')) {
      form.addEventListener('input', function () { submit.disabled = false; }, { once: true });
    }

    function setFeedback(text, kind) {
      feedback.textContent = text;
      feedback.classList.toggle('is-error', kind === 'error');
      feedback.classList.toggle('is-ok', kind === 'ok');
    }

    submit.addEventListener('click', async function () {
      const restore = busy(submit);
      setFeedback('');

      try {
        if (autosave) await autosave.saveAndWait();
      } catch (error) {
        restore();
        setFeedback(t('editor.submitFailed'), 'error');
        return;
      }

      try {
        await submitArticle(submit.dataset.articleId);
        restore(true);
        const badgeHolder = document.getElementById('status-badge');
        const fresh = pendingBadge();
        if (badgeHolder && fresh) badgeHolder.replaceChildren(fresh);
        Array.prototype.forEach.call(form.elements, function (field) {
          if (field.tagName === 'SELECT') field.disabled = true;
          else field.readOnly = true;
        });
        setFeedback(t('reporter.submitted'), 'ok');
        setTimeout(function () { window.location.assign('/reporter'); }, 1500);
      } catch (error) {
        restore();
        setFeedback(errorMessage(error), 'error');
      }
    });
  }

  const list = document.getElementById('reporter-rows');
  if (list) initDashboard(list);

  const form = document.getElementById('article-form');
  if (form) initEditor(form);
})();
