export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`mb-8${id ? ' group' : ''}`}>
      <h2 className="text-base font-semibold text-dm-text-primary mb-3">
        {title}
        {id && (
          <a
            href={`#${id}`}
            className="ml-2 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Link to ${title}`}
          >
            #
          </a>
        )}
      </h2>
      <div className="text-sm text-dm-text-secondary leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2 border-b border-dm-border text-dm-text-primary font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-dm-border last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 text-dm-text-secondary${j === 0 ? ' whitespace-nowrap' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
