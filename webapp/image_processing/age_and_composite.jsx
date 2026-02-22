/*
 * Age & Composite — Photoshop Automation Script
 *
 * HOW TO USE:
 *   1. Open your template PSD in Photoshop. It should have:
 *        - "Background" layer (the news anchor photo)
 *        - "Screen Mask" layer group at the TOP with a layer mask
 *          that reveals ONLY the TV screen area (white = screen, black = anchor/frame)
 *
 *   2. Run this script: File → Scripts → Browse → age_and_composite.jsx
 *
 *   3. Select the folder containing your source images (webapp/public/)
 *
 *   4. Choose whether to also export a GIF slideshow
 *
 *   5. The script will, for each image:
 *        - Place it inside the "Screen Mask" group (so it's clipped to the screen)
 *        - Apply aging effects (grain, desaturation, warm shift, scanlines, etc.)
 *        - Save the composite as a PNG
 *
 * LAYER STRUCTURE (after running):
 *   [Screen Mask]  ← group with layer mask for the TV screen
 *       aged_image_1.png
 *   Background     ← the anchor photo
 *
 * Compatible with Photoshop 2025/2026 (ExtendScript JSX).
 */

#target photoshop

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

var GRAIN_AMOUNT    = 8;      // Noise %  (0–100)
var GRAIN_UNIFORM   = true;   // true = uniform, false = gaussian
var DESATURATION    = 40;     // How much to desaturate (0–100)
var WARM_RED        = 12;     // Color balance: red shift
var WARM_YELLOW     = -8;     // Color balance: yellow shift
var SCANLINE_OPACITY = 20;    // Scanline layer opacity %
var SCANLINE_SPACING = 2;     // Every Nth row is darkened
var BLUR_RADIUS     = 0.5;    // Gaussian blur px
var VIGNETTE_AMOUNT = -30;    // Lens correction vignette (negative = darken)
var CONTRAST_REDUCE = 15;     // Brightness/Contrast: reduce contrast by this
var BRIGHTNESS_LIFT = 8;      // Brightness/Contrast: lift shadows
var OUTPUT_SUBDIR   = "processed";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureRGBMode(doc) {
    if (doc.mode !== DocumentMode.RGB) {
        doc.changeMode(ChangeMode.RGB);
    }
}

function getLayerByName(doc, name) {
    try { return doc.layers.getByName(name); }
    catch (e) { return null; }
}

function getGroupByName(doc, name) {
    try { return doc.layerSets.getByName(name); }
    catch (e) { return null; }
}

