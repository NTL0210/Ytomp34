## 🎯 ROLE

You are a senior Electron + Node.js software engineer.

Your task is to build a production-ready Windows desktop application for downloading videos from URLs.

The application MUST be:

* Fully functional offline (except downloading videos)
* NOT dependent on any external APIs
* Safe for users (local security system)
* Ready for GitHub and Windows packaging (.exe)

---

## ❗ CORE PRINCIPLE (VERY IMPORTANT)

The application MUST follow:

* LOCAL-FIRST architecture
* NO dependency on external APIs (VirusTotal, Google API, etc.)
* External APIs are OPTIONAL and must NOT affect core functionality

---

## 🧠 ELECTRON ARCHITECTURE (STRICT)

### Main Process (Node.js)

Handles:

* App lifecycle
* File system
* Running yt-dlp
* Running antivirus scan
* Save dialog
* IPC handlers

---

### Renderer Process (UI)

Handles:

* UI (HTML/CSS)
* User interaction
* Display video info

---

### Preload Script

* Use contextBridge
* Expose safe APIs only
* contextIsolation = true
* nodeIntegration = false

---

## 🖥️ TECH STACK

* Electron
* Node.js
* HTML / CSS / JS
* yt-dlp (local CLI)
* Native fetch API (NO axios)

---

## 📂 PROJECT STRUCTURE

project-root/
│
├── main.js
├── preload.js
├── package.json
│
├── renderer/
│   ├── index.html
│   ├── renderer.js
│   ├── styles.css
│
├── services/
│   ├── urlValidator.js
│   ├── securityService.js
│   ├── ytDlpService.js
│   ├── downloadService.js
│   ├── fileScanner.js
│   ├── cacheService.js
│
├── utils/
│   ├── processRunner.js
│
├── temp/

---

## 🎯 FEATURES

1. Input video URL
2. Local security validation
3. Fetch metadata
4. Preview video
5. Select format (MP4 / MP3)
6. Download video
7. Scan file
8. Choose save location
9. Save file safely

---

## 🔐 SECURITY SYSTEM (LOCAL-FIRST)

### STEP 1: URL VALIDATION

Allow:

* http
* https

Reject:

* file://
* javascript:
* data:

---

### STEP 2: DOMAIN HEURISTIC CHECK (NO API)

Implement checks:

* Must use HTTPS
* Domain format valid
* Detect suspicious:

  * IP-based URL
  * too many subdomains
  * random strings

If suspicious:

* Show WARNING (do NOT block)

---

### STEP 3: CACHE SYSTEM (VERY IMPORTANT)

Implement local cache:

* Store checked URLs
* Avoid duplicate checks

Example:
url → risk level

---

### STEP 4: FETCH METADATA

Use:
yt-dlp --dump-json <url>

Parse:

* title
* thumbnail
* formats

---

### STEP 5: DOWNLOAD TO TEMP

Use:
yt-dlp -f best -o temp/%(title)s.%(ext)s <url>

---

### STEP 6: FILE SECURITY CHECK

#### ✔ Extension whitelist

Allow:

* .mp4
* .mp3
* .webm

Reject:

* .exe
* .bat
* .msi

---

#### ✔ File size check

* 0 → error
* <100KB → suspicious

---

#### ✔ Antivirus scan (REQUIRED)

Use built-in Windows Defender:

Command:
MpCmdRun.exe -Scan -ScanType 3 -File <file>

If infected:

* delete file
* show error

---

### STEP 7: SAVE FILE (CRITICAL FLOW)

MUST follow:

1. Download → temp folder
2. Scan file
3. If safe:

   * Open native OS save dialog
   * Let user choose location & filename
4. Move file → selected location

---

## 💻 SAVE DIALOG (MANDATORY)

Use Electron native dialog.

User must:

* Choose folder
* Rename file
* Select format (.mp4 / .mp3)

---

## 🔄 IPC COMMUNICATION

Renderer → Main:

* checkUrl
* fetchMetadata
* downloadVideo

Main → Renderer:

* progress
* success
* error

---

## 🧠 UI REQUIREMENTS

* URL input
* "Check & Fetch" button
* Thumbnail preview
* Title
* Format dropdown
* Download button
* Progress bar
* Status message

---

## ⚠️ WARNING SYSTEM

* Safe → Green
* Suspicious → Yellow
* Dangerous → Red

---

## 🔒 ELECTRON SECURITY RULES

* contextIsolation = true
* nodeIntegration = false
* preload.js required
* NEVER execute external scripts
* NEVER load external websites

---

## 📦 BUILD

Use:
electron-builder

Output:

* Windows .exe installer

---

## 🚀 OUTPUT REQUIREMENTS

You MUST:

* Generate FULL working project
* No pseudo-code
* All files included
* Code must run:

npm install
npm start

---

## ❗ CODING RULES

* Use async/await
* Use fetch (NOT axios)
* Modular architecture
* Clean code

---

## 🧠 FINAL INSTRUCTION

* Do NOT rely on external APIs
* Do NOT skip any step
* If unclear, make assumptions and continue

---

## 🎯 FINAL GOAL

The final app must:

* Work end-to-end
* Be safe
* Not depend on API quota
* Be ready for GitHub
* Be ready for packaging into Windows app
