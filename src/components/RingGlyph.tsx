import { useMemo } from 'react'

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function ringPath(ring: number) {
  const random = mulberry32(ring)
  const radius = 14 - (ring - 1) * 1.9
  const points = Array.from({ length: 72 }, (_, segment) => {
    const angle = (segment / 72) * Math.PI * 2
    const jitter = random() * 1.2 - 0.6
    const x = 16 + Math.cos(angle) * (radius + jitter)
    const y = 16 + Math.sin(angle) * (radius + jitter)
    return `${segment === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
  })
  return `${points.join(' ')} Z`
}

export function RingGlyph({
  ring,
  size = 32,
  dotted = false,
  className = '',
}: {
  ring?: number
  size?: 32 | 64 | 112
  dotted?: boolean
  className?: string
}) {
  const hasGap = className.includes('ring-glyph--gap')
  const paths = useMemo(
    () => Array.from({ length: 7 }, (_, index) => ringPath(index + 1)),
    [],
  )
  return (
    <svg
      className={`ring-glyph${dotted ? ' ring-glyph--dotted' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={ring ? `Ring ${ring} formation glyph` : 'Neutral seven-ring formation glyph'}
    >
      {paths.map((path, index) => (
        <path
          d={path}
          key={path}
          pathLength={100}
          className={[
            ring === index + 1 ? 'ring-glyph__active' : '',
            hasGap && index === 0 ? 'ring-glyph__gap' : '',
          ].filter(Boolean).join(' ') || undefined}
        />
      ))}
    </svg>
  )
}
