/**
 * City names as people say them, by airport code, where the log's city is the airport's suburb or a local spelling
 * (YVR is in Richmond, but it's Vancouver). Applied to every airport at load. Hand-maintained.
 */
export const CITY_NAMES: Record<string, string> = {
  BDL: 'Hartford',
  CVG: 'Cincinnati',
  DFW: 'Dallas–Fort Worth',
  DPS: 'Bali',
  EGE: 'Vail',
  FRA: 'Frankfurt',
  GIG: 'Rio de Janeiro',
  GRU: 'São Paulo',
  GSP: 'Greenville',
  GUM: 'Guam',
  MAJ: 'Majuro',
  MLA: 'Malta',
  NAP: 'Naples',
  PMI: 'Palma de Mallorca',
  PNI: 'Pohnpei',
  RDM: 'Bend',
  RDU: 'Raleigh–Durham',
  SNA: 'Orange County',
  SRQ: 'Sarasota',
  TKK: 'Chuuk',
  YNG: 'Youngstown',
  YUL: 'Montreal',
  YVR: 'Vancouver',
  YYZ: 'Toronto',
}

/** Airports that name a trip after the city they serve rather than their own: a stay there was a stay in that city. */
export const METRO: Record<string, string> = {
  EWR: 'New York',
  HPN: 'New York',
}
