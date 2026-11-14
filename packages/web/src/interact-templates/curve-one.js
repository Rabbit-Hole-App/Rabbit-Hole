import * as curve from './curve-shared.js';
import { curveWords } from '../interact-curve-data.js';
export const { roles, normalize, lanesOf, states } = curve;
export const geometry = range => curve.geometry(range, false);
export const source = ctx => curve.source(ctx, false);
export const words = curveWords['curve-one'];
