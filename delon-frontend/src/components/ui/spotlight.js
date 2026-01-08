import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

export const Spotlight = ({ className, fill, delay = 0 }) => {
  const [isMounted, setIsMounted] = useState(false); // Control rendering

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), delay * 1000); // Delay in seconds
    return () => clearTimeout(timer); // Cleanup the timer on unmount
  }, [delay]);

  // Return nothing until the delay is complete
  if (!isMounted) return "";
  return (
    <svg
      className={cn(
        "animate-spotlight pointer-events-none absolute -top-90 left-[10rem] h-[89%] w-[88%]",
        className
      )}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
    >
      <g filter="url(#filter)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill || "white"}
          fillOpacity="0.21"
        />
      </g>
      <defs>
        <filter
          id="filter"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur_1065_8" />
        </filter>
      </defs>
    </svg>
  );
};
