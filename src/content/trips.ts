/**
 * Trip names Steve wrote that are fit to show, as shown. Everything else he wrote in that column (ticket numbers,
 * hotels, people, family health) stays in the data and off the page, like his notes (Nik). A trip without one here
 * is named after where it went. `place: true` adds where ("Promax in New Orleans"), for events that recur in different cities.
 */
export const TRIP_NAMES: Record<string, { name: string; place?: boolean }> = {
  '30 Games in 30 Nights hockey trip': { name: '30 Games in 30 Nights' },
  'Nick Express': { name: 'Nick Express tour' },
  'Nick Express Scout': { name: 'Nick Express scouting', place: true },
  Nick: { name: 'Nickelodeon', place: true },
  'Lev Tour': { name: 'Lev Tour', place: true },
  Promax: { name: 'Promax', place: true },
  'Promax USH Pre Meeting': { name: 'Promax', place: true },
  'Promax USH &': { name: 'Promax', place: true },
  NATPE: { name: 'NATPE', place: true },
  'NAB Radio Show': { name: 'NAB Radio Show', place: true },
  Landshark: { name: 'Landshark tour', place: true },
  'LandShark Tour': { name: 'Landshark tour', place: true },
  'Barney Tour Chicago': { name: 'Barney tour', place: true },
  'Barney Tour NJ': { name: 'Barney tour', place: true },
  'Auto Show': { name: 'Auto show', place: true },
  'Card Show': { name: 'Card show', place: true },
  'Lottery Convention': { name: 'Lottery convention', place: true },
  'Gordon Elliott Show': { name: 'The Gordon Elliott Show', place: true },
  'Telepictures/Grammys': { name: 'The Grammys', place: true },
  'World Series': { name: 'The World Series', place: true },
  'Montreux/Stanley Cup': { name: 'Montreux and the Stanley Cup' },
  'Pogues & Steve Earle Concerts': { name: 'The Pogues and Steve Earle', place: true },
  'Ski Trip': { name: 'Skiing', place: true },
  'Ski Trip - Julie': { name: 'Skiing', place: true },
  'Skiing - Breckenridge': { name: 'Skiing in Breckenridge' },
  Wedding: { name: 'A wedding', place: true },
  'Kathy Wedding': { name: 'A wedding', place: true },
  "Sandra's Wedding": { name: "Sandra's wedding", place: true },
  "Testa's & Gail's Weddings": { name: 'Two weddings', place: true },
}

/** Trips the story tells, named by a leg in them (leg id), whatever Steve wrote. */
export const TRIP_BY_LEG: Record<number, string> = {
  408: 'The move to Osaka',
  601: 'Home from Osaka',
  976: 'Tokyo and the Island Hopper',
  1385: 'The jump',
}
