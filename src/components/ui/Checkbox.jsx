import React from 'react';
import { cn } from '../../utils/cn';
import Icon from '../AppIcon';

const Checkbox = React.forwardRef(({
  className,
  checked = false,
  onCheckedChange,
  disabled = false,
  id,
  ...props
}, ref) => {
  const handleChange = (e) => {
    if (onCheckedChange) {
      onCheckedChange(e?.target?.checked);
    }
  };

  return (
    <label className="relative inline-flex items-center" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        ref={ref}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />
      <div
        className={cn(
          "w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-200 cursor-pointer",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
          checked
            ? "bg-primary border-primary" :"bg-background border-input hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {checked && (
          <Icon
            name="Check"
            size={12}
            color="var(--color-primary-foreground)"
            className="animate-in zoom-in-50 duration-200"
          />
        )}
      </div>
    </label>
  );
});

Checkbox.displayName = 'Checkbox';

export default Checkbox;
