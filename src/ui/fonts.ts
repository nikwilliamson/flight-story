// Self-hosted so the SDF text renderer can read the font files directly (troika parses WOFF, not WOFF2).
import display500 from '@fontsource/saira-semi-condensed/files/saira-semi-condensed-latin-500-normal.woff?url'
import display600 from '@fontsource/saira-semi-condensed/files/saira-semi-condensed-latin-600-normal.woff?url'
import body400 from '@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff?url'
import mono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff?url'

export const fonts = {
  display: display600,
  displayMedium: display500,
  body: body400,
  mono: mono400,
}
