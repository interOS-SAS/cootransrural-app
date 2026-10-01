#!/usr/bin/env python3
"""Crea (o actualiza) la ficha de una cooperativa: empresas/<id>/ficha.json.

Toma los datos de herramientas/cooperativas.json (empresa, colores, textos,
imágenes, fuentes) y completa con datos reales de OpenStreetMap: el centro del
pueblo, los lugares frecuentes (alcaldía, parque, colegios, salud, comercio,
barrios, veredas) y la distancia por carretera (OSRM) a los municipios vecinos
para la tabla de rutas.

Uso:  python3 herramientas/crear-ficha.py subachoque [tabio ...]
      python3 herramientas/crear-ficha.py --todas
      python3 herramientas/crear-ficha.py --rehacer madrid   (vuelve a bajar lugares y rutas)

Si la cooperativa tiene "lugaresRevisados": true en cooperativas.json y su ficha
ya existe, NO se tocan los lugares, rutas, centro ni conductores de la ficha
(fueron revisados a mano): solo se actualizan los datos de la empresa, colores,
textos, imágenes y fuentes. Con --rehacer se vuelve a bajar todo.

Si Overpass (OpenStreetMap) está saturado, los centros de los pueblos salen de
las fichas que ya existen o de Nominatim, y los lugares, de búsquedas por tipo
en Nominatim (alcaldía, hospital, colegio, banco...).

Las tarifas y rutas que salen de aquí son de EJEMPLO: hay que reemplazarlas
por las oficiales de cada cooperativa.
"""
import json
import math
import pathlib
import random
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
AGENTE = 'apptaxi-interos/1.0 (fichas de cooperativas)'
CUNDINAMARCA = (3.7, -74.9, 5.9, -73.0)  # sur, oeste, norte, este

# Destinos que pueden aparecer en las rutas (se buscan por nombre en OSM).
FIJOS = {
    'portal-80': {'nombre': 'Portal 80 (TransMilenio)', 'detalle': 'Bogotá', 'cat': 'bogota', 'lat': 4.7097122, 'lng': -74.1104822},
    'portal-norte': {'nombre': 'Portal Norte (TransMilenio)', 'detalle': 'Bogotá', 'cat': 'bogota', 'lat': 4.7546, 'lng': -74.0461},
    'aeropuerto': {'nombre': 'Aeropuerto El Dorado', 'detalle': 'Bogotá', 'cat': 'bogota', 'lat': 4.6992528, 'lng': -74.1417611},
    'terminal-salitre': {'nombre': 'Terminal Salitre', 'detalle': 'Bogotá', 'cat': 'bogota', 'lat': 4.6534, 'lng': -74.1163},
}

# Campos que vienen de cooperativas.json y pasan tal cual a la ficha.
CAMPOS_BASE = ('textos', 'imagenes', 'fuentes', 'notas')

NOMBRES = ['Jorge Castañeda', 'Luz Marina Rojas', 'Édgar Molina', 'Carlos Rodríguez', 'Wilson Gómez', 'Sandra Patiño',
           'Fabio Cruz', 'Héctor Bernal', 'Nelson Pinzón', 'Martha Garzón', 'Álvaro Cifuentes', 'Yolanda Prieto',
           'Germán Quintero', 'Rubén Sarmiento', 'Diana Forero', 'Jairo Moreno']


def slug(texto):
    t = unicodedata.normalize('NFD', texto.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return '-'.join(''.join(c if c.isalnum() else ' ' for c in t).split())[:40]


def pedir(url, datos=None, intentos=4, espera=90):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, data=datos, headers={'User-Agent': AGENTE, 'Accept-Language': 'es'})
            with urllib.request.urlopen(req, timeout=espera) as r:
                return json.loads(r.read().decode())
        except Exception:  # red inestable o servicio ocupado
            if i == intentos - 1:
                raise
            time.sleep(3 * (i + 1))


SERVIDORES_OVERPASS = (
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
)


