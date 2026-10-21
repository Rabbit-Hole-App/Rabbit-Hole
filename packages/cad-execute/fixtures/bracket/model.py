# Fixture: L-bracket. Hole position and inside height are dependent values computed here from the inputs; the mounting
# choice selects one or two holes. Combinations whose holes cannot fit are refused by this source.
from cadgen import build123d as bd
from cadgen import step
from cad_params import value, computed

BASE = value('base_length')
UPRIGHT = value('upright_height')
WIDTH = value('width')
T = value('thickness')
HOLE_D = value('hole_diameter')
MOUNTING = value('mounting')

HOLE_X = computed('hole_offset', (BASE + T) / 2)
computed('inside_height', UPRIGHT - T)
if HOLE_D >= BASE - T:
    raise ValueError('The hole does not fit on the base between the upright and the end.')
ys = [0.0] if MOUNTING == 'one_hole' else [-WIDTH / 4, WIDTH / 4]
if MOUNTING == 'two_holes' and HOLE_D >= WIDTH / 2:
    raise ValueError('Two holes of this diameter do not fit across the width.')


@step(out='/tmp/job/out/model.step')
def model():
    base = bd.Pos(BASE / 2, 0, T / 2) * bd.Box(BASE, WIDTH, T)
    upright = bd.Pos(T / 2, 0, UPRIGHT / 2) * bd.Box(T, WIDTH, UPRIGHT)
    part = base + upright
    for y in ys:
        part -= bd.Pos(HOLE_X, y, T / 2) * bd.Cylinder(HOLE_D / 2, T * 2)
    return part


if __name__ == '__main__':
    model()
