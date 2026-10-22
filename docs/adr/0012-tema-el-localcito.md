# ADR-0012: Sistema de diseño "el localcito"

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
La UI debe sentirse como entrar a un localcito mexicano-argentino de barrio, sin estereotipos, sin look genérico de IA, rápida en celulares medios y con Lighthouse ≥ 90.

## Decision
- **Tokens en Tailwind v4 `@theme`** (colores de marca, fuentes, radios, sombras, easings, duraciones). Las variantes claro/oscuro se hacen redefiniendo variables CSS bajo `[data-theme="dark"]` y `@media (prefers-color-scheme: dark)`; el interruptor de luz guarda la preferencia en `localStorage` (con *fallback* a la del sistema, aplicada antes del primer paint para evitar *flash*).
- **Modo claro = local de día; oscuro = local de noche.** De noche el letrero usa `logo-neon` (filtro SVG glow + parpadeo al prender, una sola vez).
- **Texturas con SVG/CSS** (patrones inline, `mask` para el borde dentado del ticket, `feTurbulence` solo en superficies pequeñas o pre-renderizado a data-URI < 2 KB). Prohibidas las imágenes de textura.
- **Tipografías** (self-hosted, subset latin, `font-display: swap`, preload solo de la display): display tipo rótulo, manuscrita de tiza para títulos de categoría y notas, cuerpo legible, mono de ticket. La selección final se hace en la Fase 1 con `frontend-design` y se registra en `BRAND.md`.
- **Animación:** solo `transform` y `opacity`; 150–300 ms; las decorativas (toldo que se mece, papel picado) se pausan con `prefers-reduced-motion` y cuando la pestaña no está visible. `motion` para orquestación (vuelo de la miniatura al carrito, bottom sheet, flip del cartel).
- **Sonido:** campanita generada con Web Audio API (osciladores + envolvente), con mute persistente. Sin archivos de audio.
- **Íconos:** Lucide + SVG propios. Nada de emojis como íconos.
- **Contraste AA verificado** para cada par de tokens (tabla en `BRAND.md`); targets ≥ 44 px (cocina ≥ 56 px); foco visible propio.
- **Admin sobrio:** mismos tokens, menos decoración.

## Alternatives Considered
- **shadcn/ui sin personalizar:** explícitamente descartado en el brief. Se pueden usar primitivas accesibles sin estilo (p. ej. patrones de Radix) solo si se visten por completo con los tokens (requiere OK por ser dependencia nueva).
- **Imágenes para texturas:** pesadas. Rechazado.

## Consequences
- Mucho SVG inline: se mantiene en componentes pequeños, con `memo`, y se mide el costo en la Fase 8.
- La fachada del hero es el LCP candidato: debe ser SVG inline liviano (< 20 KB) y no depender de fuentes remotas.
