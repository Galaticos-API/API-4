import { Search } from "lucide-react";

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <label className="search-field"><span className="sr-only">{label}</span><Search size={17} aria-hidden="true" /><input type="search" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>;
}
