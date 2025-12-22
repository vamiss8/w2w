const footer = document.querySelector("footer");
const TAB_INPUT_SELECTOR = 'input[name="tabs"]';
const UNWATCHED_TAB_ID = "tab-unwatched";
const UNWATCHED_LIST_SELECTOR = ".unwatched";
const WATCHED_LIST_SELECTOR = ".watched";
const RATING_DELIMITER = "|";
const ANIMATION_STEP_DELAY = 0.2;
const FOOTER_EXTRA_DELAY = 0.4;

function hideFooterInstantly() {
  if (!footer) return;

  footer.classList.remove("visible");
  footer.classList.add("instant-hide");
}

function showFooterWithDelay(totalDelaySeconds) {
  if (!footer) return;

  setTimeout(() => {
    footer.classList.remove("instant-hide");
    footer.classList.add("visible");
  }, totalDelaySeconds * 1000);
}

function animateList(listSelector) {
  const cards = document.querySelectorAll(`${listSelector} li`);

  hideFooterInstantly();

  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * ANIMATION_STEP_DELAY}s`;
  });

  const totalDelay = cards.length * ANIMATION_STEP_DELAY + FOOTER_EXTRA_DELAY;
  showFooterWithDelay(totalDelay);
}

function persistActiveTab(tabId) {
  localStorage.setItem("activeTab", tabId);
}

function restoreActiveTab() {
  const savedTab = localStorage.getItem("activeTab");

  if (!savedTab) return null;

  const savedTabInput = document.getElementById(savedTab);
  if (savedTabInput) {
    savedTabInput.checked = true;
    return savedTab;
  }

  return null;
}

function handleTabChange(tab) {
  persistActiveTab(tab.id);

  if (tab.id === UNWATCHED_TAB_ID) {
    animateList(UNWATCHED_LIST_SELECTOR);
    return;
  }

  animateList(WATCHED_LIST_SELECTOR);
}

function initializeTabs() {
  document.querySelectorAll(TAB_INPUT_SELECTOR).forEach(tab => {
    tab.addEventListener("change", () => handleTabChange(tab));
  });

  const restoredTab = restoreActiveTab();
  if (restoredTab) {
    animateList(restoredTab === UNWATCHED_TAB_ID ? UNWATCHED_LIST_SELECTOR : WATCHED_LIST_SELECTOR);
  } else {
    animateList(UNWATCHED_LIST_SELECTOR);
  }
}

function createHearts(score, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "rating-stars";

  for (let currentScore = 1; currentScore <= 10; currentScore += 1) {
    const heart = document.createElement("span");
    heart.className = `rating-heart ${owner}`;
    heart.textContent = "❤";

    if (currentScore <= score) {
      heart.classList.add("filled");
    }

    wrapper.appendChild(heart);
  }

  return wrapper;
}

function createRatingRow(name, score) {
  const row = document.createElement("div");
  row.className = "rating-row";

  const label = document.createElement("div");
  label.className = "rating-name";
  label.textContent = name;

  row.appendChild(label);
  row.appendChild(createHearts(score, name));

  return row;
}

function extractScores(metaText) {
  if (!metaText.includes(RATING_DELIMITER)) return null;

  const [vladPart, vikaPart] = metaText.split(RATING_DELIMITER);
  const vladScore = parseInt(vladPart.split(":")[1], 10);
  const vikaScore = parseInt(vikaPart.split(":")[1], 10);

  if (Number.isNaN(vladScore) || Number.isNaN(vikaScore)) return null;

  return { vladScore, vikaScore };
}

function renderRatings(metaElement, scores) {
  const rating = document.createElement("div");
  rating.className = "rating";

  rating.appendChild(createRatingRow("vlad", scores.vladScore));
  rating.appendChild(createRatingRow("vika", scores.vikaScore));

  metaElement.innerHTML = "";
  metaElement.appendChild(rating);
}

function transformRatings() {
  document.querySelectorAll(".watched .meta").forEach(meta => {
    const scores = extractScores(meta.textContent.trim());

    if (!scores) return;

    renderRatings(meta, scores);
  });
}

initializeTabs();
transformRatings();
