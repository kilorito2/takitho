import { useEffect } from 'react'
import { restaurantJsonLd } from '@/lib/seo'
import { useHours, useStore } from '@/features/catalog/hooks'

/** Injects the schema.org/Restaurant block (hours, address, phone) once the store data is loaded. Renders nothing. */
export function RestaurantJsonLd() {
  const store = useStore().data
  const hours = useHours().data

  useEffect(() => {
    if (!store || !hours) return
    const data = restaurantJsonLd({
      name: store.name,
      tagline: store.tagline,
      address: store.address,
      whatsapp: store.whatsapp,
      instagram: store.instagram,
      mapsUrl: store.mapsUrl,
      siteUrl: window.location.origin,
      image: '/brand/og-image.png',
      shifts: hours,
    })
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    // `<` is escaped so no field can close the script element.
    script.textContent = JSON.stringify(data).replaceAll('<', '\\u003c')
    document.head.append(script)
    return () => {
      script.remove()
    }
  }, [store, hours])

  return null
}
