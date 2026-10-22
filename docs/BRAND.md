# BRAND — Takitho

> Fase 1 · 2026-10-21. Las fuentes son archivos de `scripts/brand/*` y salen a `public/brand/`. Para regenerar todo: `node scripts/brand/build-logos.mjs && npm run icons`.

## 1. Idea

Takitho es el localcito de la esquina que prende el comal a la noche. La marca habla con humor y calidez de barrio: rotulación pintada a mano, un toldo a rayas, un taco que sonríe. Mezcla el letrero de un local mexicano con la calidez de un almacén argentino. **No** usa estereotipos: ni sombrero con bigote, ni poncho, ni caricaturas de personas. Los personajes son objetos (un taco, un toldo, un cartel).

## 2. Cómo elegimos el logo

Exploramos tres conceptos (`docs/brand-exploration/`) y los evaluamos renderizados a 256, 64, 32 y 16 px:

| Concepto | Personalidad | Legibilidad a 16 px | Veredicto |
|---|---|---|---|
| **A. Wordmark** "Takitho" de letrero pintado, con sombra desplazada | Muy alta | Mala: es horizontal y las letras se funden | Se queda como **lockup**, no como símbolo |
| **B. Isotipo** taco sonriente bajo toldo a rayas | Alta, cuenta el "localcito" | **Buena**: las rayas rojas y el amarillo del taco sobreviven | **Elegido como símbolo** |
| **C. Monograma** T sobre tortilla | Baja: parece un cartel de correos | Aceptable | Descartado |

**Decisión:** el sistema es **isotipo (B) + wordmark (A)**. El isotipo vive solo cuando el espacio es chico (favicon, avatar, ícono de app); en el resto va el lockup. El favicon es una versión simplificada del isotipo (5 rayas, trazo grueso, sin tomates) para que aguante 16 px.

Todo el texto del logo está **convertido a paths** (Lilita One → `opentype.js`), optimizado con SVGO y con `viewBox` limpio: no depende de que la fuente esté instalada.

## 3. Archivos

| Archivo (`/public/brand`) | Uso |
|---|---|
| `logo-full.svg` | Lockup horizontal (cabeceras, tickets digitales, firma de mails) |
| `logo-stacked.svg` | Lockup vertical (portadas, avatar grande, tarjetas) |
| `isotipo.svg` | Solo el símbolo |
| `logo-wordmark.svg` | Solo el wordmark con subrayado |
| `logo-mono-dark.svg` | Una tinta, carbón, para fondos claros / impresión en un color / sellos |
| `logo-mono-light.svg` | Una tinta, tortilla, para fondos oscuros |
| `logo-neon.svg` | Letrero de neón (filtro glow); se usa en modo noche |
| `favicon.svg` | Favicon vectorial |
| `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `maskable-512.png`, `og-image.png` (1200×630) | Generados por `scripts/generate-icons.mjs` |

`maskable-512.png` respeta la *safe zone*: todo el símbolo queda dentro de un círculo del 80 % del lado.

## 4. Usos correctos

- Fondo claro: `logo-full` o `logo-stacked` en color sobre **tortilla** `#FFF4E0` (o blanco).
- Fondo oscuro: sobre **carbón** `#1E1A17` usar `logo-mono-light`, o `logo-neon` si es la escena nocturna.
- Una sola tinta (sello, grabado, bordado): `logo-mono-dark` / `logo-mono-light`.
- Zona de respeto: al menos el alto del toldo del isotipo (≈ 26 % del alto del símbolo) libre alrededor.
- Tamaño mínimo: lockup horizontal 120 px de ancho; isotipo 24 px (por debajo se usa `favicon.svg`).
- El letrero de neón solo sobre fondos muy oscuros y solo en pantallas.

## 5. Usos incorrectos

- ✗ Recolorear el logo fuera de la paleta o poner el color sobre un fondo de color vibrante (chile, rosa, maíz).
- ✗ Estirarlo, rotarlo extra o cambiarle la inclinación del wordmark.
- ✗ Agregarle sombras, biseles, degradados o contornos nuevos.
- ✗ Reemplazar el texto por otra tipografía o volver a tipear "Takitho".
- ✗ Poner el color sobre fotos con mucho ruido (usar la versión mono con una placa).
- ✗ Sombrero, bigote, poncho, cactus-persona o cualquier caricatura humana.
- ✗ Usar `logo-neon` sobre fondo claro.

## 6. Paleta

| Token | Hex | Rol |
|---|---|---|
| `chile` | `#C8102E` | Acción primaria, precios destacados, toldo |
| `maiz` | `#F2B33D` | Acento cálido, wordmark, estados "atención"; **nunca texto sobre claro** |
| `nopal` | `#2F7D4A` | Éxito, "veggie", abierto |
| `rosa` | `#E4007C` | Acento chico (puntos, detalles); no para texto corrido |
| `tortilla` | `#FFF4E0` | Fondo del local de día |
| `madera` | `#6B3E26` | Estructura, bordes de tarjetas, texto secundario fuerte |
| `carbon` | `#1E1A17` | Texto y fondo del modo noche |
| `azulejo` | `#2C5BA3` | **Agregado**: azul talavera, solo en detalles de azulejo y enlaces sobre claro |

