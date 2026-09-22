import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Backdrop, Watermark} from './chrome';
import {C} from './theme';
import {captionLines} from './timeline.mjs';
import {EndCard} from './beats/EndCard';
import {JevStamp} from './beats/JevStamp';
import {Prompt} from './beats/Prompt';
import {Targets} from './beats/Targets';
import {Thousand} from './beats/Thousand';
import {Wall} from './beats/Wall';
import type {FilmProps} from './types';

const GLOW: Record<string, string> = {
  prompt: 'rgba(70,110,190,0.18)',
  jev: 'rgba(255,106,43,0.22)',
  wall: 'rgba(70,110,190,0.20)',
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
    if (id === 'wall') return <Wall {...props} />;
    if (id === 'thousand') return <Thousand {...props} />;
    if (id === 'accuracy') return <Targets {...props} />;
    return <EndCard layout={layout} data={data} />;
  };

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      {beats.map((b) => (
        <Sequence key={b.id} from={b.from} durationInFrames={b.durationInFrames} name={b.id}>
          <Backdrop glow={GLOW[b.id]} />
          {render(b.id, b.caption)}
        </Sequence>
      ))}
      {/* Outside every sequence: on every single frame, and nothing switches it off. */}
      <Watermark fixture={data.meta.fixture === true} width={width} height={height} />
    </AbsoluteFill>
  );
};
