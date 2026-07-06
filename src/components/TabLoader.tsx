import { T } from '../theme';

// Shown for the brief moment a tab's code chunk is downloading (code-split
// panels). B+C: the four-bar ScaleUp mark climbing in a gentle staggered pulse,
// with "LOADING" beneath. Theme-aware — ink/sand bars, cobalt on the fourth.
const BARS = [14, 20, 27, 34]; // ascending heights, like the mark

export function TabLoader() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 13, padding: '64px 0', minHeight: 200,
    }}>
      <style>{`@keyframes gcTabBar {
        0%, 100% { opacity: 0.28; transform: scaleY(0.72); }
        50%      { opacity: 1;    transform: scaleY(1); }
      }`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 34 }}>
        {BARS.map((h, i) => (
          <span key={i} style={{
            display: 'block', width: 8, height: h, transformOrigin: 'bottom',
            background: i === BARS.length - 1 ? T.brandAccent : T.text,
            animation: `gcTabBar 1.15s ease-in-out ${i * 0.13}s infinite`,
          }} />
        ))}
      </div>
      <span style={{
        fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: T.textDim,
      }}>Loading</span>
    </div>
  );
}
