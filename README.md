<div align="center">

<img src="packages/web/public/icons/logo.png" alt="VERTEX" width="160" />

# VERTEX

### **Tu comunidad, tus reglas.**

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-20_LTS-339933.svg)](https://nodejs.org/)

</div>

---

**VERTEX** es una plataforma de comunicación self-hosted que ejecutas en tu propio
hardware: espacios, canales de texto, voz y video, compartición de pantalla, mensajes
directos, amigos y federación entre instancias. Tú eres el dueño del servidor, de los
datos y de las reglas — nadie más.

## Capturas

<div align="center">

<img src="docs/screenshots/voice-video-grid.webp" alt="Canal de voz con grid de cámaras y pantallas compartidas" width="900" />

<sub><em>Canal de voz en pleno: cámaras y streams en vivo, cada uno con su badge de resolución.</em></sub>

</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/chat.webp" alt="Canal de texto con mensajes" /><br/>
      <sub><b>Canales de texto.</b> Markdown, respuestas, reacciones y typing en vivo.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/screen-share-settings.webp" alt="Ajustes de compartición de pantalla" /><br/>
      <sub><b>Screen share.</b> Resolución, framerate, códec y bitrate a tu gusto.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/friends.webp" alt="Vista de amigos" /><br/>
      <sub><b>Amigos y social.</b> Presencia, actividades y descubrimiento de gente.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/group-dm.webp" alt="Grupo de DM federado" /><br/>
      <sub><b>DMs y grupos.</b> 1-a-1 y grupos, incluso entre instancias federadas.</sub>
    </td>
  </tr>
</table>

## Features

- **Netrex** — la capa premium integrada, gestionada por el admin de tu instancia:
  efectos de perfil premium, personalización extendida y prioridad de features. Sin
  servicios de facturación externos: el dueño de la instancia controla todo.
- **Vertex AI** — asistente con IA integrada en el chat y en el portal web, con tiering
  para miembros de Netrex. Configuras tu propia API key en tu instancia y listo.
- **Spotify** — actividad musical en vivo: lo que escuchas aparece en tu perfil y en las
  tarjetas de actividad, con embeds de Spotify en el chat.
- **Match Cards** — descubrimiento social con tarjetas: gustos musicales, estilos y
  afinidades entre miembros de tu comunidad.
- **Voz y video de verdad** — hasta 4K/120fps en screen share, VP9 o H.264 por hardware,
  volumen independiente 0-200% por persona y por stream, supresión de ruido RNNoise e
  inspector de conexión en vivo.
- **Personalización total** — temas, colores de acento, banners, bios, efectos de perfil
  y un tablero de perfil (board) con widgets tuyos.
- **Federación** — conecta tu instancia con otras para amigos, DMs y llamadas entre
  servidores, sin walled gardens. Cada instancia sigue siendo independiente.
- **Desktop app** — Electron para Windows, macOS y Linux, con keybinds globales
  (push-to-talk, mute, deafen) y detección de actividad.

## Download

Los instaladores (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`/`.deb`) se publican en
**[GitHub Releases](https://github.com/Gtnnn12/vertex/releases)** — la sección está en
preparación y se rellenará en las próximas fases del proyecto.

Mientras tanto, puedes construirlo tú mismo:

```bash
git clone https://github.com/Gtnnn12/vertex.git
cd vertex
pnpm install
cp .env.example .env    # pon tu JWT_SECRET (openssl rand -hex 32)
pnpm dev
```

## Created by Gtnn

Hecho a mano — diseño, código y mascota incluidos.

© 2026 Gtnnn12 · [LICENSE](LICENSE) (MIT; partes heredadas de Backspace permanecen bajo AGPL-3.0 — ver [NOTICE](NOTICE))
