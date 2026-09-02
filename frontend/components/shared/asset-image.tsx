"use client";
import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { Sun } from "lucide-react";
export function AssetImage(props: ImageProps) { const [failed, setFailed] = useState(false); return failed ? <div className="absolute inset-0 bg-[#173c2a] flex items-center justify-center text-white" role="img" aria-label={props.alt}><Sun size={50} strokeWidth={1} /><span className="sr-only">Image unavailable</span></div> : <Image {...props} onError={() => setFailed(true)} />; }
