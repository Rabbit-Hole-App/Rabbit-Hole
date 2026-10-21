# Fixture: rectangular plate with a row of through holes. Diameter, count and spacing are inputs; the edge margin is
# computed here. A layout that does not fit is refused by this source, not by a server expression.
from cadgen import build123d as bd
from cadgen import step
from cad_params import value, computed

LENGTH = value('length')
WIDTH = value('width')
THICKNESS = value('thickness')
HOLE_D = value('hole_diameter')
COUNT = value('hole_count')
SPACING = value('hole_spacing')

span = (COUNT - 1) * SPACING + HOLE_D
if span >= LENGTH:
    raise ValueError(f'The {COUNT} holes need {span:g} mm but the plate is only {LENGTH:g} mm long.')
MARGIN = computed('edge_margin', (LENGTH - (COUNT - 1) * SPACING - HOLE_D) / 2)


@step(out='/tmp/job/out/model.step')
def model():
    plate = bd.Box(LENGTH, WIDTH, THICKNESS)
    first = -(COUNT - 1) * SPACING / 2
    for i in range(COUNT):
        plate -= bd.Pos(first + i * SPACING, 0, 0) * bd.Cylinder(HOLE_D / 2, THICKNESS * 2)
    return plate


if __name__ == '__main__':
    model()
