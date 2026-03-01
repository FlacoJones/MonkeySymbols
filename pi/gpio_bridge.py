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
"""

import argparse
import asyncio
import signal
import sys

from gpiozero import Button

try:
    import websockets
except ImportError:
    sys.exit("Missing dependency: pip install websockets")

WS_RECONNECT_DELAY = 2  # seconds


async def run(pin: int, server_url: str, bounce: float):
    button = Button(pin, pull_up=True, bounce_time=bounce)
    loop = asyncio.get_running_loop()
    press_event = asyncio.Event()

    def on_press():
        loop.call_soon_threadsafe(press_event.set)

    button.when_pressed = on_press

    print(f"Listening on GPIO{pin} (pull-up, bounce={bounce}s)")
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
    parser.add_argument(
        "--bounce", type=float, default=0.05,
        help="Debounce time in seconds (default: 0.05)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(run(args.pin, args.server, args.bounce))
    except KeyboardInterrupt:
        print("\nBye.")
        sys.exit(0)


if __name__ == "__main__":
    main()
