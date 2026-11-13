import { pending } from './stub.mjs';
export async function run(ctx) {
  if (!ctx.go) throw new Error('Release requires --go');
  return pending('09');
}
