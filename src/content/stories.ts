/**
 * Hand-researched stories (fun-facts thread, 2026-10-04), keyed to the leg id they belong to. Everything else on the
 * page is computed from the log; these are the only hand-written facts about individual planes.
 */
export const STORIES: Record<number, string> = {
  75: 'Aerobatic ride in plane #3 of the Ray-Ban sponsored Pitts team.',
  98: 'G-VIRG "Maiden Voyager", Virgin Atlantic\'s very first 747, which flew the airline\'s inaugural flight in 1984. He was on it for Sandra\'s wedding.',
  723: 'From the grass field at Polk City.',
  836: 'The "City of Philadelphia" in Kermit Weeks\' Fantasy of Flight collection. His oldest plane.',
  990: 'Flew in the D-Day invasion, then became Prince Bernhard\'s personal plane (PBA: "Prins Bernhard Alpha").',
  1003: 'A barnstormer, also at Polk City.',
  1385: 'Skydive from the drop-zone King Air N41DZ. The one flight where he took off and never landed with the plane.',
  1452: 'Delivered to Southwest eight days before he flew it.',
  989: 'In June 2015, as Delta 159 to Seoul, it flew through a hailstorm over China that smashed its nose and engines. It landed safely with 388 aboard and nobody hurt, but it was written off.',
  1093: 'On 4 March 2019, as United Express 4933, it touched down in snow beside the runway at Presque Isle, Maine. Three minor injuries; the plane was written off.',
  1139: 'In February 2018 a fan blade broke over the Pacific and tore the engine cowling away. It landed safely in Honolulu with 378 aboard.',
  1494: 'In October 2025 something, most likely a weather balloon, cracked its windshield at 36,000 feet.',
  1520: 'The third 777 ever built, from before the type entered service.',
}

/** From fun-facts/plane-incidents.md (Aviation Safety Network search, 4 Oct 2026). Static: it isn't in the log. */
export const SAFETY_NETWORK_FACT =
  '179 of the 826 tail numbers checked have an entry in the Aviation Safety Network, almost all for turbulence, bird strikes and ground bumps. The King Air he jumped from had once landed so hard its main gear came off.'
