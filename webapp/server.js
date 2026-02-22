const express = require("express");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = parseInt(process.env.PORT || "8080", 10);
const PUBLIC_DIR = path.join(__dirname, "public");
const SLIDESHOW_DIR = path.join(__dirname, "slideshow");
const STATIC_DIR = path.join(__dirname, "static");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif"]);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);

  ws.on("message", (data) => {
    const cmd = data.toString().trim().toLowerCase();
    if (cmd === "next" || cmd === "prev") {
      for (const client of clients) {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(cmd);
        }
      }
    }
  });

  ws.on("close", () => clients.delete(ws));
});

app.get("/api/images", (_req, res) => {
  if (!fs.existsSync(SLIDESHOW_DIR)) return res.json([]);

  const images = fs.readdirSync(SLIDESHOW_DIR)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXT.has(ext) && fs.statSync(path.join(SLIDESHOW_DIR, f)).isFile();
    })
    .sort();

  res.json(images);
});

app.post("/api/upload", (req, res) => {
  const boundary = (req.headers["content-type"] || "").split("boundary=")[1];
  if (!boundary) return res.status(400).json({ error: "No boundary" });

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const buf = Buffer.concat(chunks);
    const files = parseMultipart(buf, boundary);
    if (!fs.existsSync(SLIDESHOW_DIR)) fs.mkdirSync(SLIDESHOW_DIR, { recursive: true });

    let count = 0;
    for (const file of files) {
      if (!file.filename) continue;
      const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      fs.writeFileSync(path.join(SLIDESHOW_DIR, safeName), file.data);
      count++;
    }
    res.json({ count });
  });
});

function parseMultipart(buf, boundary) {
  const sep = Buffer.from("--" + boundary);
  const results = [];
  let start = 0;

  while (true) {
    const idx = buf.indexOf(sep, start);
    if (idx === -1) break;
    if (start > 0) {
      const part = buf.slice(start, idx);
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const headers = part.slice(0, headerEnd).toString();
        const data = part.slice(headerEnd + 4, part.length - 2); // strip trailing \r\n
        const fnMatch = headers.match(/filename="([^"]+)"/);
        results.push({ filename: fnMatch ? fnMatch[1] : null, data });
      }
    }
    start = idx + sep.length + 2; // skip past boundary + \r\n
  }
  return results;
}

app.use("/public", express.static(PUBLIC_DIR));
app.use("/slideshow", express.static(SLIDESHOW_DIR));
app.use("/assets", express.static(path.join(__dirname, "image_processing")));
app.use("/static", express.static(STATIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/compose", (_req, res) => res.sendFile(path.join(STATIC_DIR, "compose.html")));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Slideshow server running on http://0.0.0.0:${PORT}`);
});
