// Executed by macOS's built-in JXA interpreter, not by Electron's renderer.
ObjC.import('AppKit');
function run(argv) {
  const icon = $.NSWorkspace.sharedWorkspace.iconForFile($(argv[0]));
  const variants = [];
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const bitmap = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
      null, size, size, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
    const context = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmap);
    $.NSGraphicsContext.saveGraphicsState;
    try {
      $.NSGraphicsContext.setCurrentContext(context);
      icon.drawInRectFromRectOperationFractionRespectFlippedHints(
        $.NSMakeRect(0, 0, size, size), $.NSMakeRect(0, 0, 0, 0), $.NSCompositingOperationCopy, 1, true, null);
    } finally { $.NSGraphicsContext.restoreGraphicsState; }
    const data = bitmap.representationUsingTypeProperties($.NSPNGFileType, $());
    variants.push({ width: size, height: size, dataUrl: 'data:image/png;base64,' + ObjC.unwrap(data.base64EncodedStringWithOptions(0)) });
  }
  return JSON.stringify(variants);
}
