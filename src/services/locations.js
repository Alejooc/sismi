const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export async function searchLocations(query, signal) {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []

  const params = new URLSearchParams({
    name: normalizedQuery,
    count: '8',
    language: 'es',
    format: 'json',
  })
  const response = await fetch(`${GEOCODING_URL}?${params}`, { signal })
  if (!response.ok) throw new Error('No fue posible buscar ubicaciones')

  const payload = await response.json()
  return (payload.results || []).map((place) => ({
    id: place.id,
    name: place.name,
    region: place.admin1 || place.admin2 || '',
    country: place.country || place.country_code || '',
    countryCode: place.country_code || '',
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    timezone: place.timezone || '',
    label: [place.name, place.admin1, place.country].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(', '),
  }))
}
