# TODO

## Memory

### Clickable Memory Console

- Turn the Memory tab into an interactive review console, not only a static memory browser.

### Draft Review Audit Trail

- [x] Keep pending candidates in `memory/drafts/`.
- [x] When a candidate is promoted, create the official story/narrative memory file and write an audit record under a promoted/review folder.
- [x] When a candidate is dismissed, write an audit record under a dismissed/review folder instead of losing the signal.
- [x] Surface promoted/dismissed history in the Memory UI as a clickable review trail.
- When a dismissed candidate reappears in future model output, mark it as previously dismissed and make the old decision clickable.

### Propagation Log Click Targets

- Make each propagation log update clickable.
- Clicking a log update should jump to the target story/narrative.
- If possible, highlight the timeline/evidence/open-gap entry created by that event.

### Related Memory Links

- Make related stories and related narratives clickable inside the detail view.
- Clicking a related item should switch the selected memory entry without leaving the Memory tab.

### Source Report Links

- Make source report references clickable.
- Clicking a source report should open the corresponding report in History, preserving the report type and date context.

### Evidence And Open Gap Actions

- Make important open gaps actionable.
- Allow an open gap to become a watch item.
- If a later report provides confirming evidence, mark the watch item as resolved or strengthened.
