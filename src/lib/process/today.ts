// « Aujourd'hui » au sens du calendrier français.
//
// Les échéances (StepInstance.dueDate) sont des dates civiles sans heure.
// Le cron doit donc comparer à la date courante à Paris, jamais à UTC :
// sinon, lancé à 23h UTC, il traiterait déjà les échéances du lendemain
// français et une convocation J-7 partirait la veille au soir.
const parisDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Renvoie la date civile de Paris, en Date UTC minuit (même repère que dueDate).
export function todayInParis(now: Date = new Date()): Date {
  return new Date(`${parisDate.format(now)}T00:00:00.000Z`);
}

export function parisDateString(now: Date = new Date()): string {
  return parisDate.format(now);
}
