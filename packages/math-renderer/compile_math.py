"""Trusted compiler: validated spec in, MP4 out.

Run as `python compile_math.py spec.json out.mp4` inside the worker. The spec
is data - manim objects are constructed here, never generated as Python source
from model output, so there is no code path for the spec to escape into.
"""
import json
import math
import sys
from pathlib import Path

from validation import safe_expression, validate

ACCENT, INK, MUTED, MARK = '#2383e2', '#E8E8E6', '#9B9A97', '#E8590C'
MATH_NAMES = {
    'sin': math.sin, 'cos': math.cos, 'tan': math.tan, 'sinh': math.sinh, 'cosh': math.cosh,
    'tanh': math.tanh, 'exp': math.exp, 'log': math.log, 'log2': math.log2, 'log10': math.log10,
    'sqrt': math.sqrt, 'abs': abs, 'floor': math.floor, 'ceil': math.ceil, 'atan': math.atan,
    'asin': math.asin, 'acos': math.acos, 'pow': pow, 'erf': math.erf,
    'pi': math.pi, 'e': math.e, 'tau': math.tau,
}


def safe_function(expression):
    """Compile a validated arithmetic expression into a callable of x."""
    code = compile(safe_expression(expression, 'expression'), '<plot>', 'eval')
    def evaluate(x):
        try:
            value = eval(code, {'__builtins__': {}}, {**MATH_NAMES, 'x': x})  # noqa: S307 - allowlisted AST, no builtins
        except (ValueError, ZeroDivisionError, OverflowError):
            return math.nan
        return value if isinstance(value, (int, float)) and math.isfinite(value) else math.nan
    return evaluate


def build(spec):
    """Everything the renderer needs, resolved from the spec without manim."""
    steps = []
    for step in spec['scene']['steps']:
        resolved = {'kind': step['kind'], 'note': step.get('note'), 'hold': step.get('hold', 2)}
        if step['kind'] == 'plot':
            resolved['functions'] = [{
                'evaluate': safe_function(function['expression']),
                'label': function.get('label'),
                'color': function.get('color', ACCENT),
            } for function in step['functions']]
            resolved['xRange'] = list(step.get('xRange', [-5, 5]))
            resolved['yRange'] = list(step.get('yRange', [-3, 3]))
            resolved['marker'] = step.get('marker')
        else:
            resolved.update({key: step[key] for key in step if key not in ('kind', 'note', 'hold')})
        steps.append(resolved)
    return {'title': spec['scene'].get('title'), 'steps': steps}


