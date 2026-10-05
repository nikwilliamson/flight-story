export type Precision = 'Exact' | 'Range' | 'Month' | 'Year' | 'Unknown'
export type FlightType = 'Airline' | 'Vintage' | 'Joyride' | 'Helicopter'

export interface Airport {
  key: string
  code: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  closed: string | null
}

export interface Leg {
  id: number
  date: string | null
  sort: string
  detail: string | null
  precision: Precision
  /** Index into airports, or -1 when unknown. */
  from: number
  to: number
  /** As logged, only where the airport is unknown (from/to = -1). */
  fromName: string | null
  toName: string | null
  airline: string | null
  airlineName: string | null
  flight: string | null
  aircraft: string | null
  family: string | null
  tail: string | null
  built: number | null
  miles: number | null
  milesPlaceholder: boolean
  intl: boolean | null
  type: FlightType
  ground: boolean
  candidates: number[]
  trip: number
  home: number
  /** Steve's trip name, only when it is one to show (src/content/trip-names.json). */
  purpose: string | null
}

export interface FlightData {
  generated: string
  airports: Airport[]
  legs: Leg[]
}
