import { cloudinaryPlaceholder, cloudinarySrcSet, cloudinaryUrl } from '@/lib/cloudinary'
import { env } from '@/lib/env'
import { cn } from '@/lib/cn'

interface Props {
  publicId: string | null
  /** Empty for decorative use (the card already names the product). */
  alt: string
  /** CSS sizes hint; the card thumbnail is ~112 px, the sheet hero is full width. */
  sizes: string
  /** Above-the-fold images (LCP candidates) load eagerly; everything else is lazy. */
  priority?: boolean
  className?: string
  soldOut?: boolean
}

/** Square Cloudinary photo: f_auto,q_auto, responsive srcset, fixed intrinsic size (no layout shift), blurred placeholder. */
export function ProductImage({ publicId, alt, sizes, priority = false, className, soldOut = false }: Props) {
  if (!publicId) {
    return (
      <div aria-hidden className={cn('grid place-items-center bg-ink/10 text-ink-soft', className)}>
        <svg
          viewBox="0 0 64 64"
          className="size-1/2"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M8 38a24 20 0 0 1 48 0Z" />
          <path d="M16 30c4-8 28-8 32 0" opacity=".6" />
        </svg>
      </div>
    )
  }
  const cloud = env().VITE_CLOUDINARY_CLOUD_NAME
  return (
    <img
      src={cloudinaryUrl(cloud, publicId, { width: 320 })}
      srcSet={cloudinarySrcSet(cloud, publicId)}
      sizes={sizes}
      width={320}
      height={320}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={cn('bg-ink/10 bg-cover object-cover', soldOut && 'grayscale', className)}
      style={{ backgroundImage: `url(${cloudinaryPlaceholder(cloud, publicId)})` }}
    />
  )
}
