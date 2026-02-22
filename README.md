# MonkeySymbols — GPIO Slideshow

A full-screen image slideshow served from a Raspberry Pi 5, advanced by a
physical push-button wired to a GPIO pin.

## Architecture

```
┌──────────────┐  WebSocket "next"  ┌────────────────────┐
│  GPIO bridge │ ─────────────────► │  Slideshow server   │
│  (pi/)       │                    │  (webapp/)          │
└──────┬───────┘                    └────────┬───────────┘
       │                                     │
  GPIO17 ← button                   Browser ← localhost:8080
```

Two separate processes running on the Pi:

| Process | Folder | Role |
|---------|--------|------|
| **Slideshow server** | `webapp/` | Serves the frontend + images, hosts the WebSocket |
| **GPIO bridge** | `pi/` | Reads the button, sends `"next"` over WebSocket |

## Quick start

### 1. Add your images

Drop `.jpg`, `.png`, `.gif`, `.webp`, `.bmp`, or `.svg` files into
`webapp/public/`. They will be displayed in alphabetical order.

### 2. Start the slideshow server

```bash
cd webapp
npm install
npm start
```

The server starts on **http://0.0.0.0:8080** by default.  
Override with `PORT=3000 npm start`.

Open a browser (on the Pi or any device on the same network) to
`http://<pi-ip>:8080`.

### 3. Start the GPIO bridge

```bash
cd pi
pip install -r requirements.txt
python gpio_bridge.py
```

Default settings: GPIO17, connects to `ws://localhost:8080/ws`.  
Override with flags:

```bash
python gpio_bridge.py --pin 27 --server ws://localhost:3000/ws --bounce 0.08
```

### 4. Press the button

Each press sends `"next"` to the slideshow. Done.

## Wiring

Momentary push-button — simplest safe setup:

```
GPIO17 (pin 11) ──── switch ──── GND (pin 9)
```

The script enables the Pi's internal pull-up resistor, so no external
components are needed.

> **Warning:** Pi GPIO is 3.3 V only. If your pulse source outputs 5 V or
> higher, use an opto-isolator or level shifter.

## Controls (browser)

| Input | Action |
|-------|--------|
| Right arrow / Space | Next slide |
| Left arrow | Previous slide |
| Click right half | Next slide |
| Click left half | Previous slide |
| GPIO button | Next slide |

## Running on boot (optional)

Create two systemd services. Example for the slideshow server:

```ini
# /etc/systemd/system/slideshow.service
[Unit]
Description=MonkeySymbols Slideshow Server
After=network.target

[Service]
WorkingDirectory=/home/pi/MonkeySymbols/webapp
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

And similarly for the GPIO bridge (`gpio_bridge.py`).
Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable slideshow gpio-bridge
sudo systemctl start slideshow gpio-bridge
```
