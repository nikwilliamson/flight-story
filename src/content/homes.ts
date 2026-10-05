/**
 * Where Steve lived, by the airport he flew from (Nik, 2026-10-05): London, Connecticut (flying from JFK), Boston,
 * Fort Lauderdale, Orlando, Osaka, Orlando. The moves themselves are pinned in scripts/build_data.py. Each home's
 * name, and its short tag for the Airports tab's timeline.
 */
export const HOME_PLACES: Record<string, [name: string, tag: string]> = {
  LHR: ['London', 'LON'],
  JFK: ['Connecticut', 'CT'],
  BOS: ['Boston', 'BOS'],
  FLL: ['Fort Lauderdale', 'FLL'],
  MCO: ['Orlando', 'MCO'],
  KIX: ['Osaka', 'KIX'],
}
