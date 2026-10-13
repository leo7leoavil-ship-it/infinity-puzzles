# ♾️ Infinity Puzzles (Colección de Puzles Procedurales)

**Infinity Puzzles** es una Progressive Web App (SPA) responsive, moderna y **100% offline-first**, optimizada especialmente para pantallas táctiles de smartphones Android (Mobile-First, viewport vertical 20:9) y pantallas de escritorio.

---

## 🎮 Los 11 Puzles Implementados

Cada juego cuenta con su propia vista, selector de dificultad (**Fácil**, **Medio**, **Difícil**), pila de deshacer (**Undo**), botón de reinicio y generador de **Niveles Infinitos con Solución Garantizada** mediante semillas alfanuméricas.

| # | Puzle | Mecánica | Algoritmo Procedimental |
|---|---|---|---|
| 1 | **Tap Away** | Bloques con flechas direccionales. Un bloque vuela solo si su trayectoria hacia el exterior está libre de obstáculos. | **Generación Inversa**: Los bloques se insertan desde los bordes hacia el interior sobre líneas libres; la solución en reversa siempre existe. |
| 2 | **Kruskal Pipes** | Red de conductos y tuberías. Gira piezas para conectar e iluminar la red desde el reactor de energía. | **Árbol de Expansión Mínima (MST)** usando el algoritmo de Kruskal en grafo de cuadrícula, con rotaciones aleatorias. |
| 3 | **Lights Out** | Matriz binaria donde pulsar una lámpara invierte su estado y el de sus 4 vecinas. | **Simulación Inversa**: Aplica $K$ conmutaciones registradas desde el tablero apagado. Las mismas pulsaciones garantizan la solución. |
| 4 | **Klotski Escape** | Desliza bloques rectangulares horizontales y verticales para abrir paso al bloque maestro rojo hacia la salida lateral. | **Random-Walk Inverso**: Scramble hacia atrás desde la posición del bloque en la salida aplicando movimientos válidos. |
| 5 | **Path Weaver (Flow)** | Une pares de terminales del mismo color dibujando cintas ortogonales sin cruzarse y llenando el 100% del tablero. | **Partición de Espacio**: División en serpientes autoevitantes disjuntas que cubren el 100% de la cuadrícula. |
| 6 | **Sokoban Clásico** | Empuja cajas de energía hacia las metas sin jalarlas. Soporte para gestos táctiles y cruceta D-Pad. | **Generador Inverso (Backward-Pull)**: El jugador jala cajas hacia atrás desde las metas a través de pasillos legales. |
| 7 | **Bridges (Hashi)** | Conecta islas ortogonalmente con 1 o 2 puentes sin cruzarse para satisfacer el número exacto de cada isla. | **Crecimiento de Grafos**: Expansión incremental de islas y puentes ortogonales no intersectantes. |
| 8 | **Pattern Fold** | Despliega cintas numeradas con flechas para cubrir la silueta objetivo sin superposiciones ni huecos. | **Partición Rectilínea Inversa**: Segmentación de la figura target plegada hacia bloques origen con longitud y dirección. |
| 9 | **Sliding Tile** | 15-Puzzle deslizante que forma un gradiente suave 2D de color continuo con o sin números visibles. | **Permutación Paritaria Válida**: $N$ intercambios del espacio vacío desde el estado ordenado para conservar paridad soluble. |
| 10 | **Laser & Mirrors** | Rayo láser continuo en tiempo real que debe alcanzar sensores orientando espejos a 45° (`/` y `\`). | **Trazado Óptico Inverso**: Raycasting constructivo desde el emisor al sensor con reflexiones a 90° y scramble de ángulos. |
| 11 | **Tetriz Fit** | Coloca piezas poliominó (tetrominoes, trominoes) en el tablero de 8x8 para despejar líneas y cumplir objetivos. | **Generador de Secuencias**: Bandejas generadas con piezas garantizadas para completar líneas y combos sin soft-lock. |

---

## 🛠️ Arquitectura Técnica

- **Core:** HTML5 Semántico + Vanilla JavaScript moderno estructurado en módulos ES6 limpios (`/js/core/`, `/js/games/`). Cero frameworks pesados o dependencias lentas.
- **Audio Sintetizado:** Módulo `SoundFX` con **Web Audio API** nativo (`AudioContext`, osciladores senoidales, triangulares y rampa exponencial). Cero archivos MP3/WAV externos, 100% offline.
- **Feedback Háptico:** `Haptics` mediante `navigator.vibrate([15])` para toques, deslizamientos, bloqueos y victoria.
- **Estética & Diseño:**
  - Modo Oscuro nativo **OLED Black (`#0a0b0e` / `#121212`)** con acentos neón (Cian `#00f0ff`, Púrpura `#a855f7`, Esmeralda `#10b981`, Ámbar `#f59e0b`, Rosa `#f43f5e`).
  - Tipografía moderna: Google Fonts **Outfit** y **JetBrains Mono**.
  - Pila de deshacer (Undo Stack) completa en todos los juegos.
  - Temporizador, contador de movimientos y récord de estrellas con celebración de confeti por partículas Canvas.
- **PWA Offline-First:**
  - `manifest.json` para instalación en pantalla de inicio de Android/iOS.
  - `sw.js` (Service Worker) con caché completa de assets para jugar sin conexión a Internet.
- **Persistencia:** `localStorage` para registrar niveles completados, mejor racha (`streak`), mejores marcas de tiempo y movimientos por dificultad.

---

## 🚀 Cómo Ejecutar Localmente

### Opción 1: Servidor Python
```bash
python -m http.server 8080
```
Abre en tu navegador o smartphone en la misma red Wi-Fi: **`http://localhost:8080`**

### Opción 2: Node.js (npx serve)
```bash
npx serve -l 8080
```

---

## 📱 Instalación en Android (PWA)
1. Abre la URL en Chrome / Brave / Edge en Android.
2. Toca en el menú de opciones (tres puntos) y selecciona **"Agregar a la pantalla principal"** o **"Instalar aplicación"**.
3. La aplicación se abrirá a pantalla completa en formato vertical 20:9 con rendimiento nativo a 60 FPS y funcionará incluso en Modo Avión.
