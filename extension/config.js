// Where Recall lives. Point this at localhost while developing.
export const RECALL_ORIGIN = "https://recall-kohl-mu.vercel.app";

// How often to check Slate. Chrome only fires alarms while the browser runs,
// so this is "about every 6 hours that you're using your computer".
export const SYNC_PERIOD_MINUTES = 360;

// How often to ask Recall whether a reminder is due. Chrome enforces a
// 1-minute floor on alarms. 5 keeps a 30-minute warning from arriving late.
export const REMINDER_PERIOD_MINUTES = 5;
