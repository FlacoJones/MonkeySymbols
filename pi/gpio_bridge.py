#!/usr/bin/env python3
"""
GPIO → WebSocket bridge for the slideshow.

Monitors a momentary push-button on a GPIO pin and sends "next"
to the slideshow server's WebSocket endpoint each time it's pressed.

Wiring (momentary switch, simplest safe setup):
  - One leg of the switch → GND (e.g. physical pin 9, 14, 20, 25, 30, 34, or 39)
  - Other leg → GPIO6 (physical pin 31)
  - Internal pull-up is enabled, so no external resistor needed.

If your pulse source outputs >3.3V, use an opto-isolator or
level shifter — do NOT feed 5V/12V directly into Pi GPIO.

Debounce / cooldown history (2026-03-02)
----------------------------------------
The physical switch in use is noisy and slow-closing, chattering at roughly
3 transitions per second.  Two layers of protection were needed:

  1. gpiozero bounce_time (--bounce):
     Originally 0.05s — far too short; the switch chatter sailed right
     through.  Increased to 0.3s so gpiozero's edge-suppression covers
     the fast part of the contact noise.

  2. Application-level cooldown (--cooldown):
     Even with 0.3s bounce_time, slower chatter could still produce
     multiple distinct press callbacks that each passed the bounce filter
     individually, causing the slideshow to skip ahead several images on
     a single physical press.  A monotonic-clock gate was added in the
     on_press callback: after accepting a press, all further callbacks
     within `cooldown` seconds are silently dropped.  0.35s works well
     for this switch (~3 Hz chatter rate).

  Combined, bounce=0.3 + cooldown=0.35 reliably collapses each physical
  press into exactly one "next" event.

  Previous values for reference:
    --bounce  0.05  (original, too short)
    --bounce  0.3   (current, handles fast edge chatter)
    --cooldown 0.5  (first attempt, felt sluggish)
    --cooldown 0.35 (current, good balance for ~3 Hz noisy switch)
"""

import argparse
import asyncio
import signal
import sys
import time

from gpiozero import Button

try:
    import websockets
except ImportError:
    sys.exit("Missing dependency: pip install websockets")

WS_RECONNECT_DELAY = 2  # seconds


async def run(pin: int, server_url: str, bounce: float, cooldown: float):
    button = Button(pin, pull_up=True, bounce_time=bounce)
    loop = asyncio.get_running_loop()
    press_event = asyncio.Event()

    # gpiozero's bounce_time handles fast edge chatter, but a very noisy or
    # slow-closing switch can still produce multiple press callbacks over a
    # longer window.  This timestamp gate ignores any callback that arrives
    # within `cooldown` seconds of the last accepted press.
    last_accepted = 0.0

    def on_press():
        nonlocal last_accepted
        now = time.monotonic()
        if now - last_accepted < cooldown:
            return
        last_accepted = now
        loop.call_soon_threadsafe(press_event.set)

    button.when_pressed = on_press

    print(f"Listening on GPIO{pin} (pull-up, bounce={bounce}s, cooldown={cooldown}s)")
    print(f"Target: {server_url}")
    print("Press Ctrl-C to quit.\n")

    while True:
        try:
            async with websockets.connect(server_url) as ws:
                print("Connected to slideshow server.")
                while True:
                    await press_event.wait()
                    press_event.clear()
                    await ws.send("next")
                    print("→ sent 'next'")
        except (OSError, websockets.exceptions.WebSocketException) as exc:
            print(f"Connection lost ({exc}), retrying in {WS_RECONNECT_DELAY}s…")
            await asyncio.sleep(WS_RECONNECT_DELAY)


def main():
    parser = argparse.ArgumentParser(description="GPIO → slideshow bridge")
    parser.add_argument(
        "--pin", type=int, default=6,
        help="BCM GPIO pin number (default: 6)",
    )
    parser.add_argument(
        "--server", type=str, default="ws://localhost:8080/ws",
        help="WebSocket URL of the slideshow server",
    )
    # Previous default was 0.05s — too short for noisy / slow-closing switches
    # that chatter during contact. 0.3s handles heavy bounce and static well.
    parser.add_argument(
        "--bounce", type=float, default=0.3,
        help="Debounce time in seconds (default: 0.3)",
    )
    parser.add_argument(
        "--cooldown", type=float, default=0.35,
        help="Min seconds between accepted presses (default: 0.35)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(run(args.pin, args.server, args.bounce, args.cooldown))
    except KeyboardInterrupt:
        print("\nBye.")
        sys.exit(0)


if __name__ == "__main__":
    main()
