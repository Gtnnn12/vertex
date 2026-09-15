; VERTEX — custom NSIS installer touches (included by electron-builder).
; The assisted flow (Language → Welcome → License → Destination →
; Progress → Finish) comes from oneClick: false in electron-builder.yml.

; Compress harder — installer size matters for download.
SetCompressor /SOLID lzma

; ── Branding ────────────────────────────────────────────────────────────────
; Window title and name on every page.
Name "VERTEX"

; Keep user data on uninstall — this is already the default via
; deleteAppDataOnUninstall: false; explicit RMDir guard for safety.

; ── Finish page: "Run VERTEX" checkbox ──────────────────────────────────────
; electron-builder's assisted installer already adds a run-after-finish
; checkbox when oneClick is false. Nothing extra needed — keep the file
; minimal and future-proof.

; ── Uninstaller: keep app data ──────────────────────────────────────────────
; deleteAppDataOnUninstall: false in the yml handles this; no custom pages
; required. Data dirs (%APPDATA%/VERTEX) are left untouched on uninstall.
