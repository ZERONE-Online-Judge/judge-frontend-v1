# Presentation scoreboard rehearsal

Revision 13: retain the original scoreboard and result playback, fit two
divisions across the screen, and keep the presentation frame fixed. Each
division scrolls its own table; optional horizontal and vertical auto-scroll
make overflowing columns and teams available without shrinking them away.

Text scaling now changes glyph sizes while preserving card, table and column
geometry and padding. Fixed time-panel line slots prevent the header from
pushing the boards down at larger font settings. Numeric values fit their
published column; short table viewports retain a readable first row. A visible
horizontal range and arrow buttons give mouse and keyboard users direct access
to overflowing problems without moving the page.

After observed completion of all selected divisions and the final result/rank
motion, the awards stage celebrates the official podium. Bronze, silver and
gold medals settle in sequence with a single confetti/firework burst and a
3.45-second fanfare when sound is available. Tied ranks include every named
team; overflowing award lists scroll internally and extend reading time up to
16 seconds. Already-public results loaded on entry do not replay awards.
Hidden, stale, undone and changed audiences cancel retained ceremonies.

The sound invitation is hidden when the actual audio output is ready. The
sound hook checks current AudioContext state, recovers a previously activated
interrupted output on return or a trusted gesture, and never queues missed
cues. Enabled preference and actual playback readiness are shown separately.

This is the real product page and CSS with synthetic API responses only.
The reviewed design is authorized for production after verification and the
accompanying operator-guide updates.

## Composition

The foundation remains the original page at
`bf316e74a810a3482b39ff76af6e3ca8574cf053`: hero, TimePanel, 118rem shell,
the board grid, colors and pill shapes. At Full HD/100%, table text is team
20px, rank 24px, total 23px, cell 17px, problem code 19px and labels 14px. The
team column receives 30% in a full-width board. Compact cards adapt type, fixed
columns, team share and spacing together to fit two IOI4/ICPC8 boards in HD and
Full HD. The grid caps at two columns and puts a third division on the next row.
The frame never scrolls: division titles stay fixed and each table owns both
axes, with a sticky table heading. Announced rank changes also move the table
scroll position with the same 600ms easing, so the moved team remains visible. IOI point and pending pills
share height, radius and centered grouping; oversized groups wrap in their cell.

The viewport width and height set a shared resolution scale, capped at 150%
for 4K. The shell uses the available width and the hero uses height limits, so
short or portrait frames retain a usable table viewport. Low cards compact
their own heading before reducing the space for team rows. Manual 300% text
still increases score content and relies on each table's internal scrolling.
Extremely short cards cap that enlargement so a full team/score line remains
visible below the sticky heading.

Short and long contest names share a reserved two-line title height. The full
title is measured and shrunk to fit when needed, including after font load,
viewport resize and display font-scale changes. Full accessible names remain.

No visible ICPC/IOI caption or release-completed/waiting/finalized prose is
reintroduced. Hidden rows, natural problem ordering, accurate IOI maximums and
accessible score semantics remain protected.

## Overflow and display preferences

The actual screen settings provide independent horizontal and vertical auto-scroll
switches, on by default. Like theme and font scale, they are saved per display
and seed new tabs from local preferences. Only overflowing axes move, slowly
back and forth with a reading pause at each end. Every division has independent
positions. No document, presentation frame or settings panel is auto-scrolled.

Reveal playback, schedule overlays and open settings suspend auto-scroll. Manual
wheel, keyboard, touch or scrollbar interaction yields that division until five
seconds after the interaction ends. Returning from a hidden tab or result stage
starts with a reading pause and does not make up elapsed distance. Focus moves
only the relevant table, never its outer ancestors.

Multi-division fixtures use ordinary team names without adding their division to
the name. Division identifiers remain distinct so simultaneous release events
can be queued and scoped correctly.

An initial, non-modal sound card asks whether to enable effects. Activating it
unlocks browser audio; choosing later leaves sound off until enabled in settings.
The choice is remembered for that contest in the current tab, including reloads.

## Motion

The old public board focuses the target for 420ms. Its visible source expands
into a neutral question and waits 1100ms. Resolver questions show the team and
problem, with a question mark instead of the outcome. Selected-rank questions
also withhold new team identities. Final verdict, score, rank, outcome colors
and accessible result text are absent until the result phase. RevealScore
mounts and the matching sound plays only then.

The existing staggered result entrance, IOI count-up and 1400–2600ms reading
time remain. After the 340ms return, show the old board plainly for 300ms, then
highlight only announced teams whose rank changes for 180ms. Commit the new
snapshot as the same rows move for 600ms. Remove the emphasis and allow its
300ms fade before another queued event. Old values remain unchanged through
question/result/return/hold/highlight; they change only at movement. A previous
resolver event no longer leaves permanent team or problem emphasis behind. Hidden tabs, reduced motion, undo,
route changes, data resets and stale responses cancel pending playback.

## Verification

Evidence lives in `artifacts/presentation-center-stage-20261114/` at the project
root. Relevant component/domain tests, typecheck, build and ESLint are checked. Chrome
QA covers title height and fit, score/pending geometry, mobile and 300% text,
long names and actual resolver/rank/batch reveal flows. Record and inspect the
question, reveal, old-board hold, emphasized movement and restored frames with
real product CSS. The problem code now flows directly before its title in the
same centered heading rather than occupying a separate wide column.

Stageshow references guide motion; the user's request for the real product UI
takes precedence over a faux frame or kit. Browser QA does not measure physical
projector lighting or viewing distance.
