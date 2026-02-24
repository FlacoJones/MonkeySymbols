(function () {
  "use strict";

  // ── DOM refs ──
  const templateInput = document.getElementById("template-input");
  const maskInput = document.getElementById("mask-input");
  const photosInput = document.getElementById("photos-input");
  const templateStatus = document.getElementById("template-status");
  const maskStatus = document.getElementById("mask-status");
  const photosStatus = document.getElementById("photos-status");
  const templateThumb = document.getElementById("template-thumb");
  const maskThumb = document.getElementById("mask-thumb");
  const btnCompose = document.getElementById("btn-compose");
  const btnDownloadAll = document.getElementById("btn-download-all");
  const btnSendSlideshow = document.getElementById("btn-send-to-slideshow");
  const btnReset = document.getElementById("btn-reset");
  const btnCopy = document.getElementById("btn-copy");
  const progressWrap = document.getElementById("progress-wrap");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const previewEmpty = document.getElementById("preview-empty");
  const previewCanvas = document.getElementById("preview-canvas");
  const previewNav = document.getElementById("preview-nav");
  const previewCounter = document.getElementById("preview-counter");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnDownloadOne = document.getElementById("btn-download-one");

  // ── State ──
  let templateImg = null;
  let maskImg = null;
  let photoFiles = [];
  let composites = []; // array of { blob, name }
  let currentIdx = 0;

  // ── Helpers ──

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function drawThumb(canvas, img) {
    const ctx = canvas.getContext("2d");
    const aspect = img.width / img.height;
    canvas.width = 280;
    canvas.height = Math.round(280 / aspect);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.classList.add("visible");
  }

  function updateComposeButton() {
    btnCompose.disabled = !(templateImg && maskImg && photoFiles.length > 0);
  }

  function stripExtension(name) {
    return name.replace(/\.[^.]+$/, "");
  }

  // ── Compositing ──

  // Convert the B&W mask's luminance into an alpha-only mask.
  // White pixels → alpha 255 (photo visible), black → alpha 0 (template visible).
  let alphaMask = null;
  let maskBounds = null; // { x, y, w, h } bounding box of white region

  function buildAlphaMask() {
    const w = maskImg.width;
    const h = maskImg.height;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(maskImg, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    const LUM_THRESHOLD = 128;

    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (lum >= LUM_THRESHOLD) {
        const px = (i / 4) % w;
        const py = Math.floor((i / 4) / w);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(lum);
    }

    ctx.putImageData(imgData, 0, 0);
    alphaMask = c;
    maskBounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // ── CRT aging effect ──

  function applyCRTAging(ctx, x, y, w, h) {
    const imgData = ctx.getImageData(x, y, w, h);
    const d = imgData.data;
    const len = d.length;

    for (let i = 0; i < len; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];

      // Partial desaturation (~40%)
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = r * 0.6 + gray * 0.4;
      g = g * 0.6 + gray * 0.4;
      b = b * 0.6 + gray * 0.4;

      // Warm color shift (boost red, reduce blue)
      r = Math.min(255, r + 12);
      g = Math.min(255, g + 4);
      b = Math.max(0, b - 10);

      // Reduce contrast, lift shadows
      r = r * 0.85 + 38;
      g = g * 0.85 + 38;
      b = b * 0.85 + 38;

      // Film grain (monochromatic noise)
      const noise = (Math.random() - 0.5) * 30;
      r += noise;
      g += noise;
      b += noise;

      d[i]     = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }

    // CRT scanlines: darken every other row
    for (let row = 0; row < h; row += 2) {
      const base = row * w * 4;
      for (let col = 0; col < w; col++) {
        const idx = base + col * 4;
        d[idx]     = d[idx] * 0.82;
        d[idx + 1] = d[idx + 1] * 0.82;
        d[idx + 2] = d[idx + 2] * 0.82;
      }
    }

    ctx.putImageData(imgData, x, y);

    // Vignette: radial gradient overlay darkening the edges
    const cx = x + w / 2;
    const cy = y + h / 2;
    const radius = Math.sqrt(w * w + h * h) / 2;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  function compositeOne(photo) {
    if (!alphaMask) buildAlphaMask();

    const w = templateImg.width;
    const h = templateImg.height;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");

    // Scale the mask bounds to template dimensions
    const scaleX = w / maskImg.width;
    const scaleY = h / maskImg.height;
    const bx = maskBounds.x * scaleX;
    const by = maskBounds.y * scaleY;
    const bw = maskBounds.w * scaleX;
    const bh = maskBounds.h * scaleY;

    // Scale photo to cover the mask bounding box (with 5% padding)
    const pad = 1.05;
    const targetW = bw * pad;
    const targetH = bh * pad;
    const photoAspect = photo.width / photo.height;
    const boxAspect = targetW / targetH;
    let sw, sh;
    if (photoAspect > boxAspect) {
      sh = targetH;
      sw = Math.round(targetH * photoAspect);
    } else {
      sw = targetW;
      sh = Math.round(targetW / photoAspect);
    }
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const sx = Math.round(cx - sw / 2);
    const sy = Math.round(cy - sh / 2);

    // 1) Draw photo sized and centered on the mask region
    ctx.drawImage(photo, sx, sy, sw, sh);

    // 2) Apply CRT aging to the photo region
    const ax = Math.max(0, Math.floor(bx - bw * 0.025));
    const ay = Math.max(0, Math.floor(by - bh * 0.025));
    const aw = Math.min(w - ax, Math.ceil(bw * 1.05));
    const ah = Math.min(h - ay, Math.ceil(bh * 1.05));
    applyCRTAging(ctx, ax, ay, aw, ah);

    // 3) Punch a hole in the template where the mask is white
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d");

    offCtx.drawImage(templateImg, 0, 0, w, h);
    offCtx.globalCompositeOperation = "destination-out";
    const feather = Math.round(Math.max(w, h) * 0.003);
    offCtx.filter = "blur(" + feather + "px)";
    offCtx.drawImage(alphaMask, 0, 0, w, h);
    offCtx.filter = "none";

    // 4) Layer the punched template over the aged photo
    ctx.drawImage(offscreen, 0, 0);

    // 5) Slight vignette over the entire composite
    const vr = Math.sqrt(w * w + h * h) / 2;
    const vg = ctx.createRadialGradient(w / 2, h / 2, vr * 0.55, w / 2, h / 2, vr);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  // ── Preview ──

  function showPreview(idx) {
    if (composites.length === 0) return;
    currentIdx = ((idx % composites.length) + composites.length) % composites.length;

    const url = URL.createObjectURL(composites[currentIdx].blob);
    const img = new Image();
    img.onload = () => {
      previewCanvas.width = img.width;
      previewCanvas.height = img.height;
      previewCanvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
    };
    img.src = url;

    previewCanvas.classList.add("visible");
    previewEmpty.classList.add("hidden");
    previewNav.classList.remove("hidden");
    previewCounter.textContent = (currentIdx + 1) + " / " + composites.length;
  }

  // ── Load defaults ──

  async function loadDefaults() {
    try {
      templateImg = await loadImage("/assets/template.png");
      templateStatus.textContent = "template.png";
      document.querySelector('label[for="template-input"]').classList.add("has-file");
      drawThumb(templateThumb, templateImg);
    } catch { /* no default template */ }

    try {
      maskImg = await loadImage("/assets/mask.png");
      maskStatus.textContent = "mask.png";
      document.querySelector('label[for="mask-input"]').classList.add("has-file");
      drawThumb(maskThumb, maskImg);
    } catch { /* no default mask */ }

    updateComposeButton();
  }

  loadDefaults();

  // ── Upload handlers ──

  templateInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    templateImg = await loadImage(await fileToDataURL(file));
    templateStatus.textContent = file.name;
    templateInput.closest(".upload-label") ||
      templateInput.previousElementSibling;
    document.querySelector('label[for="template-input"]').classList.add("has-file");
    drawThumb(templateThumb, templateImg);
    updateComposeButton();
  });

  maskInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    maskImg = await loadImage(await fileToDataURL(file));
    alphaMask = null;
    maskBounds = null;
    maskStatus.textContent = file.name;
    document.querySelector('label[for="mask-input"]').classList.add("has-file");
    drawThumb(maskThumb, maskImg);
    updateComposeButton();
  });

  photosInput.addEventListener("change", (e) => {
    const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i;
    photoFiles = Array.from(e.target.files)
      .filter((f) => IMAGE_EXT.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    photosStatus.textContent = photoFiles.length + " image" + (photoFiles.length !== 1 ? "s" : "");
    document.querySelector('label[for="photos-input"]').classList.add("has-file");
    updateComposeButton();
  });

  // ── Compose ──

  btnCompose.addEventListener("click", async () => {
    if (!templateImg || !maskImg || photoFiles.length === 0) return;

    composites = [];
    btnCompose.disabled = true;
    btnDownloadAll.disabled = true;
    btnSendSlideshow.disabled = true;
    progressWrap.classList.remove("hidden");

    for (let i = 0; i < photoFiles.length; i++) {
      progressFill.style.width = ((i / photoFiles.length) * 100) + "%";
      progressText.textContent = (i + 1) + " / " + photoFiles.length;

      const dataURL = await fileToDataURL(photoFiles[i]);
      const photo = await loadImage(dataURL);
      const canvas = compositeOne(photo);
      const blob = await canvasToBlob(canvas);

      composites.push({
        blob,
        name: "composed_" + stripExtension(photoFiles[i].name) + ".png",
      });

      showPreview(i);
      // Yield to the browser so the UI updates
      await new Promise((r) => setTimeout(r, 0));
    }

    progressFill.style.width = "100%";
    btnCompose.disabled = false;
    btnDownloadAll.disabled = false;
    btnSendSlideshow.disabled = false;
    showPreview(0);
  });

  // ── Navigation ──

  btnPrev.addEventListener("click", () => showPreview(currentIdx - 1));
  btnNext.addEventListener("click", () => showPreview(currentIdx + 1));

  document.addEventListener("keydown", (e) => {
    if (composites.length === 0) return;
    if (e.key === "ArrowRight") showPreview(currentIdx + 1);
    else if (e.key === "ArrowLeft") showPreview(currentIdx - 1);
  });

  // ── Download single ──

  btnDownloadOne.addEventListener("click", () => {
    if (composites.length === 0) return;
    const { blob, name } = composites[currentIdx];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ── Download all as ZIP (using JSZip from CDN) ──

  let jsZipLoaded = false;

  function loadJSZip() {
    if (jsZipLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js";
      s.onload = () => { jsZipLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  btnDownloadAll.addEventListener("click", async () => {
    if (composites.length === 0) return;
    btnDownloadAll.textContent = "Zipping…";
    btnDownloadAll.disabled = true;

    try {
      await loadJSZip();
      const zip = new JSZip();
      for (const c of composites) {
        zip.file(c.name, c.blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "composites.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      // Fallback: download individually
      for (const c of composites) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(c.blob);
        a.download = c.name;
        a.click();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    btnDownloadAll.textContent = "Download ZIP";
    btnDownloadAll.disabled = false;
  });

  // ── Send to slideshow (upload to /public via server) ──

  btnSendSlideshow.addEventListener("click", async () => {
    if (composites.length === 0) return;
    btnSendSlideshow.textContent = "Uploading…";
    btnSendSlideshow.disabled = true;

    try {
      const formData = new FormData();
      for (const c of composites) {
        formData.append("images", c.blob, c.name);
      }
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      const result = await res.json();
      btnSendSlideshow.textContent = result.count + " sent ✓";
    } catch {
      btnSendSlideshow.textContent = "Failed ✗";
    }
    setTimeout(() => {
      btnSendSlideshow.textContent = "Send to Slideshow";
      btnSendSlideshow.disabled = false;
    }, 2000);
  });
  // ── Copy photos from ~/Desktop/trump ──

  btnCopy.addEventListener("click", async () => {
    btnCopy.textContent = "Copying…";
    btnCopy.disabled = true;

    try {
      const res = await fetch("/api/copy-photos", { method: "POST" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      btnCopy.textContent = result.copied + " copied";
    } catch {
      btnCopy.textContent = "Failed";
    }
    setTimeout(() => {
      btnCopy.textContent = "Copy Photos";
      btnCopy.disabled = false;
    }, 2000);
  });

  // ── Reset folders ──

  btnReset.addEventListener("click", async () => {
    if (!confirm("Delete all files in public/ and slideshow/?")) return;
    btnReset.textContent = "Clearing…";
    btnReset.disabled = true;

    try {
      const res = await fetch("/api/reset", { method: "DELETE" });
      if (!res.ok) throw new Error();
      const result = await res.json();
      btnReset.textContent = result.deleted + " deleted";
    } catch {
      btnReset.textContent = "Failed";
    }
    setTimeout(() => {
      btnReset.textContent = "Reset Folders";
      btnReset.disabled = false;
    }, 2000);
  });
})();
