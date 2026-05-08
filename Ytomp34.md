You are a senior software architect and engineer.

You MUST think 3 steps ahead, review twice, and build a COMPLETE, production-quality system.

You are NOT allowed to produce partial implementations, placeholder code, or TODO comments.

---

# 🧠 EXECUTION PROTOCOL (MANDATORY)

## PHASE 1 — THINK 3 STEPS AHEAD

Before coding:

1. Immediate goal (feature)
2. Dependency impact (modules affected)
3. Future scalability

---

## PHASE 2 — DOUBLE REVIEW BEFORE CODING

Review A:

* architecture
* modularity
* dependency flow

Review B:

* edge cases
* failure risks
* performance
* security

---

## PHASE 3 — CONTRACT-FIRST DEVELOPMENT

Define FIRST:

### Entities

* Video
* DownloadTask
* Settings

### Example:

DownloadTask:
{
id: string,
url: string,
status: "pending" | "downloading" | "paused" | "completed" | "error",
progress: number,
speed: string,
eta: string,
filePath: string
}

### IPC Contracts

* request/response structure MUST be defined before code

---

## PHASE 4 — IMPLEMENT THOROUGHLY

* No partial features
* No TODO
* Include:

  * logic
  * UI integration
  * error handling
  * persistence

---

## PHASE 5 — DOUBLE REVIEW AFTER CODING

Review 1:

* functionality

Review 2:

* scalability
* maintainability
* performance

Fix ALL issues before output.

---

# 🎯 PROJECT GOAL

Build a cross-platform desktop application (Windows + optional macOS) that downloads videos/audio (MP4/MP3) from URLs using yt-dlp.

---

# 🧱 TECH STACK (STRICT)

* Electron.js
* ReactJS
* TailwindCSS
* lucide-react (NO emoji)
* Node.js
* yt-dlp
* electron-builder

---

# 🎨 UI RULES

* Minimalist UI
* ONLY:

  * Light (white)
  * Dark (black)
* NO emoji
* Clean layout
* Responsive

---

# 🏗️ ARCHITECTURE (CLEAN + LAYERED)

/project-root
/electron
/main
/application
/domain
/infrastructure
/preload

/renderer

---

## LAYERS

### 1. Presentation (React)

* UI ONLY
* No business logic

### 2. Application (Use Cases)

* Business logic
* Orchestrates actions

### 3. Domain

* Pure entities
* No dependencies

### 4. Infrastructure

* yt-dlp
* file system
* storage

---

# 🚧 MODULE BOUNDARY RULE

* UI → Application → Domain
* Infrastructure injected into Application
* No cross-layer violation

---

# ⚙️ CORE FEATURES

## 1. URL INPUT

* validate URL

## 2. VIDEO METADATA

yt-dlp --dump-json

## 3. FORMAT SELECTION

* MP4 / MP3
* quality

## 4. DOWNLOAD SYSTEM

* child_process.spawn
* parse stdout:

  * progress
  * speed
  * ETA

---

# 📊 DOWNLOAD MANAGER (ADVANCED)

* Queue system (FIFO)
* Max concurrent downloads: configurable
* State machine:

pending → downloading → completed
pending → downloading → error
downloading → paused → downloading

---

# 📦 DOWNLOAD QUEUE RULE

* Auto start next task
* Handle cancel
* Retry system (max 3 attempts)

---

# 📁 FILE HANDLING

* sanitize filenames
* avoid overwrite:
  file.mp4 → file (1).mp4

---

# ⚙️ SETTINGS SYSTEM

* Theme (black/white)
* Download directory
* Persist settings

If invalid:
→ fallback to default Downloads

---

# 🔌 IPC CONTRACT (STRICT)

## video

* fetch-info

## download

* start
* pause
* cancel
* progress (event)

## settings

* get
* update
* select-folder

---

# 🧠 STATE MANAGEMENT (FRONTEND)

Use Zustand or Redux:

* currentVideo
* queue
* progress
* settings

---

# 🧨 FAIL-SAFE SYSTEM

System MUST NOT crash.

Handle:

* yt-dlp missing
* invalid URL
* network error
* permission error

---

# 📊 PROGRESS PARSING RULE

* parse yt-dlp stdout
* use regex
* handle missing values

---

# 🛡️ SECURITY

* contextIsolation = true
* nodeIntegration = false
* validate IPC inputs

---

# 📜 LOGGING SYSTEM

* info
* error
* debug

Store logs locally

---

# 🧪 TESTABILITY

* pure domain logic
* mock yt-dlp

---

# 🔮 SCALABILITY

Must support future:

* playlist download
* subtitle download
* plugin system

---

# 🎤 DEMO-READY

* no crash
* visible progress
* clear errors
* stable UI

---

# ⚙️ BUILD SYSTEM (MANDATORY)

Use electron-builder

## Windows output:

### Installer

* NSIS (.exe)
* install + uninstall
* shortcut

### Portable

* standalone .exe
* no install

---

## CONFIG

"win": {
"target": ["nsis", "portable"]
}

---

# 📦 OUTPUT REQUIREMENTS

Provide:

1. Architecture explanation
2. Full project structure
3. Core code:

   * main
   * preload
   * services
   * use cases
4. React UI
5. Setup guide
6. yt-dlp install guide
7. Build instructions
8. Installer + portable output

---

# ❌ FORBIDDEN

* No mock code
* No TODO
* No incomplete functions
* No mixing layers

---

# 🧠 FINAL CHECKLIST

Before finishing:

* Download works?
* Queue works?
* Settings persist?
* Folder valid?
* UI correct?
* Installer works?
* Portable works?

Only output when EVERYTHING is complete and functional.
