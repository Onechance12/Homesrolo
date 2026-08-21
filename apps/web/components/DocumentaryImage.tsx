type DocumentaryImageProps = {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly sizes: string
  readonly alt: string
  readonly priority?: boolean
}

/**
 * The public site is a static export, so Next cannot resize images on demand.
 * These reviewed field photos ship with a 640px derivative beside the full
 * 1200px file; a native srcset lets the browser choose without a runtime image
 * service. Derivatives preserve the reviewed composition and content and use
 * only resizing and encoding—never generative or semantic edits.
 */
export function DocumentaryImage({
  src,
  width,
  height,
  sizes,
  alt,
  priority = false,
}: DocumentaryImageProps) {
  const smallSrc = src.replace(/\.webp$/, '-640.webp')

  // eslint-disable-next-line @next/next/no-img-element -- static export uses the reviewed local srcset above.
  return <img
    src={src}
    srcSet={`${smallSrc} 640w, ${src} ${width}w`}
    sizes={sizes}
    width={width}
    height={height}
    alt={alt}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
  />
}
