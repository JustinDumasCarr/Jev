/* Every string in the film that depends on which task is being shown lives here,
 * and nowhere else. ANIMATION-PLAN.md §4: no routing content in the injection
 * film and no injection content in the routing film. */

export type TaskStrings = {
  /** the one header line on the quadrant and blocks beats */
  header: string;
  /** the asterisk footnote on the quadrant beat */
  quadFoot: string;
  /** the asterisk footnote on the blocks beat, both phases */
  blocksFootA: string;
  blocksFootB: (speed: string) => string;
  /** what Jev's answer is called in the blocks footnote */
  jevAnswer: (decision: string, pctText: string) => string;
  /** the second line of the live stats column, on two lines so it never clips */
  correctLabel: string[];
  /** the static line under a model's name */
  accuracyPhrase: string;
  /** the towers' legend and small print */
  towersLegend: string;
  towersFoot: string;
  scoreboardTitle: string;
};

const ROUTING: TaskStrings = {
  header: 'One request. Which skill or agent should handle it?',
  quadFoot: 'real time · real test cases · the model’s own top three, best first',
  blocksFootA: 'real time · one cell = one decision · each lights when that model answered',
  blocksFootB: (speed) => `time-lapse ×${speed} · one cell = one decision · one stream per model`,
  jevAnswer: (decision, pctText) => `Jev picked ${decision}, ${pctText}`,
  correctLabel: ['correct', 'pick'],
  accuracyPhrase: 'picks the right tool',
  towersLegend: 'green = the gold skill or agent, red = a different pick',
  towersFoot: 'correct = the gold skill or agent · same height everywhere · red = wrong',
  scoreboardTitle: 'Routing: speed against accuracy',
};

const INJECTION: TaskStrings = {
  header: 'Someone is messaging a chatbot. Attack or safe?',
  quadFoot: 'real time · real test cases · attack = prompt injection',
  blocksFootA: 'real time · one cell = one decision · each lights when that model answered',
  blocksFootB: (speed) => `time-lapse ×${speed} · one cell = one decision · one stream per model`,
  jevAnswer: (decision, pctText) => `Jev: ${decision}, ${pctText}`,
  correctLabel: ['correct'],
  accuracyPhrase: 'flags attacks correctly',
  towersLegend: 'green = matched gold, red = missed',
  towersFoot: 'attack = prompt injection · same height everywhere · red = wrong',
  scoreboardTitle: 'Injection: speed against accuracy',
};

export const stringsFor = (task: string | undefined): TaskStrings =>
  task === 'task1' ? ROUTING : INJECTION;
