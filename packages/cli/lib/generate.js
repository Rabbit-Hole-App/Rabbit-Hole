'use strict';
const fs = require('fs');
const path = require('path');

function runCommand(entry, framework) {
  const mod = path.basename(entry, '.py');
  switch (framework) {
    case 'flask':
      return `gunicorn --bind 0.0.0.0:$PORT --timeout 300 ${mod}:app`;
    case 'fastapi':
      return `uvicorn ${mod}:app --host 0.0.0.0 --port $PORT`;
    case 'streamlit':
      return `streamlit run ${entry} --server.port $PORT --server.address 0.0.0.0 --server.headless true`;
    default:
      return `python ${entry}`;
  }
}

function guardSource() {
  const shipped = path.join(__dirname, '..', 'assets', 'guard.py');
  if (fs.existsSync(shipped)) return shipped; // published package
  return path.join(__dirname, '..', '..', 'runtime', 'guard.py'); // monorepo dev
}

function dockerfile(app, dir) {
  const deps = (app.config.deps && app.config.deps.file) || 'requirements.txt';
  const system = (app.config.deps && app.config.deps.system) || [];
  const lines = ['FROM python:3.13-slim', 'WORKDIR /app'];
  if (system.length) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${system.join(' ')} && rm -rf /var/lib/apt/lists/*`);
  }
  if (fs.existsSync(path.join(dir, deps))) {
    lines.push(`COPY ${deps} .`, `RUN pip install --no-cache-dir -r ${deps}`);
  }
  lines.push(
    'COPY . .',
    'ENV PORT=8080',
    'ENV SMALL_APP_PORT=8090',
    'EXPOSE 8080',
    `CMD ["python", ".small/guard.py", "sh", "-c", "${runCommand(app.entry, app.framework)}"]`
  );
  return lines.join('\n') + '\n';
}

// Writes .small/Dockerfile + .small/guard.py; ensures .env never enters the image.
function write(dir, app) {
  const out = path.join(dir, '.small');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'Dockerfile'), dockerfile(app, dir));
  fs.copyFileSync(guardSource(), path.join(out, 'guard.py'));
  const ignorePath = path.join(dir, '.dockerignore');
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, '.env\n.git\n');
  } else if (!fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/).includes('.env')) {
    console.error('! .dockerignore exists but does not exclude .env — secrets could end up in the image');
  }
  return out;
}

module.exports = { runCommand, dockerfile, write };
