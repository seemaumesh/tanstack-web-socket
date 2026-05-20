import { useQuery } from '@tanstack/react-query';
import type { Highlight, Document as DocType, Paragraph } from '../types';

interface Props {
  remoteHighlights: Highlight[];
  onHighlight: (h: Omit<Highlight, 'userId' | 'userName' | 'color'>) => void;
  onClearHighlight: () => void;
}

async function fetchDocument(): Promise<DocType> {
  const res = await fetch('/api/document');
  if (!res.ok) throw new Error('Failed to load document');
  return res.json();
}

/** Splits paragraph text into segments based on overlapping highlight ranges */
function buildSegments(text: string, highlights: Highlight[]) {
  // Collect all boundary points
  const boundaries = new Set<number>([0, text.length]);
  highlights.forEach(({ start, end }) => {
    if (start >= 0 && end <= text.length && start < end) {
      boundaries.add(start);
      boundaries.add(end);
    }
  });

  const points = Array.from(boundaries).sort((a, b) => a - b);

  return points.slice(0, -1).map((start, i) => {
    const end = points[i + 1];
    const slice = text.slice(start, end);
    const activeHighlights = highlights.filter(
      (h) => h.start <= start && h.end >= end && h.start < h.end
    );
    return { start, end, text: slice, highlights: activeHighlights };
  });
}

function ParagraphView({
  paragraph,
  highlights,
  onMouseUp,
}: {
  paragraph: Paragraph;
  highlights: Highlight[];
  onMouseUp: (paragraphId: string) => void;
}) {
  const segments = buildSegments(paragraph.text, highlights);

  return (
    <p
      className="doc-paragraph"
      data-paragraph-id={paragraph.id}
      onMouseUp={() => onMouseUp(paragraph.id)}
    >
      {segments.map((seg, idx) => {
        if (seg.highlights.length === 0) {
          return <span key={idx}>{seg.text}</span>;
        }
        // Use the last highlight's color (most recent wins)
        const h = seg.highlights[seg.highlights.length - 1];
        return (
          <mark
            key={idx}
            className="highlight-mark"
            style={{ backgroundColor: h.color + '55', borderBottom: `2px solid ${h.color}` }}
            title={h.userName}
          >
            {seg.text}
          </mark>
        );
      })}
    </p>
  );
}

export function Document({ remoteHighlights, onHighlight, onClearHighlight }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['document'],
    queryFn: fetchDocument,
  });

  function handleMouseUp(paragraphId: string) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      onClearHighlight();
      return;
    }

    const range = selection.getRangeAt(0);
    const paragraphEl = document.querySelector(`[data-paragraph-id="${paragraphId}"]`);
    if (!paragraphEl) return;

    // Compute start offset relative to paragraph text
    const preRange = document.createRange();
    preRange.selectNodeContents(paragraphEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;

    if (end > start) {
      onHighlight({ paragraphId, start, end });
    }
  }

  if (isLoading) return <div className="doc-status">Loading document…</div>;
  if (isError) return <div className="doc-status doc-error">Failed to load document.</div>;

  return (
    <article className="document">
      <h1 className="doc-title">{data!.title}</h1>
      {data!.paragraphs.map((p) => (
        <ParagraphView
          key={p.id}
          paragraph={p}
          highlights={remoteHighlights.filter((h) => h.paragraphId === p.id)}
          onMouseUp={handleMouseUp}
        />
      ))}
      <p className="doc-hint">
        💡 Select any text to highlight it for other users in real time.
      </p>
    </article>
  );
}
