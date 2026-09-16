// ===========================================================================
// Инициализация Telegram WebApp
// ===========================================================================

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// initData нужна на каждый запрос к API — бэкенд проверяет её подпись.
// Вне Telegram (открыто просто в браузере) она будет пустой строкой,
// и запросы к API получат 401 — это ожидаемо, тестировать нужно через бота.
function getInitData() {
  return tg?.initData || "";
}

function getUserFirstName() {
  return tg?.initDataUnsafe?.user?.first_name || "друг";
}

// ===========================================================================
// Обёртка над fetch с заголовком авторизации Telegram
// ===========================================================================

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "X-Telegram-Init-Data": getInitData(),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Ошибка запроса: ${response.status}`);
  }

  return response.json();
}

// ===========================================================================
// Навигация между экранами
// ===========================================================================

const SCREEN_TO_NAV = {
  "screen-home": "home",
  "screen-topics": "tests",
  "screen-quiz": "tests",
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  const navKey = SCREEN_TO_NAV[id] || null;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", navKey !== null && btn.dataset.nav === navKey);
  });
}

function showPlaceholder(title) {
  document.getElementById("placeholder-title").textContent = title;
  showScreen("screen-placeholder");
}

// ===========================================================================
// Главный экран: приветствие + быстрый доступ к темам
// ===========================================================================

// Иконки для быстрого доступа — просто по порядку тем.
// Когда тем станет больше, можно завести словарь topic_id -> emoji.
const QUICK_ACCESS_EMOJIS = ["🌱", "🐾", "🧬", "🧑", "🔬", "🦴", "🌍", "🦠"];

async function loadHomeScreen() {
  document.getElementById("greeting").textContent = `Привет, ${getUserFirstName()}! 👋`;
  showScreen("screen-home");

  try {
    const topics = await apiFetch("/api/practice/topics");
    renderQuickAccess(topics);

    if (topics.length > 0) {
      document.getElementById("today-topic-name").textContent = `Тема: ${topics[0].name}`;
      document.getElementById("today-start-btn").onclick = () => openTopic(topics[0].id);
    }
  } catch (err) {
    console.error("Не удалось загрузить темы:", err);
    document.getElementById("quick-topics-row").innerHTML =
      `<div style="padding:8px; font-size:12px; color:#a05;">Не удалось загрузить темы. Открой Mini App через бота, не в обычном браузере.</div>`;
  }

  // Прогресс/XP/стрик — отдельным запросом, чтобы падение одного не рушило другое
  loadProfile();
}

async function loadProfile() {
  try {
    const me = await apiFetch("/api/me");
    document.getElementById("progress-numbers").textContent =
      `${me.xp_into_level} / ${me.xp_per_level} XP · уровень ${me.level}`;
    const pct = Math.round((me.xp_into_level / me.xp_per_level) * 100);
    document.getElementById("progress-fill").style.width = `${pct}%`;
    document.getElementById("streak-value").textContent = me.streak;
  } catch (err) {
    console.error("Не удалось загрузить профиль:", err);
  }
}

function renderQuickAccess(topics) {
  const row = document.getElementById("quick-topics-row");
  row.innerHTML = "";
  topics.forEach((topic, index) => {
    const chip = document.createElement("div");
    chip.className = "topic-chip";
    chip.onclick = () => openTopic(topic.id);
    chip.innerHTML = `
      <div class="emoji">${QUICK_ACCESS_EMOJIS[index % QUICK_ACCESS_EMOJIS.length]}</div>
      <strong>${topic.name}</strong>
      <span>${topic.task_count} заданий</span>
    `;
    row.appendChild(chip);
  });
}

// ===========================================================================
// Список всех тем
// ===========================================================================

async function openTopicsList() {
  showScreen("screen-topics");
  const container = document.getElementById("topics-list-container");
  container.innerHTML = `<div style="text-align:center; color:#8a8f8b; padding:20px;">Загрузка…</div>`;

  try {
    const topics = await apiFetch("/api/practice/topics");
    container.innerHTML = "";
    topics.forEach((topic) => {
      const item = document.createElement("div");
      item.className = "topics-list-item";
      item.onclick = () => openTopic(topic.id);
      item.innerHTML = `
        <div><strong>${topic.name}</strong></div>
        <span>${topic.task_count} заданий ›</span>
      `;
      container.appendChild(item);
    });
    if (topics.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:#8a8f8b; padding:20px;">Пока нет ни одной темы.</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; color:#a05; padding:20px;">${err.message}</div>`;
  }
}

