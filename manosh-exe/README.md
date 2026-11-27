# manosh.exe

A tiny pixel-art computer engineer (glasses, headphones, hoodie, laptop) who lives on your Windows 11 desktop. Transparent, borderless, always on top,
no taskbar button. He wanders, sits, naps, dances, drinks coffee, and reacts when you poke or carry him.

## Build the installer (Windows)
1. Install Node.js LTS (https://nodejs.org).
2. Double-click **`build-windows.bat`** (or run `npm install` then `npm run dist`).
3. Installer appears at `dist\Manosh-Setup.exe`. Run it; he drops in from the top of your screen.

No Windows machine handy? Push this folder to GitHub and run the *Build Windows installer* workflow
(Actions tab). The installer is attached as a downloadable artifact.

Try without installing: `npm install` then `npm start`.

> The installer is unsigned, so SmartScreen may show "More info > Run anyway".
> If the build says "Cannot create symbolic link", enable Windows Developer Mode and retry.

## Interactions
| Action | Result |
|---|---|
| Left-click | Reacts (surprise, wave, laugh...). Poke him 5x fast and he gets annoyed. |
| Drag | Picks him up; drop him mid-air and he falls and lands. |
| Right-click | Menu: say hi, coffee, dance, jump, run, sit, look around, sleep/wake, size, wander, speech bubbles, start with Windows, quit. |
| Tray icon | Left-click brings him back to center; right-click opens the same menu. |

Clicks pass through transparent pixels: only the character itself is clickable.

## How he decides what to do
`src/renderer/brain.js` is a small life simulation: energy drains as he walks/runs and recovers asleep or with
coffee; mood rises when he dances; he naps more at night; recently used activities are down-weighted so
he does not loop. `npm test` simulates hours of his life (including random clicks, drags and commands).

## Project layout
```
src/main/main.js        window, tray, menu, settings, IPC
src/main/preload.js     safe bridge to the renderer
src/renderer/brain.js   behaviour engine (pure logic, unit-simulated)
src/renderer/renderer.js drawing, effects, click-through hit-testing, dragging
tools/generate-sprites.js  procedural pixel-art generator (62 frames) -> assets/
tools/selftest.js       headless simulation tests
```
Edit the palette at the top of `tools/generate-sprites.js` (skin, hair, hoodie colour, beard...) and run
`npm run sprites` to restyle him. Settings are stored in `%APPDATA%\manosh\settings.json`.
