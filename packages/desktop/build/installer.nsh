; VERTEX — custom NSIS installer touches (included by electron-builder).
; The assisted flow (Language → Welcome → License → Destination →
; Progress → Finish) comes from oneClick: false in electron-builder.yml.

; Compression is owned by electron-builder (solid LZMA already); do not
; SetCompressor here — it collides with the embedded-publisher macros.

; ── Branding ────────────────────────────────────────────────────────────────
; (The product Name comes from electron-builder's productName — do NOT
; redefine it here: NSIS treats a duplicate Name as an error.)

; Keep user data on uninstall — this is already the default via
; deleteAppDataOnUninstall: false; explicit RMDir guard for safety.

; ── Finish page: "Run VERTEX" checkbox ──────────────────────────────────────
; electron-builder's assisted installer already adds a run-after-finish
; checkbox when oneClick is false. Nothing extra needed — keep the file
; minimal and future-proof.

; ── Uninstaller: keep app data ──────────────────────────────────────────────
; deleteAppDataOnUninstall: false in the yml handles this; no custom pages
; required. Data dirs (%APPDATA%/VERTEX) are left untouched on uninstall.
