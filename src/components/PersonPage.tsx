import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { MetaItem } from './MetaItem';
import { PersonAvatar } from './PersonAvatar';
import { usePerson, type PersonDetail } from '../hooks/usePeople';
import { toApp } from '../lib/basepath';
import { formatRoles } from '../lib/credits';
import { ageInYears, formatCatalogDate, todayCatalogDate } from '../lib/people';

interface PersonPageProps {
  personId: string;
}

/**
 * Person / Filmography surface. Top-level route (`/person/:id`), reached
 * from the search "Cast & crew" section and from tappable cast names on
 * the detail page. Header = portrait (initials without one), name, credit
 * count, then what the catalog knows about them — known for, born, died —
 * and the biography; body = a grid of the person's titles, rendered with
 * the same MediaCard / grid the Browse and Watchlist surfaces use (watched /
 * saved badges, tap → detail), each naming the person's roles on it.
 *
 * The filmography is rendered in the order katalog-api returns it — no
 * client-side re-ranking.
 */
export function PersonPage({ personId }: PersonPageProps) {
  const { data, notFound, loading } = usePerson(personId);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-chino-bg text-chino-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-chino-bg text-white">
        <BackButton />
        <div className="max-w-6xl mx-auto px-6 py-24 text-center text-chino-muted">
          <p className="text-lg">Person not found.</p>
        </div>
      </div>
    );
  }

  const items = data.items ?? [];
  const credits = items.length;
  // The portrait in a 2:3 frame, like the posters below; the initials, in
  // the square they have always had, for someone the catalog has no
  // portrait of.
  const portrait = data.has_profile ? data.profile_url : undefined;
  const facts = personFacts(data);
  const biography = data.biography?.trim();
  const about = facts.length > 0 || !!biography;

  return (
    <div className="min-h-screen bg-chino-bg text-white">
      <BackButton />
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        {/* Header: one grid, so the same elements lay out both ways. On a
            phone the portrait sits beside the name and the facts and the
            biography run full width beneath; from sm up they stand in the
            column beside the portrait, whose spare height the empty third
            row takes. With nothing to say beyond the name, it is the
            avatar and the name side by side, as it always was. */}
        <div
          className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 items-start mb-10 ${
            about ? 'sm:grid-rows-[auto_auto_1fr]' : ''
          }`}
        >
          <PersonAvatar
            name={data.name}
            src={portrait}
            size={portrait ? 128 : 88}
            portrait={!!portrait}
            className={about ? 'sm:row-span-3' : ''}
          />
          <div className={`min-w-0 self-center ${about ? 'sm:self-start' : ''}`}>
            <h1 className="text-3xl md:text-4xl font-bold break-words">{data.name}</h1>
            <p className="text-chino-muted mt-1">
              {credits} title{credits === 1 ? '' : 's'}
            </p>
          </div>
          {about ? (
            <div className="col-span-2 sm:col-span-1 min-w-0 max-w-3xl mt-6">
              {facts.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {facts.map((f) => (
                    <MetaItem key={f.label} label={f.label}>
                      {f.value}
                    </MetaItem>
                  ))}
                </div>
              ) : null}
              {biography ? (
                <Biography text={biography} lang={data.biography_lang} className={facts.length > 0 ? 'mt-6' : ''} />
              ) : null}
            </div>
          ) : null}
        </div>

        <h2 className="text-2xl font-semibold mb-4 text-white">Filmography</h2>
        {items.length === 0 ? (
          <p className="text-chino-muted">No titles available for this person.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
            {items.map((it) => (
              <MediaCard
                key={it.id}
                id={it.id}
                title={it.title}
                image={it.poster_url || ''}
                year={it.year ? String(it.year) : undefined}
                rating={it.rating ? it.rating.toFixed(1) : undefined}
                type={it.type === 'series' ? 'series' : 'movie'}
                watchedAt={it.watched_at}
                credit={formatRoles(it.roles) || undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The labelled facts under the name: what they are known for, when and
 * where they were born, when they died. Dates are written in the browser's
 * locale ("March 3, 1957"), with the age (or the age they reached) beside.
 */
function personFacts(p: PersonDetail): { label: string; value: ReactNode }[] {
  const facts: { label: string; value: ReactNode }[] = [];
  if (p.known_for_department) facts.push({ label: 'Known for', value: p.known_for_department });

  const born = formatCatalogDate(p.birth_date);
  const died = formatCatalogDate(p.death_date);
  const age = ageInYears(p.birth_date, p.death_date || todayCatalogDate());
  if (born || p.birthplace) {
    facts.push({
      label: 'Born',
      value: (
        <>
          {born ? (
            <div>
              <time dateTime={p.birth_date}>{born}</time>
              {!died && age !== undefined ? <span className="text-chino-muted"> (age {age})</span> : null}
            </div>
          ) : null}
          {p.birthplace ? <div>{p.birthplace}</div> : null}
        </>
      ),
    });
  }
  if (died) {
    facts.push({
      label: 'Died',
      value: (
        <div>
          <time dateTime={p.death_date}>{died}</time>
          {age !== undefined ? <span className="text-chino-muted"> (aged {age})</span> : null}
        </div>
      ),
    });
  }
  return facts;
}

/**
 * The biography, in the language the catalog had it in (lang, for screen
 * readers and hyphenation). A long one is cut to six lines with a
 * "Read more" toggle, so the filmography stays within reach on a phone; the
 * toggle shows only when the text is in fact cut.
 */
function Biography({ text, lang, className = '' }: { text: string; lang?: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <p
        id={id}
        ref={ref}
        lang={lang || undefined}
        className={`text-chino-text leading-relaxed whitespace-pre-line ${expanded ? '' : 'line-clamp-6'}`}
      >
        {text}
      </p>
      {clamped || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-2 inline-flex items-center gap-1 text-sm text-chino-accent hover:underline"
        >
          {expanded ? 'Show less' : 'Read more'}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      ) : null}
    </div>
  );
}

function BackButton() {
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign(toApp('/'));
      }}
      className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 transition-colors z-10"
      title="Back"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
