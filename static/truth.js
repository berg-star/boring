"use strict";
(() => {
  const draw = document.querySelector('#draw');
  const skip = document.querySelector('#skip');
  const question = document.querySelector('#question');
  const progress = document.querySelector('#truth-progress');
  const error = document.querySelector('#api-error');
  const levels = [...document.querySelectorAll('[data-level]')];
  let category = 'light';
  let records = null;
  let loading = false;
  const decks = {};
  function next() {
    const state = decks[category];
    if (!state.remaining.length) {
      state.remaining = [...state.questions];
      for (let i = state.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.remaining[i], state.remaining[j]] = [state.remaining[j], state.remaining[i]];
      }
      if (state.remaining.length > 1 && state.remaining.at(-1) === state.last) {
        [state.remaining[0], state.remaining[state.remaining.length - 1]] = [state.remaining.at(-1), state.remaining[0]];
      }
      state.round++;
    }
    state.last = state.remaining.pop();
    question.textContent = state.last;
    progress.textContent = `${category === 'light' ? '轻松' : '走心'} · 第 ${state.round} 轮 · ${state.questions.length - state.remaining.length} / ${state.questions.length}`;
  }
  async function load() {
    if (loading) return;
    loading = true;
    draw.disabled = skip.disabled = true;
    levels.forEach(button => button.disabled = true);
    error.textContent = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/truth-questions', {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      if (!Array.isArray(data) || !data.length || data.some(row => !row || !['light','deep'].includes(row.category) || typeof row.question !== 'string' || !row.question.trim())) throw new Error('Invalid questions');
      for (const level of ['light','deep']) {
        const questions = [...new Set(data.filter(row => row.category === level).map(row => row.question))];
        if (!questions.length) throw new Error('Missing category');
        decks[level] = {questions, remaining:[], last:null, round:0};
      }
      records = data;
      draw.textContent = '下一题 ↻';
      next();
    } catch (_) {
      question.textContent = '题目暂时没赶到，再试一次吧。';
      progress.textContent = '等待题库';
      error.textContent = '暂时无法加载题目，请检查网络后重试。';
      draw.textContent = '重新加载 ↻';
    } finally {
      clearTimeout(timer);
      loading = false;
      draw.disabled = false;
      skip.disabled = !records;
      levels.forEach(button => button.disabled = !records);
    }
  }
  draw.addEventListener('click', () => records ? next() : load());
  skip.addEventListener('click', next);
  levels.forEach(button => button.addEventListener('click', () => {
    if (category === button.dataset.level) return;
    category = button.dataset.level;
    levels.forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    if (decks[category].last) {
      question.textContent = decks[category].last;
      const state = decks[category];
      progress.textContent = `${category === 'light' ? '轻松' : '走心'} · 第 ${state.round} 轮 · ${state.questions.length - state.remaining.length} / ${state.questions.length}`;
    } else next();
  }));
  load();
})();