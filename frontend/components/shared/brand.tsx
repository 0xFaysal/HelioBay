import Link from "next/link";
import { Zap } from "lucide-react";

export function Brand(
  {
    light = false
  }: {
    light?: boolean;
  }
) {
  return <Link href="/" aria-label="HelioBay home" className={`brand ${light ? "text-white" : ""}`}><span className="brand-mark"><Zap size={29} strokeWidth={2.7} fill="currentColor" /></span><span>HelioBay</span></Link>;
}
