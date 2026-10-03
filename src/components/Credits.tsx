import type { CastEntry } from '../hooks/useItem';
import { toApp } from '../lib/basepath';

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
