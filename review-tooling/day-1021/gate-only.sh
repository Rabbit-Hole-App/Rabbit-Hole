#!/usr/bin/env bash
# Wait for verify+fast-e2e on W's HEAD, then dispatch the sharded gate and print its run id (no dev push, no main).
R=Rabbit-Hole-App/Rabbit-Hole; SHA=$(git -C ${W:?} rev-parse HEAD); TREE=$(git -C $W rev-parse HEAD^{tree})
for i in $(seq 1 60); do
  V=$(gh run list -R $R --commit $SHA --json databaseId,workflowName --jq '[.[]|select(.workflowName=="verify")][0].databaseId // empty')
  F=$(gh run list -R $R --commit $SHA --json databaseId,workflowName --jq '[.[]|select(.workflowName=="fast-e2e")][0].databaseId // empty')
  [ -n "$V" ] && [ -n "$F" ] && break; sleep 10; done
for id in $V $F; do until [ "$(gh run view $id -R $R --json status --jq .status)" = completed ]; do sleep 20; done; c=$(gh run view $id -R $R --json conclusion --jq .conclusion); echo "run $id: $c"; [ "$c" = success ] || { echo STOP; exit 1; }; done
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run gate-sharded.yml -R $R --ref fix/ctrlk-gate-selection -f app_sha=$SHA -f app_tree=$TREE || exit 1
for i in $(seq 1 40); do G=$(gh run list -R $R --workflow gate-sharded.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$since\")] | last | .databaseId // empty"); [ -n "$G" ] && break; sleep 5; done
echo "gate run $G"
bash /c/s/spec/day-1021/watchdog.sh $G 25
until [ "$(gh run view $G -R $R --json status --jq .status)" = completed ]; do sleep 15; done
echo "gate $G: $(gh run view $G -R $R --json conclusion --jq .conclusion)"
