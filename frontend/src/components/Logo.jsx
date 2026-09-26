import logo from '../assets/logo.png';

export default function Logo({ className = "w-12 h-12 md:w-16 md:h-16" }) {
  return <img src={logo} alt="" aria-hidden="true" className={`shrink-0 object-contain ${className}`} />;
}
