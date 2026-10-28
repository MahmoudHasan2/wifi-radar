# Emberline RF-9: Cinematic Scanner Demo

🇬🇧 English · [🇩🇪 Deutsch](README.de.md)

[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-ff5a1f)](https://mahmoudhasan2.github.io/wifi-radar/)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS%20%C2%B7%20no%20dependencies-F7DF1E?logo=javascript&logoColor=black)

**[▶ Open the live demo](https://mahmoudhasan2.github.io/wifi-radar/)**

A browser-based **visual prop** that looks like a futuristic Wi-Fi-assisted, through-wall thermal scanner.

> **This is a simulation.** It does not detect people, heat, movement or anything behind walls. The silhouettes are drawn by code, the target attributes are fixed strings in a script, and the Wi-Fi readings are generated locally with noise functions. Normal Wi-Fi signals and webcams cannot reveal a person's sex, age, height, weight or location through a wall.

Plain HTML, CSS and vanilla JavaScript. No backend, build step, dependencies, external fonts or downloaded assets. Every visual is generated with CSS and Canvas.

```
index.html   page structure
styles.css   visual design, layout, responsive and reduced-motion rules
app.js       render loop, scenarios, procedural figures, telemetry, camera, input
README.md    this file
```

---

## Launching

### Option A: open the file
Double-click `index.html`. It opens in Chrome, Edge or Firefox.

Some browsers refuse camera access for pages opened as `file://`. If **Start camera** shows an error, use option B. The rest of the demo works either way.

### Option B: local HTTP server (recommended for the camera)
From this folder, run one of these:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve -l 8000 .
```

Then open **http://localhost:8000**. Browsers treat `localhost` as a secure origin, so the camera works there.

### Before a shoot
1. Open the page and press **F** (or click Fullscreen).
2. Optional: click **Start camera** and allow access. The feed is used only as a background image.
3. Press **1** or **2** when you want a scene to play.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` | **Scenario 1.** 3 s countdown, short acquisition sweep, then 15 s of a walking male-style silhouette that crosses the wall area, pauses, and walks out. Overlays fade and the scanner returns to standby. |
| `2` | **Scenario 2.** Starts immediately (no countdown). 10 s of a female-style silhouette moving around a room: she walks to a table, leans over and wipes it, turns, and walks back. Then a clean fade back to standby. |
| `Space` | Start or stop scanning. Stopping halts every animation loop and sound. |
| `V` | Scan view on/off. Off hides the scene, the silhouette and all overlays at once, and stops any active scenario. |
| `Esc` | Exit fullscreen if active; otherwise stop the active scenario (or close the shortcut panel). |
| `F` | Toggle fullscreen. |
| `R` | Reset: stop scenario, scan view on, scanning on, counters cleared. The camera is left as you set it. |
| `C` | Camera on/off. |
| `M` | Mute/unmute the synthesized sounds. |
| `P` | **Prank mode.** Hides the on-screen simulation labels (top badge, watermark, SIM tags). Press again to bring them back. Off by default. |
| `X` | **Prank reveal.** Shows a full-screen "it's a prank" message in English and Arabic. Press `X` or `Esc` to close. |
| `H` or `?` | Show/hide the shortcut panel. |

Shortcut behaviour:
- Shortcuts are ignored while typing in a text field, and when Ctrl, Alt or Cmd is held.
- Holding a key down does not re-trigger it (auto-repeat is ignored).
- Pressing `1` or `2` during a scenario cancels it cleanly and starts the new one from the beginning.
- If scan view is off, `1` and `2` show a hint and do nothing. Press `V` first.
- In fullscreen, most browsers use the first `Esc` to leave fullscreen themselves. Press `Esc` again to stop the scenario.

Scenarios are started from the keyboard only (there are no on-screen scenario buttons). The other controls also have on-screen buttons.

---

## Scenario data (fictional)

| | Scenario 1 | Scenario 2 |
|---|---|---|
| Target | MALE | FEMALE |
| Estimated age | 30–35 | 22 |
| Height | 175 cm | 168 cm |
| Weight | 70–75 kg | 55 kg |
| Status | SIMULATED TRACKING | SIMULATED TRACKING |
| Timeline | 3 s countdown → 1.2 s sweep → 15 s active → 3 s exit/fade | 10 s active → 1 s fade |

These values live in the `SCENARIOS` object at the top of `app.js`, and you can edit them there. They are never derived from the camera, Wi-Fi or a real person. Each value is marked **SIM** on screen.

---

## Scan view and laptop orientation

The operator may physically turn the laptop toward a different wall. The demo **does not and cannot know** which way the laptop faces. There is no face tracking, motion analysis or hidden camera processing.

Instead, the operator uses the **Scan view** toggle (`V`):
- **Off:** the scene, silhouette and tracking overlays disappear at once, and any running scenario stops.
- **On:** the standby scanning interface returns, ready for `1` or `2`.

---

## Camera and privacy

- The camera is requested **only** when you click **Start camera** (or press `C`). It is never started automatically. The microphone is never requested.
- A red **CAMERA LIVE** indicator and a `CAM LIVE` chip in the top bar show while it is on. **Camera off** releases the device immediately.
- The feed is shown in the preview panel and drawn as a faint background in the thermal panel. It is **not** analysed, recorded, stored, uploaded or transmitted. Nothing leaves the page.
- If permission is denied, or no camera exists, a clear message appears and the demo keeps running with an animated standby background.

## Wi-Fi telemetry

Browsers do **not** expose Wi-Fi signal strength, channels, spectrum or packets to web pages. Every reading in the telemetry panel (gauge, waveform, spectrum, radar, quality, packet log) is generated locally and labelled **SIMULATED SIGNAL**.

The only real data shown is the small line at the bottom of the panel, which comes from the browser's **Network Information API** (`navigator.connection`). It is only available in Chromium browsers and reports just a coarse connection class (e.g. `4G`) plus rough downlink and RTT estimates. Firefox and Safari report "not exposed".

---

## Accessibility and reliability

- **Reduced motion:** if the OS has *reduce motion* turned on, sweeps, flicker, sensor noise, scrambling text and pulsing effects are disabled or slowed. The scripted figure motion still plays, because it is the content.
- **One render loop:** all scenario timing derives from `performance.now()` inside one guarded `requestAnimationFrame` loop. There are no `setTimeout` chains, so repeated key presses cannot stack timers. Stopping scanning cancels the loop entirely.
- **Sound:** short tones are synthesized with the Web Audio API. No audio files are used, and sound starts only after a key press or click. Every active tone is stopped when a scenario is cancelled, scanning stops, or you mute.
- **Layout:** designed for laptop screens (1280×720 to 1920×1080). Narrower or shorter windows switch to a scrolling, stacked layout.

## Browser support

Tested in current Chrome/Edge. Firefox and Safari are supported too. Where the canvas `filter` property is missing (older Safari), the silhouettes use a shadow-based glow instead of blur.
