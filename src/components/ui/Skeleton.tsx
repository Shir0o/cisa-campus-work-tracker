import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps extends React.ComponentPropsWithoutRef<"div"> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-on-surface/10", className)}
      {...props}
    />
  );
}