def overpass(consulta, rondas=2):
    # Los servidores públicos se saturan: se prueban todos y se espera entre rondas.
    for ronda in range(rondas):
        for servidor in SERVIDORES_OVERPASS:
            try:
                return pedir(servidor, urllib.parse.urlencode({'data': consulta}).encode(), intentos=1, espera=120)['elements']
            except Exception:
                continue
        if ronda < rondas - 1:
            time.sleep(30 * (ronda + 1))
    raise RuntimeError('Overpass no respondió (servidores saturados)')


_ultimo_nominatim = [0.0]


def nominatim(q, cerca=None, radio_km=4, limite=20):
    """Búsqueda en Nominatim (máximo 1 consulta por segundo, como pide su política de uso)."""
    params = {'q': q, 'format': 'jsonv2', 'limit': limite, 'countrycodes': 'co'}
    if cerca:
        g = radio_km / 111.0
        params.update({'viewbox': f'{cerca["lng"] - g},{cerca["lat"] + g},{cerca["lng"] + g},{cerca["lat"] - g}', 'bounded': 1})
    espera = 1.1 - (time.time() - _ultimo_nominatim[0])
    if espera > 0:
        time.sleep(espera)
    try:
        return pedir('https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(params), intentos=3, espera=40)
    finally:
        _ultimo_nominatim[0] = time.time()


def distancia(a, b):
    r = 6371
    dlat = math.radians(b['lat'] - a['lat'])
    dlng = math.radians(b['lng'] - a['lng'])
    s = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a['lat'])) * math.cos(math.radians(b['lat'])) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(s))


def centros_conocidos():
    """Centros de pueblos que ya están en las fichas (evita consultas repetidas)."""
    conocidos = {}
    for archivo in (RAIZ / 'empresas').glob('*/ficha.json'):
        try:
            f = json.loads(archivo.read_text(encoding='utf-8'))
        except Exception:
            continue
        pueblo = (f.get('EMPRESA') or {}).get('pueblo')
        if pueblo and f.get('CENTRO'):
            conocidos[slug(pueblo)] = {'lat': f['CENTRO']['lat'], 'lng': f['CENTRO']['lng']}
        for l in f.get('LUGARES') or []:
            if l.get('cat') == 'municipio':
                conocidos.setdefault(slug(l['nombre']), {'lat': l['lat'], 'lng': l['lng']})
    return conocidos


_CONOCIDOS = None


def lugar_poblado(nombre):
    """Centro del pueblo (el casco urbano, no el centro del municipio)."""
    global _CONOCIDOS
    if _CONOCIDOS is None:
        _CONOCIDOS = centros_conocidos()
    if slug(nombre) in _CONOCIDOS:
        return _CONOCIDOS[slug(nombre)]
    # 1) Nominatim: nodo place=town/city/village con ese nombre en Cundinamarca.
    s, o, n, e = CUNDINAMARCA
    try:
        res = nominatim(f'{nombre}, Cundinamarca', limite=10)
        res = [x for x in res if (x.get('category') or x.get('class')) == 'place' and x.get('type') in ('city', 'town', 'village')
               and s <= float(x['lat']) <= n and o <= float(x['lon']) <= e and slug(x.get('name') or '') == slug(nombre)]
        if res:
            orden = {'city': 0, 'town': 1, 'village': 2}
            res.sort(key=lambda x: orden.get(x['type'], 9))
            return {'lat': float(res[0]['lat']), 'lng': float(res[0]['lon'])}
    except Exception:
        pass
    # 2) Overpass.
    els = overpass(f'[out:json][timeout:60];node["place"~"^(city|town|village)$"]["name"="{nombre}"]({s},{o},{n},{e});out;')
    if not els:
        raise RuntimeError(f'No encontré el pueblo «{nombre}» en OpenStreetMap')
    orden = {'city': 0, 'town': 1, 'village': 2}
    els.sort(key=lambda x: orden.get(x['tags'].get('place'), 9))
    return {'lat': els[0]['lat'], 'lng': els[0]['lon']}


