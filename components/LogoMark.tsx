export default function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 100 100" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="50" cy="40" rx="20" ry="30" transform="rotate(0 50 40)" />
      <ellipse cx="40" cy="60" rx="20" ry="30" transform="rotate(60 40 60)" />
      <ellipse cx="60" cy="60" rx="20" ry="30" transform="rotate(-60 60 60)" />
    </svg>
  );
}
