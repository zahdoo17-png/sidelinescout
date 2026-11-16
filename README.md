# SidelineScout

Free tool for high school defensive coordinators. Upload a play-by-play CSV (Hudl or GameChanger export), or scan a game video, and get a printable one-page situational call sheet.

- Runs in your browser. Game data and video are not uploaded anywhere.
- Not affiliated with Hudl or GameChanger.

## Files (all must stay together)
- index.html: the app
- scan.js: reads the scoreboard in game video
- models/rec.onnx and models/chars.json: the text-reading model (about 11 MB)

Open it from the GitHub Pages link, not by double-clicking index.html (browsers block the model file when a page is opened from disk).
