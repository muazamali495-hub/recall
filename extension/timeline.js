/**
 * Asking Moodle what is still to be done.
 *
 * Moodle's Timeline block shows only "action events": an assignment until it
 * is submitted, a quiz until it is attempted. Once the student has done the
 * work the event drops out of that list. So the list of what Moodle still
 * shows is, by subtraction, the list of what is finished — and the calendar
 * export's UID is the same event id, so the two can be joined exactly.
 *
 * Kept apart from background.js so the response handling can be tested
 * against a fixture; there is no Slate session to run a test in.
 */

export const METHOD = "core_calendar_get_action_events_by_timesort";

/** Moodle caps this at 50 per call, so the list is walked in pages. */
export const PAGE = 50;

/**
 * One page of action events from `fromUnix` onward.
 *
 * `afterEventId` is Moodle's cursor: pass the last id of the previous page to
 * get the next one. Starting a week back rather than at "now" keeps overdue
 * work that is still open in the list — an unsubmitted assignment past its
 * date must not be mistaken for a submitted one.
 */
export function timelineRequest(fromUnix, afterEventId = 0) {
  return [
    {
      index: 0,
      methodname: METHOD,
      args: {
        timesortfrom: fromUnix,
        aftereventid: afterEventId,
        limitnum: PAGE,
        limittononsuspendedevents: true,
      },
    },
  ];
}

/**
 * The event ids in one page, plus whether another page should be asked for.
 *
 * Every event Moodle returns counts as "still open", including ones flagged
 * `actionable: false` — that flag means "not yet open for submission", which
 * is the opposite of finished. Only absence from the list means done.
 */
export function extractActionable(payload) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  if (!first || first.error) return { ids: [], lastId: null, more: false };

  const data = first.data ?? first;
  const events = Array.isArray(data?.events) ? data.events : [];

  const ids = [];
  for (const e of events) {
    const id = Number(e?.id);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }

  const lastId = Number(data?.lastid);

  return {
    ids,
    lastId: Number.isInteger(lastId) && lastId > 0 ? lastId : ids.at(-1) ?? null,
    more: events.length >= PAGE,
  };
}