function collectImageFiles(folder) {
    var exts = [".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"];
    var files = folder.getFiles();
    var images = [];
    for (var i = 0; i < files.length; i++) {
        if (!(files[i] instanceof File)) continue;
        var name = files[i].name.toLowerCase();
        // skip already-processed files
        if (name.indexOf("tv_") === 0) continue;
        for (var e = 0; e < exts.length; e++) {
            if (name.lastIndexOf(exts[e]) === name.length - exts[e].length) {
                images.push(files[i]);
                break;
            }
        }
    }
    images.sort(function (a, b) {
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
    return images;
}

// ---------------------------------------------------------------------------
// Aging effects — applied to the currently active layer
// ---------------------------------------------------------------------------

function applyAging(doc) {
    ensureRGBMode(doc);
    var layer = doc.activeLayer;

    // 1. Desaturate partially via Hue/Saturation
    //    (reduce saturation on the layer)
    desaturateLayer(DESATURATION);

    // 2. Warm color shift via Color Balance (midtones)
    applyColorBalance(WARM_RED, 0, WARM_YELLOW);

    // 3. Reduce contrast, lift brightness
    applyBrightnessContrast(BRIGHTNESS_LIFT, -CONTRAST_REDUCE);

    // 4. Add noise (film grain)
    applyNoise(GRAIN_AMOUNT, GRAIN_UNIFORM);

    // 5. Slight Gaussian blur (CRT softness)
    if (BLUR_RADIUS > 0) {
        applyGaussianBlur(BLUR_RADIUS);
    }

    // 6. Vignette via Lens Correction
    applyVignette(VIGNETTE_AMOUNT);

    // 7. Scanlines — add a new layer with horizontal lines
    addScanlines(doc, SCANLINE_SPACING, SCANLINE_OPACITY);
}

function desaturateLayer(amount) {
    // Hue/Saturation: reduce saturation
    var desc = new ActionDescriptor();
    var adj = new ActionDescriptor();
    adj.putInteger(charIDToTypeID("Hue "), 0);
    adj.putInteger(charIDToTypeID("Strt"), -amount);
    adj.putInteger(charIDToTypeID("Lght"), 0);
    var list = new ActionList();
    list.putObject(charIDToTypeID("HStA"), adj);
    desc.putList(charIDToTypeID("Adjs"), list);
    // Use colorize = false
    executeAction(charIDToTypeID("HStr"), desc, DialogModes.NO);
}

function applyColorBalance(redCyan, greenMagenta, blueYellow) {
    var desc = new ActionDescriptor();
    var adjList = new ActionList();
    // Midtones
    var mid = new ActionDescriptor();
    var vals = new ActionList();
    vals.putInteger(redCyan);       // +red / -cyan
    vals.putInteger(greenMagenta);  // +green / -magenta
    vals.putInteger(blueYellow);    // +blue / -yellow
    mid.putList(charIDToTypeID("Cyn "), vals);
    mid.putEnumerated(
        stringIDToTypeID("luminancePreservation"),
        charIDToTypeID("bool"),
        charIDToTypeID("bool")
    );
    // Apply via action
    var d2 = new ActionDescriptor();
    d2.putList(charIDToTypeID("Shd "), vals);
    // Simpler approach: use image adjustments menu
    try {
        app.activeDocument.activeLayer.adjustColorBalance(
            [redCyan, greenMagenta, blueYellow],   // shadows
            [redCyan, greenMagenta, blueYellow],   // midtones
            [0, 0, 0]                               // highlights
        );
    } catch (e) {
        // Fallback: use Curves for warm shift
        applyWarmCurves();
    }
}

function applyWarmCurves() {
    // Boost red channel slightly, reduce blue
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("AdjL"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);

    // Apply via Photo Filter warm instead
    var d = new ActionDescriptor();
    var c = new ActionDescriptor();
    c.putDouble(charIDToTypeID("Rd  "), 236);
    c.putDouble(charIDToTypeID("Grn "), 183);
    c.putDouble(charIDToTypeID("Bl  "), 104);
    d.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), c);
    d.putInteger(charIDToTypeID("Dnst"), 20);
    d.putBoolean(stringIDToTypeID("preserveLuminosity"), true);
    try {
        executeAction(stringIDToTypeID("photoFilter"), d, DialogModes.NO);
    } catch (e) { /* skip if not available */ }
}

function applyBrightnessContrast(brightness, contrast) {
    var desc = new ActionDescriptor();
    desc.putInteger(charIDToTypeID("Brgh"), brightness);
    desc.putInteger(charIDToTypeID("Cntr"), contrast);
    desc.putBoolean(stringIDToTypeID("useLegacy"), false);
    executeAction(charIDToTypeID("BrgC"), desc, DialogModes.NO);
}

function applyNoise(amount, uniform) {
    var desc = new ActionDescriptor();
    desc.putUnitDouble(charIDToTypeID("Amnt"), charIDToTypeID("#Prc"), amount);
    desc.putEnumerated(
        charIDToTypeID("Dstr"),
        charIDToTypeID("Dstr"),
        charIDToTypeID(uniform ? "Unfr" : "Gsn ")
    );
    desc.putBoolean(charIDToTypeID("Mnch"), true); // monochromatic
    executeAction(stringIDToTypeID("addNoise"), desc, DialogModes.NO);
}

function applyGaussianBlur(radius) {
    var desc = new ActionDescriptor();
    desc.putUnitDouble(charIDToTypeID("Rds "), charIDToTypeID("#Pxl"), radius);
    executeAction(charIDToTypeID("GsnB"), desc, DialogModes.NO);
}

function applyVignette(amount) {
    // Use Lens Correction filter for vignette
    try {
        var desc = new ActionDescriptor();
        desc.putInteger(stringIDToTypeID("vignetteMidpoint"), 50);
        desc.putInteger(stringIDToTypeID("vignetteAmount"), amount);
        executeAction(stringIDToTypeID("lensCorrection"), desc, DialogModes.NO);
    } catch (e) {
        // Fallback: skip vignette if Lens Correction unavailable
    }
}

