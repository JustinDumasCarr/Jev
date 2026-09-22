import {useVideoConfig} from 'remotion';
import {racers, type Racer} from '../shared';
import type {FilmProps} from '../../types';
import {STAGGER} from './stage';

/* The shared schedule for the two race prototypes, in frames at 30 fps.
 *
 *   0 ..  27   nine elements enter, staggered
 *  30 .. 204   the race — ONE shared rate, strictly linear in elapsed time
 * 204 .. 270   the hold: the silence after the last system lands
 *
 * The camera pushes in the moment Jev lands and pulls back a beat later,
 * while the race keeps running behind it. */

export const ENTER_AT = 0;
export const RACE_AT = 30;
export const RACE_FRAMES = 174;
export const TOTAL_FRAMES = 270;

export type V2Race = {
  rs: Racer[];
  jev: Racer;
  elapsed: number;
  slowest: number;
  speed: number;
  progress: number;
  raceFrame: number;
  /** frame at which this system's answer lands */
  capFrame: (r: Racer) => number;
  /** frames since this system landed, negative before */
  since: (r: Racer) => number;
  enterAt: (i: number) => number;
};

export function useV2Race(data: FilmProps['data']): V2Race {
  const {fps} = useVideoConfig();
  const rs = racers(data);
  const jev = rs[0];
  const slowest = Math.max(...rs.map((r) => r.ms));
  // One playback rate for every lane, stated on screen.
  const speed = Math.min(1, slowest / 1000 / (RACE_FRAMES / fps));

  return {
    rs,
    jev,
    slowest,
    speed,
    elapsed: 0,
    progress: 0,
    raceFrame: 0,
    capFrame: (r) => RACE_AT + (r.ms / speed / 1000) * fps,
    since: () => 0,
    enterAt: (i) => ENTER_AT + i * STAGGER,
  };
}

/** Per-frame values. Kept out of the hook so a component can call it with its own frame. */
export function raceAt(race: V2Race, frame: number, fps: number) {
  const raceFrame = frame - RACE_AT;
  const elapsed = Math.max(0, Math.min(race.slowest, (raceFrame / fps) * 1000 * race.speed));
  return {
    elapsed,
    progress: race.slowest ? elapsed / race.slowest : 0,
    raceFrame,
  };
}
