const footer = document.querySelector("footer");

function animateList(listSelector) {
  const cards = document.querySelectorAll(`${listSelector} li`);

  // instant hiding of footer
  footer.classList.remove("visible");
  footer.classList.add("instant-hide");

  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 0.2}s`;
  });

  // time when footer will appear
  const totalDelay = cards.length * 0.2 + 0.4;

  setTimeout(() => {
    footer.classList.remove("instant-hide");
    footer.classList.add("visible");
  }, totalDelay * 1000);
}

// initial animation
animateList(".unwatched");

// remember selected tab
const tabs = document.querySelectorAll('input[name="tabs"]');

tabs.forEach(tab => {
  tab.addEventListener("change", () => {
    localStorage.setItem("activeTab", tab.id);

    if (tab.id === "tab-unwatched") {
      animateList(".unwatched");
    }

    if (tab.id === "tab-watched") {
      animateList(".watched");
    }
  });
});

// restore tab
const savedTab = localStorage.getItem("activeTab");
if (savedTab) {
  document.getElementById(savedTab).checked = true;
  animateList(savedTab === "tab-unwatched" ? ".unwatched" : ".watched");
}

function createHearts(score, owner) {
  const wrapper = document.createElement("div");
  wrapper.className = "rating-stars";

  for (let i = 1; i <= 10; i++) {
    const heart = document.createElement("span");
    heart.className = `rating-heart ${owner}`;
    heart.textContent = "❤";

    if (i <= score) {
      heart.classList.add("filled");
    }

    wrapper.appendChild(heart);
  }

  return wrapper;
}


function transformRatings() {
  document.querySelectorAll(".watched .meta").forEach(meta => {
    const text = meta.textContent.trim();

    if (!text.includes("|")) return;

    const [vladPart, vikaPart] = text.split("|");

    const vladScore = parseInt(vladPart.split(":")[1]);
    const vikaScore = parseInt(vikaPart.split(":")[1]);

    const rating = document.createElement("div");
    rating.className = "rating";

    // vlad
    const vladRow = document.createElement("div");
    vladRow.className = "rating-row";

    const vladName = document.createElement("div");
    vladName.className = "rating-name";
    vladName.textContent = "vlad";

    vladRow.appendChild(vladName);
    vladRow.appendChild(createHearts(vladScore, "vlad"));

    // vika
    const vikaRow = document.createElement("div");
    vikaRow.className = "rating-row";

    const vikaName = document.createElement("div");
    vikaName.className = "rating-name";
    vikaName.textContent = "vika";

    vikaRow.appendChild(vikaName);
    vikaRow.appendChild(createHearts(vikaScore, "vika"));

    rating.appendChild(vladRow);
    rating.appendChild(vikaRow);

    meta.innerHTML = "";
    meta.appendChild(rating);
  });
}

transformRatings();