def categoria(t):
    a = t.get('amenity')
    if a in ('townhall', 'police', 'courthouse', 'library', 'community_centre', 'fire_station', 'bus_station', 'marketplace', 'post_office', 'place_of_worship', 'arts_centre'):
        return 'centro'
    if a in ('hospital', 'clinic', 'doctors'):
        return 'salud'
    if a in ('school', 'college', 'university', 'kindergarten'):
        return 'educacion'
    if a in ('restaurant', 'cafe', 'fast_food'):
        return 'comida'
    if a in ('fuel', 'bank') or t.get('shop') in ('supermarket', 'mall', 'department_store', 'convenience'):
        return 'comercio'
    if t.get('leisure') in ('park', 'sports_centre', 'stadium') or t.get('office') == 'government':
        return 'centro'
    if t.get('tourism') in ('attraction', 'viewpoint', 'hotel', 'museum', 'guest_house') or t.get('natural') in ('water', 'peak'):
        return 'turismo'
    p = t.get('place')
    if p in ('neighbourhood', 'suburb', 'quarter'):
        return 'barrio'
    if p in ('hamlet', 'village', 'locality', 'isolated_dwelling'):
        return 'vereda'
    if t.get('landuse') == 'residential':
        return 'barrio'
    return None


CUPOS = {'centro': 10, 'salud': 4, 'educacion': 6, 'comercio': 5, 'barrio': 8, 'vereda': 8, 'comida': 5, 'turismo': 6}
GENERICOS = ('casa', 'piqueteadero', 'restaurante', 'tienda', 'pizzeria', 'pizzería', 'droguería', 'drogueria', 'panadería', 'panaderia')


def filas_overpass(centro, radio):
    c = f'(around:{radio},{centro["lat"]},{centro["lng"]})'
    q = f'''[out:json][timeout:90];(
      nwr{c}[name][amenity];
      nwr{c}[name][shop~"^(supermarket|mall|department_store)$"];
      nwr{c}[name][leisure~"^(park|sports_centre|stadium)$"];
      nwr{c}[name][tourism~"^(attraction|viewpoint|hotel|museum|guest_house)$"];
      nwr{c}[name][office=government];
      node{c}[name][place~"^(neighbourhood|suburb|quarter|hamlet|village|locality)$"];
      way{c}[name][landuse=residential];
    );out center 600;'''
    filas = []
    for el in overpass(q, rondas=1):
        t = el.get('tags', {})
        lat = el.get('lat') or el.get('center', {}).get('lat')
        lng = el.get('lon') or el.get('center', {}).get('lon')
        filas.append((t.get('name'), categoria(t), lat, lng))
    return filas


# Búsquedas por tipo en Nominatim (respaldo cuando Overpass no responde).
BUSQUEDAS_NOMINATIM = (
    ('alcaldía', 'centro'), ('police', 'centro'), ('place of worship', 'centro'), ('parque', 'centro'),
    ('marketplace', 'centro'), ('biblioteca', 'centro'), ('bus station', 'centro'), ('cementerio', 'centro'),
    ('hospital', 'salud'), ('centro de salud', 'salud'), ('colegio', 'educacion'), ('escuela', 'educacion'),
    ('banco', 'comercio'), ('supermercado', 'comercio'), ('fuel', 'comercio'), ('restaurante', 'comida'),
    ('hotel', 'turismo'), ('museo', 'turismo'), ('hamlet', 'vereda'), ('vereda', 'vereda'), ('barrio', 'barrio'),
)


def filas_nominatim(centro, radio):
    filas = []
    for frase, cat in BUSQUEDAS_NOMINATIM:
        try:
            res = nominatim(frase, centro, radio_km=radio / 1000)
        except Exception:
            continue
        for x in res:
            if not x.get('name'):  # sin nombre propio Nominatim devuelve la calle: se descarta
                continue
            filas.append((x['name'], cat, float(x['lat']), float(x['lon'])))
    return filas


