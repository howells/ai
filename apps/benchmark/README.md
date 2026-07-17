# Private benchmark app

The benchmark has two authenticated modes: `/` runs the fixed rigorous suite,
and `/explore` compares one custom prompt across up to four routes. `/sandbox`
redirects to `/explore`.

Copy `.env.example` to `.env.local`, fill every required benchmark value, and
configure at least one provider. The application refuses to start without
Postgres and independent session/hash secrets. Provider calls spend real quota;
normal package and app checks do not call them.

Apply migrations in order with your normal migration runner. First apply
`0001_hardened_benchmark.sql`, verify new runs and samples, then apply
`0002_delete_legacy_history.sql`. The second migration permanently deletes the
legacy raw-prompt table without making a backup. Schedule
`SELECT cleanup_benchmark_data();` daily through a database role that is not
available to the browser or application client.

The default hosted limits reserve 500 provider attempts per UTC day, 50 per
run, and two lease-backed active runs. Rigorous execution is sequential; Explore
uses at most four concurrent provider calls. Started attempts remain charged.
