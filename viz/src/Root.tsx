import React from 'react';
import {Composition, Folder} from 'remotion';
import {Film} from './Film';
import {P1Rockets} from './proto/P1Rockets';
import {P2Rings} from './proto/P2Rings';
import {P3Glasses} from './proto/P3Glasses';
import {P4Sprint} from './proto/P4Sprint';
import {P5Thousand} from './proto/P5Thousand';
import fixture from '../data.fixture.json';
import {FPS, totalFrames} from './timeline.mjs';
import type {FilmProps, VizData} from './types';

// The Studio opens on the fixture; `render.sh` passes the real data as props. The
// duration is never hard-coded: it comes out of the data, because beat 3 lasts exactly as
// long as the slowest measured call (ANIMATION-PLAN.md §5).
const calc = ({props}: {props: FilmProps}) => ({
  durationInFrames: totalFrames(props.data, props.layout),
});

const PROTOS: [string, React.FC<FilmProps>][] = [
  ['P1-Rockets', P1Rockets],
  ['P2-Rings', P2Rings],
  ['P3-Glasses', P3Glasses],
  ['P4-Sprint', P4Sprint],
  ['P5-Thousand', P5Thousand],
];

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="JevVsClaude-Square"
      component={Film}
      durationInFrames={900}
      fps={FPS}
      width={1080}
      height={1080}
      defaultProps={{layout: 'square', data: fixture as unknown as VizData} satisfies FilmProps}
      calculateMetadata={calc}
    />
    <Composition
      id="JevVsClaude-Wide"
      component={Film}
      durationInFrames={1050}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{layout: 'wide', data: fixture as unknown as VizData} satisfies FilmProps}
      calculateMetadata={calc}
    />
    {/* ANIMATION-PLAN.md §5c — the prototype round. Separate compositions; the film above
        is untouched until Justin picks one. */}
    <Folder name="Prototypes">
      {PROTOS.map(([id, component]) => (
        <Composition
          key={id}
          id={id}
          component={component}
          durationInFrames={8 * FPS}
          fps={FPS}
          width={1080}
          height={1080}
          defaultProps={{layout: 'square', data: fixture as unknown as VizData} satisfies FilmProps}
        />
      ))}
    </Folder>
  </>
);
