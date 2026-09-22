import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Watermark} from './chrome';
import {C} from './theme';
import {captionLines} from './timeline.mjs';
import {Decision} from './beats/Decision';
import {Quadrants} from './beats/Quadrants';
import {EndCard} from './beats/EndCard';
import {Targets} from './beats/Targets';
import type {FilmProps} from './types';

export const Film: React.FC<FilmProps> = ({layout, data}) => {
  const {width, height} = useVideoConfig();
  const beats = captionLines(data, layout) as {
    id: string;
    from: number;
    durationInFrames: number;
    caption: string;
  }[];

  const render = (id: string, caption: string) => {
    if (id === 'quadrants') return <Quadrants layout={layout} data={data} />;
    if (id === 'decision') return <Decision layout={layout} data={data} />;
    if (id === 'accuracy') return <Targets layout={layout} data={data} caption={caption} />;
    return <EndCard layout={layout} data={data} />;
  };

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      {beats.map((b) => (
        // Each beat runs 10 frames past its slot so its exit plays OVER the beat
        // that follows: no beat ever ends on black, and none of them just holds.
        <Sequence key={b.id} from={b.from} durationInFrames={b.durationInFrames + 10} name={b.id}>
          {render(b.id, b.caption)}
        </Sequence>
      ))}
      {/* Outside every sequence: on every single frame, and nothing switches it off.
          Each beat also draws it, so a beat can never be composited over it. */}
      <Watermark fixture={data.meta.fixture === true} width={width} height={height} />
    </AbsoluteFill>
  );
};