Variantes para modo noche (los originales no alcanzan contraste sobre carbón): `chile-claro #FF6B6B`, `nopal-claro #5DBB7F`, `rosa-claro #FF4FA3`.

### Contraste (WCAG 2.x, calculado con `scripts/brand/lib.mjs`)

| Par (texto sobre fondo) | Ratio | Nivel |
|---|---|---|
| carbón / tortilla | 15,85 | AAA |
| madera / tortilla | 8,23 | AAA |
| chile / tortilla | 5,40 | AA |
| tortilla / chile | 5,40 | AA (texto de botones primarios) |
| azulejo / tortilla | 6,15 | AA |
| nopal / tortilla | 4,64 | AA |
| tortilla / nopal | 4,64 | AA |
| carbón / maíz | 9,29 | AAA (texto de botones secundarios) |
| tortilla / carbón | 15,85 | AAA |
| maíz / carbón | 9,29 | AAA |
| chile-claro / carbón | 6,23 | AA |
| nopal-claro / carbón | 7,31 | AAA |
| rosa-claro / carbón | 5,68 | AA |
| **rosa / tortilla** | 4,20 | Solo texto grande (≥ 24 px) o elementos gráficos |
| **maíz / tortilla** | 1,71 | ✗ Nunca para texto ni para íconos informativos |
| **chile / carbón** | 2,94 | ✗ Usar `chile-claro` |

Regla: la información nunca se transmite solo por color (el estado siempre lleva texto o ícono).

## 7. Tipografías

Se evaluaron opciones para cada rol; todas son **OFL** y se sirven **self-hosted** con `@fontsource` (subset latin; los acentos del español están incluidos).

| Rol | Elegida | Por qué | Alternativas descartadas |
|---|---|---|---|
| **Display** (títulos, precios grandes, logo) | **Lilita One** | Es la voz del rótulo pintado: peso grueso, terminales redondeados, muy legible chica. Ya es la base del wordmark | Bowlby One (más pesada y apretada, cansa en títulos largos) |
| **Manuscrita de tiza** (títulos de categoría y notas) | **Caveat** 700 | Se lee como letra de pizarrón sin caer en caligrafía "tipo Western"; es solo para 1–3 palabras | Permanent Marker (agresiva) |
| **Cuerpo** | **Nunito** (400/600/700) | Redondeada, cálida y de excelente legibilidad en celular; combina con Lilita sin competir | Outfit (más fría, más "tech") |
| **Mono (tickets)** | **Space Mono** | Estética de impresora térmica con carácter propio | Courier Prime (demasiado máquina de escribir) |

Escala (rem sobre 16 px): 0,75 · 0,875 · 1 · 1,125 · 1,375 · 1,75 · 2,25 · 3. Cuerpo 16 px mínimo en celular, interlínea 1,5; largo de línea ≤ 65 caracteres.

## 8. Tono de voz

Voseo, frases cortas, un guiño de taquería por pantalla (no por oración), cero caricatura. Se habla de objetos y de comida, no de personas ni países.

| Momento | Texto |
|---|---|
| Carrito vacío | **Tu bandeja está vacía… y eso se arregla** |
| 404 | **Se nos acabaron las tortillas para esta página** |
| Local cerrado | **Estamos cerrados, prendemos el comal a las 19 h** |
| Agregar al carrito | Sumar a la comanda |
| Confirmar pedido | Confirmar pedido |
| Pedido recibido | **¡Sale!** Recibimos tu pedido |
| Preparando | Está en el comal |
| Listo | **¡Órale, ya está tu orden!** |
| En camino | Salió con el repartidor |
| Entregado | Provecho. ¿Te sumás otra ronda? |
| Error de red | Se cortó la señal. Probá de nuevo en un toque |
| Producto agotado | Se nos terminó por hoy |
| "¿Con todo?" | ¿Con todo? (cebolla y cilantro) |
| Efectivo | ¿Con cuánto pagás? Te calculamos el vuelto |
| Transferencia | Copiá el alias y pagá desde tu app |

Reglas: sin signos de exclamación dobles; sin "Lo sentimos mucho"; los errores explican qué pasó y qué hacer; la misma acción se llama igual en todo el flujo ("Sumar a la comanda" → toast "Sumado a la comanda").

## 9. Ilustración y textura

- **Hero**: fachada ilustrada en SVG (`src/components/illustrations/facadeMarkup.ts`) con toldo que se mece, letrero (pintado de día / neón de noche), ventana con luz cálida y macetas, papel picado y cartel ABIERTO/CERRADO.
- **Texturas** solo en SVG/CSS: azulejo talavera (patrón de 16 px), pizarrón, madera, papel de ticket con borde dentado.
- **Fotos de producto**: Cloudinary, carpeta `takitho/menu`; plano a 45°, mesa de madera, plato de barro, luz cálida lateral, azulejo desenfocado, 1:1, sin texto ni manos. Prompt maestro en `docs/adr/0009-imagenes-cloudinary.md`.
