// ===== 英语打卡应用主逻辑 =====
(function() {
  'use strict';

  // ===== 数据存储键名 =====
  const STORAGE_KEYS = {
    WORDS_PROGRESS: 'english_words_progress',
    PHRASES_PROGRESS: 'english_phrases_progress',
    RECORDINGS: 'english_recordings',
    CURRENT_WORD_DAY: 'english_current_word_day',
    CURRENT_PHRASE_DAY: 'english_current_phrase_day',
    LAST_ACTIVE_DATE: 'english_last_active_date',
    GROQ_API_KEY: 'english_groq_api_key',
    CUSTOM_WORDS: 'english_custom_words',
    CUSTOM_PHRASES: 'english_custom_phrases',
    AI_MODEL: 'english_ai_model'
  };

  // ===== 全局状态 =====
  const state = {
    currentView: 'words',
    currentWordDay: 1,
    currentPhraseDay: 1,
    wordsProgress: {},
    phrasesProgress: {},
    recordings: [],
    mediaRecorder: null,
    audioChunks: [],
    recordingBlob: null,
    recordingTimer: null,
    recordingSeconds: 0,
    currentRecordTarget: null,
    // AI加词相关
    customWords: [],
    customPhrases: [],
    aiGeneratedWords: [],
    aiGeneratedPhrases: [],
    currentCustomTab: 'words',
    isAiGenerating: false
  };

  // ===== 工具函数 =====
  function $(id) { return document.getElementById(id); }
  
  function showToast(message, type = 'info') {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => { toast.className = 'toast'; }, 2500);
  }

  function loadJSON(key, defaultValue) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error('加载数据失败:', e);
      return defaultValue;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('保存数据失败:', e);
      showToast('保存失败：存储空间不足', 'error');
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function formatDate(date) {
    const d = new Date(date);
    return d.getFullYear() + '-' + 
           (d.getMonth() + 1).toString().padStart(2, '0') + '-' + 
           d.getDate().toString().padStart(2, '0') + ' ' +
           d.getHours().toString().padStart(2, '0') + ':' +
           d.getMinutes().toString().padStart(2, '0');
  }

  // ===== 初始化 =====
  function init() {
    // 加载数据
    state.wordsProgress = loadJSON(STORAGE_KEYS.WORDS_PROGRESS, {});
    state.phrasesProgress = loadJSON(STORAGE_KEYS.PHRASES_PROGRESS, {});
    state.recordings = loadJSON(STORAGE_KEYS.RECORDINGS, []);
    state.currentWordDay = loadJSON(STORAGE_KEYS.CURRENT_WORD_DAY, 1);
    state.currentPhraseDay = loadJSON(STORAGE_KEYS.CURRENT_PHRASE_DAY, 1);
    state.customWords = loadJSON(STORAGE_KEYS.CUSTOM_WORDS, []);
    state.customPhrases = loadJSON(STORAGE_KEYS.CUSTOM_PHRASES, []);

    // 绑定事件
    bindEvents();

    // 初始化AI加词界面
    initAiView();

    // 渲染初始视图
    renderWordDay();
    renderPhraseDay();
    renderStats();
    renderCustomLibrary();
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // Tab切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchView(tab.dataset.plan));
    });

    // 单词日导航
    $('prev-day').addEventListener('click', () => navigateWordDay(-1));
    $('next-day').addEventListener('click', () => navigateWordDay(1));
    $('mark-all-done').addEventListener('click', markAllWordsDone);
    $('reset-day').addEventListener('click', resetWordDay);

    // 短语日导航
    $('prev-phrase-day').addEventListener('click', () => navigatePhraseDay(-1));
    $('next-phrase-day').addEventListener('click', () => navigatePhraseDay(1));
    $('mark-phrase-done').addEventListener('click', markAllPhrasesDone);
    $('reset-phrase-day').addEventListener('click', resetPhraseDay);

    // 弹窗关闭
    $('close-record-modal').addEventListener('click', closeRecordModal);
    $('close-detail-modal').addEventListener('click', () => {
      $('detail-modal').classList.remove('active');
    });
    
    // 点击弹窗背景关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // 录音控制
    $('start-record').addEventListener('click', startRecording);
    $('stop-record').addEventListener('click', stopRecording);
    $('save-record').addEventListener('click', saveRecording);
    $('re-record').addEventListener('click', reRecord);

    // 统计页数据管理
    $('export-data').addEventListener('click', exportData);
    $('import-data').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', importData);
    $('clear-all-data').addEventListener('click', clearAllData);

    // ===== 发音设置 =====
    // 单词页面口音选择
    $('speech-lang-words').addEventListener('change', (e) => {
      speechConfig.lang = e.target.value;
      $('speech-lang-phrases').value = e.target.value;
      showToast('已切换为' + (e.target.value === 'en-US' ? '美式' : '英式') + '英语', 'success');
    });

    // 单词语速调节
    $('speech-rate-words').addEventListener('input', (e) => {
      speechConfig.rate = parseFloat(e.target.value);
      $('speech-rate-value-words').textContent = e.target.value + 'x';
      $('speech-rate-phrases').value = e.target.value;
      $('speech-rate-value-phrases').textContent = e.target.value + 'x';
    });

    // 单词试听按钮
    $('test-speech-words').addEventListener('click', (e) => {
      speakText('Hello, welcome to your English practice. Let us learn today.', e.target);
    });

    // 短语页面口音选择
    $('speech-lang-phrases').addEventListener('change', (e) => {
      speechConfig.lang = e.target.value;
      $('speech-lang-words').value = e.target.value;
      showToast('已切换为' + (e.target.value === 'en-US' ? '美式' : '英式') + '英语', 'success');
    });

    // 短语语速调节
    $('speech-rate-phrases').addEventListener('input', (e) => {
      speechConfig.rate = parseFloat(e.target.value);
      $('speech-rate-value-phrases').textContent = e.target.value + 'x';
      $('speech-rate-words').value = e.target.value;
      $('speech-rate-value-words').textContent = e.target.value + 'x';
    });

    // 短语试听按钮
    $('test-speech-phrases').addEventListener('click', (e) => {
      speakText('I built an A-share factor research platform and reproduced 21 broker research factors.', e.target);
    });

    // ===== AI加词功能 =====
    $('save-api-key').addEventListener('click', saveApiKey);
    $('change-api-key').addEventListener('click', () => {
      $('api-key-section').style.display = 'block';
      $('ai-main-section').style.display = 'none';
      $('api-key-input').value = '';
    });
    $('ai-generate-btn').addEventListener('click', generateAiWords);
    $('ai-keyword-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') generateAiWords();
    });
    $('ai-model-select').addEventListener('change', (e) => {
      saveJSON(STORAGE_KEYS.AI_MODEL, e.target.value);
    });
    $('select-all-words').addEventListener('click', () => toggleSelectAll('ai-word-list', true));
    $('select-all-phrases').addEventListener('click', () => toggleSelectAll('ai-phrase-list', true));
    $('add-selected-btn').addEventListener('click', addSelectedToLibrary);

    // 自定义词库Tab切换
    document.querySelectorAll('.custom-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.currentCustomTab = tab.dataset.customTab;
        document.querySelectorAll('.custom-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $('custom-word-list').style.display = state.currentCustomTab === 'words' ? 'block' : 'none';
        $('custom-phrase-list').style.display = state.currentCustomTab === 'phrases' ? 'block' : 'none';
      });
    });

    $('clear-custom-library').addEventListener('click', () => {
      if (confirm('确定要清空所有自定义词库吗？此操作不可撤销。')) {
        state.customWords = [];
        state.customPhrases = [];
        saveJSON(STORAGE_KEYS.CUSTOM_WORDS, []);
        saveJSON(STORAGE_KEYS.CUSTOM_PHRASES, []);
        renderCustomLibrary();
        showToast('自定义词库已清空', 'info');
      }
    });

    // ===== 搜索功能 =====
    $('search-words').addEventListener('input', (e) => handleSearch(e.target.value, 'words'));
    $('clear-search-words').addEventListener('click', () => {
      $('search-words').value = '';
      handleSearch('', 'words');
    });
    $('search-phrases').addEventListener('input', (e) => handleSearch(e.target.value, 'phrases'));
    $('clear-search-phrases').addEventListener('click', () => {
      $('search-phrases').value = '';
      handleSearch('', 'phrases');
    });
  }

  // ===== 视图切换 =====
  function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.plan === view);
    });
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('view-' + view).classList.add('active');

    if (view === 'stats') renderStats();
    if (view === 'ai-add') renderCustomLibrary();
    // 切换视图时停止发音
    stopSpeaking();
  }

  // ===== 单词计划渲染 =====
  function renderWordDay() {
    const day = state.currentWordDay;
    const dayData = WORDS_PLAN[day - 1];
    if (!dayData) return;

    $('current-day-label').textContent = 'Day ' + day;
    $('current-day-stage').textContent = dayData.stage;

    const list = $('word-list');
    list.innerHTML = '';

    let completedCount = 0;
    const dayProgress = state.wordsProgress[day] || {};

    dayData.items.forEach((item, index) => {
      const isDone = dayProgress[index] === true;
      if (isDone) completedCount++;

      const card = document.createElement('div');
      card.className = 'word-card ' + item.category + (isDone ? ' done' : '');
      
      card.innerHTML = `
        <div class="word-header">
          <div class="word-term">${escapeHtml(item.word)}</div>
          <button class="btn-speak" data-speak="${escapeHtml(item.word)}" title="播放发音">🔊</button>
          <div class="word-pos">${escapeHtml(item.pos || '')}</div>
        </div>
        <div class="word-ipa">${escapeHtml(item.ipa || '')}</div>
        <div class="word-meaning">${escapeHtml(item.meaning)}</div>
        <div class="word-example">
          ${escapeHtml(item.example)}
          <button class="btn-speak-small" data-speak="${escapeHtml(item.example)}" title="朗读例句">🔊</button>
        </div>
        <div class="word-actions">
          <label class="word-check">
            <input type="checkbox" ${isDone ? 'checked' : ''} data-index="${index}">
            <span>已掌握</span>
          </label>
          <button class="btn-record-small" data-index="${index}">🎙️ 录音</button>
        </div>
      `;

      // 绑定checkbox事件
      card.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        toggleWordDone(index, e.target.checked);
      });

      // 绑定录音按钮
      card.querySelector('.btn-record-small').addEventListener('click', () => {
        openRecordModal(item, 'words', day, index);
      });

      // 绑定单词发音按钮
      card.querySelector('.btn-speak').addEventListener('click', (e) => {
        speakText(item.word, e.target);
      });

      // 绑定例句发音按钮
      card.querySelector('.btn-speak-small').addEventListener('click', (e) => {
        speakText(item.example, e.target);
      });

      list.appendChild(card);
    });

    // 更新进度
    const total = dayData.items.length;
    const pct = Math.round((completedCount / total) * 100);
    $('day-progress').style.width = pct + '%';
    $('day-progress-text').textContent = completedCount + '/' + total;
  }

  function navigateWordDay(delta) {
    const newDay = state.currentWordDay + delta;
    if (newDay < 1 || newDay > WORDS_PLAN.length) {
      showToast('已经是第一天/最后一天了', 'info');
      return;
    }
    state.currentWordDay = newDay;
    saveJSON(STORAGE_KEYS.CURRENT_WORD_DAY, newDay);
    renderWordDay();
  }

  function toggleWordDone(index, done) {
    const day = state.currentWordDay;
    if (!state.wordsProgress[day]) state.wordsProgress[day] = {};
    state.wordsProgress[day][index] = done;
    saveJSON(STORAGE_KEYS.WORDS_PROGRESS, state.wordsProgress);
    renderWordDay();
    if (done) showToast('✓ 已标记为掌握', 'success');
  }

  function markAllWordsDone() {
    const day = state.currentWordDay;
    const dayData = WORDS_PLAN[day - 1];
    state.wordsProgress[day] = {};
    dayData.items.forEach((_, i) => { state.wordsProgress[day][i] = true; });
    saveJSON(STORAGE_KEYS.WORDS_PROGRESS, state.wordsProgress);
    renderWordDay();
    showToast('🎉 Day ' + day + ' 全部完成！', 'success');
  }

  function resetWordDay() {
    const day = state.currentWordDay;
    if (confirm('确定要重置 Day ' + day + ' 的打卡记录吗？')) {
      delete state.wordsProgress[day];
      saveJSON(STORAGE_KEYS.WORDS_PROGRESS, state.wordsProgress);
      renderWordDay();
      showToast('已重置打卡记录', 'info');
    }
  }

  // ===== 短语计划渲染 =====
  function renderPhraseDay() {
    const day = state.currentPhraseDay;
    const dayData = PHRASES_PLAN[day - 1];
    if (!dayData) return;

    $('current-phrase-day-label').textContent = 'Day ' + day;
    $('current-phrase-day-stage').textContent = dayData.stage;

    const list = $('phrase-list');
    list.innerHTML = '';

    let completedCount = 0;
    const dayProgress = state.phrasesProgress[day] || {};

    dayData.items.forEach((item, index) => {
      const isDone = dayProgress[index] === true;
      if (isDone) completedCount++;

      const card = document.createElement('div');
      card.className = 'phrase-card' + (isDone ? ' done' : '');
      
      card.innerHTML = `
        <div class="phrase-module">${escapeHtml(item.module || '')}</div>
        <div class="phrase-header">
          <div class="phrase-text">${escapeHtml(item.phrase)}</div>
          <button class="btn-speak" data-speak="${escapeHtml(item.phrase)}" title="播放发音">🔊</button>
        </div>
        <div class="phrase-meaning">${escapeHtml(item.meaning)}</div>
        <div class="phrase-context">
          📝 简历原文：${escapeHtml(item.context)}
          <button class="btn-speak-small" data-speak="${escapeHtml(item.context)}" title="朗读原文">🔊</button>
        </div>
        <div class="word-actions">
          <label class="word-check">
            <input type="checkbox" ${isDone ? 'checked' : ''} data-index="${index}">
            <span>已掌握</span>
          </label>
          <button class="btn-record-small" data-index="${index}">🎙️ 录音</button>
        </div>
      `;

      card.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        togglePhraseDone(index, e.target.checked);
      });

      card.querySelector('.btn-record-small').addEventListener('click', () => {
        openRecordModal(item, 'phrases', day, index);
      });

      // 绑定短语发音按钮
      card.querySelector('.btn-speak').addEventListener('click', (e) => {
        speakText(item.phrase, e.target);
      });

      // 绑定原文发音按钮
      card.querySelector('.btn-speak-small').addEventListener('click', (e) => {
        speakText(item.context, e.target);
      });

      list.appendChild(card);
    });

    const total = dayData.items.length;
    const pct = Math.round((completedCount / total) * 100);
    $('phrase-progress').style.width = pct + '%';
    $('phrase-progress-text').textContent = completedCount + '/' + total;
  }

  function navigatePhraseDay(delta) {
    const newDay = state.currentPhraseDay + delta;
    if (newDay < 1 || newDay > PHRASES_PLAN.length) {
      showToast('已经是第一天/最后一天了', 'info');
      return;
    }
    state.currentPhraseDay = newDay;
    saveJSON(STORAGE_KEYS.CURRENT_PHRASE_DAY, newDay);
    renderPhraseDay();
  }

  function togglePhraseDone(index, done) {
    const day = state.currentPhraseDay;
    if (!state.phrasesProgress[day]) state.phrasesProgress[day] = {};
    state.phrasesProgress[day][index] = done;
    saveJSON(STORAGE_KEYS.PHRASES_PROGRESS, state.phrasesProgress);
    renderPhraseDay();
    if (done) showToast('✓ 已标记为掌握', 'success');
  }

  function markAllPhrasesDone() {
    const day = state.currentPhraseDay;
    const dayData = PHRASES_PLAN[day - 1];
    state.phrasesProgress[day] = {};
    dayData.items.forEach((_, i) => { state.phrasesProgress[day][i] = true; });
    saveJSON(STORAGE_KEYS.PHRASES_PROGRESS, state.phrasesProgress);
    renderPhraseDay();
    showToast('🎉 Day ' + day + ' 全部完成！', 'success');
  }

  function resetPhraseDay() {
    const day = state.currentPhraseDay;
    if (confirm('确定要重置 Day ' + day + ' 的打卡记录吗？')) {
      delete state.phrasesProgress[day];
      saveJSON(STORAGE_KEYS.PHRASES_PROGRESS, state.phrasesProgress);
      renderPhraseDay();
      showToast('已重置打卡记录', 'info');
    }
  }

  // ===== 录音功能 =====
  function openRecordModal(item, planType, day, index) {
    state.currentRecordTarget = { item, planType, day, index };
    const targetText = item.word || item.phrase || '';
    $('record-target-text').textContent = '🎯 朗读目标：' + targetText;
    $('record-status').textContent = '点击下方按钮开始录音';
    $('record-status').className = 'record-status';
    $('record-timer').textContent = '00:00';
    $('record-playback').style.display = 'none';
    $('start-record').disabled = false;
    $('stop-record').disabled = true;
    $('record-modal').classList.add('active');
  }

  function closeRecordModal() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
    }
    clearRecordingTimer();
    $('record-modal').classList.remove('active');
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream);
      
      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };
      
      state.mediaRecorder.onstop = () => {
        state.recordingBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(state.recordingBlob);
        $('record-audio').src = audioUrl;
        $('record-playback').style.display = 'block';
        stream.getTracks().forEach(track => track.stop());
      };
      
      state.mediaRecorder.start();
      state.recordingSeconds = 0;
      $('record-status').textContent = '正在录音...';
      $('record-status').className = 'record-status recording';
      $('start-record').disabled = true;
      $('stop-record').disabled = false;
      
      state.recordingTimer = setInterval(() => {
        state.recordingSeconds++;
        $('record-timer').textContent = formatTime(state.recordingSeconds);
      }, 1000);
      
    } catch (e) {
      console.error('录音失败:', e);
      showToast('录音失败：请允许麦克风权限', 'error');
    }
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
    }
    clearRecordingTimer();
    $('record-status').textContent = '录音完成，可以回放或保存';
    $('record-status').className = 'record-status';
    $('start-record').disabled = false;
    $('stop-record').disabled = true;
  }

  function clearRecordingTimer() {
    if (state.recordingTimer) {
      clearInterval(state.recordingTimer);
      state.recordingTimer = null;
    }
  }

  function reRecord() {
    $('record-playback').style.display = 'none';
    $('record-timer').textContent = '00:00';
    $('record-status').textContent = '点击下方按钮开始录音';
    $('record-status').className = 'record-status';
    state.recordingBlob = null;
  }

  function saveRecording() {
    if (!state.recordingBlob) {
      showToast('没有可保存的录音', 'error');
      return;
    }

    const target = state.currentRecordTarget;
    const defaultName = (target.item.word || target.item.phrase || '录音') + ' - Day ' + target.day;
    const customName = $('record-name').value.trim();
    const name = customName || defaultName;

    // 转换为base64存储
    const reader = new FileReader();
    reader.onloadend = () => {
      const recording = {
        id: Date.now(),
        name: name,
        target: target.item.word || target.item.phrase || '',
        planType: target.planType,
        day: target.day,
        duration: state.recordingSeconds,
        date: new Date().toISOString(),
        audioData: reader.result
      };
      
      state.recordings.unshift(recording);
      // 限制最多保存50条录音
      if (state.recordings.length > 50) {
        state.recordings = state.recordings.slice(0, 50);
        showToast('录音数量已达上限(50条)，最早的录音已被删除', 'info');
      }
      saveJSON(STORAGE_KEYS.RECORDINGS, state.recordings);
      $('record-name').value = '';
      closeRecordModal();
      showToast('💾 录音已保存', 'success');
      renderStats();
    };
    reader.readAsDataURL(state.recordingBlob);
  }

  // ===== 统计渲染 =====
  function renderStats() {
    // 计算统计数据
    let completedWordDays = 0;
    let totalWordsLearned = 0;
    
    WORDS_PLAN.forEach((dayData, i) => {
      const day = i + 1;
      const progress = state.wordsProgress[day] || {};
      const completed = Object.values(progress).filter(v => v === true).length;
      totalWordsLearned += completed;
      if (completed === dayData.items.length) completedWordDays++;
    });

    $('stat-total-days').textContent = WORDS_PLAN.length;
    $('stat-completed-days').textContent = completedWordDays;
    $('stat-total-words').textContent = totalWordsLearned;
    $('stat-streak').textContent = calculateStreak();

    // 渲染日历
    renderCalendar('words-calendar', WORDS_PLAN, state.wordsProgress, 'words');
    renderCalendar('phrases-calendar', PHRASES_PLAN, state.phrasesProgress, 'phrases');

    // 渲染录音列表
    renderRecordingsList();
  }

  function calculateStreak() {
    // 简单的连续打卡计算：检查最近的日期
    const lastActive = loadJSON(STORAGE_KEYS.LAST_ACTIVE_DATE, null);
    if (!lastActive) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDate = new Date(lastActive);
    lastDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return 0;
    
    // 简化：返回已完成天数作为参考
    let streak = 0;
    for (let day = WORDS_PLAN.length; day >= 1; day--) {
      const progress = state.wordsProgress[day] || {};
      const completed = Object.values(progress).filter(v => v === true).length;
      if (completed > 0) streak++;
      else break;
    }
    return streak;
  }

  function renderCalendar(containerId, plan, progress, type) {
    const container = $(containerId);
    container.innerHTML = '';
    
    plan.forEach((dayData, i) => {
      const day = i + 1;
      const dayProgress = progress[day] || {};
      const completed = Object.values(dayProgress).filter(v => v === true).length;
      const total = dayData.items.length;
      const pct = Math.round((completed / total) * 100);
      
      let status = 'pending';
      if (completed === total) status = 'completed';
      else if (completed > 0) status = 'partial';
      
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day ' + status;
      dayEl.innerHTML = `
        <span class="day-num">${day}</span>
        <span class="day-pct">${pct}%</span>
      `;
      
      dayEl.addEventListener('click', () => {
        if (type === 'words') {
          state.currentWordDay = day;
          saveJSON(STORAGE_KEYS.CURRENT_WORD_DAY, day);
          switchView('words');
          renderWordDay();
        } else {
          state.currentPhraseDay = day;
          saveJSON(STORAGE_KEYS.CURRENT_PHRASE_DAY, day);
          switchView('phrases');
          renderPhraseDay();
        }
      });
      
      container.appendChild(dayEl);
    });
  }

  function renderRecordingsList() {
    const container = $('recordings-list');
    if (state.recordings.length === 0) {
      container.innerHTML = '<p class="empty-text">暂无录音记录</p>';
      return;
    }
    
    container.innerHTML = '';
    state.recordings.forEach(rec => {
      const item = document.createElement('div');
      item.className = 'recording-item';
      item.innerHTML = `
        <div class="recording-info">
          <div class="recording-name">${escapeHtml(rec.name)}</div>
          <div class="recording-meta">${formatDate(rec.date)} · ${formatTime(rec.duration)} · ${rec.planType === 'words' ? '单词' : '短语'} Day ${rec.day}</div>
        </div>
        <div class="recording-actions">
          <button class="play">▶ 播放</button>
          <button class="delete">删除</button>
        </div>
      `;
      
      item.querySelector('.play').addEventListener('click', () => {
        const audio = new Audio(rec.audioData);
        audio.play();
      });
      
      item.querySelector('.delete').addEventListener('click', () => {
        if (confirm('确定删除这条录音吗？')) {
          state.recordings = state.recordings.filter(r => r.id !== rec.id);
          saveJSON(STORAGE_KEYS.RECORDINGS, state.recordings);
          renderStats();
          showToast('录音已删除', 'info');
        }
      });
      
      container.appendChild(item);
    });
  }

  // ===== 数据导入导出 =====
  function exportData() {
    const data = {
      wordsProgress: state.wordsProgress,
      phrasesProgress: state.phrasesProgress,
      recordings: state.recordings,
      currentWordDay: state.currentWordDay,
      currentPhraseDay: state.currentPhraseDay,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'english-practice-backup-' + formatDate(new Date()).replace(/[: ]/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 数据已导出', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.wordsProgress) state.wordsProgress = data.wordsProgress;
        if (data.phrasesProgress) state.phrasesProgress = data.phrasesProgress;
        if (data.recordings) state.recordings = data.recordings;
        if (data.currentWordDay) state.currentWordDay = data.currentWordDay;
        if (data.currentPhraseDay) state.currentPhraseDay = data.currentPhraseDay;
        
        saveJSON(STORAGE_KEYS.WORDS_PROGRESS, state.wordsProgress);
        saveJSON(STORAGE_KEYS.PHRASES_PROGRESS, state.phrasesProgress);
        saveJSON(STORAGE_KEYS.RECORDINGS, state.recordings);
        saveJSON(STORAGE_KEYS.CURRENT_WORD_DAY, state.currentWordDay);
        saveJSON(STORAGE_KEYS.CURRENT_PHRASE_DAY, state.currentPhraseDay);
        
        renderWordDay();
        renderPhraseDay();
        renderStats();
        showToast('📥 数据已导入', 'success');
      } catch (err) {
        showToast('导入失败：文件格式不正确', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearAllData() {
    if (confirm('⚠️ 确定要清除所有学习数据吗？这将删除所有打卡记录和录音，且无法恢复！')) {
      if (confirm('再次确认：真的要清除所有数据吗？')) {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        state.wordsProgress = {};
        state.phrasesProgress = {};
        state.recordings = [];
        state.currentWordDay = 1;
        state.currentPhraseDay = 1;
        renderWordDay();
        renderPhraseDay();
        renderStats();
        showToast('所有数据已清除', 'info');
      }
    }
  }

  // ===== HTML转义 =====
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== 发音功能 (Web Speech API) =====
  const speechConfig = {
    lang: 'en-US', // en-US 美式, en-GB 英式
    rate: 0.9,     // 语速 0.1 - 10
    pitch: 1.0,    // 音调 0 - 2
    volume: 1.0     // 音量 0 - 1
  };

  function speakText(text, buttonEl) {
    if (!('speechSynthesis' in window)) {
      showToast('当前浏览器不支持发音功能', 'error');
      return;
    }
    if (!text || !text.trim()) return;

    // 停止当前播放
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechConfig.lang;
    utterance.rate = speechConfig.rate;
    utterance.pitch = speechConfig.pitch;
    utterance.volume = speechConfig.volume;

    // 尝试选择英语语音
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v =>
      v.lang.startsWith(speechConfig.lang) || v.lang.startsWith('en')
    );
    if (englishVoice) utterance.voice = englishVoice;

    // 按钮状态反馈
    if (buttonEl) {
      const originalText = buttonEl.textContent;
      buttonEl.textContent = '🔊 播放中...';
      buttonEl.disabled = true;
      utterance.onend = () => {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      };
      utterance.onerror = () => {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      };
    }

    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // 预加载语音列表（部分浏览器需要）
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  // ===== AI加词功能 =====

  // 初始化AI加词界面
  function initAiView() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.GROQ_API_KEY);
    if (apiKey) {
      $('api-key-section').style.display = 'none';
      $('ai-main-section').style.display = 'block';
    } else {
      $('api-key-section').style.display = 'block';
      $('ai-main-section').style.display = 'none';
    }

    // 恢复AI模型选择
    const savedModel = loadJSON(STORAGE_KEYS.AI_MODEL, 'llama-3.1-70b-versatile');
    if ($('ai-model-select')) {
      $('ai-model-select').value = savedModel;
    }
  }

  // 保存API Key
  function saveApiKey() {
    const key = $('api-key-input').value.trim();
    if (!key) {
      showToast('请输入API Key', 'error');
      return;
    }
    if (!key.startsWith('gsk_')) {
      showToast('API Key格式不正确，应以 gsk_ 开头', 'error');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.GROQ_API_KEY, key);
    $('api-key-section').style.display = 'none';
    $('ai-main-section').style.display = 'block';
    showToast('API Key已保存，可以开始使用AI加词了！', 'success');
  }

  // 调用Groq API生成词汇
  async function generateAiWords() {
    const keyword = $('ai-keyword-input').value.trim();
    if (!keyword) {
      showToast('请输入关键词', 'error');
      return;
    }
    if (state.isAiGenerating) {
      showToast('正在生成中，请稍候...', 'info');
      return;
    }

    const apiKey = localStorage.getItem(STORAGE_KEYS.GROQ_API_KEY);
    if (!apiKey) {
      showToast('请先设置API Key', 'error');
      initAiView();
      return;
    }

    state.isAiGenerating = true;
    $('ai-loading').style.display = 'flex';
    $('ai-generate-btn').disabled = true;
    $('ai-results-card').style.display = 'none';

    const model = $('ai-model-select').value;

    const prompt = `你是一个专业的英语词汇专家。请围绕关键词"${keyword}"生成相关的英语学习内容。

要求：
1. 生成5-8个相关单词，每个单词包含：word(单词), pos(词性), ipa(音标), meaning(中文释义), example(英文例句，要实用), category(分类：daily日常或professional专业)
2. 生成2-3个相关短语，每个短语包含：phrase(短语), meaning(中文释义), context(英文例句/使用场景)
3. 内容要围绕关键词的语义场，包括同义词、相关概念、常见搭配
4. 如果关键词是中文，先翻译成英文再生成相关内容
5. 返回严格的JSON格式，不要有任何其他文字、解释或markdown标记

JSON格式：
{"words":[{"word":"","pos":"","ipa":"","meaning":"","example":"","category":""}],"phrases":[{"phrase":"","meaning":"","context":""}]}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'API请求失败: ' + response.status);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // 解析JSON
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // 尝试提取JSON部分
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AI返回格式无法解析');
        }
      }

      state.aiGeneratedWords = parsed.words || [];
      state.aiGeneratedPhrases = parsed.phrases || [];

      if (state.aiGeneratedWords.length === 0 && state.aiGeneratedPhrases.length === 0) {
        showToast('AI没有生成相关内容，请换个关键词试试', 'error');
      } else {
        renderAiResults();
        showToast(`生成了 ${state.aiGeneratedWords.length} 个单词和 ${state.aiGeneratedPhrases.length} 个短语！`, 'success');
      }

    } catch (error) {
      console.error('AI生成失败:', error);
      let errorMsg = error.message;
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        errorMsg = 'API Key无效，请检查后重试';
      } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        errorMsg = 'API调用频率超限，请稍后再试';
      }
      showToast('生成失败: ' + errorMsg, 'error');
    } finally {
      state.isAiGenerating = false;
      $('ai-loading').style.display = 'none';
      $('ai-generate-btn').disabled = false;
    }
  }

  // 渲染AI生成结果
  function renderAiResults() {
    const wordList = $('ai-word-list');
    const phraseList = $('ai-phrase-list');

    wordList.innerHTML = '';
    phraseList.innerHTML = '';

    state.aiGeneratedWords.forEach((word, index) => {
      const item = document.createElement('div');
      item.className = 'ai-word-item';
      item.innerHTML = `
        <input type="checkbox" class="ai-word-checkbox" data-index="${index}" checked>
        <div class="ai-word-item-content">
          <div class="word-header">
            <div class="word-term">${escapeHtml(word.word)}</div>
            <button class="btn-speak" data-speak-word="${index}" title="播放发音">🔊</button>
            <div class="word-pos">${escapeHtml(word.pos || '')}</div>
          </div>
          <div class="word-ipa">${escapeHtml(word.ipa || '')}</div>
          <div class="word-meaning">${escapeHtml(word.meaning)}</div>
          <div class="word-example">${escapeHtml(word.example)}</div>
        </div>
      `;
      // 发音按钮
      item.querySelector('.btn-speak').addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(word.word, e.target);
      });
      wordList.appendChild(item);
    });

    state.aiGeneratedPhrases.forEach((phrase, index) => {
      const item = document.createElement('div');
      item.className = 'ai-phrase-item';
      item.innerHTML = `
        <input type="checkbox" class="ai-phrase-checkbox" data-index="${index}" checked>
        <div class="ai-phrase-item-content">
          <div class="phrase-text">${escapeHtml(phrase.phrase)}
            <button class="btn-speak-small" data-speak-phrase="${index}" title="播放发音">🔊</button>
          </div>
          <div class="phrase-meaning">${escapeHtml(phrase.meaning)}</div>
          <div class="phrase-context">📝 ${escapeHtml(phrase.context)}</div>
        </div>
      `;
      item.querySelector('.btn-speak-small').addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(phrase.phrase, e.target);
      });
      phraseList.appendChild(item);
    });

    $('ai-results-card').style.display = 'block';
  }

  // 全选/取消全选
  function toggleSelectAll(listId, checked) {
    const list = $(listId);
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
  }

  // 添加选中到自定义词库
  function addSelectedToLibrary() {
    const wordCheckboxes = document.querySelectorAll('.ai-word-checkbox:checked');
    const phraseCheckboxes = document.querySelectorAll('.ai-phrase-checkbox:checked');

    if (wordCheckboxes.length === 0 && phraseCheckboxes.length === 0) {
      showToast('请先选择要添加的单词或短语', 'error');
      return;
    }

    let addedWords = 0;
    let addedPhrases = 0;

    wordCheckboxes.forEach(cb => {
      const index = parseInt(cb.dataset.index);
      const word = state.aiGeneratedWords[index];
      if (word && !state.customWords.find(w => w.word.toLowerCase() === word.word.toLowerCase())) {
        state.customWords.push({ ...word, addedAt: new Date().toISOString() });
        addedWords++;
      }
    });

    phraseCheckboxes.forEach(cb => {
      const index = parseInt(cb.dataset.index);
      const phrase = state.aiGeneratedPhrases[index];
      if (phrase && !state.customPhrases.find(p => p.phrase.toLowerCase() === phrase.phrase.toLowerCase())) {
        state.customPhrases.push({ ...phrase, addedAt: new Date().toISOString() });
        addedPhrases++;
      }
    });

    saveJSON(STORAGE_KEYS.CUSTOM_WORDS, state.customWords);
    saveJSON(STORAGE_KEYS.CUSTOM_PHRASES, state.customPhrases);
    renderCustomLibrary();

    const total = addedWords + addedPhrases;
    if (total > 0) {
      showToast(`已添加 ${addedWords} 个单词和 ${addedPhrases} 个短语到自定义词库！`, 'success');
    } else {
      showToast('所选内容已存在于词库中', 'info');
    }
  }

  // 渲染自定义词库
  function renderCustomLibrary() {
    const wordList = $('custom-word-list');
    const phraseList = $('custom-phrase-list');

    $('custom-words-count').textContent = state.customWords.length + '词';
    $('custom-phrases-count').textContent = state.customPhrases.length + '短语';

    if (state.customWords.length === 0) {
      wordList.innerHTML = '<div class="empty-custom"><span class="emoji">📖</span>还没有自定义单词<br>用上方AI生成功能添加吧！</div>';
    } else {
      wordList.innerHTML = '';
      state.customWords.forEach((word, index) => {
        const card = document.createElement('div');
        card.className = 'custom-word-item word-card ' + (word.category || 'daily');
        card.innerHTML = `
          <button class="custom-delete-btn" data-index="${index}" title="删除">🗑️</button>
          <div class="word-header">
            <div class="word-term">${escapeHtml(word.word)}</div>
            <button class="btn-speak" title="播放发音">🔊</button>
            <div class="word-pos">${escapeHtml(word.pos || '')}</div>
          </div>
          <div class="word-ipa">${escapeHtml(word.ipa || '')}</div>
          <div class="word-meaning">${escapeHtml(word.meaning)}</div>
          <div class="word-example">${escapeHtml(word.example)}</div>
          <div class="word-actions">
            <button class="btn-record-small">🎙️ 录音</button>
          </div>
        `;
        card.querySelector('.btn-speak').addEventListener('click', (e) => {
          speakText(word.word, e.target);
        });
        card.querySelector('.btn-record-small').addEventListener('click', () => {
          openRecordModal(word, 'custom-words', 0, index);
        });
        card.querySelector('.custom-delete-btn').addEventListener('click', () => {
          if (confirm('确定删除单词 "' + word.word + '" 吗？')) {
            state.customWords.splice(index, 1);
            saveJSON(STORAGE_KEYS.CUSTOM_WORDS, state.customWords);
            renderCustomLibrary();
            showToast('已删除', 'info');
          }
        });
        wordList.appendChild(card);
      });
    }

    if (state.customPhrases.length === 0) {
      phraseList.innerHTML = '<div class="empty-custom"><span class="emoji">💬</span>还没有自定义短语<br>用上方AI生成功能添加吧！</div>';
    } else {
      phraseList.innerHTML = '';
      state.customPhrases.forEach((phrase, index) => {
        const card = document.createElement('div');
        card.className = 'custom-phrase-item phrase-card';
        card.innerHTML = `
          <button class="custom-delete-btn" data-index="${index}" title="删除">🗑️</button>
          <div class="phrase-module">${escapeHtml(phrase.module || '自定义')}</div>
          <div class="phrase-header">
            <div class="phrase-text">${escapeHtml(phrase.phrase)}</div>
            <button class="btn-speak" title="播放发音">🔊</button>
          </div>
          <div class="phrase-meaning">${escapeHtml(phrase.meaning)}</div>
          <div class="phrase-context">📝 ${escapeHtml(phrase.context)}</div>
          <div class="word-actions">
            <button class="btn-record-small">🎙️ 录音</button>
          </div>
        `;
        card.querySelector('.btn-speak').addEventListener('click', (e) => {
          speakText(phrase.phrase, e.target);
        });
        card.querySelector('.btn-record-small').addEventListener('click', () => {
          openRecordModal(phrase, 'custom-phrases', 0, index);
        });
        card.querySelector('.custom-delete-btn').addEventListener('click', () => {
          if (confirm('确定删除短语 "' + phrase.phrase + '" 吗？')) {
            state.customPhrases.splice(index, 1);
            saveJSON(STORAGE_KEYS.CUSTOM_PHRASES, state.customPhrases);
            renderCustomLibrary();
            showToast('已删除', 'info');
          }
        });
        phraseList.appendChild(card);
      });
    }
  }

  // ===== 搜索功能 =====

  function handleSearch(query, type) {
    const resultsDiv = type === 'words' ? $('search-words-results') : $('search-phrases-results');
    const clearBtn = type === 'words' ? $('clear-search-words') : $('clear-search-phrases');
    const listEl = type === 'words' ? $('word-list') : $('phrase-list');

    if (!query.trim()) {
      resultsDiv.style.display = 'none';
      resultsDiv.innerHTML = '';
      clearBtn.style.display = 'none';
      listEl.style.display = 'block';
      return;
    }

    clearBtn.style.display = 'block';
    listEl.style.display = 'none';

    const q = query.toLowerCase().trim();
    let results = [];

    if (type === 'words') {
      // 搜索预设单词
      WORDS_PLAN.forEach(dayData => {
        dayData.items.forEach(word => {
          if (word.word.toLowerCase().includes(q) ||
              word.meaning.toLowerCase().includes(q) ||
              (word.example && word.example.toLowerCase().includes(q))) {
            results.push({ ...word, source: 'Day ' + dayData.day });
          }
        });
      });
      // 搜索自定义单词
      state.customWords.forEach(word => {
        if (word.word.toLowerCase().includes(q) ||
            word.meaning.toLowerCase().includes(q) ||
            (word.example && word.example.toLowerCase().includes(q))) {
          results.push({ ...word, source: '自定义词库' });
        }
      });
    } else {
      // 搜索预设短语
      PHRASES_PLAN.forEach(dayData => {
        dayData.items.forEach(phrase => {
          if (phrase.phrase.toLowerCase().includes(q) ||
              phrase.meaning.toLowerCase().includes(q) ||
              (phrase.context && phrase.context.toLowerCase().includes(q))) {
            results.push({ ...phrase, source: 'Day ' + dayData.day });
          }
        });
      });
      // 搜索自定义短语
      state.customPhrases.forEach(phrase => {
        if (phrase.phrase.toLowerCase().includes(q) ||
            phrase.meaning.toLowerCase().includes(q) ||
            (phrase.context && phrase.context.toLowerCase().includes(q))) {
          results.push({ ...phrase, source: '自定义词库' });
        }
      });
    }

    // 去重
    const seen = new Set();
    results = results.filter(r => {
      const key = type === 'words' ? r.word.toLowerCase() : r.phrase.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 限制结果数量
    results = results.slice(0, 50);

    if (results.length === 0) {
      resultsDiv.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">未找到匹配的' + (type === 'words' ? '单词' : '短语') + '</p>';
    } else {
      resultsDiv.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">找到 ' + results.length + ' 个结果（点击可发音）</p>';
      results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        if (type === 'words') {
          div.innerHTML = `
            <div class="search-result-word">${escapeHtml(item.word)} <span style="font-size:11px;color:var(--muted);font-weight:normal;">${escapeHtml(item.pos || '')} · ${escapeHtml(item.source)}</span></div>
            <div class="search-result-meaning">${escapeHtml(item.meaning)} — ${escapeHtml(item.example || '')}</div>
          `;
          div.addEventListener('click', () => speakText(item.word));
        } else {
          div.innerHTML = `
            <div class="search-result-word">${escapeHtml(item.phrase)} <span style="font-size:11px;color:var(--muted);font-weight:normal;">${escapeHtml(item.source)}</span></div>
            <div class="search-result-meaning">${escapeHtml(item.meaning)} — ${escapeHtml(item.context || '')}</div>
          `;
          div.addEventListener('click', () => speakText(item.phrase));
        }
        resultsDiv.appendChild(div);
      });
    }

    resultsDiv.style.display = 'block';
  }

  // ===== 启动 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
