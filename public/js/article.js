/**
 * Article page: Ajax comments (Vanilla JS).
 *
 * - Posts the comment form with fetch() and inserts the new comment at the top of the list,
 *   without reloading the page or re-rendering the list.
 * - HTTP 429 (a guest posted more than 3 comments in a minute): shows a warning with a countdown
 *   taken from the Retry-After header, keeps the typed text, and re-enables posting when it ends.
 * - Records the article as "read" in this browser (for the badge on feed cards).
 *
 * Depends on window.DW from main.js (loaded first).
 */
(function () {
  'use strict';

  const DW = window.DW;
  const story = document.querySelector('.story[data-article-id]');
  if (!DW || !story) return;

  DW.viewed.add(story.dataset.articleId);

  // A main image that fails to load is removed, so readers never see a broken-image icon.
  // It may have failed before this script ran, hence the naturalWidth check.
  const figure = story.querySelector('.story__figure');
  const mainImage = figure && figure.querySelector('img');
  if (mainImage) {
    const drop = function () { figure.remove(); };
    if (mainImage.complete && mainImage.naturalWidth === 0) drop();
    else mainImage.addEventListener('error', drop, { once: true });
  }

  const form = document.getElementById('comment-form');
  if (!form) return;

  const t = DW.t;
  const list = document.getElementById('comment-list');
  const emptyNote = document.getElementById('comments-empty');
  const countEl = document.getElementById('comments-count');
  const body = document.getElementById('comment-body');
  const nameInput = document.getElementById('comment-name');
  const submit = document.getElementById('comment-submit');
  const submitLabel = submit.querySelector('.btn__label');
  const feedback = document.getElementById('comment-feedback');
  const counter = document.getElementById('comment-counter');
  const limitBox = document.getElementById('comment-limit');
  const limitText = document.getElementById('comment-limit-text');
  const limitCountdown = document.getElementById('comment-limit-countdown');

  const MAX_LENGTH = Number(counter.dataset.max) || 1000;
  const DEFAULT_LOCK_SECONDS = 60;

  let sending = false;
  let lockedUntil = 0;
  let lockTimer = null;

  /* ---------- Character counter ---------- */
  function updateCounter() {
    const left = MAX_LENGTH - body.value.length;
    counter.textContent = t('comments.charsLeft', { count: DW.fmt.number(left, {}) });
    counter.classList.toggle('is-low', left <= 50);
  }
  body.addEventListener('input', function () {
    updateCounter();
    if (feedback.classList.contains('is-error')) setFeedback('');
  });
  updateCounter();

  function setFeedback(text, kind) {
    feedback.textContent = text;
    feedback.classList.toggle('is-error', kind === 'error');
    feedback.classList.toggle('is-ok', kind === 'ok');
  }

  function setSending(on) {
    sending = on;
    submit.disabled = on || Date.now() < lockedUntil;
    submitLabel.textContent = on ? t('comments.sending') : t('comments.submit');
  }

  /* ---------- Rate limit (HTTP 429) ---------- */
  function lockForm(seconds) {
    lockedUntil = Date.now() + seconds * 1000;
    limitText.textContent = t('comments.rateLimited');
    limitBox.hidden = false;
    limitBox.classList.remove('is-shake');
    void limitBox.offsetWidth; // restart the shake animation on repeated attempts
    limitBox.classList.add('is-shake');
    submit.disabled = true;

    clearInterval(lockTimer);
    const tick = function () {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(lockTimer);
        limitBox.hidden = true;
        submit.disabled = sending;
        return;
      }
      limitCountdown.textContent = t('comments.retryIn', { seconds: left });
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  /* ---------- Rendering ---------- */
  function renderComment(comment) {
    const name = (comment.authorName || '').trim() || t('comments.guest');

    const item = document.createElement('li');
    item.className = 'comment is-new';
    if (comment._id) item.dataset.id = comment._id;

    const head = document.createElement('div');
    head.className = 'comment__head';

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = name.charAt(0).toUpperCase();

    const author = document.createElement('span');
    author.className = 'comment__author';
    author.dir = 'auto';
    author.textContent = name;

    const created = comment.createdAt || Date.now();
    const time = document.createElement('time');
    time.className = 'comment__time';
    time.dateTime = DW.fmt.iso(created);
    time.textContent = DW.fmt.date(created);

    const text = document.createElement('p');
    text.className = 'comment__body';
    text.dir = 'auto';
    text.textContent = comment.content;

    head.append(avatar, author, time);
    item.append(head, text);
    return item;
  }

  function bumpCount() {
    const count = (Number(countEl.dataset.count) || 0) + 1;
    countEl.dataset.count = String(count);
    countEl.textContent = t('comments.count', { count: DW.fmt.number(count, {}) });
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (sending) return;

    if (Date.now() < lockedUntil) {
      lockForm(Math.ceil((lockedUntil - Date.now()) / 1000));
      return;
    }

    const content = body.value.trim();
    if (!content) {
      setFeedback(t('comments.invalid'), 'error');
      body.focus();
      return;
    }

    setFeedback('');
    setSending(true);

    try {
      const data = await DW.api('/api/comments', {
        method: 'POST',
        body: {
          articleId: form.elements.articleId.value,
          content: content,
          authorName: nameInput.value.trim()
        }
      });
      const comment = (data && data.comment) || data || {};
      if (!comment.content) comment.content = content;
      if (!comment.authorName) comment.authorName = nameInput.value.trim();

      list.prepend(renderComment(comment));
      emptyNote.hidden = true;
      bumpCount();
      body.value = '';
      updateCounter();
      setFeedback(t('comments.posted'), 'ok');
    } catch (error) {
      if (error.status === 429) {
        // Use our own translated message so it matches the page language.
        lockForm(error.retryAfter || DEFAULT_LOCK_SECONDS);
      } else if (error.status === 400 || error.status === 422) {
        setFeedback(error.message || t('comments.invalid'), 'error');
      } else {
        setFeedback(t('comments.error'), 'error');
      }
    } finally {
      setSending(false);
    }
  });
})();
