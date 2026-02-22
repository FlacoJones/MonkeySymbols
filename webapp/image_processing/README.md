# Image Processing — Photoshop Automation

A Photoshop script that ages photos to look like old CRT broadcast footage
and composites them onto the TV screen behind the news anchor.

## Setup (one-time)

### 1. Create the template PSD

Open `template.png` in Photoshop and set up the layers:

```
[Screen Mask]     ← Layer group with a layer mask
    (images go here, placed by the script)
Background        ← The anchor photo (template.png)
```

### 2. Create the screen mask

- Select the layer group "Screen Mask"
- Add a **layer mask** to the group
- Paint the mask:
  - **White** = TV screen area (where images will appear)
  - **Black** = everything else (anchor's body, shoulder, TV frame, background)
- This mask controls exactly where the image shows through

**Tip:** Use the Pen Tool to trace the TV screen edge precisely, including
the curve around the anchor's shoulder. Convert the path to a selection,
then fill it white on the layer mask.

### 3. Save as `template.psd`

Save this layered file — you'll reopen it each time you run the script.

## Running the script

1. Open `template.psd` in Photoshop
2. Go to **File → Scripts → Browse**
3. Select `age_and_composite.jsx`
4. Pick your source image folder (e.g. `webapp/public/`)
5. Choose whether to also export an animated GIF
6. Wait — the script processes each image and saves to `public/processed/`

## What the script does to each image

### Aging effects

| Effect | What it does | Config variable |
|--------|-------------|-----------------|
| Desaturation | Reduces color saturation 40% | `DESATURATION` |
| Warm color shift | Pushes reds/yellows (old film look) | `WARM_RED`, `WARM_YELLOW` |
| Contrast reduction | Lifts blacks, compresses range | `CONTRAST_REDUCE`, `BRIGHTNESS_LIFT` |
| Film grain | Monochromatic noise | `GRAIN_AMOUNT`, `GRAIN_UNIFORM` |
| CRT softness | Slight Gaussian blur | `BLUR_RADIUS` |
| Vignette | Darkened edges | `VIGNETTE_AMOUNT` |
| Scanlines | Horizontal CRT scanline overlay | `SCANLINE_SPACING`, `SCANLINE_OPACITY` |

### Compositing

- Places the aged image inside the "Screen Mask" group
- Resizes to cover the full canvas (maintains aspect ratio)
- The group's layer mask clips it to just the TV screen
- Your anchor and TV frame stay on top

### GIF export (optional)

If selected, creates `slideshow.gif` from all processed frames using
Save For Web with 256-color adaptive palette.

## Tuning

All aging parameters are constants at the top of the JSX file.
Edit them to taste — the variable names and comments explain each one.

## Output

```
public/processed/
├── tv_screenshot1.png
├── tv_screenshot2.png
├── tv_screenshot3.png
└── slideshow.gif          (if GIF option selected)
```
