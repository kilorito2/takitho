# ADR-0009: Imágenes en Cloudinary con subida firmada

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Las fotos del menú se generan con el MCP de Cloudinary y el dueño debe poder reemplazarlas por fotos reales. El plan gratuito tiene créditos limitados y las imágenes pesan en Lighthouse.

## Decision
- Carpeta `takitho/menu`; en `products` se guarda solo `image_public_id`.
- Las URLs se construyen en el front con una función pura `cloudinaryUrl(publicId, {w, ar, crop})` → `https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_fill,ar_1:1,w_<w>/<public_id>` (sin SDK, sin dependencia). `srcset` con 160/320/480/720 px; `sizes` explícito; `loading="lazy"` salvo la imagen LCP; `width/height` fijos para evitar CLS; placeholder de baja calidad (`e_blur:1000,q_1,w_24`) como fondo.
- `cloud_name` es público (`VITE_CLOUDINARY_CLOUD_NAME`). `CLOUDINARY_API_SECRET` y `API_KEY` solo en la Edge Function `cloudinary-sign`.
- **Subida firmada desde el admin:** el navegador pide la firma a `cloudinary-sign` (solo admin) y sube directo a Cloudinary; luego guarda el `public_id`. Si la subida falla, el producto conserva la foto anterior.
- Generación de las fotos de producto con el MCP (`generate-image`) usando un **prompt maestro** único (ángulo, mesa de madera, plato de barro, luz cálida lateral, azulejo talavera desenfocado, sin texto ni manos, 1:1). Antes de generar el lote se consulta el uso (`get-usage-details`) para no pasarse del free tier.
- Las texturas de UI (pizarrón, madera, papel) son SVG/CSS; no son imágenes.

## Alternatives Considered
- **Supabase Storage:** gratis pero sin transformaciones automáticas (f_auto/q_auto/resize) en el plan free. Rechazado.
- **Subir a través de la Edge Function:** consume ancho de banda/tiempo de función. La firma directa es más liviana.

## Consequences
- Si se agotan los créditos de Cloudinary las imágenes ya subidas siguen sirviéndose (el límite afecta transformaciones nuevas); se monitorea en go-live.
- La generación de IA puede consumir créditos: es una acción a confirmar antes del lote.