function addScanlines(doc, spacing, opacity) {
    // Create a new layer with horizontal black lines
    var scanLayer = doc.artLayers.add();
    scanLayer.name = "Scanlines";
    scanLayer.opacity = opacity;
    scanLayer.blendMode = BlendMode.MULTIPLY;

    // Fill with a 1px-tall pattern via selection
    var w = doc.width.as("px");
    var h = doc.height.as("px");

    // Select every other row and fill black
    doc.activeLayer = scanLayer;
    doc.selection.selectAll();
    var fillColor = new SolidColor();
    fillColor.rgb.red = 0;
    fillColor.rgb.green = 0;
    fillColor.rgb.blue = 0;

    // Fill entire layer transparent first, then draw lines
    doc.selection.fill(fillColor, ColorBlendMode.NORMAL, 0, false);
    doc.selection.deselect();

    // Draw horizontal lines by selecting thin strips
    for (var y = 0; y < h; y += spacing * 2) {
        var region = [
            [0, y],
            [w, y],
            [w, y + 1],
            [0, y + 1]
        ];
        doc.selection.select([region]);
        doc.selection.fill(fillColor, ColorBlendMode.NORMAL, 100, false);
        doc.selection.deselect();
    }

    return scanLayer;
}

// ---------------------------------------------------------------------------
// Place image into the Screen Mask group
// ---------------------------------------------------------------------------

function placeImageInGroup(doc, group, imageFile) {
    // Open the image, copy, paste into our doc
    var placed = open(imageFile);
    placed.flatten();
    placed.selection.selectAll();
    placed.selection.copy();
    placed.close(SaveOptions.DONOTSAVECHANGES);

    doc.activeLayer = group.artLayers.count > 0
        ? group.artLayers[group.artLayers.count - 1]
        : group;

    // Paste inside the group
    app.activeDocument = doc;
    var idPast = charIDToTypeID("past");
    var desc = new ActionDescriptor();
    desc.putEnumerated(
        charIDToTypeID("AnAt"),
        charIDToTypeID("Annt"),
        charIDToTypeID("Anno")
    );
    executeAction(idPast, desc, DialogModes.NO);

    var newLayer = doc.activeLayer;
    newLayer.name = imageFile.name;

    // Move into group if not already there
    newLayer.move(group, ElementPlacement.INSIDE);

    // Resize to fill the document
    fitLayerToCanvas(doc, newLayer);

    return newLayer;
}

function fitLayerToCanvas(doc, layer) {
    // Get layer bounds and resize to fill canvas
    var bounds = layer.bounds;
    var lw = bounds[2].as("px") - bounds[0].as("px");
    var lh = bounds[3].as("px") - bounds[1].as("px");
    var cw = doc.width.as("px");
    var ch = doc.height.as("px");

    var scaleX = (cw / lw) * 100;
    var scaleY = (ch / lh) * 100;
    var scale = Math.max(scaleX, scaleY); // cover

    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);

    // Center the layer
    var b = layer.bounds;
    var dx = (cw / 2) - ((b[0].as("px") + b[2].as("px")) / 2);
    var dy = (ch / 2) - ((b[1].as("px") + b[3].as("px")) / 2);
    layer.translate(dx, dy);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function savePNG(doc, outputFolder, filename) {
    var file = new File(outputFolder + "/" + filename);
    var opts = new PNGSaveOptions();
    opts.compression = 6;
    opts.interlaced = false;
    doc.saveAs(file, opts, true, Extension.LOWERCASE);
}

