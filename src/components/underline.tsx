// A red-pen underline, drawn once as one stroke when the page loads. Pure CSS,
// so it costs nothing after that, and reduced motion just shows it drawn.
export function Underline() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 14"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -bottom-[0.14em] left-[-6%] h-[0.32em] w-[112%] overflow-visible text-marker"
      fill="none"
    >
      {/* Swept right, then a quick flick back under itself, like a pen
          that didn't lift. */}
      <path
        className="ul-stroke"
        pathLength={1}
        d="M2 9.5C22 6.5 48 5 97 5.5 74 7.8 50 9.6 30 12"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