def lugares_del_pueblo(centro, pueblo, radio=3500):
    try:
        filas_crudas = filas_overpass(centro, radio)
    except Exception:
        print('   Overpass no respondió: lugares desde Nominatim')
        filas_crudas = filas_nominatim(centro, radio)
    filas = []
    for nombre, cat, lat, lng in filas_crudas:
        nombre = (nombre or '').strip()
        if not nombre or not cat or lat is None or len(nombre) < 3 or nombre.lower() in GENERICOS:
            continue
        filas.append({'nombre': nombre[:60], 'cat': cat, 'lat': round(lat, 6), 'lng': round(lng, 6), 'd': distancia(centro, {'lat': lat, 'lng': lng})})
    filas.sort(key=lambda f: f['d'])
    vistos, usados, salida = set(), {}, []
    for f in filas:
        clave = slug(f['nombre'])
        if clave in vistos:
            continue
        if usados.get(f['cat'], 0) >= CUPOS[f['cat']]:
            continue
        vistos.add(clave)
        usados[f['cat']] = usados.get(f['cat'], 0) + 1
        detalle = pueblo if f['d'] < 1.2 else f'{pueblo} · a {f["d"]:.1f} km'.replace('.', ',')
        if f['cat'] == 'vereda':
            detalle = f'Vereda de {pueblo}' if f['d'] > 1.2 else pueblo
        salida.append({'id': slug(f['nombre']), 'nombre': f['nombre'], 'detalle': detalle, 'cat': f['cat'], 'lat': f['lat'], 'lng': f['lng']})
    # El parque principal siempre de primero (si no está en OSM, el centro del pueblo).
    if not any('parque principal' in l['nombre'].lower() for l in salida):
        salida.insert(0, {'id': 'parque', 'nombre': 'Parque Principal', 'detalle': f'Centro, {pueblo}', 'cat': 'centro', 'lat': round(centro['lat'], 6), 'lng': round(centro['lng'], 6)})
    else:
        i = next(i for i, l in enumerate(salida) if 'parque principal' in l['nombre'].lower())
        salida.insert(0, salida.pop(i))
        salida[0]['id'] = 'parque'
    return salida


def ruta_osrm(a, b):
    url = f'https://router.project-osrm.org/route/v1/driving/{a["lng"]},{a["lat"]};{b["lng"]},{b["lat"]}?overview=false'
    r = pedir(url)['routes'][0]
    return r['distance'] / 1000, r['duration'] / 60 * 1.25


def valor_ejemplo(km):
    # Tarifa de EJEMPLO para viajes intermunicipales: arranque + valor por km.
    return max(15000, int(round((6000 + km * 1500) / 1000.0)) * 1000)


def conductores_demo(id_, empresa):
    rnd = random.Random(id_)
    nombres = NOMBRES[:]
    rnd.shuffle(nombres)
    prefijo = empresa.get('placaPrefijo', 'TAX')
    moviles = sorted(rnd.sample(range(1, max(empresa.get('taxis') or 30, 12) + 1), 8))
    return [{
        'id': f'demo-{m:02d}', 'movil': f'{m:03d}', 'nombre': nombres[i], 'placa': f'{prefijo} {600 + m:03d}',
        'vehiculo': empresa.get('vehiculo', 'Kia Picanto'), 'color': empresa.get('colorTaxi', 'Amarillo'),
        'calificacion': round(rnd.uniform(4.6, 5.0), 1), 'viajes': rnd.randint(400, 2300), 'desde': rnd.randint(2006, 2021),
        'tel': f'3000000{m:03d}',
    } for i, m in enumerate(moviles)]


def datos_de_empresa(base, ficha):
    """Lo que viene de cooperativas.json (manda sobre lo que tenga la ficha)."""
    ficha['estado'] = base.get('estado', 'propuesta')
    ficha['EMPRESA'] = base['EMPRESA']
    ficha['colores'] = base['colores']
    for campo in CAMPOS_BASE:
        if base.get(campo):
            ficha[campo] = base[campo]
        else:
            ficha.pop(campo, None)
    return ficha


