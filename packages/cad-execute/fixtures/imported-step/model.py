# Fixture: stands in for an imported model. Constants only, no cad_params reads, like a legacy saved source or a STEP
# that arrives without its source. The local run builds it once, then inspects only the STEP. Nothing is editable.
from cadgen import build123d as bd
from cadgen import step


@step(out='/tmp/job/out/model.step')
def model():
    block = bd.Box(50, 30, 10)
    boss = bd.Pos(0, 0, 10) * bd.Cylinder(8, 10)
    return block + boss


if __name__ == '__main__':
    model()
