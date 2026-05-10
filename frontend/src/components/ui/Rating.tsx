// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingProps {
  value: number;
  max?: number;
  size?: "sm" | "md";
  showValue?: boolean;
  className?: string;
}

export default function Rating({ value, max = 5, size = "sm", showValue, className }: RatingProps) {
  const starSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < Math.floor(value);
        const partial = !filled && i < value;
        return (
          <div key={i} className="relative">
            <Star className={cn(starSize, "text-slate-200 fill-slate-200")} />
            {(filled || partial) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: partial ? `${(value % 1) * 100}%` : "100%" }}
              >
                <Star className={cn(starSize, "text-amber-400 fill-amber-400")} />
              </div>
            )}
          </div>
        );
      })}
      {showValue && (
        <span className="ml-1 text-sm font-medium text-slate-600">
          {value.toFixed(1)}
        </span>
      )}
    </div>
  );
}
