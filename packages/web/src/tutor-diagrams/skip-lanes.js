export const skipLaneX = (right, index) => right + 10 + 9 * index;

export function skipLanePoints(from, to, x, departY = from[1], arriveY = to[1]) {
  return [from, [from[0], departY], [x, departY], [x, arriveY], [to[0], arriveY], to];
}
