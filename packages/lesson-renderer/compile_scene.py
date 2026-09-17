"""Trusted compiler invoked by Blender. Inputs are validated JSON, never Python."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from validation import validate

def material(color):
    mat = bpy.data.materials.new(color); mat.diffuse_color = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5)) + (1,)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = mat.diffuse_color
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .65
    return mat

def rod(start, end, radius, parent, mat, head=False):
    a, b = Vector(start), Vector(end); delta = b - a; length = delta.length
    if length < 1e-6: return
    tip = min(radius * 5, length * .3) if head else 0
    shaft_end = b - delta.normalized() * tip
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=(shaft_end-a).length)
    shaft = bpy.context.object; shaft.parent = parent; shaft.location = (a+shaft_end)/2
    shaft.rotation_mode = 'QUATERNION'; shaft.rotation_quaternion = delta.to_track_quat('Z', 'Y'); shaft.data.materials.append(mat)
    if head:
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=radius*2.4, radius2=0, depth=tip)
        cone = bpy.context.object; cone.parent = parent; cone.location = b-delta.normalized()*tip/2
        cone.rotation_mode = 'QUATERNION'; cone.rotation_quaternion = delta.to_track_quat('Z', 'Y'); cone.data.materials.append(mat)

def compile_scene(data, output):
    data = validate(data)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.fps = 24; scene.frame_start = 1; scene.frame_end = round(data['duration']*24)+1
    # Input and GLB use metres, Y-up, camera forward -Z. This root converts to Blender Z-up.
    root = bpy.data.objects.new('Lesson root', None); scene.collection.objects.link(root); root.rotation_euler.x = math.pi/2
    parents = {}
    for spec in data['scene']['objects']:
        obj = bpy.data.objects.new(spec['id'], None); scene.collection.objects.link(obj); parents[spec['id']] = obj
    for spec in data['scene']['objects']:
        obj = parents[spec['id']]; obj.parent = parents.get(spec.get('parent'), root)
        obj.location = spec.get('position', [0, 0, 0]); obj.rotation_euler = [math.radians(v) for v in spec.get('rotation', [0, 0, 0])]; obj.scale = spec.get('scale', [1, 1, 1])
        mat = material(spec.get('color', '#4c78a8')); kind = spec['type']
        if kind in ('cube', 'sphere'):
            if kind == 'cube': bpy.ops.mesh.primitive_cube_add(size=1)
            else: bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.5)
            mesh = bpy.context.object; mesh.parent = obj; mesh.data.materials.append(mat)
        elif kind == 'arrow': rod(spec['start'], spec['end'], spec.get('thickness', .025), obj, mat, True)
        elif kind == 'coordinate_frame':
            length = spec.get('length', 1)
            for axis, color in enumerate(['#d94b4b', '#389c63', '#397bc9']):
                end = [0, 0, 0]; end[axis] = length; rod([0, 0, 0], end, spec.get('thickness', .02), obj, material(color), True)
        elif kind == 'camera_frustum':
            near, far = spec.get('near', .1), spec.get('far', 3); aspect = spec.get('aspect', 16/9); slope = math.tan(math.radians(spec.get('fov', 60))/2)
            corners = [[x*z*slope*aspect, y*z*slope, -z] for z in [near, far] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            for i,j in [(0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]: rod(corners[i], corners[j], spec.get('thickness', .015), obj, mat)
    for a in data['scene'].get('animations', []):
        obj = parents[a['target']]; channel = {'translate': 'location', 'rotate': 'rotation_euler', 'scale': 'scale'}[a['type']]
        for time, values in [(a['start'], a['from']), (a['end'], a['to'])]:
            setattr(obj, channel, [math.radians(v) for v in values] if a['type'] == 'rotate' else values)
            obj.keyframe_insert(data_path=channel, frame=round(time*24)+1)
    for obj in parents.values():
        if obj.animation_data and obj.animation_data.action:
            for curve in obj.animation_data.action.fcurves:
                for point in curve.keyframe_points: point.interpolation = 'LINEAR'
            track = obj.animation_data.nla_tracks.new(); track.name = 'Lesson motion'
            track.strips.new('Lesson motion', 1, obj.animation_data.action); obj.animation_data.action = None
    scene.frame_set(1)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True, export_animations=True, export_frame_range=True, export_force_sampling=True, export_nla_strips=True, export_extras=False)

if __name__ == '__main__':
    source, output = sys.argv[sys.argv.index('--')+1:]
    compile_scene(json.loads(Path(source).read_text()), output)