// ===========================================================================
// Прохождение теста по теме
// ===========================================================================

let currentQuizState = { tasks: [], index: 0, topicName: "" };

async function openTopic(topicId) {
  showScreen("screen-quiz");
  const card = document.getElementById("question-card");
  card.innerHTML = `<div style="text-align:center; color:#8a8f8b;">Загрузка…</div>`;
  document.getElementById("explanation-box").style.display = "none";

  try {
    const data = await apiFetch(`/api/practice/${topicId}`);
    currentQuizState = { tasks: data.tasks, index: 0, topicName: data.topic.name };
    renderCurrentQuestion();
  } catch (err) {
    card.innerHTML = `<div style="color:#a05;">${err.message}</div>`;
  }
}

function renderCurrentQuestion() {
  const { tasks, index } = currentQuizState;
  const card = document.getElementById("question-card");
  const explanationBox = document.getElementById("explanation-box");
  explanationBox.style.display = "none";

  if (index >= tasks.length) {
    card.innerHTML = `
      <p class="question-text">Тема пройдена! 🎉</p>
      <button class="btn-start" style="background:#1f3328; color:#fff;" onclick="showScreen('screen-topics')">К списку тем</button>
    `;
    document.getElementById("quiz-progress-fill").style.width = "100%";
    return;
  }

  const task = tasks[index];
  document.getElementById("quiz-progress-fill").style.width = `${(index / tasks.length) * 100}%`;

  const photoHtml = task.photo_file_id
    ? `<img src="${API_BASE_URL}/api/photo/${task.photo_file_id}" alt="">`
    // ^ TODO: этот эндпоинт для проксирования Telegram getFile ещё не создан на бэкенде
    : "";

  const optionsHtml = (task.options || [])
    .map((opt, i) => `<button class="option" data-index="${i}" onclick="selectAnswer(${task.id}, ${i})">${opt}</button>`)
    .join("");

  card.innerHTML = `
    ${photoHtml}
    <p class="question-text">${task.question_text}</p>
    ${optionsHtml}
  `;
}

async function selectAnswer(taskId, chosenIndex) {
  // Блокируем повторный выбор, пока не пришёл ответ
  document.querySelectorAll(".option").forEach((btn) => (btn.disabled = true));

  try {
    const result = await apiFetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, chosen_index: chosenIndex }),
    });

    const chosenBtn = document.querySelector(`.option[data-index="${chosenIndex}"]`);
    chosenBtn.classList.add(result.is_correct ? "correct" : "incorrect");

    const explanationBox = document.getElementById("explanation-box");
    explanationBox.textContent = result.explanation || (result.is_correct ? "Верно!" : "Неверно.");
    explanationBox.style.display = "block";

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred(result.is_correct ? "success" : "error");
    }

    // Обновляем профиль в фоне — XP уже начислен на бэкенде за этот ответ,
    // так что на главном экране цифры будут актуальными сразу
    loadProfile();

    setTimeout(() => {
      currentQuizState.index += 1;
      renderCurrentQuestion();
    }, 1600);
  } catch (err) {
    alert(err.message);
    document.querySelectorAll(".option").forEach((btn) => (btn.disabled = false));
  }
}

// ===========================================================================
// Старт
// ===========================================================================

loadHomeScreen();
