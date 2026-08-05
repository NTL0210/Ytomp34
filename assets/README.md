# Application Assets

- `icon.png` is the source application logo used by the renderer and window.
- `icon.ico` is generated from `icon.png` for Windows executables and installers.
- `donation.jpg` is displayed only when the user opens the donation dialog.

Regenerate the Windows icon after replacing `icon.png`:

```powershell
.\scripts\create-icon.ps1
```

The script embeds 16, 24, 32, 48, 64, 128, and 256 pixel PNG frames in `icon.ico`.
