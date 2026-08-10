import path from 'node:path';
import { config } from '../config.js';

// Caption fonts — free (OFL/Apache) stand-ins for TikTok's proprietary text
// styles. Keys must match client/src/lib/clips.js CAPTION_FONTS.
export const CAPTION_FONTS = {
  classic: { label: 'Classic', file: 'Caption.ttf' }, // Montserrat Bold
  bold: { label: 'Bold', file: 'Anton.ttf' },
  headline: { label: 'Headline', file: 'BebasNeue.ttf' },
  typewriter: { label: 'Typewriter', file: 'CourierPrime.ttf' },
  serif: { label: 'Serif', file: 'DMSerif.ttf' },
  handwriting: { label: 'Handwriting', file: 'Pacifico.ttf' },
  marker: { label: 'Marker', file: 'PermanentMarker.ttf' },
};

export function captionFontFile(key) {
  const entry = CAPTION_FONTS[key] || CAPTION_FONTS.classic;
  return path.join(config.assetsDir, 'fonts', entry.file);
}
