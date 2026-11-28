'use client';

import { useRef } from 'react';

/** A GET filter form that applies itself: dropdowns submit immediately, the search box after you stop typing. */
export function FilterForm({ children, className, hidden, ...rest }: { children: React.ReactNode; className?: string; hidden?: Record<string, string | undefined> } & React.FormHTMLAttributes<HTMLFormElement>) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const submit = () => ref.current?.requestSubmit();
  return (
    <form
      ref={ref}
      className={className}
      {...rest}
      onChange={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' || el.type === 'month') submit();
      }}
      onInput={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) {
          clearTimeout(timer.current);
          timer.current = setTimeout(submit, 500);
        }
      }}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
      {children}
    </form>
  );
}
