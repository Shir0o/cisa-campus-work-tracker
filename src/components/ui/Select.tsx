import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
  iconClassName?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, iconClassName, children, ...props }, ref) => {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            'w-full pl-3 pr-10 py-2 bg-surface rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface cursor-pointer appearance-none',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant',
            iconClassName
          )}
        />
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
export default Select;
