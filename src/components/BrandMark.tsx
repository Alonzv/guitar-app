import { T } from '../theme';

/**
 * The ScaleUp mark: four ascending bars — three in the current text colour,
 * the fourth rising in the cobalt brand accent. Rendered inline (not the PNG)
 * so it inherits the theme and stays legible on both the light and the
 * night-black header. Same "monochrome until the Up" gesture as the wordmark.
 */
export function BrandMark({ size = 24, title = 'ScaleUp' }: { size?: number; title?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 512 512"
      role="img" aria-label={title} style={{ display: 'block' }}
    >
      <rect x="0"      y="337.92" width="85.76" height="174.08" rx="5.15" fill={T.text} />
      <rect x="142.08" y="230.40" width="85.76" height="281.60" rx="5.15" fill={T.text} />
      <rect x="284.16" y="122.88" width="85.76" height="389.12" rx="5.15" fill={T.text} />
      <rect x="426.24" y="0"      width="85.76" height="512.00" rx="5.15" fill={T.brandAccent} />
    </svg>
  );
}
