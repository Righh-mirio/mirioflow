# Mirioflow icons

`generate.py` draws the app icon and the tray icons (a white roaring tiger face
on orange) as SVG and renders them with the Tauri CLI, so it needs no extra
tools on macOS or Windows. Run it from this folder after `npm ci`:

```bash
python3 generate.py
```

It writes `app-icon.svg`, renders every platform size into a temporary folder
and overwrites only the files that already exist in `src-tauri/icons/`, plus
`tray-idle.png`, `tray-microphone.png` (dictating) and
`tray-spinner/frame_00.png`…`frame_11.png`.

The tiger paths are shared with `src/components/MirioflowWordmark.tsx`; change
both together.
