import { cloneElement, isValidElement, type ReactElement } from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  optional?: boolean;
  error?: string;
  children: ReactElement;
}

// Label + input wrapper: consistent spacing, an "(optional)" suffix instead
// of every non-required field looking identical to a required one, and
// aria-invalid/aria-describedby wired onto the input automatically when an
// error is passed in (server-action forms had no field-level error styling
// at all before this).
export function FormField({ label, htmlFor, optional, error, children }: FormFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  const input = isValidElement(children)
    ? cloneElement(children, {
        id: htmlFor,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': errorId,
      } as Record<string, unknown>)
    : children;

  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-mist">
        {label}
        {optional && <span className="text-mist/70"> (optional)</span>}
      </label>
      {input}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-amber">
          {error}
        </p>
      )}
    </div>
  );
}
