// Runs once at image build (Dockerfile): records exact tool versions and the FFmpeg licence
// evidence into /app/build-info.json, and FAILS the build when the FFmpeg binary is not an LGPL
// build, links anything beyond the C library, or lacks the encoder the audio converter uses.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return `${r.stdout || ''}${r.stderr || ''}`.trim(); };
const dpkg = pkgs => Object.fromEntries(sh('dpkg-query', ['-W', '-f=${Package} ${Version}\n', ...pkgs]).split('\n').map(l => l.split(' ')));
const fail = msg => { console.error(`✗ build-info: ${msg}`); process.exit(1); };

const ffVersion = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-version']).split('\n')[0];
const buildconf = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-buildconf']);
const licence = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-L']).split('\n').slice(0, 3).join(' ');
const encoders = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-encoders']).split('\n').filter(l => /^ [A-Z.]{6} \S/.test(l) && !/^ [A-Z.]{6} =/.test(l)).map(l => l.trim().split(/\s+/)[1]);
const decoders = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-decoders']).split('\n').filter(l => /^ [A-Z.]{6} \S/.test(l) && !/^ [A-Z.]{6} =/.test(l)).map(l => l.trim().split(/\s+/)[1]);
const demuxers = sh('/opt/ffmpeg/bin/ffmpeg', ['-hide_banner', '-demuxers']).split('\n').filter(l => /^ D[E ]? +\S/.test(l) && !/ = /.test(l)).map(l => l.trim().split(/\s+/)[1]);
const ldd = sh('ldd', ['/opt/ffmpeg/bin/ffmpeg']).split('\n').map(l => l.trim().split(' ')[0]);
const lddProbe = sh('ldd', ['/opt/ffmpeg/bin/ffprobe']).split('\n').map(l => l.trim().split(' ')[0]);

if (!/Lesser General Public License/.test(licence)) fail(`ffmpeg -L is not LGPL: ${licence}`);
if (/--enable-(gpl|nonfree|version3)/.test(buildconf)) fail('ffmpeg was configured with --enable-gpl, --enable-nonfree or --enable-version3');
if (!encoders.includes('aac')) fail('the aac encoder is missing');
const allowedLibs = /^(linux-vdso\.so\.1|libm\.so\.6|libc\.so\.6|\/lib64\/ld-linux-x86-64\.so\.2|libpthread\.so\.0|libdl\.so\.2)$/;
for (const l of [...ldd, ...lddProbe]) if (!allowedLibs.test(l)) fail(`ffmpeg links ${l}`);

// poppler-utils is approved (owner 2026-10-16) as separate GPL-2.0+ programs only: its copyright and
// licence notices, and those of the libpoppler it runs on, must stay in the image.
const popplerNotices = ['poppler-utils', ...readdirSync('/usr/share/doc').filter(d => /^libpoppler\d+$/.test(d))].map(d => `/usr/share/doc/${d}/copyright`);
if (popplerNotices.length < 2) fail('libpoppler is not installed beside poppler-utils');
for (const f of popplerNotices) if (!existsSync(f) || !/GPL/.test(readFileSync(f, 'utf8'))) fail(`poppler licence notice missing or without its GPL terms: ${f}`);

const lo = sh('soffice', ['--headless', '--version']).split('\n').find(l => /LibreOffice/.test(l)) || '';
const occt = JSON.parse(readFileSync('/app/vendor/occt-import-js/package.json', 'utf8'));
const pkgs = dpkg(['libreoffice-core-nogui', 'libreoffice-writer-nogui', 'libreoffice-impress-nogui', 'poppler-utils', 'fonts-liberation', 'fonts-crosextra-carlito', 'fonts-crosextra-caladea', 'fonts-dejavu-core', 'util-linux', 'sudo']);
const info = {
  built_at: new Date().toISOString(),
  build: process.env.CONVERT_BUILD || 'unknown',
  versions: {
    libreoffice: (lo.match(/LibreOffice ([\d.]+)/) || [])[1] || 'unknown',
    poppler: (sh('pdftoppm', ['-v']).match(/version ([\d.]+)/) || [])[1] || 'unknown',
    ffmpeg: (ffVersion.match(/ffmpeg version (\S+)/) || [])[1] || 'unknown',
    'occt-import-js': occt.version,
    opencascade: '7.6.1',
    node: process.versions.node,
  },
  libreoffice_version_line: lo,
  poppler_notices: popplerNotices,
  debian_packages: pkgs,
  ffmpeg: { version_line: ffVersion, licence, buildconf: buildconf.split('\n').map(s => s.trim()).filter(s => s.startsWith('--')), linked_libraries: [...new Set([...ldd, ...lddProbe])], encoders, decoders, demuxers },
};
writeFileSync('/app/build-info.json', `${JSON.stringify(info, null, 2)}\n`);
console.log(`✓ build-info: LibreOffice ${info.versions.libreoffice}, poppler ${info.versions.poppler}, FFmpeg ${info.versions.ffmpeg} (LGPL, encoders ${encoders.join(',')}), occt-import-js ${occt.version}`);
