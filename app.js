(function () {
  'use strict';

  var MAX_BYTES = 4 * 1024 * 1024; // 4MB
  var STORAGE_KEY = 'accessCode';

  var $ = function (id) { return document.getElementById(id); };
  var dropzone = $('dropzone');
  var fileInput = $('fileInput');
  var fileNameWrap = $('fileNameWrap');
  var fileNameEl = $('fileName');
  var analyzeBtn = $('analyzeBtn');
  var accessCodeWrap = $('accessCodeWrap');
  var accessCodeInput = $('accessCode');
  var loading = $('loading');
  var errorBox = $('errorBox');
  var results = $('results');
  var card1 = $('card1');
  var card2 = $('card2');
  var card3 = $('card3');
  var copyAllBtn = $('copyAllBtn');
  var toastEl = $('toast');

  var selectedFile = null;
  var lastResult = null;
  var toastTimer = null;
  var busy = false;

  // ---------------- 토스트 ----------------
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('opacity-0', 'translate-y-2');
    toastEl.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('opacity-100', 'translate-y-0');
      toastEl.classList.add('opacity-0', 'translate-y-2');
    }, 2500);
  }

  // ---------------- 표시/숨김 ----------------
  function show(el, display) {
    el.classList.remove('hidden');
    if (display) el.classList.add(display);
  }
  function hide(el, display) {
    el.classList.add('hidden');
    if (display) el.classList.remove(display);
  }

  function showError(message) {
    errorBox.textContent = message;
    show(errorBox);
  }
  function hideError() {
    errorBox.textContent = '';
    hide(errorBox);
  }

  // ---------------- 파일 선택 ----------------
  function resetFile() {
    selectedFile = null;
    fileInput.value = '';
    fileNameEl.textContent = '';
    hide(fileNameWrap, 'flex');
    analyzeBtn.disabled = true;
  }

  function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      resetFile();
      toast('PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_BYTES) {
      resetFile();
      toast('4MB 이하의 PDF만 업로드할 수 있습니다.');
      return;
    }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    show(fileNameWrap, 'flex');
    analyzeBtn.disabled = busy;
    toast('PDF 파일이 준비되었습니다.');
  }

  fileInput.addEventListener('change', function () {
    handleFile(fileInput.files && fileInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.add('border-indigo-500', 'bg-indigo-100');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-100');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    handleFile(files && files[0]);
  });

  // ---------------- 접속 코드 ----------------
  function getStoredCode() {
    try { return sessionStorage.getItem(STORAGE_KEY) || ''; } catch (e) { return ''; }
  }
  function setStoredCode(code) {
    try { sessionStorage.setItem(STORAGE_KEY, code); } catch (e) { /* 무시 */ }
  }
  function clearStoredCode() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
  }

  // ---------------- 결과 렌더링 (textContent만 사용) ----------------
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function render(data) {
    card1.textContent = data.card1_easy_explanation || '';

    card2.replaceChildren();
    (data.card2_takeaways || []).forEach(function (text, i) {
      var li = document.createElement('li');
      li.className = 'flex items-start gap-3 rounded-xl bg-emerald-50/60 px-4 py-3';

      var badge = document.createElement('span');
      badge.className = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white';
      badge.textContent = String(i + 1);

      var span = document.createElement('span');
      span.className = 'pt-0.5 font-medium text-slate-800';
      span.textContent = text;

      li.appendChild(badge);
      li.appendChild(span);
      card2.appendChild(li);
    });

    card3.replaceChildren();
    var slides = data.card3_card_news || [];
    slides.forEach(function (text, i) {
      var box = document.createElement('div');
      box.className = 'flex flex-col rounded-2xl bg-gradient-to-br from-indigo-900 to-indigo-700 p-5 text-white shadow-md';

      var top = document.createElement('div');
      top.className = 'mb-3 flex items-center justify-between';

      var label = document.createElement('span');
      label.className = 'text-xs font-bold tracking-wider text-indigo-200';
      label.textContent = 'Slide ' + pad2(i + 1) + ' / ' + pad2(slides.length);

      var tag = document.createElement('span');
      tag.className = 'rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-100';
      tag.textContent = 'Card News';

      var body = document.createElement('p');
      body.className = 'whitespace-pre-line leading-relaxed text-indigo-50';
      body.textContent = text;

      top.appendChild(label);
      top.appendChild(tag);
      box.appendChild(top);
      box.appendChild(body);
      card3.appendChild(box);
    });
  }

  // ---------------- 분석 요청 ----------------
  analyzeBtn.addEventListener('click', async function () {
    if (!selectedFile) {
      toast('먼저 PDF 파일을 업로드해 주세요.');
      return;
    }

    busy = true;
    analyzeBtn.disabled = true;
    hide(results);
    hideError();
    show(loading, 'flex');

    var code = accessCodeInput.value.trim() || getStoredCode();
    var headers = { 'Content-Type': 'application/octet-stream' };
    if (code) headers['x-access-code'] = code;

    try {
      var response = await fetch('/api/analyze', {
        method: 'POST',
        headers: headers,
        body: selectedFile // File 객체 그대로 (원본 바이트)
      });

      var data = null;
      try { data = await response.json(); } catch (e) { data = null; }

      if (!response.ok) {
        if (data && data.code === 'ACCESS_CODE_REQUIRED') {
          clearStoredCode();
          show(accessCodeWrap);
          accessCodeInput.focus();
        }
        showError((data && data.error) || '요청에 실패했습니다. (' + response.status + ')');
        return;
      }

      if (code) setStoredCode(code);
      lastResult = data || {};
      render(lastResult);
      show(results);
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      showError('요청에 실패했습니다. (네트워크 오류)');
    } finally {
      busy = false;
      hide(loading, 'flex');
      analyzeBtn.disabled = !selectedFile;
    }
  });

  // ---------------- 전체 결과 복사 ----------------
  function buildCopyText(r) {
    var takeaways = (r.card2_takeaways || []).map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
    var slides = (r.card3_card_news || []).join('\n\n');
    return '[초등학생도 이해하는 쉬운 말 해설]\n' + (r.card1_easy_explanation || '') +
      '\n\n[핵심 테이크어웨이]\n' + takeaways +
      '\n\n[SNS 카드뉴스 슬라이드]\n' + slides;
  }

  copyAllBtn.addEventListener('click', async function () {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(lastResult));
      toast('전체 결과가 클립보드에 복사되었습니다!');
    } catch (e) {
      toast('복사에 실패했습니다. 직접 선택해서 복사해 주세요.');
    }
  });
})();
