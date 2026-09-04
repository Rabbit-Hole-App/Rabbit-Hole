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
    case 'gradio':
      // gradio reads these env vars in launch(); overrides any hardcoded defaults
      return `GRADIO_SERVER_NAME=0.0.0.0 GRADIO_SERVER_PORT=$PORT python ${entry}`;
    default:
      return `python ${entry}`;
  }
}

function runtimeSource(name) {
  const shipped = path.join(__dirname, '..', 'assets', name);
  if (fs.existsSync(shipped)) return shipped; // published package
  return path.join(__dirname, '..', '..', 'runtime', name); // monorepo dev
}

function dockerfile(app, dir) {
  const deps = (app.config.deps && app.config.deps.file) || 'requirements.txt';
  const system = app.config.system || (app.config.deps && app.config.deps.system) || [];
  const lines = ['FROM python:3.13-slim', 'WORKDIR /app'];
  if (system.length) {
    lines.push(`RUN apt-get update && apt-get install -y --no-install-recommends ${system.join(' ')} && rm -rf /var/lib/apt/lists/*`);
  }
  if (fs.existsSync(path.join(dir, deps))) {
    lines.push(`COPY ${deps} .`, `RUN pip install --no-cache-dir -r ${deps}`);
  }
  if (app.config.kind === 'job') {
    // no port, no guard: runner.py streams output to the control plane and exits
    lines.push(
      'COPY . .',
      'ENV PYTHONUNBUFFERED=1',
      `CMD ["python", ".small/runner.py", "sh", "-c", "${runCommand(app.entry, app.framework)}"]`
    );
  } else {
    lines.push(
      'COPY . .',
      'ENV PORT=8080',
      'ENV SMALL_APP_PORT=8090',
      'EXPOSE 8080',
      `CMD ["python", ".small/guard.py", "sh", "-c", "${runCommand(app.entry, app.framework)}"]`
    );
  }
  return lines.join('\n') + '\n';
}

// Writes .small/Dockerfile + .small/guard.py (or runner.py for jobs); ensures .env never enters the image.
function write(dir, app) {
  const out = path.join(dir, '.small');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'Dockerfile'), dockerfile(app, dir));
  const py = app.config.kind === 'job' ? 'runner.py' : 'guard.py';
  fs.copyFileSync(runtimeSource(py), path.join(out, py));
  const ignorePath = path.join(dir, '.dockerignore');
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, '.env\n.git\n');
  } else if (!fs.readFileSync(ignorePath, 'utf8').split(/\r?\n/).includes('.env')) {
    console.error('! .dockerignore exists but does not exclude .env — secrets could end up in the image');
  }
  return out;
}

function writeFlyToml(dir, flyApp, memory) {
  const toml = [
    `app = "${flyApp}"`,
    '',
    '[http_service]',
    '  internal_port = 8080',
    '  force_https = true',
    '  auto_stop_machines = "stop"',
    '  auto_start_machines = true',
    '  min_machines_running = 0',
    '',
    '[[vm]]',
    '  size = "shared-cpu-1x"',
    `  memory = "${String(memory || '256mb').toLowerCase()}"`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(dir, '.small', 'fly.toml'), toml);
}

module.exports = { runCommand, dockerfile, write, writeFlyToml };
