export const INCLUDE_TAGS = ['chakravyuha']
export const HIDE_SLUGS: string[] = []
export const TAG_ALIASES: Record<string, string> = {
  'python 3': 'python',
}

export function normalizeTag(value: string) {
  const normalized = value.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase()
  const aliased = TAG_ALIASES[normalized] ?? normalized
  return aliased
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
