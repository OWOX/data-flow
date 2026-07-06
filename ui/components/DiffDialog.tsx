import type { ReactNode } from "react";
import type { ModelGraph } from "@mc/okf";
import { diffGraphs } from "../lib/diff";

// Shows the structural diff between a past version and the current canvas — which
// tables, fields and joins were added or removed.
export function DiffDialog({ prev, next, label, onClose }: { prev: ModelGraph; next: ModelGraph; label: string; onClose: () => void }) {
  const d = diffGraphs(prev, next);

  const Row = ({ sign, color, text }: { sign: string; color: string; text: string }) => (
    <div className="flex gap-2 text-[13px]"><span className={`font-semibold ${color}`}>{sign}</span><span className="text-slate-700">{text}</span></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-[520px] max-h-[80vh] overflow-y-auto rounded-2xl border border-[#d8dee8] bg-white p-7 shadow-xl" onClick={e => e.stopPropagation()}>
        <h1 className="text-lg font-semibold">Changes since {label}</h1>
        <p className="mt-1 text-[13px] text-slate-500">Comparing that version to your current canvas.</p>

        {!d.changed ? (
          <p className="mt-6 rounded-xl border border-[#e6e9f0] bg-[#f7f8fa] p-5 text-center text-[13px] text-slate-500">No structural changes — same tables, fields and joins.</p>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            {(d.tables.added.length > 0 || d.tables.removed.length > 0) && (
              <Section title="Tables">
                {d.tables.added.map(t => <Row key={"ta" + t} sign="+" color="text-green-600" text={t} />)}
                {d.tables.removed.map(t => <Row key={"tr" + t} sign="−" color="text-red-600" text={t} />)}
              </Section>
            )}
            {d.fields.length > 0 && (
              <Section title="Fields">
                {d.fields.map(f => (
                  <div key={f.table} className="text-[13px]">
                    <div className="font-[550] text-slate-800">{f.table}</div>
                    {f.added.map(n => <Row key={"fa" + n} sign="+" color="text-green-600" text={n} />)}
                    {f.removed.map(n => <Row key={"fr" + n} sign="−" color="text-red-600" text={n} />)}
                  </div>
                ))}
              </Section>
            )}
            {(d.joins.added.length > 0 || d.joins.removed.length > 0) && (
              <Section title="Joins">
                {d.joins.added.map(j => <Row key={"ja" + j} sign="+" color="text-green-600" text={j} />)}
                {d.joins.removed.map(j => <Row key={"jr" + j} sign="−" color="text-red-600" text={j} />)}
              </Section>
            )}
          </div>
        )}

        <button onClick={onClose} className="mt-6 w-full text-[13px] text-slate-500 hover:text-slate-800 cursor-pointer">Close</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e6e9f0] bg-[#f7f8fa] p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
