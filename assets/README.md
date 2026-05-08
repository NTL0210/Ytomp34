# Application Icon

## icon.ico

The application icon should be placed in this directory as `icon.ico`.

### Requirements:
- Format: ICO (Windows Icon)
- Size: 256x256 pixels (recommended)
- Multiple sizes embedded: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256

### How to create:

1. **Using online tools:**
   - Visit https://www.icoconverter.com/
   - Upload a PNG image (256x256 or larger)
   - Select all icon sizes
   - Download the generated .ico file

2. **Using GIMP:**
   - Open your image in GIMP
   - Resize to 256x256 (Image → Scale Image)
   - Export as .ico (File → Export As → icon.ico)
   - Select multiple sizes in export dialog

3. **Using ImageMagick:**
   ```bash
   convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
   ```

### Placeholder Icon

For development purposes, a placeholder icon has been created. Replace it with your actual application icon before production release.

### Icon Design Guidelines:

- Use simple, recognizable shapes
- Ensure visibility at small sizes (16x16)
- Use high contrast colors
- Avoid fine details that won't be visible when scaled down
- Consider the Windows taskbar and system tray appearance
- Test on both light and dark backgrounds
