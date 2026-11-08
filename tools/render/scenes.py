"""Renders 3D de los selectores de entrada de Casa TV (Blender/bpy 4.2, Cycles CPU).

Uso: python scenes.py <streaming|consola|tele> <salida.png> [escala%] [samples]
Fondo transparente + shadow catcher: el degradado del tile se ve debajo.
"""
import sys, math
import bpy
from mathutils import Vector

which, out = sys.argv[1], sys.argv[2]
pct = int(sys.argv[3]) if len(sys.argv) > 3 else 100
samples = int(sys.argv[4]) if len(sys.argv) > 4 else 96

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------- utilidades ----------------
def mat(name, color, metallic=0.0, rough=0.4, coat=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

def finish(o, m, bevel=None, segs=8):
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel; mod.segments = segs; mod.limit_method = 'NONE'
        mod.harden_normals = True
    o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o

def rbox(size, loc, bevel, m, rot=(0, 0, 0), parent=None, segs=8):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    finish(o, m, bevel, segs)
    if parent: o.parent = parent
    return o

def cyl(r, depth, loc, m, bevel=None, rot=(0, 0, 0), parent=None, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; finish(o, m, bevel, 6)
    if parent: o.parent = parent
    return o

def sphere(r, loc, m, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object; finish(o, m)
    if parent: o.parent = parent
    return o

def look(o, target):
    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(loc, size, energy, color=(1, 1, 1), target=(0, 0, 0), shape='RECTANGLE', size_y=None):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object; l.data.shape = shape; l.data.size = size
    if size_y: l.data.size_y = size_y
    l.data.energy = energy; l.data.color = color; look(l, target)
    return l

def camera(loc, target, lens=50):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object; c.data.lens = lens; look(c, target); sc.camera = c
    return c

def empty(loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.object.empty_add(location=loc, rotation=rot)
    return bpy.context.object

def floor():
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    f = bpy.context.object; f.is_shadow_catcher = True
    return f

def bezier_from(points, cyclic=True, scale=0.01, cx=340, cy=190):
    """points: [(p, left_handle, right_handle)] en coordenadas SVG (px)."""
    cu = bpy.data.curves.new('c', 'CURVE'); cu.dimensions = '2D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    tr = lambda q: ((q[0] - cx) * scale, -(q[1] - cy) * scale, 0)
    for bp, (p, l, r) in zip(sp.bezier_points, points):
        bp.co = tr(p); bp.handle_left = tr(l); bp.handle_right = tr(r)
        bp.handle_left_type = bp.handle_right_type = 'FREE'
    sp.use_cyclic_u = cyclic
    return cu


def rrect_slab(w, d, h, r, edge, m, loc=(0, 0, 0), parent=None):
    """Losa de planta rectangular con esquinas redondeadas (radio r) y canto suave (edge)."""
    k = 0.5523 * r
    a, b = w / 2, d / 2
    pts = []
    # cada esquina: dos puntos (inicio y fin del arco) con manejadores
    corners = [((a, b), (1, 1)), ((-a, b), (-1, 1)), ((-a, -b), (-1, -1)), ((a, -b), (1, -1))]
    seq = []
    for (cx, cy), (sx, sy) in corners:
        if sx * sy > 0:   # esquinas 1 y 3: recorre de eje x a eje y
            p1 = (cx, cy - sy * r); p2 = (cx - sx * r, cy)
            h1 = (cx, cy - sy * r + sy * k); h2 = (cx - sx * r + sx * k, cy)
        else:
            p1 = (cx - sx * r, cy); p2 = (cx, cy - sy * r)
            h1 = (cx - sx * r + sx * k, cy); h2 = (cx, cy - sy * r + sy * k)
        seq.append((p1, h1, p2, h2))
    cu = bpy.data.curves.new('rr', 'CURVE'); cu.dimensions = '2D'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(7)
    i = 0
    for (p1, h1, p2, h2) in seq:
        bp = sp.bezier_points[i]; bp.co = (*p1, 0); bp.handle_right = (*h1, 0); bp.handle_left = (*p1, 0)
        bp2 = sp.bezier_points[i + 1]; bp2.co = (*p2, 0); bp2.handle_left = (*h2, 0); bp2.handle_right = (*p2, 0)
        for q in (bp, bp2): q.handle_left_type = q.handle_right_type = 'FREE'
        i += 2
    sp.use_cyclic_u = True
    cu.extrude = h / 2 - edge; cu.bevel_depth = edge; cu.bevel_resolution = 8
    cu.resolution_u = 24; cu.fill_mode = 'BOTH'
    o = bpy.data.objects.new('slab', cu); bpy.context.collection.objects.link(o)
    o.location = (loc[0], loc[1], loc[2] + h / 2); o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def world(color=(0.16, 0.16, 0.18), strength=0.7):
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*color, 1); bg.inputs[1].default_value = strength

def settings():
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 1360, 672
    sc.render.resolution_percentage = pct
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.filepath = out

def studio(rim=(0.6, 0.75, 1.0), rim_energy=500, key=700, fill=220):
    area((-3.2, -2.6, 4.2), 3.5, key)                      # key, arriba-izquierda
    area((3.6, -3.0, 2.2), 3.0, fill)                      # fill
    area((0.5, 3.5, 2.4), 3.0, rim_energy, rim)            # contraluz de color
    area((0, -0.5, 5.5), 6.0, 180, shape='RECTANGLE', size_y=1.2)  # tira cenital (reflejo largo)

# ---------------- escenas ----------------
def scene_streaming():
    world((0.10, 0.10, 0.12), 0.35); floor(); studio((0.55, 0.65, 1.0), 520, key=520, fill=60)
    black_gloss = mat('blackGloss', (0.004, 0.004, 0.005), rough=0.42, coat=0.35)
    black_side = mat('blackSide', (0.01, 0.01, 0.011), rough=0.45)
    alu = mat('alu', (0.80, 0.80, 0.83), metallic=1.0, rough=0.28)
    glass = mat('glass', (0.02, 0.02, 0.025), rough=0.08, coat=1.0)
    btn = mat('btn', (0.03, 0.03, 0.035), rough=0.35)
    led = mat('led', (1, 1, 1), emission=(1, 1, 1), strength=25)

    box = empty((-0.3, 0.2, 0), (0, 0, math.radians(18)))
    rrect_slab(1.15, 1.15, 0.30, 0.26, 0.045, black_gloss, parent=box)
    sphere(0.012, (0, -0.577, 0.15), led, parent=box)

    rem = empty((0.78, -0.42, 0.024), (0, 0, math.radians(-38)))
    rbox((0.19, 0.86, 0.045), (0, 0, 0), 0.03, alu, parent=rem)
    cyl(0.072, 0.012, (0, 0.27, 0.022), glass, bevel=0.004, parent=rem)
    for x, y in [(-0.045, 0.12), (0.045, 0.12), (-0.045, 0.04), (-0.045, -0.04)]:
        cyl(0.03, 0.012, (x, y, 0.022), btn, bevel=0.004, parent=rem)
    rbox((0.06, 0.17, 0.012), (0.045, 0.0, 0.022), 0.006, btn, parent=rem)

    camera((0.15, -3.9, 2.15), (0.15, 0.05, 0.12), lens=58)

def scene_consola():
    world((0.10, 0.12, 0.18), 0.6); floor(); studio((0.35, 0.6, 1.0), 650)
    white = mat('shell', (0.86, 0.87, 0.90), rough=0.32, coat=0.6)
    dark = mat('core', (0.018, 0.019, 0.024), rough=0.32, coat=0.4)
    pad = mat('pad', (0.03, 0.032, 0.04), rough=0.55)
    stick = mat('stick', (0.02, 0.02, 0.024), rough=0.6)
    lightbar = mat('bar', (0.3, 0.7, 1), emission=(0.25, 0.65, 1.0), strength=18)
    cols = [((0.19, 0.82, 0.35)), ((1.0, 0.27, 0.23)), ((0.39, 0.82, 1.0)), ((1.0, 0.84, 0.04))]

    root = empty((0, 0.25, 0.42), (math.radians(28), 0, 0))
    S = 0.0055  # px -> m

    body = [((226, 104), (168, 118), (268, 90)), ((454, 104), (412, 90), (512, 118)),
            ((570, 246), (552, 182), (580, 286)), ((526, 288), (552, 306), (500, 270)),
            ((442, 232), (478, 236), (442, 232)), ((238, 232), (238, 232), (202, 236)),
            ((154, 288), (180, 270), (128, 306)), ((110, 246), (100, 286), (128, 182))]
    cu = bezier_from(body, scale=S); cu.extrude = 0.075; cu.bevel_depth = 0.05; cu.bevel_resolution = 6
    cu.resolution_u = 48; cu.fill_mode = 'BOTH'
    o = bpy.data.objects.new('body', cu); bpy.context.collection.objects.link(o)
    o.data.materials.append(white); o.parent = root

    core = [((262, 112), (250, 112), (300, 104)), ((418, 112), (380, 104), (418, 112)),
            ((430, 186), (430, 186), (420, 214)), ((340, 226), (392, 226), (288, 226)),
            ((250, 186), (260, 214), (250, 186))]
    cu2 = bezier_from(core, scale=S); cu2.extrude = 0.02; cu2.bevel_depth = 0.03; cu2.bevel_resolution = 5
    cu2.resolution_u = 32; cu2.fill_mode = 'BOTH'
    o2 = bpy.data.objects.new('core', cu2); bpy.context.collection.objects.link(o2)
    o2.location.z = 0.09; o2.data.materials.append(dark); o2.parent = root

    tp = [((278, 118), (278, 118), (312, 112)), ((402, 118), (368, 112), (402, 118)),
          ((406, 156), (406, 156), (380, 164)), ((274, 156), (300, 164), (274, 156))]
    cu3 = bezier_from(tp, scale=S); cu3.extrude = 0.006; cu3.bevel_depth = 0.008; cu3.fill_mode = 'BOTH'
    o3 = bpy.data.objects.new('pad', cu3); bpy.context.collection.objects.link(o3)
    o3.location.z = 0.142; o3.data.materials.append(pad); o3.parent = root

    bar = bezier_from([((270, 166), (270, 166), (290, 176)), ((410, 166), (390, 176), (410, 166))], cyclic=False, scale=S)
    bar.dimensions = '3D'; bar.bevel_depth = 0.008; bar.bevel_resolution = 4
    ob = bpy.data.objects.new('bar', bar); bpy.context.collection.objects.link(ob)
    ob.location.z = 0.15; ob.data.materials.append(lightbar); ob.parent = root

    px = lambda x, y, z: ((x - 340) * S, -(y - 190) * S, z)
    for sx in (282, 398):
        cyl(0.115, 0.06, px(sx, 207, 0.15), dark, bevel=0.02, parent=root)
        cyl(0.095, 0.05, px(sx, 207, 0.2), stick, bevel=0.025, parent=root)
    for (dx, dy, w, h) in [(0, -19, 16, 22), (0, 19, 16, 22), (-19, 0, 22, 16), (19, 0, 22, 16)]:
        rbox((w * S, h * S, 0.03), px(206 + dx, 160 + dy, 0.135), 0.012, dark, parent=root)
    for (dx, dy), c in zip([(0, -24), (24, 0), (0, 24), (-24, 0)], cols):
        cyl(0.062, 0.03, px(474 + dx, 160 + dy, 0.13), dark, bevel=0.012, parent=root)
        cyl(0.034, 0.02, px(474 + dx, 160 + dy, 0.15), mat('b', c, rough=0.15, coat=1, emission=c, strength=1.5), bevel=0.008, parent=root)

    camera((0, -4.0, 2.2), (0, 0.15, 0.35), lens=50)

def scene_tele():
    world((0.12, 0.09, 0.12), 0.4); floor(); studio((1.0, 0.45, 0.75), 520, key=600, fill=90)
    bezel = mat('bezel', (0.015, 0.015, 0.018), rough=0.25, coat=0.6)
    top = mat('top', (0.012, 0.012, 0.014), rough=0.6)
    front = mat('front', (0.012, 0.012, 0.014), rough=0.18, coat=1.0)
    disp = mat('disp', (0.004, 0.0, 0.0), rough=0.1, coat=1.0)
    red = mat('red', (1, 0.2, 0.15), emission=(1.0, 0.18, 0.12), strength=12)
    green = mat('green', (0.2, 1, 0.4), emission=(0.2, 1.0, 0.4), strength=20)

    # pantalla con imagen generada (atardecer)
    img = bpy.data.images.load(sys.argv[5])
    scr = bpy.data.materials.new('screen'); scr.use_nodes = True
    nt = scr.node_tree; b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Emission Strength'].default_value = 0.85
    b.inputs['Roughness'].default_value = 0.08; b.inputs['Coat Weight'].default_value = 1.0

    tv = empty((0.25, 1.6, 0))
    rbox((2.3, 0.06, 1.32), (0, 0, 1.12), 0.03, bezel, parent=tv)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.031, 1.12), rotation=(math.radians(90), 0, 0))
    p = bpy.context.object; p.scale = (2.21, 1.23, 1); p.data.materials.append(scr); p.parent = tv
    rbox((0.07, 0.05, 0.46), (0, 0.06, 0.23), 0.02, bezel, parent=tv)
    rbox((0.8, 0.38, 0.03), (0, 0.02, 0.015), 0.012, bezel, parent=tv)

    stb = empty((-0.1, -0.5, 0), (0, 0, math.radians(6)))
    rbox((2.1, 0.8, 0.22), (0, 0, 0.11), 0.03, top, parent=stb)
    rbox((2.09, 0.02, 0.2), (0, -0.402, 0.11), 0.008, front, parent=stb)
    rbox((0.52, 0.01, 0.12), (0, -0.414, 0.11), 0.006, disp, parent=stb)
    bpy.ops.object.text_add(location=(0, -0.42, 0.083), rotation=(math.radians(90), 0, 0))
    t = bpy.context.object; t.data.body = '21:30'; t.data.align_x = 'CENTER'; t.data.size = 0.085
    t.data.extrude = 0.002; t.data.materials.append(red); t.parent = stb
    sphere(0.014, (-0.88, -0.415, 0.11), green, parent=stb)
    for i in range(4):
        rbox((0.34, 0.006, 0.012), (0.66, -0.414, 0.07 + i * 0.026), 0.003, top, parent=stb)

    camera((0.0, -7.4, 1.7), (0.05, 0.5, 0.74), lens=56)

settings()
{'streaming': scene_streaming, 'consola': scene_consola, 'tele': scene_tele}[which]()
bpy.ops.render.render(write_still=True)
print('OK', out)
