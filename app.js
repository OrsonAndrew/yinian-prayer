/* ============================================================
   一念 · 自动求佛
   Local-first prayer engine · visual ritual · daily scheduler
   ============================================================ */

(() => {
  'use strict';

  /* ------------------------------------------------------------
     Small helpers
  ------------------------------------------------------------ */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad2 = (value) => String(value).padStart(2, '0');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const formatNumber = (value) => Number(value || 0).toLocaleString('zh-CN');
  const dateKey = (date = new Date()) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const shiftDateKey = (key, days) => {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function chineseDay(value) {
    if (value <= 10) return value === 10 ? '十' : CN_DIGITS[value];
    if (value < 20) return `十${CN_DIGITS[value - 10]}`;
    if (value === 20) return '二十';
    if (value < 30) return `二十${CN_DIGITS[value - 20]}`;
    if (value === 30) return '三十';
    return `三十${CN_DIGITS[value - 30]}`;
  }

  function formatDateLine(date = new Date()) {
    const month = CN_NUMERALS[date.getMonth() + 1] || String(date.getMonth() + 1);
    const day = chineseDay(date.getDate());
    return `${month}月${day} · 星期${WEEKDAYS[date.getDay()]}`;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* ------------------------------------------------------------
     State
  ------------------------------------------------------------ */

  const STORAGE_KEY = 'yinian-auto-prayer-v1';
  const DAILY_GOAL = 108;
  const TICK_MS = 950;
  const DEFAULT_WISH = '愿此间清净，众生安乐。';

  const LEVELS = [
    { name: '初心', char: '初', min: 0, copy: '从第一念开始，静心叩拜。' },
    { name: '清净', char: '净', min: 108, copy: '一念清净，尘虑渐息。' },
    { name: '精进', char: '进', min: 888, copy: '日复一日，功不唐捐。' },
    { name: '般若', char: '若', min: 3888, copy: '照见五蕴，心无挂碍。' },
    { name: '菩提', char: '菩', min: 10800, copy: '一花一世界，一叶一菩提。' }
  ];

  const DEFAULT_STATE = {
    version: 1,
    total: 0,
    today: { date: dateKey(), count: 0 },
    streak: 0,
    lastPrayDate: null,
    wish: '',
    sound: true,
    auto: { enabled: false, time: '08:00', count: 18, lastRun: null },
    history: {},
    log: []
  };

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return clone(DEFAULT_STATE);

      return {
        ...clone(DEFAULT_STATE),
        ...raw,
        today: {
          ...DEFAULT_STATE.today,
          ...(raw.today || {}),
          date: typeof raw.today?.date === 'string' ? raw.today.date : dateKey(),
          count: Number(raw.today?.count) || 0
        },
        auto: {
          ...DEFAULT_STATE.auto,
          ...(raw.auto || {}),
          count: Number(raw.auto?.count) || 18,
          enabled: raw.auto?.enabled === true
        },
        history: { ...(raw.history || {}) },
        log: Array.isArray(raw.log) ? raw.log.slice(0, 20) : [],
        total: Number(raw.total) || 0,
        streak: Number(raw.streak) || 0,
        wish: typeof raw.wish === 'string' ? raw.wish.slice(0, 60) : '',
        sound: raw.sound !== false
      };
    } catch (error) {
      return clone(DEFAULT_STATE);
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* Storage can be unavailable in private or file contexts. The ritual still works. */
    }
  }

  function refreshDay() {
    const today = dateKey();
    if (state.today.date === today) return false;

    if (state.today.date && state.today.count > 0) {
      state.history[state.today.date] = state.today.count;
    }

    state.today = { date: today, count: 0 };

    if (
      state.lastPrayDate &&
      state.lastPrayDate !== today &&
      state.lastPrayDate !== shiftDateKey(today, -1)
    ) {
      state.streak = 0;
    }

    saveState();
    return true;
  }

  /* ------------------------------------------------------------
     DOM references
  ------------------------------------------------------------ */

  const dom = {
    body: document.body,
    header: $('#siteHeader'),
    soundToggle: $('#soundToggle'),
    soundLabel: $('#soundLabel'),
    fullscreenToggle: $('#fullscreenToggle'),
    todayCount: $('#todayCount'),
    totalCount: $('#totalCount'),
    streakDays: $('#streakDays'),
    todayDate: $('#todayDate'),
    practiceCount: $('#practiceCount'),
    practiceRing: $('#practiceRing'),
    miniCount: $('#miniCount'),
    miniProgressBar: $('#miniProgressBar'),
    ritualStatus: $('#ritualStatus'),
    practiceSteps: $('#practiceSteps'),
    practiceStepNodes: $$('.practice-step'),
    altar: $('.altar'),
    altarStage: $('#altarStage'),
    altarWish: $('#altarWish'),
    altarAutoTag: $('#altarAutoTag'),
    altarAutoCount: $('#altarAutoCount'),
    prayDisc: $('#prayDisc'),
    floatLayer: $('#floatLayer'),
    particleCanvas: $('#particleCanvas'),
    ambientCanvas: $('#ambientCanvas'),
    autoPanel: $('#autoPanel'),
    autoToggle: $('#autoToggle'),
    autoToggleLabel: $('#autoToggleLabel'),
    autoTime: $('#autoTime'),
    autoCount: $('#autoCount'),
    autoNext: $('#autoNext'),
    autoNextText: $('#autoNextText'),
    autoForm: $('#autoForm'),
    autoSession: $('#autoSession'),
    autoSessionLabel: $('#autoSessionLabel'),
    autoSessionMeta: $('#autoSessionMeta'),
    makeUpBtn: $('#makeUpBtn'),
    wishInput: $('#wishInput'),
    wishCount: $('#wishCount'),
    saveWish: $('#saveWish'),
    prayNow: $('#prayNow'),
    templeGrid: $('#templeGrid'),
    filterBar: $('#filterBar'),
    weekChart: $('#weekChart'),
    weekTotal: $('#weekTotal'),
    levelName: $('#levelName'),
    levelOrbText: $('#levelOrbText'),
    levelCopy: $('#levelCopy'),
    levelFraction: $('#levelFraction'),
    levelBar: $('#levelBar'),
    logList: $('#logList'),
    clearLog: $('#clearLog'),
    sessionBar: $('#sessionBar'),
    sessionTitle: $('#sessionTitle'),
    sessionProgress: $('#sessionProgress'),
    sessionBarFill: $('#sessionBarFill'),
    stopSession: $('#stopSession'),
    toast: $('#toast')
  };

  /* ------------------------------------------------------------
     Toast
  ------------------------------------------------------------ */

  let toastTimer = 0;

  function toast(message, duration = 2600) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove('is-visible');
    }, duration);
  }

  /* ------------------------------------------------------------
     Sound — synthesized wooden fish and a closing bell
  ------------------------------------------------------------ */

  const Sound = (() => {
    let context = null;
    let master = null;
    let noiseBuffer = null;

    function ensure() {
      if (!state.sound) return null;
      try {
        if (!context) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return null;
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = 0.62;
          master.connect(context.destination);
        }
        if (context.state === 'suspended') context.resume();
        return context;
      } catch (error) {
        return null;
      }
    }

    function getNoise(ctx) {
      if (noiseBuffer) return noiseBuffer;
      const length = Math.floor(ctx.sampleRate * 0.08);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      return noiseBuffer;
    }

    function knock() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime + 0.005;

      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(212, now);
      body.frequency.exponentialRampToValueAtTime(88, now + 0.14);
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.3, now + 0.006);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      body.connect(bodyGain);
      bodyGain.connect(master);
      body.start(now);
      body.stop(now + 0.21);

      const wood = ctx.createOscillator();
      const woodGain = ctx.createGain();
      wood.type = 'triangle';
      wood.frequency.setValueAtTime(760, now);
      wood.frequency.exponentialRampToValueAtTime(330, now + 0.045);
      woodGain.gain.setValueAtTime(0.0001, now);
      woodGain.gain.exponentialRampToValueAtTime(0.075, now + 0.003);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      wood.connect(woodGain);
      woodGain.connect(master);
      wood.start(now);
      wood.stop(now + 0.08);

      const crack = ctx.createBufferSource();
      const crackFilter = ctx.createBiquadFilter();
      const crackGain = ctx.createGain();
      crack.buffer = getNoise(ctx);
      crackFilter.type = 'bandpass';
      crackFilter.frequency.value = 1450;
      crackFilter.Q.value = 0.8;
      crackGain.gain.setValueAtTime(0.0001, now);
      crackGain.gain.exponentialRampToValueAtTime(0.075, now + 0.002);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(master);
      crack.start(now);
      crack.stop(now + 0.05);
    }

    function chime() {
      const ctx = ensure();
      if (!ctx) return;
      const now = ctx.currentTime + 0.02;
      const notes = [261.63, 523.25, 783.99, 1046.5];

      notes.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 1.4;
        const start = now + index * 0.055;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.06 / (index + 1), start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.9);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + 3);
      });
    }

    return { ensure, knock, chime };
  })();

  /* ------------------------------------------------------------
     Render: numbers, daily practice, auto schedule
  ------------------------------------------------------------ */

  function bump(element) {
    if (!element) return;
    element.classList.remove('bump');
    void element.offsetWidth;
    element.classList.add('bump');
    window.setTimeout(() => element.classList.remove('bump'), 500);
  }

  function renderStats(animate = false) {
    dom.todayCount.textContent = formatNumber(state.today.count);
    dom.totalCount.textContent = formatNumber(state.total);
    dom.streakDays.textContent = formatNumber(state.streak);
    dom.todayDate.textContent = formatDateLine();

    if (animate) {
      bump(dom.todayCount);
      bump(dom.totalCount);
    }
  }

  function renderPractice() {
    const count = state.today.count;
    const progress = clamp(count / DAILY_GOAL, 0, 1);
    const circumference = 2 * Math.PI * 52;

    dom.practiceCount.textContent = formatNumber(count);
    dom.miniCount.textContent = formatNumber(count);
    dom.practiceRing.style.strokeDashoffset = String(circumference * (1 - progress));
    dom.miniProgressBar.style.width = `${(progress * 100).toFixed(2)}%`;
    dom.prayDisc.style.setProperty('--progress', (progress * 100).toFixed(2));
  }

  function getNextRunText() {
    if (!state.auto.enabled) return '开启后，每日按时自动叩拜';
    if (session.active) return '自动叩拜进行中 · 请保持页面打开';

    const today = dateKey();
    if (state.auto.lastRun === today) {
      return `今日已完成 · 明日 ${state.auto.time}`;
    }

    const [hours, minutes] = state.auto.time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours || 0, minutes || 0, 0, 0);

    if (now < target) return `下一次 · 今日 ${state.auto.time}`;
    return state.today.count > 0 ? '今日时辰已过 · 可补今日功课' : '今日时辰已过 · 尚未叩拜';
  }

  function updateAutoNextText() {
    dom.autoNextText.textContent = getNextRunText();
    dom.autoNext.classList.toggle(
      'is-live',
      state.auto.enabled && !session.active && state.auto.lastRun !== dateKey()
    );
  }

  function renderAuto() {
    dom.autoToggle.checked = Boolean(state.auto.enabled);
    dom.autoToggleLabel.textContent = state.auto.enabled ? '已开启' : '已关闭';
    dom.autoPanel.classList.toggle('is-on', Boolean(state.auto.enabled));

    if (document.activeElement !== dom.autoTime) {
      dom.autoTime.value = state.auto.time || '08:00';
    }
    if (document.activeElement !== dom.autoCount) {
      dom.autoCount.value = String(state.auto.count || 18);
    }

    dom.autoSessionMeta.textContent = `${state.auto.count || 18} 拜`;
    updateAutoNextText();
  }

  function renderWish() {
    if (document.activeElement !== dom.wishInput) {
      dom.wishInput.value = state.wish || '';
    }
    const length = (dom.wishInput.value || '').length;
    dom.wishCount.textContent = `${length} / 60`;

    const displayWish = (state.wish || '').trim() || DEFAULT_WISH;
    dom.altarWish.textContent =
      displayWish.length > 34 ? `${displayWish.slice(0, 33)}…` : displayWish;
  }

  function renderChart() {
    const today = dateKey();
    const days = [];

    for (let offset = -6; offset <= 0; offset += 1) {
      const key = shiftDateKey(today, offset);
      const value =
        key === today
          ? state.today.count
          : Number(state.history[key]) || 0;
      const date = new Date(`${key}T00:00:00`);
      days.push({
        key,
        value,
        isToday: key === today,
        label: key === today ? '今日' : `周${WEEKDAYS[date.getDay()]}`
      });
    }

    const max = Math.max(...days.map((day) => day.value), 1);
    const total = days.reduce((sum, day) => sum + day.value, 0);
    dom.weekTotal.textContent = `${formatNumber(total)} 拜`;

    dom.weekChart.innerHTML = `
      ${total === 0 ? '<span class="chart-empty">尚无行迹</span>' : ''}
      ${days
        .map((day) => {
          const height = day.value === 0 ? 2 : Math.max(5, (day.value / max) * 100);
          return `
            <div class="chart-col${day.isToday ? ' is-today' : ''}" title="${day.key} · ${day.value} 拜">
              <div class="chart-bar-wrap">
                <span class="chart-count">${day.value > 0 ? formatNumber(day.value) : ''}</span>
                <span class="chart-bar" style="height:${height}%"></span>
              </div>
              <span class="chart-label">${day.label}</span>
            </div>`;
        })
        .join('')}
    `;
  }

  function getLevel() {
    let index = 0;
    for (let i = 0; i < LEVELS.length; i += 1) {
      if (state.total >= LEVELS[i].min) index = i;
    }
    return {
      current: LEVELS[index],
      next: LEVELS[index + 1] || null,
      index
    };
  }

  function renderLevel() {
    const { current, next } = getLevel();
    dom.levelName.textContent = current.name;
    dom.levelOrbText.textContent = current.char;
    dom.levelCopy.textContent = current.copy;

    if (next) {
      const span = next.min - current.min;
      const done = clamp(state.total - current.min, 0, span);
      const fraction = span > 0 ? done / span : 0;
      dom.levelFraction.textContent = `${formatNumber(state.total)} / ${formatNumber(next.min)}`;
      dom.levelBar.style.width = `${(fraction * 100).toFixed(2)}%`;
    } else {
      dom.levelFraction.textContent = `${formatNumber(state.total)} / 圆满`;
      dom.levelBar.style.width = '100%';
    }
  }

  function formatLogTime(timestamp) {
    const date = new Date(timestamp);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function renderLog() {
    if (!state.log.length) {
      dom.logList.innerHTML = '<li class="log-empty">尚无行迹，叩下第一拜。</li>';
      return;
    }

    dom.logList.innerHTML = state.log
      .map(
        (entry) => `
          <li>
            <span class="log-time">${formatLogTime(entry.t)}</span>
            <span class="log-label">${escapeHTML(entry.label)}</span>
            <span class="log-amount">${entry.amount > 0 ? `+${formatNumber(entry.amount)}` : '—'}</span>
          </li>`
      )
      .join('');
  }

  function addLog(label, amount, type = 'manual') {
    state.log.unshift({
      t: Date.now(),
      label,
      amount: Number(amount) || 0,
      type
    });
    state.log = state.log.slice(0, 10);
    saveState();
    renderLog();
  }

  function renderSessionUI() {
    const isActive = session.active;

    dom.altar.classList.toggle('is-auto', isActive);
    dom.altarAutoTag.hidden = !isActive;
    dom.autoSessionLabel.textContent = isActive ? '止静' : '自动一炷香';
    dom.autoSessionMeta.textContent = isActive
      ? `${session.done} / ${session.total}`
      : `${state.auto.count || 18} 拜`;

    if (isActive) {
      dom.altarAutoCount.textContent = String(session.total);
      dom.sessionTitle.textContent =
        session.source === 'daily'
          ? '每日定时 · 自动叩拜'
          : session.source === 'makeup'
            ? '补今日功课 · 自动叩拜'
            : '自动一炷香 · 自动叩拜';
      dom.sessionProgress.textContent = `${session.done} / ${session.total} 拜`;
      dom.sessionBarFill.style.width = `${((session.done / session.total) * 100).toFixed(2)}%`;
    }
  }

  function showSessionBar() {
    dom.sessionBar.hidden = false;
    requestAnimationFrame(() => {
      dom.sessionBar.classList.add('is-visible');
    });
  }

  function hideSessionBar() {
    dom.sessionBar.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!session.active) dom.sessionBar.hidden = true;
    }, 420);
  }

  function setPracticeStep(index) {
    dom.practiceStepNodes.forEach((node, nodeIndex) => {
      node.classList.toggle('is-active', nodeIndex === index);
      node.classList.toggle('is-done', nodeIndex < index);
    });
  }

  let statusTimer = 0;

  function setRitualStatus(text, resetAfter = 1600) {
    dom.ritualStatus.textContent = text;
    window.clearTimeout(statusTimer);
    if (resetAfter > 0) {
      statusTimer = window.setTimeout(() => {
        dom.ritualStatus.textContent = session.active ? '叩拜相续' : '静候一念';
      }, resetAfter);
    }
  }

  function renderAll(animate = false) {
    renderStats(animate);
    renderPractice();
    renderAuto();
    renderWish();
    renderChart();
    renderLevel();
    renderLog();
    renderSessionUI();
  }

  /* ------------------------------------------------------------
     Visual prayer animation
  ------------------------------------------------------------ */

  let altarGlowTimer = 0;
  let discTimer = 0;
  let stepTimers = [];
  let lastPrayAt = 0;

  const RITUAL_WORDS = [
    '一念恭敬',
    '心诚则灵',
    '愿有所成',
    '功德无量',
    '万念归寂',
    '善念相续'
  ];

  function runSteps() {
    stepTimers.forEach((timer) => window.clearTimeout(timer));
    stepTimers = [];
    setPracticeStep(1);
    stepTimers.push(
      window.setTimeout(() => {
        setPracticeStep(2);
      }, 250)
    );
    stepTimers.push(
      window.setTimeout(() => {
        if (!session.active) setPracticeStep(0);
      }, 720)
    );
  }

  function spawnMerit(localX, localY) {
    const node = document.createElement('span');
    node.className = 'merit-float';
    node.textContent = Math.random() < 0.16 ? '功德 +1 · 善' : '功德 +1';
    node.style.left = `${localX}px`;
    node.style.top = `${localY}px`;
    node.style.setProperty('--dx', `${random(-22, 22).toFixed(1)}px`);
    node.style.setProperty('--rot', `${random(-4, 4).toFixed(1)}deg`);
    dom.floatLayer.appendChild(node);

    const ripple = document.createElement('span');
    ripple.className = 'pray-ripple';
    ripple.style.left = `${localX}px`;
    ripple.style.top = `${localY}px`;
    dom.floatLayer.appendChild(ripple);

    window.setTimeout(() => node.remove(), 1600);
    window.setTimeout(() => ripple.remove(), 1200);
  }

  function animatePrayer() {
    dom.altar.classList.add('is-praying');
    dom.prayDisc.classList.remove('is-hit');
    void dom.prayDisc.offsetWidth;
    dom.prayDisc.classList.add('is-hit');

    const stageRect = dom.altarStage.getBoundingClientRect();
    const discRect = dom.prayDisc.getBoundingClientRect();
    const localX = discRect.left - stageRect.left + discRect.width / 2 + random(-15, 15);
    const localY = discRect.top - stageRect.top + 14 + random(-4, 4);

    spawnMerit(localX, localY);
    altarParticles.burst(localX, localY);

    window.clearTimeout(altarGlowTimer);
    altarGlowTimer = window.setTimeout(() => {
      dom.altar.classList.remove('is-praying');
    }, 1000);

    window.clearTimeout(discTimer);
    discTimer = window.setTimeout(() => {
      dom.prayDisc.classList.remove('is-hit');
    }, 650);

    runSteps();
    setRitualStatus(pick(RITUAL_WORDS), 1450);
  }

  /* ------------------------------------------------------------
     Prayer engine
  ------------------------------------------------------------ */

  function pray({ source = 'manual', animate = true } = {}) {
    const now = performance.now();
    if (now - lastPrayAt < 60) return false;
    lastPrayAt = now;

    refreshDay();

    state.today.count += 1;
    state.total += 1;
    state.history[state.today.date] = state.today.count;

    if (state.lastPrayDate !== state.today.date) {
      state.streak =
        state.lastPrayDate === shiftDateKey(state.today.date, -1)
          ? state.streak + 1
          : 1;
      state.lastPrayDate = state.today.date;
    }

    if (source === 'manual') {
      addLog('随心一叩', 1, 'manual');
    }

    saveState();
    renderStats(true);
    renderPractice();
    renderLevel();
    updateAutoNextText();

    if (state.today.count % 5 === 0) renderChart();
    if (animate) animatePrayer();
    if (state.sound) Sound.knock();

    return true;
  }

  /* ------------------------------------------------------------
     Automatic session
  ------------------------------------------------------------ */

  const session = {
    active: false,
    total: 0,
    done: 0,
    source: 'manual',
    timer: 0
  };

  function clearSessionTimer() {
    if (session.timer) {
      window.clearTimeout(session.timer);
      session.timer = 0;
    }
  }

  function sessionLabel() {
    if (session.source === 'daily') return '每日定时';
    if (session.source === 'makeup') return '补今日功课';
    return '自动一炷香';
  }

  function startSession(total, source = 'manual') {
    if (session.active) {
      toast('已有功课正在进行');
      return;
    }

    const count = clamp(Number(total) || 18, 1, 1080);

    session.active = true;
    session.total = count;
    session.done = 0;
    session.source = source;
    session.timer = 0;

    if (source === 'daily' || source === 'makeup') {
      state.auto.lastRun = dateKey();
      saveState();
    }

    dom.altar.classList.add('is-auto');
    dom.altarAutoTag.hidden = false;
    dom.altarAutoCount.textContent = String(count);
    dom.sessionBar.hidden = false;
    dom.sessionBar.classList.remove('is-visible');
    requestAnimationFrame(() => dom.sessionBar.classList.add('is-visible'));

    renderAuto();
    renderSessionUI();
    setPracticeStep(0);
    setRitualStatus('净心 · 起香', 0);

    toast(`${sessionLabel()} · ${count} 拜，静心开始`);

    session.timer = window.setTimeout(() => {
      tickSession();
    }, 520);
  }

  function tickSession() {
    if (!session.active) return;

    pray({ source: 'auto', animate: true });
    session.done += 1;
    renderSessionUI();
    dom.sessionProgress.textContent = `${session.done} / ${session.total} 拜`;
    dom.sessionBarFill.style.width = `${((session.done / session.total) * 100).toFixed(2)}%`;
    updateAutoNextText();

    if (session.done >= session.total) {
      finishSession();
      return;
    }

    session.timer = window.setTimeout(tickSession, TICK_MS);
  }

  function finishSession() {
    if (!session.active) return;

    clearSessionTimer();
    const completed = session.done;
    const source = session.source;

    session.active = false;
    hideSessionBar();
    dom.altar.classList.remove('is-auto');
    dom.altarAutoTag.hidden = true;
    dom.sessionBarFill.style.width = '100%';

    addLog(`${sessionLabel()} · ${completed} 拜`, completed, 'session');
    renderSessionUI();
    renderChart();
    renderLevel();
    updateAutoNextText();
    setPracticeStep(0);
    setRitualStatus('一炷香圆满', 3600);

    if (state.sound) Sound.chime();
    toast(`${source === 'daily' ? '每日功课' : '一炷香'}圆满 · 功德 +${completed}`, 3600);
    dom.autoSessionLabel.textContent = '自动一炷香';
    dom.autoSessionMeta.textContent = `${state.auto.count || 18} 拜`;
  }

  function stopSession() {
    if (!session.active) return;

    clearSessionTimer();
    const completed = session.done;

    session.active = false;
    hideSessionBar();
    dom.altar.classList.remove('is-auto');
    dom.altarAutoTag.hidden = true;
    dom.autoSessionLabel.textContent = '自动一炷香';
    dom.autoSessionMeta.textContent = `${state.auto.count || 18} 拜`;

    if (completed > 0) {
      addLog(`止静 · 已叩 ${completed} 拜`, completed, 'stop');
    }

    renderSessionUI();
    renderChart();
    updateAutoNextText();
    setPracticeStep(0);
    setRitualStatus('止静 · 亦修行', 2800);
    toast(completed > 0 ? `已止静 · 今日又添 ${completed} 拜` : '已止静');
  }

  /* ------------------------------------------------------------
     Daily scheduler
  ------------------------------------------------------------ */

  let lastTriggeredMinute = '';
  let lastDayCheck = dateKey();

  function checkSchedule() {
    const now = new Date();
    const today = dateKey(now);
    const dayChanged = refreshDay();

    if (today !== lastDayCheck || dayChanged) {
      lastDayCheck = today;
      renderAll();
      toast('新的一日 · 今日功课已归零', 3200);
    }

    updateAutoNextText();

    if (!state.auto.enabled || session.active) return;
    if (state.auto.lastRun === today) return;

    const [hours, minutes] = String(state.auto.time || '08:00').split(':').map(Number);
    if (now.getHours() !== (hours || 0) || now.getMinutes() !== (minutes || 0)) return;

    const triggerKey = `${today} ${pad2(hours || 0)}:${pad2(minutes || 0)}`;
    if (triggerKey === lastTriggeredMinute) return;

    lastTriggeredMinute = triggerKey;
    startSession(Number(state.auto.count) || 18, 'daily');
  }

  /* ------------------------------------------------------------
     Directory
  ------------------------------------------------------------ */

  const TEMPLES = [
    {
      no: '壹',
      name: '拜拜',
      domain: 'baifo.life',
      url: 'https://baifo.life/',
      category: 'shrine',
      categoryLabel: '在线佛堂',
      status: '免费 · 免登录',
      glyph: '堂',
      description:
        '选一尊佛、摆上供品、点一炷香，再把心愿认真说一遍。完整的在线礼佛流程，也有木鱼、念佛与每日一签。',
      tags: ['在线拜佛', '电子烧香', '许愿']
    },
    {
      no: '贰',
      name: '随缘佛堂',
      domain: 'fo.wfqmj.com',
      url: 'https://fo.wfqmj.com/',
      category: 'shrine',
      categoryLabel: '在线佛堂',
      status: '基础免费 · 免登录',
      glyph: '缘',
      description:
        '老牌线上佛堂，可浴佛、供灯、念佛、抄经、放生。殿宇很多，挑一处坐下，随缘而来，静心入堂。',
      tags: ['在线浴佛', '供灯', '抄经']
    },
    {
      no: '叁',
      name: '赛博佛堂',
      domain: 'noheart2019.github.io/FoTang',
      url: 'https://noheart2019.github.io/FoTang/',
      category: 'shrine',
      categoryLabel: '数字供佛',
      status: '开源 · 免费',
      glyph: '供',
      description:
        '一个克制、安静的开源数字佛堂。供桌空空，添几样贡品，上一炷香，适合在浏览器里留三分钟给自己。',
      tags: ['开源', '上香', '添加贡品']
    },
    {
      no: '肆',
      name: '真如禅寺 · 网络佛堂',
      domain: 'zhenru.org',
      url: 'https://zhenru.org/online-buddhist-temple.php',
      category: 'shrine',
      categoryLabel: '寺院线上',
      status: '免费 · 寺院官网',
      glyph: '禅',
      description:
        '台湾真如禅寺的线上礼佛入口，可祈福、顶礼、问讯，并读到实时回向。山门在云端，心意仍郑重。',
      tags: ['寺院官网', '祈福顶礼', '回向']
    },
    {
      no: '伍',
      name: '净心道场',
      domain: 'rushiwowen.co/zen',
      url: 'https://rushiwowen.co/zen',
      category: 'zen',
      categoryLabel: '静心空间',
      status: '免费 · 可免登录',
      glyph: '静',
      description:
        '3D 数字石窟佛堂。点一炷香、听钟声、随呼吸静坐片刻，再读一句经。手机横屏时，像真的走进石窟。',
      tags: ['3D 佛堂', '静坐', '梵音']
    },
    {
      no: '陆',
      name: '赛博求签',
      domain: 'noheart2019.github.io/FoTang/qiuqian',
      url: 'https://noheart2019.github.io/FoTang/qiuqian.html',
      category: 'qian',
      categoryLabel: '在线求签',
      status: '免费 · 免登录',
      glyph: '签',
      description:
        '六十甲子签。静心默念、净手、拜叩，再摇动签筒。心有所惑时，不妨借一签照一照自己。',
      tags: ['六十甲子', '摇签', '解签']
    },
    {
      no: '柒',
      name: '拜拜 · 每日一签',
      domain: 'qian.baifo.life',
      url: 'https://qian.baifo.life/',
      category: 'qian',
      categoryLabel: '在线求签',
      status: '免费 · 免登录',
      glyph: '运',
      description:
        '从三个数字里选一个更有感应的，看今日事业、感情、健康与财运的提示。适合在一天开始前安静地看一眼。',
      tags: ['每日一签', '运势', '轻占卜']
    },
    {
      no: '捌',
      name: '968T · 电子木鱼',
      domain: '968t.com/tools/wooden-fish',
      url: 'https://968t.com/tools/wooden-fish/',
      category: 'muyu',
      categoryLabel: '电子木鱼',
      status: '免费 · 免登录',
      glyph: '鱼',
      description:
        '高保真合成木鱼声，支持自定义自动敲击频率、多种禅意背景与修行里程碑。所有功德记录只留在本地。',
      tags: ['自动敲击', '合成音效', '本地记录']
    },
    {
      no: '玖',
      name: 'UD5 · 电子木鱼',
      domain: 'ud5.com/tool/digital-wooden-fish',
      url: 'https://www.ud5.com/tool/digital-wooden-fish',
      category: 'muyu',
      categoryLabel: '电子木鱼',
      status: '免费 · 免登录',
      glyph: '叩',
      description:
        '多种木鱼材质与音色，支持自动模式、今日回向和今日／累世功德统计。工具很轻，适合当作片刻的白噪音。',
      tags: ['多材质', '今日回向', '功德统计']
    },
    {
      no: '拾',
      name: '电子木鱼 · 赛博真经',
      domain: 'xzwzl6.github.io/dianzimuyu',
      url: 'https://xzwzl6.github.io/dianzimuyu/',
      category: 'muyu',
      categoryLabel: '电子木鱼',
      status: '免费 · 免登录',
      glyph: '空',
      description:
        '“敲电子木鱼，见机械佛祖，得赛博真经。” 可换音色、开自动积功德，带一点玩笑，也不妨碍静一静。',
      tags: ['赛博', '自动积功德', '音色']
    },
    {
      no: '拾壹',
      name: 'ToolKK · 电子木鱼',
      domain: 'toolkk.com/tools/wooden-fish',
      url: 'https://www.toolkk.com/tools/wooden-fish',
      category: 'muyu',
      categoryLabel: '电子木鱼',
      status: '免费 · 免登录',
      glyph: '木',
      description:
        '打开即敲的在线木鱼，界面干净，带功德计数与木鱼音效。工作间隙敲两下，给脑子留一点空白。',
      tags: ['即开即用', '功德计数', '音效']
    },
    {
      no: '拾贰',
      name: '新木鱼 WoodenFish',
      domain: 'nonloop.github.io/muyu',
      url: 'https://nonloop.github.io/muyu/',
      category: 'muyu',
      categoryLabel: '电子木鱼',
      status: '免费 · 网页体验',
      glyph: '心',
      description:
        '极简的木鱼网页体验，点击木鱼即可功德 +1。也有 App 版本，可换皮肤、听经声、做冥想计时。',
      tags: ['网页体验', '木鱼皮肤', '冥想']
    }
  ];

  let currentFilter = 'all';

  function renderTemples(filter = 'all') {
    currentFilter = filter;
    const list = filter === 'all'
      ? TEMPLES
      : TEMPLES.filter((temple) => temple.category === filter);

    dom.templeGrid.dataset.count = String(list.length);
    dom.templeGrid.innerHTML = list
      .map(
        (temple, index) => `
        <article class="temple-card" data-cat="${temple.category}" style="--card-index:${index}">
          <div class="temple-top">
            <span class="temple-index">${temple.no} · ${temple.categoryLabel}</span>
            <span class="temple-status">${temple.status}</span>
          </div>
          <h3>${temple.name}<em>${temple.domain}</em></h3>
          <p class="temple-desc">${temple.description}</p>
          <div class="temple-tags">
            ${temple.tags.map((tag) => `<span>${tag}</span>`).join('')}
          </div>
          <div class="temple-actions">
            <a class="temple-enter" href="${temple.url}" target="_blank" rel="noopener noreferrer">
              入山门
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <button class="copy-btn" type="button" data-url="${temple.url}" aria-label="复制 ${temple.name} 的网址">
              <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" fill="none" stroke="currentColor"/></svg>
              复制
            </button>
          </div>
          <span class="temple-glyph" aria-hidden="true">${temple.glyph}</span>
        </article>`
      )
      .join('');

    $$('.temple-card', dom.templeGrid).forEach((card) => {
      card.classList.add('is-filtering');
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      try {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const ok = document.execCommand('copy');
        helper.remove();
        return ok;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  /* ------------------------------------------------------------
     Canvas: ambient ash & altar sparks
  ------------------------------------------------------------ */

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ambientParticles = (() => {
    const canvas = dom.ambientCanvas;
    if (!canvas) return { resize() {} };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { resize() {} };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let time = 0;

    function seed() {
      const count = prefersReducedMotion ? 0 : clamp(Math.floor((width * height) / 42000), 18, 52);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: random(0.4, 1.5),
        speed: random(0.06, 0.26),
        sway: random(0.1, 0.5),
        phase: random(0, Math.PI * 2),
        alpha: random(0.08, 0.32)
      }));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      time += 0.006;

      particles.forEach((particle) => {
        particle.y -= particle.speed;
        particle.x += Math.sin(time + particle.phase) * particle.sway * 0.06;

        if (particle.y < -8) {
          particle.y = height + 8;
          particle.x = Math.random() * width;
        }
        if (particle.x < -8) particle.x = width + 8;
        if (particle.x > width + 8) particle.x = -8;

        ctx.beginPath();
        ctx.fillStyle = `rgba(201, 164, 92, ${particle.alpha})`;
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    if (!prefersReducedMotion) {
      raf = requestAnimationFrame(draw);
    }

    return {
      resize,
      stop() {
        cancelAnimationFrame(raf);
      }
    };
  })();

  const altarParticles = (() => {
    const canvas = dom.particleCanvas;
    const stage = dom.altarStage;
    if (!canvas || !stage) return { burst() {}, resize() {} };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { burst() {}, resize() {} };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let dust = [];
    let bursts = [];
    let raf = 0;
    let time = 0;
    let resizeObserver = null;

    function seedDust() {
      const count = prefersReducedMotion ? 0 : clamp(Math.floor(width / 11), 16, 46);
      dust = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: random(0.5, 1.8),
        speed: random(0.08, 0.35),
        sway: random(0.15, 0.75),
        phase: random(0, Math.PI * 2),
        alpha: random(0.1, 0.5)
      }));
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedDust();
    }

    function burst(x, y) {
      if (prefersReducedMotion) return;
      for (let i = 0; i < 15; i += 1) {
        const angle = random(0, Math.PI * 2);
        const speed = random(18, 74);
        bursts.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - random(6, 30),
          radius: random(0.7, 2.2),
          life: random(0.7, 1.35),
          age: 0,
          alpha: random(0.35, 0.85)
        });
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      time += 0.008;

      dust.forEach((particle) => {
        particle.y -= particle.speed;
        particle.x += Math.sin(time + particle.phase) * particle.sway * 0.1;

        if (particle.y < -6) {
          particle.y = height + 6;
          particle.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(232, 212, 167, ${particle.alpha})`;
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      bursts = bursts.filter((particle) => {
        particle.age += 0.016;
        particle.x += particle.vx * 0.016;
        particle.y += particle.vy * 0.016;
        particle.vy += 22 * 0.016;
        particle.vx *= 0.985;

        const life = particle.age / particle.life;
        if (life >= 1) return false;

        ctx.beginPath();
        ctx.fillStyle = `rgba(232, 212, 167, ${particle.alpha * (1 - life)})`;
        ctx.arc(particle.x, particle.y, particle.radius * (1 - life * 0.55), 0, Math.PI * 2);
        ctx.fill();
        return true;
      });

      raf = requestAnimationFrame(draw);
    }

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
    } else {
      window.addEventListener('resize', resize, { passive: true });
    }

    if (!prefersReducedMotion) {
      raf = requestAnimationFrame(draw);
    }

    return {
      burst,
      resize,
      stop() {
        cancelAnimationFrame(raf);
        if (resizeObserver) resizeObserver.disconnect();
      }
    };
  })();

  /* ------------------------------------------------------------
     Reveal & navigation
  ------------------------------------------------------------ */

  function initReveal() {
    if (prefersReducedMotion) {
      $$('.js-reveal').forEach((element) => element.classList.add('is-in'));
      return;
    }

    $$('.section-head, .panel, .record-card').forEach((element) => {
      element.classList.add('js-reveal');
    });

    if (typeof IntersectionObserver === 'undefined') {
      $$('.js-reveal').forEach((element) => element.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    $$('.js-reveal').forEach((element) => observer.observe(element));
  }

  let navTicking = false;

  function updateNav() {
    const scrollY = window.scrollY;
    dom.header.classList.toggle('is-scrolled', scrollY > 24);

    const sections = ['pray', 'temples', 'records']
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    let current = 'pray';
    sections.forEach((section) => {
      if (scrollY >= section.offsetTop - window.innerHeight * 0.42) {
        current = section.id;
      }
    });

    $$('.site-nav a').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === current);
    });

    navTicking = false;
  }

  function onScroll() {
    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(updateNav);
  }

  /* ------------------------------------------------------------
     Event wiring
  ------------------------------------------------------------ */

  function bindEvents() {
    dom.prayNow.addEventListener('click', () => {
      pray({ source: 'manual' });
    });

    dom.prayDisc.addEventListener('click', () => {
      pray({ source: 'manual' });
    });

    dom.autoSession.addEventListener('click', () => {
      if (session.active) {
        stopSession();
      } else {
        startSession(Number(state.auto.count) || 18, 'manual');
      }
    });

    dom.stopSession.addEventListener('click', stopSession);

    dom.autoToggle.addEventListener('change', () => {
      state.auto.enabled = dom.autoToggle.checked;

      if (state.auto.enabled) {
        const [hours, minutes] = String(state.auto.time || '08:00').split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(hours || 0, minutes || 0, 0, 0);

        if (now > target) {
          toast(`每日 ${state.auto.time} · ${state.auto.count} 拜已设定。今日时辰已过，可点“补今日功课”。`, 4200);
        } else {
          toast(`每日 ${state.auto.time} · ${state.auto.count} 拜已设定`, 3000);
        }
      } else {
        toast('每日自动已关闭');
      }

      saveState();
      renderAuto();
    });

    dom.autoTime.addEventListener('change', () => {
      state.auto.time = dom.autoTime.value || '08:00';
      saveState();
      renderAuto();
      toast(`定时改为 ${state.auto.time} · 需保持页面打开`, 3000);
    });

    dom.autoCount.addEventListener('change', () => {
      state.auto.count = Number(dom.autoCount.value) || 18;
      saveState();
      renderAuto();
      dom.autoSessionMeta.textContent = `${state.auto.count} 拜`;
      toast(`每次叩拜 ${state.auto.count} 拜`, 2200);
    });

    dom.autoForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });

    dom.makeUpBtn.addEventListener('click', () => {
      if (session.active) {
        toast('已有功课正在进行');
        return;
      }
      startSession(Number(state.auto.count) || 18, 'makeup');
    });

    let wishTimer = 0;

    function commitWish(announce = false) {
      state.wish = dom.wishInput.value.slice(0, 60);
      saveState();
      renderWish();
      if (announce) toast('心愿已供于佛前');
    }

    dom.wishInput.addEventListener('input', () => {
      const value = dom.wishInput.value.slice(0, 60);
      dom.wishCount.textContent = `${value.length} / 60`;
      dom.altarWish.textContent = value.trim() || DEFAULT_WISH;
      window.clearTimeout(wishTimer);
      wishTimer = window.setTimeout(() => {
        state.wish = value;
        saveState();
      }, 420);
    });

    dom.wishInput.addEventListener('blur', () => {
      commitWish(false);
    });

    dom.saveWish.addEventListener('click', () => {
      commitWish(true);
    });

    dom.soundToggle.addEventListener('click', () => {
      state.sound = !state.sound;
      saveState();
      renderSound();
      if (state.sound) {
        Sound.ensure();
        Sound.knock();
        toast('木鱼声已开启');
      } else {
        toast('已入静音');
      }
    });

    dom.fullscreenToggle.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error) {
        toast('当前浏览器不支持全屏');
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const label = dom.fullscreenToggle.querySelector('span');
      if (label) label.textContent = document.fullscreenElement ? '退出' : '全屏';
    });

    dom.clearLog.addEventListener('click', () => {
      state.log = [];
      saveState();
      renderLog();
      toast('行迹已清除');
    });

    dom.filterBar.addEventListener('click', (event) => {
      const button = event.target.closest('.filter');
      if (!button) return;

      const filter = button.dataset.filter || 'all';
      if (filter === currentFilter) return;

      $$('.filter', dom.filterBar).forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });

      renderTemples(filter);
    });

    dom.templeGrid.addEventListener('click', async (event) => {
      const button = event.target.closest('.copy-btn');
      if (!button) return;

      const ok = await copyText(button.dataset.url || '');
      toast(ok ? '山门网址已复制' : '复制失败，请手动选择网址');
    });

    document.addEventListener('keydown', (event) => {
      const tag = (event.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'a'].includes(tag)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        pray({ source: 'manual' });
      }

      if (event.key === 'Escape' && session.active) {
        stopSession();
      }
    });

    window.addEventListener('scroll', onScroll, { passive: true });

    window.addEventListener('beforeunload', (event) => {
      if (!session.active) return;
      event.preventDefault();
      event.returnValue = '';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (refreshDay()) renderAll();
        updateAutoNextText();
      }
    });
  }

  function renderSound() {
    dom.soundToggle.classList.toggle('is-off', !state.sound);
    dom.soundToggle.setAttribute('aria-pressed', String(Boolean(state.sound)));
    dom.soundLabel.textContent = state.sound ? '声' : '静';
  }

  /* ------------------------------------------------------------
     Boot
  ------------------------------------------------------------ */

  function boot() {
    refreshDay();
    renderTemples('all');
    renderAll();
    renderSound();
    bindEvents();
    initReveal();
    updateNav();
    checkSchedule();

    window.setInterval(checkSchedule, 5000);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add('is-loaded');
      });
    });

    window.setTimeout(() => {
      document.body.classList.add('is-settled');
    }, 2200);

    // A quiet hint for first-time visitors, after the entrance settles.
    if (!state.total) {
      window.setTimeout(() => {
        if (state.total === 0) {
          toast('叩下第一拜，或开启每日自动求佛', 3600);
        }
      }, 2200);
    }
  }

  boot();
})();