function exportGIF(doc, outputFolder, frames, delayMs) {
    // Save for Web as animated GIF using all processed composites
    // This requires loading each saved PNG as a frame in Timeline.
    // Photoshop scripting can drive this via Actions.

    // Step 1: Create a new document for the GIF
    var w = doc.width.as("px");
    var h = doc.height.as("px");
    var gifDoc = app.documents.add(w, h, 72, "slideshow_gif", NewDocumentMode.RGB);

    // Step 2: Load each frame as a layer
    for (var i = 0; i < frames.length; i++) {
        var f = new File(frames[i]);
        if (!f.exists) continue;
        var opened = open(f);
        opened.flatten();
        opened.selection.selectAll();
        opened.selection.copy();
        opened.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = gifDoc;
        gifDoc.paste();
        gifDoc.activeLayer.name = "Frame " + (i + 1);
    }

    // Remove the default empty background
    try {
        var bg = gifDoc.layers[gifDoc.layers.length - 1];
        if (bg.name === "Background" || bg.isBackgroundLayer) {
            bg.isBackgroundLayer = false;
            bg.remove();
        }
    } catch (e) {}

    // Step 3: Use Save For Web to export as GIF
    var gifFile = new File(outputFolder + "/slideshow.gif");
    var sfwOpts = new ExportOptionsSaveForWeb();
    sfwOpts.format = SaveDocumentType.COMPUSERVEGIF;
    sfwOpts.colorReduction = ColorReductionType.ADAPTIVE;
    sfwOpts.colors = 256;
    sfwOpts.dither = Dither.DIFFUSION;
    sfwOpts.ditherAmount = 88;
    sfwOpts.transparency = false;

    gifDoc.exportDocument(gifFile, ExportType.SAVEFORWEB, sfwOpts);
    gifDoc.close(SaveOptions.DONOTSAVECHANGES);

    return gifFile;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    if (app.documents.length === 0) {
        alert(
            "Open your template PSD first.\n\n" +
            "It needs a layer group called \"Screen Mask\" with a layer mask " +
            "that reveals only the TV screen area."
        );
        return;
    }

    var doc = app.activeDocument;
    ensureRGBMode(doc);

    // Find the Screen Mask group
    var group = getGroupByName(doc, "Screen Mask");
    if (!group) {
        alert(
            "Layer group \"Screen Mask\" not found.\n\n" +
            "Create a group called \"Screen Mask\" with a layer mask where:\n" +
            "  • White = TV screen area (content goes here)\n" +
            "  • Black = anchor & frame (preserved)\n\n" +
            "Place it above the Background layer."
        );
        return;
    }

    // Select source folder
    var folder = Folder.selectDialog("Select folder with source images (e.g. public/)");
    if (!folder) return;

    var images = collectImageFiles(folder);
    if (images.length === 0) {
        alert("No image files found in:\n" + folder.fsName);
        return;
    }

    // Ask about GIF
    var makeGif = confirm(
        "Found " + images.length + " images.\n\n" +
        "Process all and export as individual PNGs?\n" +
        "Click YES to also create an animated GIF slideshow.\n" +
        "Click NO for PNGs only."
    );

    // Create output folder
    var outFolder = new Folder(folder.fsName + "/" + OUTPUT_SUBDIR);
    if (!outFolder.exists) outFolder.create();

    var savedFrames = [];

    for (var i = 0; i < images.length; i++) {
        // Store current state
        var historyState = doc.activeHistoryState;

        // Clear any previous content in the group
        while (group.artLayers.length > 0) {
            group.artLayers[0].remove();
        }

        // Place image
        var layer = placeImageInGroup(doc, group, images[i]);

        // Select just this layer and apply aging
        doc.activeLayer = layer;
        applyAging(doc);

        // Merge the scanlines into the image layer
        // (scanlines was added to the doc, move it into the group and merge)
        var scanLayer = getLayerByName(doc, "Scanlines");
        if (scanLayer) {
            scanLayer.move(group, ElementPlacement.INSIDE);
            doc.activeLayer = scanLayer;
            doc.activeLayer = layer;
            layer = group.merge(); // merge group contents
            // Recreate group since merge collapsed it
            // Actually, let's just merge down the scanlines layer
        }

        // Flatten a copy for saving
        var outName = "tv_" + images[i].name.replace(/\.[^.]+$/, "") + ".png";
        doc.flatten();
        savePNG(doc, outFolder.fsName, outName);
        savedFrames.push(outFolder.fsName + "/" + outName);

        // Undo flatten to restore layers
        doc.activeHistoryState = historyState;
    }

    // Clean up — remove any leftover content in the group
    while (group.artLayers.length > 0) {
        group.artLayers[0].remove();
    }

    // Export GIF if requested
    if (makeGif && savedFrames.length > 1) {
        try {
            var gifFile = exportGIF(doc, outFolder.fsName, savedFrames, 3000);
            alert(
                "Done!\n\n" +
                savedFrames.length + " PNGs saved to:\n" + outFolder.fsName + "\n\n" +
                "GIF saved to:\n" + gifFile.fsName
            );
        } catch (e) {
            alert(
                "PNGs saved (" + savedFrames.length + ") but GIF export failed:\n" + e.message + "\n\n" +
                "You can create the GIF manually from the PNGs in:\n" + outFolder.fsName
            );
        }
    } else {
        alert("Done! " + savedFrames.length + " PNGs saved to:\n" + outFolder.fsName);
    }
}

main();