def ordenar(ficha):
    orden = ['id', 'estado', 'EMPRESA', 'colores', 'CENTRO', 'ZONA', 'TARIFAS', 'RUTAS', 'LUGARES', 'CONDUCTORES_DEMO', 'PASAJEROS_DEMO', 'textos', 'imagenes', 'fuentes', 'notas']
    return {k: ficha[k] for k in orden if k in ficha} | {k: v for k, v in ficha.items() if k not in orden}


def guardar(id_, ficha):
    destino = RAIZ / 'empresas' / id_ / 'ficha.json'
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(ordenar(ficha), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('   ->', destino.relative_to(RAIZ))


def crear(id_, base, rehacer=False):
    print(f'== {id_}: {base["EMPRESA"]["nombre"]}')
    destino = RAIZ / 'empresas' / id_ / 'ficha.json'
    if destino.exists() and base.get('lugaresRevisados') and not rehacer:
        ficha = json.loads(destino.read_text(encoding='utf-8'))
        guardar(id_, datos_de_empresa(base, ficha))
        print('   (lugares y rutas revisados a mano: se conservan; usa --rehacer para bajarlos de nuevo)')
        return
    centro = lugar_poblado(base['pueblo_osm'])
    print('   centro', centro)
    lugares = lugares_del_pueblo(centro, base['EMPRESA']['pueblo'])
    print('   lugares', len(lugares))
    rutas = []
    for dest in base['destinos']:
        if dest in FIJOS:
            d = dict(FIJOS[dest], id=dest)
        else:
            p = lugar_poblado(dest)
            d = {'id': slug(dest), 'nombre': dest, 'detalle': 'Cundinamarca', 'cat': 'municipio', 'lat': round(p['lat'], 6), 'lng': round(p['lng'], 6)}
        km, minutos = ruta_osrm(centro, d)
        time.sleep(0.6)
        if not any(l['id'] == d['id'] for l in lugares):
            lugares.append({k: d[k] for k in ('id', 'nombre', 'detalle', 'cat', 'lat', 'lng')})
        destino_nombre = d['nombre'].replace(' (TransMilenio)', ' (Bogotá)')
        if d['cat'] == 'bogota' and '(' not in destino_nombre and 'Aeropuerto' not in destino_nombre:
            destino_nombre += ' (Bogotá)'
        rutas.append({'id': d['id'], 'destino': destino_nombre, 'valor': valor_ejemplo(km), 'km': round(km), 'min': int(round(minutos / 5.0) * 5) or 5, 'radioKm': 3 if d['cat'] == 'bogota' else 4})
        print(f'   ruta → {d["nombre"]}: {km:.1f} km')
    rutas.sort(key=lambda r: r['km'])
    cootrans = json.loads((RAIZ / 'empresas/cootransrural/ficha.json').read_text(encoding='utf-8'))
    ficha = {
        'id': id_,
        'CENTRO': {'lat': round(centro['lat'], 6), 'lng': round(centro['lng'], 6)},
        'ZONA': {'sur': round(centro['lat'] - 0.32, 2), 'norte': round(centro['lat'] + 0.32, 2), 'oeste': round(centro['lng'] - 0.32, 2), 'este': round(centro['lng'] + 0.32, 2)},
        'TARIFAS': dict(cootrans['TARIFAS'], **base.get('tarifas', {})),
        'RUTAS': rutas,
        'LUGARES': lugares,
        'CONDUCTORES_DEMO': conductores_demo(id_, base['EMPRESA']),
        'PASAJEROS_DEMO': cootrans['PASAJEROS_DEMO'],
    }
    guardar(id_, datos_de_empresa(base, ficha))


def main():
    bases = json.loads((RAIZ / 'herramientas/cooperativas.json').read_text(encoding='utf-8'))
    ids = list(bases) if '--todas' in sys.argv else [a for a in sys.argv[1:] if not a.startswith('-')]
    if not ids:
        print(__doc__)
        sys.exit(1)
    for i in ids:
        crear(i, bases[i], rehacer='--rehacer' in sys.argv)


if __name__ == '__main__':
    main()
