# Fixture: cylinder from radius and height. Its diameter is computed here and measured independently by the checker.
from cadgen import build123d as bd
from cadgen import step
from cad_params import value, computed

RADIUS = value('radius')
HEIGHT = value('height')
computed('diameter', 2 * RADIUS)


@step(out='/tmp/job/out/model.step')
def model():
    return bd.Cylinder(RADIUS, HEIGHT)


if __name__ == '__main__':
    model()
