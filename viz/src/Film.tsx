import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Watermark} from './chrome';
import {C} from './theme';
import {captionLines, raceWindowSeconds} from './timeline.mjs';
import {EndCard} from './beats/EndCard';
import {JevStamp} from './beats/JevStamp';
import {Prompt} from './beats/Prompt';
import {Targets} from './beats/Targets';
import {Thousand} from './beats/Thousand';
import {Race} from './beats/Race';
import type {FilmProps} from './types';

const GLOW: Record<string, string> = {
  prompt: 'rgba(70,110,190,0.18)',
  jev: 'rgba(255,106,43,0.22)',
  race: 'rgba(70,110,190,0.20)',
  thousand: 'rgba(70,110,190,0.16)',
  accuracy: 'rgba(120,120,160,0.14)',
  end: 'rgba(255,106,43,0.20)',
};

export const Film: React.FC<FilmProps> = ({layout, data}) => {
  const {width, height} = useVideoConfig();
  const beats = captionLines(data, layout) as {
    id: string;
    from: number;
    durationInFrames: number;
    caption: string;
  }[];

  const render = (id: string, caption: string) => {
    const props = {layout, data, caption};
    if (id === 'prompt') return <Prompt {...props} />;
    if (id === 'jev') return <JevStamp {...props} />;
    if (id === 'race') return <Race {...props} windowSeconds={raceWindowSeconds(layout)} />;
    if (id === 'thousand') return <Thousand {...props} />;
    if (id === 'accuracy') return <Targets {...props} />;
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
