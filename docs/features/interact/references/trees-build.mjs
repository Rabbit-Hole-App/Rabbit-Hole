import {writeCards} from './trees-author.mjs';
const id=process.argv[2];
const m=await import(`./trees-author-${id}.mjs`);
writeCards(id,m.make,m.compute,m.paint);
