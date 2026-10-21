# Fixture: one input drives all three edges (a linked dimension). Handwritten, deterministic, no model output.
from cadgen import build123d as bd
from cadgen import step
from cad_params import value, computed

EDGE = value('edge')
if EDGE <= 0:
    raise ValueError('The edge length must be positive.')
computed('face_diagonal', EDGE * 2 ** 0.5)


@step(out='/tmp/job/out/model.step')
def model():
    return bd.Box(EDGE, EDGE, EDGE)


if __name__ == '__main__':
    model()
