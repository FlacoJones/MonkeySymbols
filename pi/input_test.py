#!/usr/bin/env python3
"""
Simple GPIO input test for Raspberry Pi 5.

Prints a message every time GPIO6 (physical pin 31) is pulled to ground.

Getting Started
---------------
1. You're on a Pi 5 with Cursor running over USB-C — you're already set.

2. Install the one dependency you need (gpiozero ships with Pi OS, but just in case):
       pip install gpiozero

3. Wire it up:
       - Connect one side of your switch/wire to GND (any ground pin, e.g. pin 9).
       - Connect the other side to GPIO6 (physical pin 31).
       No resistor needed — the script enables the internal pull-up.

4. Run this script:
       python3 pi/input_test.py

5. Pull GPIO6 to ground (press the button / short the wire) and you'll see
   a message printed each time. Ctrl-C to quit.
"""

from signal import pause
from gpiozero import Button

PIN = 6

button = Button(PIN, pull_up=True, bounce_time=0.05)

print(f"Waiting for input on GPIO{PIN} (physical pin 31, pull-up enabled)...")
print("Pull the pin to GND to trigger. Ctrl-C to quit.\n")

button.when_pressed = lambda: print(f"GPIO{PIN} activated!")

pause()
