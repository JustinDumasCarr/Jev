import {Config} from '@remotion/cli/config';

// H.264 in an mp4 that LinkedIn will accept, and a quality level that keeps the square
// cut well under the 20 MB budget in ANIMATION-PLAN.md §2.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(21);
Config.setPixelFormat('yuv420p');
Config.setChromiumOpenGlRenderer('angle');
Config.setOverwriteOutput(true);
