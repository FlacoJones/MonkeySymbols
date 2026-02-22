const express = require("express");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = parseInt(process.env.PORT || "8080", 10);
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_DIR = path.join(__dirname, "static");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);

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
  if (!fs.existsSync(PUBLIC_DIR)) return res.json([]);

  const images = fs.readdirSync(PUBLIC_DIR)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXT.has(ext) && fs.statSync(path.join(PUBLIC_DIR, f)).isFile();
    })
    .sort();

  res.json(images);
});

app.use("/public", express.static(PUBLIC_DIR));
app.use("/static", express.static(STATIC_DIR));
app.get("/", (_req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Slideshow server running on http://0.0.0.0:${PORT}`);
});
