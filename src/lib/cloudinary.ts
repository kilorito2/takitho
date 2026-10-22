// Cloudinary delivery URLs (ADR-0009). No SDK: f_auto/q_auto + responsive widths built as plain strings.

export const MENU_IMAGE_WIDTHS = [160, 320, 480, 720] as const

export interface ImageOptions {
  /** Output width in CSS px (Cloudinary scales the 1:1 source). */
  width: number
  /** Aspect ratio of the crop, default square (menu photos are 1:1). */
  ratio?: string
  /** Device-pixel-ratio multiplier. */
  dpr?: number
}

export function cloudinaryUrl(
  cloudName: string,
  publicId: string,
  { width, ratio = '1:1', dpr = 1 }: ImageOptions,
): string {
  const w = Math.round(width * dpr)
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_fill,ar_${ratio},w_${w}/${publicId}`
}

/** Tiny blurred preview used as a placeholder background while the real image loads. */
export function cloudinaryPlaceholder(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_1,c_fill,ar_1:1,w_24,e_blur:800/${publicId}`
}

/** `srcset` for the menu photo widths (w descriptors). */
export function cloudinarySrcSet(
  cloudName: string,
  publicId: string,
  widths: readonly number[] = MENU_IMAGE_WIDTHS,
): string {
  return widths.map((w) => `${cloudinaryUrl(cloudName, publicId, { width: w })} ${w}w`).join(', ')
}
