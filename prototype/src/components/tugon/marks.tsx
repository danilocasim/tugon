/** Product mark: barangay hall roofline over a resolved tick. */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="9" fill="#0b5d4b" />
      <path d="M7.5 15.2 16 8.4l8.5 6.8" fill="none" stroke="#fbfaf6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 14.6V23h11v-8.4" fill="none" stroke="#fbfaf6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.3 18.6 2 2 3.6-3.9" fill="none" stroke="#f1b44c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Fictional barangay seal: dotted ring and a five-petal sampaguita. */
export function Seal({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={className}>
      <circle cx="20" cy="20" r="19.5" fill="#0b5d4b" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="#f1b44c" strokeWidth="1" strokeDasharray="1.4 1.9" />
      <circle cx="20" cy="20" r="13.4" fill="#e1efe8" />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx="20" cy="13.4" rx="3.4" ry="5.7" transform={`rotate(${deg} 20 20)`} fill="#ffffff" stroke="#0b5d4b" strokeWidth="1.1" />
      ))}
      <circle cx="20" cy="20" r="2.5" fill="#f1b44c" />
    </svg>
  );
}
