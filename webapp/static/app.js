(function () {
  "use strict";

  const container = document.getElementById("slides-container");
  const counter = document.getElementById("counter");
  const emptyState = document.getElementById("empty-state");

  let images = [];
  let current = 0;
  let counterTimeout = null;

  function buildSlides() {
    container.innerHTML = "";
    images.forEach((src, i) => {
      const div = document.createElement("div");
      div.className = "slide" + (i === 0 ? " active" : "");
      const img = document.createElement("img");
      img.src = "/public/" + encodeURIComponent(src);
      img.alt = src;
      img.draggable = false;
      div.appendChild(img);
      container.appendChild(div);
    });
  }

  function showCounter() {
    counter.classList.add("visible");
    clearTimeout(counterTimeout);
    counterTimeout = setTimeout(() => counter.classList.remove("visible"), 2000);
  }

  function updateCounter() {
    counter.textContent = (current + 1) + " / " + images.length;
    showCounter();
  }

  function goTo(index) {
    if (images.length === 0) return;
    const slides = container.querySelectorAll(".slide");
    slides[current]?.classList.remove("active");
    current = ((index % images.length) + images.length) % images.length;
    slides[current]?.classList.add("active");
    updateCounter();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  // --- WebSocket ---
  function connectWS() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(proto + "//" + location.host + "/ws");

    ws.onmessage = function (ev) {
      const cmd = ev.data.trim().toLowerCase();
      if (cmd === "next") next();
      else if (cmd === "prev") prev();
    };

    ws.onclose = function () {
      setTimeout(connectWS, 2000);
    };

    ws.onerror = function () {
      ws.close();
    };
  }

  // --- Keyboard ---
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  });

  // --- Click / Touch ---
  document.addEventListener("click", function (e) {
    if (e.clientX > window.innerWidth / 2) next();
    else prev();
  });

  // --- Init ---
  async function init() {
    try {
      const res = await fetch("/api/images");
      images = await res.json();
    } catch {
      images = [];
    }

    if (images.length === 0) {
      emptyState.classList.add("show");
      return;
    }

    buildSlides();
    updateCounter();
    connectWS();
  }

  init();
})();