def render(plan, output, quality):
    from manim import (Axes, Brace, Circle, Create, Dot, DOWN, FadeIn, FadeOut, GrowArrow, Arrow,
                       Line, Matrix, MathTex, NumberPlane, Rectangle, Scene, SurroundingRectangle,
                       Text, Transform, TransformMatchingTex, UP, ValueTracker, Write, always_redraw, config)

    config.output_file = str(output)
    config.media_dir = str(Path(output).parent / 'media')
    config.pixel_width, config.pixel_height, config.frame_rate = (854, 480, 24) if quality == 'low' else (1280, 720, 30)
    config.background_color = '#1A1A19'
    config.verbosity = 'ERROR'

    def caption(text):
        return Text(text, font_size=22, color=MUTED).to_edge(DOWN, buff=0.4)

    class Lesson(Scene):
        def construct(self):
            if plan['title']:
                heading = Text(plan['title'], font_size=30, color=INK)
                self.play(Write(heading), run_time=0.8)
                self.play(FadeOut(heading), run_time=0.4)
            for step in plan['steps']:
                note = caption(step['note']) if step['note'] else None
                if note:
                    self.add(note)
                getattr(self, f'show_{step["kind"]}')(step)
                self.wait(step['hold'])
                self.play(*[FadeOut(item) for item in self.mobjects], run_time=0.4)

        # A derivation: each line becomes the next, so the learner sees which
        # part moved rather than reading two separate lines.
        def show_equation(self, step):
            current = MathTex(step['expressions'][0], color=INK).scale(1.1)
            self.play(Write(current), run_time=1.2)
            for fragment in step.get('highlight', []):
                for part in current.get_parts_by_tex(fragment):
                    self.play(part.animate.set_color(MARK), run_time=0.4)
            for expression in step['expressions'][1:]:
                following = MathTex(expression, color=INK).scale(1.1)
                self.play(TransformMatchingTex(current, following), run_time=1.4)
                current = following

        def show_plot(self, step):
            x_range, y_range = step['xRange'], step['yRange']
            axes = Axes(
                x_range=x_range if len(x_range) == 3 else [*x_range, max((x_range[1] - x_range[0]) / 6, 0.1)],
                y_range=y_range if len(y_range) == 3 else [*y_range, max((y_range[1] - y_range[0]) / 5, 0.1)],
                axis_config={'color': MUTED, 'stroke_width': 2, 'include_tip': False},
            ).scale(0.9)
            self.play(Create(axes), run_time=0.8)
            curves = []
            for function in step['functions']:
                curve = axes.plot(function['evaluate'], color=function['color'], use_smoothing=False)
                curves.append(curve)
                self.play(Create(curve), run_time=1.2)
                if function['label']:
                    self.play(FadeIn(MathTex(function['label'], color=function['color'], font_size=30).next_to(curve, UP)), run_time=0.4)
            marker = step.get('marker')
            if marker and curves:
                tracker = ValueTracker(marker['from'])
                evaluate = step['functions'][0]['evaluate']
                dot = always_redraw(lambda: Dot(axes.c2p(tracker.get_value(), evaluate(tracker.get_value())), color=MARK, radius=0.07))
                self.add(dot)
                if marker.get('tangent'):
                    def tangent():
                        at = tracker.get_value()
                        step_size = max((x_range[1] - x_range[0]) / 400, 1e-4)
                        slope = (evaluate(at + step_size) - evaluate(at - step_size)) / (2 * step_size)
                        if not math.isfinite(slope):
                            slope = 0
                        reach = (x_range[1] - x_range[0]) / 12
                        return Line(
                            axes.c2p(at - reach, evaluate(at) - slope * reach),
                            axes.c2p(at + reach, evaluate(at) + slope * reach),
                            color=MARK, stroke_width=3,
                        )
                    self.add(always_redraw(tangent))
                self.play(tracker.animate.set_value(marker['to']), run_time=2.4)

        def show_shapes(self, step):
            built = {}
            for item in step['objects']:
                at = item.get('at', [0, 0])
                colour = item.get('color', ACCENT)
                where = [at[0], at[1], 0]
                if item['type'] == 'circle':
                    shape = Circle(radius=item.get('size', 1), color=colour).move_to(where)
                elif item['type'] == 'rectangle':
                    shape = Rectangle(width=item.get('width', 2), height=item.get('height', 1), color=colour).move_to(where)
                elif item['type'] == 'dot':
                    shape = Dot(where, radius=item.get('size', 0.08), color=colour)
                elif item['type'] in ('arrow', 'line'):
                    to = item['to']
                    ends = (where, [to[0], to[1], 0])
                    shape = (Arrow(*ends, color=colour, buff=0) if item['type'] == 'arrow'
                             else Line(*ends, color=colour, stroke_width=3))
                elif item['type'] == 'brace':
                    shape = Brace(Line(where, [item.get('to', [at[0] + 2, at[1]])[0], item.get('to', [at[0] + 2, at[1]])[1], 0]), color=colour)
                    shape = shape.put_at_tip(MathTex(item['text'], color=colour, font_size=28)) or shape
                else:
                    shape = MathTex(item['text'], color=colour, font_size=32).move_to(where)
                built[item['id']] = shape
                entrance = {'create': Create, 'fade_in': FadeIn, 'write': Write,
                            'grow': GrowArrow if item['type'] == 'arrow' else FadeIn}[item.get('animation', 'create')]
                self.play(entrance(shape), run_time=0.7)
            for move in step.get('moves', []):
                shape = built[move['target']]
                target = shape.copy().move_to([move['to'][0], move['to'][1], 0])
                if move.get('scale'):
                    target.scale(move['scale'])
                self.play(Transform(shape, target), run_time=1.0)

        def show_matrix(self, step):
            matrix = Matrix(step['rows']).set_color(INK).scale(0.9)
            self.play(Write(matrix), run_time=1.2)
            spot = step.get('emphasise', {})
            if 'row' in spot:
                self.play(Create(SurroundingRectangle(matrix.get_rows()[int(spot['row'])], color=MARK)), run_time=0.8)
            if 'column' in spot:
                self.play(Create(SurroundingRectangle(matrix.get_columns()[int(spot['column'])], color=MARK)), run_time=0.8)
            if step.get('grid'):
                a, b, c, d = step['grid']
                plane = NumberPlane(x_range=[-4, 4, 1], y_range=[-3, 3, 1],
                                    background_line_style={'stroke_color': MUTED, 'stroke_width': 1, 'stroke_opacity': 0.5})
                self.play(FadeOut(matrix), FadeIn(plane), run_time=0.6)
                self.play(plane.animate.apply_matrix([[a, b], [c, d]]), run_time=2.0)

    Lesson().render()


if __name__ == '__main__':
    specification = validate(json.loads(Path(sys.argv[1]).read_text()))
    render(build(specification), Path(sys.argv[2]), specification['quality'])
