# Batch Audio Converter PWA

A static GitHub-hostable PWA that converts WAV files locally in the browser.

## Outputs
- MP3
- WAV
- Ogg Vorbis
- Opus
- AAC / M4A (**experimental**)

## Honest limitations
- **MP3 and WAV are the most dependable**
- Ogg and Opus depend on browser MediaRecorder support
- AAC / M4A is clearly marked **experimental** because browser AAC/M4A encoding support is inconsistent
- This app uses CDN-hosted `lamejs` and `jszip`, which are cached by the service worker after first successful online load

## GitHub Pages setup
1. Create a new repo, such as `batch-audio-converter-pwa`
2. Upload these files to the repo root
3. Commit and push
4. In GitHub: **Settings > Pages**
5. Set source to **Deploy from a branch**
6. Choose branch **main** and folder **/(root)**

## Recommended browsers
- Chrome
- Edge

## Local-only note
Audio files are processed locally in the browser. They are not uploaded by this app.
