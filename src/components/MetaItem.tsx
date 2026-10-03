import type { ReactNode } from 'react';

interface MetaItemProps {
  /** The muted label above the value ("Director", "Born"). */
  label: string;
  children: ReactNode;
  /** Extra classes for the block (e.g. a grid span). */
  className?: string;
}

/**
 * One labelled block of the meta strip: a muted label over its value. The
 * detail page's credits and subtitles and the person page's facts are built
 * from it, so the two pages read the same. The label is its own element with
 * nothing but the label in it, and the block is its parent.
 */
export function MetaItem({ label, children, className = '' }: MetaItemProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-chino-muted mb-1">{label}</div>
      <div className="text-chino-text break-words">{children}</div>
    </div>
  );
}
