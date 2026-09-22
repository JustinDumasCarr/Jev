// Type surface for src/timeline.mjs (plain JS on purpose: scripts/write-srt.mjs imports
// the same module, so the captions and the video cannot drift apart).
import type {Layout, System, VizData} from './types';

export const FPS: number;
export const TIER: string[];
export function byId(data: VizData, id: string): System | null;
export function panels(data: VizData, layout: Layout): {sys: System; ghost: System | null; tier: number}[];
export function jevOf(data: VizData): System | null;
export function blocksSystems(data: VizData): System[];
export function wallSeconds(data: VizData, layout: Layout): number;
export type Beat = {id: string; seconds: number; caption: string; srt?: string; from: number; fromSeconds: number; durationInFrames: number};
export function beats(data: VizData, layout: Layout): Beat[];
export function totalFrames(data: VizData, layout: Layout): number;
export type VerdictLine = {head: string | null; full: string | null; tail: string; good: boolean};
export type Verdict = {
  lines: VerdictLine[];
  weakest: string | null;
  nearestNote: string | null;
  marginPts: number;
  preliminary: boolean;
};
export function verdictSentence(line: VerdictLine): string;
export function verdict(data: VizData): Verdict;
export function captionLines(data: VizData, layout: Layout): Beat[];

export interface VerdictBlock {
  headline: string;
  smallPrint: string;
  nearest: {id: string; p: Record<string, number>; sys: System} | null;
  marginPts: number;
  preliminary: boolean;
}
export function verdictBlock(data: VizData): VerdictBlock;
