# Data Flow

**The whole path from source to report, on one page.**

A read-only plugin for [OWOX Data Marts](https://docs.owox.com/): **Sources → Storages → Data
Marts → Destinations → Reports**, drawn as cards with the lines that connect them.

<https://github.com/user-attachments/assets/5b73785b-b72e-43d6-984f-61ed33106e8c>

## The challenge

A number in a report is only as good as the chain behind it, and the chain is what no single screen
shows. OWOX already knows all of it — the source behind a mart, the joins, the reports, the
destinations they write to, the last run and the quality checks. It's just never in one place.
Each piece is a different screen, a different tab, a different row you have to open, and the flow
itself only ever exists in your head — assembled one click at a time, gone again by the next
question.

## What this gives you

🗺️ **The whole picture, one screen.** Every source, storage, mart, destination and report, and
every line between them. Hover a card to see what it touches; click to keep it — the chain stays
drawn end to end, upstream to the source and downstream to the report, while you go on hovering
anything else to compare.

🏛️ **A storage scopes everything below it.** Click one and the Data Marts block narrows to the
marts it holds. A storage this project can't see doesn't break the chain — the line runs to the
block that would have held it, so nothing goes missing just because you lack access to it.

🚦 **Quality and freshness where you can see them.** Each data mart carries its quality state —
which colours the card border, the way OWOX colours the block on its own Models page — and its
last-updated time beside it. Sources, destinations and reports take their colour from their runs
instead. Hover either mark on a mart to read what it found. A broken link in the chain is visible
before anyone asks about it.

🔍 **Filters that answer real questions.** Marts without relationships. Drafts. Marts with errors.
Marts nothing reports on. Reports without triggers. Storages by type or by what they're shared for,
destinations by type, anything by search — the lines redraw with the cards.

👥 **Who owns what.** Every card but a source says who created it and who owns it — a data mart
names its business and technical owners separately — with faces and names on hover, and a badge for
what it's shared for.

🎯 **Reports in context.** Select a data mart or a destination and the Reports block narrows to just
its reports.

🔗 **Every card is a link.** The corner icon opens that mart, storage, destination or report in
OWOX, and a data mart's shield opens its Data Quality tab.

🔄 **Check everything at once.** The button beside the Data Marts count runs Check Quality and
Check Data Last Updated over every mart on the page, then watches the shields settle as the
answers come back.

Skip hours of clicking through screens to reconstruct lineage. Know the quality of the reports you’re responsible for before someone asks about them.

## Zero setup

Install it and open it — nothing to configure, nothing to connect. The plugin reads your project
through the OWOX host and shows you what's there.

It stores nothing. It writes nothing.

## Install

In the OWOX Data Marts plugin, pick **Data Flow** from the gallery.

---

Source: [github.com/OWOX/data-flow](https://github.com/OWOX/data-flow) — build, hosting and release
notes live in [AGENTS.md](AGENTS.md).
