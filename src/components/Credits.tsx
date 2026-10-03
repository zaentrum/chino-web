import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CastEntry } from '../hooks/useItem';
import { toApp } from '../lib/basepath';
import { MetaItem } from './MetaItem';

/** How many actors "Starring" shows before "Full cast". */
const CAST_PREVIEW = 6;

/**
 * A credited name: a link to the person's page (`/person/{id}` under the
 * app's mount, as search links it) when the credit carries a person_id,
 * plain text otherwise.
 */
export function PersonLink({ person }: { person: CastEntry }) {
  if (!person.person_id) return <>{person.name}</>;
  return (
    <a
      href={toApp(`/person/${encodeURIComponent(person.person_id)}`)}
      className="hover:text-chino-accent hover:underline transition-colors"
    >
      {person.name}
    </a>
  );
}

/**
 * Comma-separated cast / crew names, each a PersonLink. The separators stay
 * outside the links so only the name is tappable.
 */
export function CastNames({ people }: { people: CastEntry[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={`${p.person_id ?? p.name}-${i}`}>
          {i > 0 ? ', ' : ''}
          <PersonLink person={p} />
        </span>
      ))}
    </>
  );
}

/**
 * The detail page's "Starring" block: the actors in billing order (the order
 * katalog-api sends), each name with the character beneath it, two to a row
 * so a phone shows them without scrolling sideways. A long cast shows its
 * first CAST_PREVIEW and a "Full cast" toggle for the rest; a cast only a
 * name or two longer than that is shown whole, since a button that hides
 * two names saves nothing.
 */
export function Starring({ actors }: { actors: CastEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const collapsible = actors.length > CAST_PREVIEW + 2;
  const shown = collapsible && !expanded ? actors.slice(0, CAST_PREVIEW) : actors;

  return (
    <MetaItem label="Starring" className="col-span-2">
      <ul id={listId} className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {shown.map((a, i) => (
          <li key={`${a.person_id ?? a.name}-${i}`} className="min-w-0">
            <PersonLink person={a} />
            {a.character ? (
              <div className="text-xs text-chino-muted mt-0.5">
                <span className="sr-only">as </span>
                {a.character}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-3 inline-flex items-center gap-1 text-chino-accent hover:underline"
        >
          {expanded ? 'Show less' : `Full cast (${actors.length})`}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      ) : null}
    </MetaItem>
  );
}
