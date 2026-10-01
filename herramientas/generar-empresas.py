#!/usr/bin/env python3
"""Genera las páginas de cada cooperativa a partir de plantillas/.

Cada archivo de plantillas/<ruta> se escribe, para cada ficha de empresas/*/ficha.json:
  - Cootransrural → en la raíz del sitio (<ruta>)
  - las demás     → en <id>/<ruta>
Las plantillas de plantillas/_raiz/<ruta> se escriben una sola vez, en la raíz
(<ruta>), con los datos de Cootransrural y la lista de todas las cooperativas.

Marcas que entiende el generador (en HTML, JSON, etc.):
  {{RAIZ}}             ruta relativa a la raíz del sitio desde el archivo generado
  {{RAIZ_EMPRESA}}     ruta relativa a la raíz de la cooperativa
  {{clave.sub}}        valor de la ficha o del contexto (se escapa para HTML)
  {{{clave.sub}}}      valor sin escapar (solo para HTML/JSON armado aquí)
  {{#si clave}}…{{/si}}      bloque si el valor es verdadero
  {{#no clave}}…{{/no}}      bloque si el valor es falso o vacío
  {{#cada lista}}…{{/cada}}  repite el bloque por cada elemento de la lista; dentro
                             se leen los campos del elemento ({{nombre}}), el
                             elemento entero ({{este}}), {{indice}}, {{primero}} y {{ultimo}}
Los bloques se pueden anidar (también del mismo tipo).

Además de la ficha, las plantillas reciben datos derivados (ver derivados()):
paleta de colores en CSS, íconos, cifras disponibles, textos con respaldo
honesto, JSON-LD, contacto, etc. Así la plantilla nunca muestra «null» ni
datos de otra cooperativa.

Después de generar, correr herramientas/versionar.py.
Uso:  python3 herramientas/generar-empresas.py
"""
import colorsys
import html
import json
import pathlib
import re
from urllib.parse import urlparse

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PLANTILLAS = RAIZ / 'plantillas'
PRINCIPAL = 'cootransrural'  # la que vive en la raíz del sitio
URL_PUBLICA = 'https://interos-sas.github.io/cootransrural-app/'
PROVEEDOR = {'nombre': 'interOS', 'web': 'https://interos.com.co'}

# ---------------------------------------------------------------------------
# Motor de plantillas
# ---------------------------------------------------------------------------

ETIQUETA = re.compile(
    r'\{\{\{\s*(?P<crudo>[\w.]+)\s*\}\}\}'
    r'|\{\{\s*#(?P<abre>si|no|cada)\s+(?P<clave>[\w.]+)\s*\}\}'
    r'|\{\{\s*/(?P<cierra>si|no|cada)\s*\}\}'
    r'|\{\{\s*(?P<valor>[\w.]+)\s*\}\}'
)


class ErrorPlantilla(Exception):
    pass


def analizar(fuente, nombre='plantilla'):
    """Convierte el texto en un árbol: ('texto', s) | ('crudo', k) | ('valor', k) | ('bloque', tipo, k, hijos)."""
    raiz = []
    pila = [('raiz', None, raiz)]
    pos = 0
    for m in ETIQUETA.finditer(fuente):
        actual = pila[-1][2]
        if m.start() > pos:
            actual.append(('texto', fuente[pos:m.start()]))
        pos = m.end()
        if m.group('crudo'):
            actual.append(('crudo', m.group('crudo')))
        elif m.group('valor'):
            actual.append(('valor', m.group('valor')))
        elif m.group('abre'):
            hijos = []
            actual.append(('bloque', m.group('abre'), m.group('clave'), hijos))
            pila.append((m.group('abre'), m.group('clave'), hijos))
        else:
            tipo = m.group('cierra')
            if pila[-1][0] != tipo:
                linea = fuente.count('\n', 0, m.start()) + 1
                raise ErrorPlantilla(f'{nombre}:{linea}: se cierra {{{{/{tipo}}}}} pero está abierto «{pila[-1][0]}»')
            pila.pop()
    if len(pila) > 1:
        raise ErrorPlantilla(f'{nombre}: falta cerrar {{{{#{pila[-1][0]} {pila[-1][1]}}}}}')
    if pos < len(fuente):
        raiz.append(('texto', fuente[pos:]))
    return raiz


def buscar(ctx, clave):
    valor = ctx
    for parte in clave.split('.'):
        if isinstance(valor, dict) and parte in valor:
            valor = valor[parte]
        elif isinstance(valor, list) and parte.isdigit() and int(parte) < len(valor):
            valor = valor[int(parte)]
        else:
            return None
    return valor


def texto(valor):
    if valor is None:
        return ''
    if isinstance(valor, bool):
        return 'true' if valor else 'false'
    if isinstance(valor, (dict, list)):
        return json.dumps(valor, ensure_ascii=False)
    return str(valor)


def verdadero(v):
    return bool(v) and v not in ('false', '0')


def pintar(nodos, ctx):
    salida = []
    for nodo in nodos:
        tipo = nodo[0]
        if tipo == 'texto':
            salida.append(nodo[1])
        elif tipo == 'crudo':
            salida.append(texto(buscar(ctx, nodo[1])))
        elif tipo == 'valor':
            salida.append(html.escape(texto(buscar(ctx, nodo[1])), quote=True))
        else:
            _, clase, clave, hijos = nodo
            v = buscar(ctx, clave)
            if clase == 'si':
                if verdadero(v):
                    salida.append(pintar(hijos, ctx))
            elif clase == 'no':
                if not verdadero(v):
                    salida.append(pintar(hijos, ctx))
            else:  # cada
                lista = v if isinstance(v, list) else []
                for i, elemento in enumerate(lista):
                    sub = dict(ctx)
                    if isinstance(elemento, dict):
                        sub.update(elemento)
                    sub.update({'este': elemento, 'indice': i, 'primero': i == 0, 'ultimo': i == len(lista) - 1})
                    salida.append(pintar(hijos, sub))
    return ''.join(salida)


def renderizar(plantilla, ctx, nombre='plantilla'):
    return pintar(analizar(plantilla, nombre), ctx)


# ---------------------------------------------------------------------------
# Utilidades de datos
# ---------------------------------------------------------------------------

def fichas():
    salida = []
    for p in sorted((RAIZ / 'empresas').glob('*/ficha.json')):
        salida.append(json.loads(p.read_text(encoding='utf-8')))
    # La principal primero.
    salida.sort(key=lambda f: (f['id'] != PRINCIPAL, f['id']))
    return salida


def pesos(n):
    return '$' + f'{round(n):,}'.replace(',', '.')


def numero(n):
    return f'{round(n):,}'.replace(',', '.')


def lista_natural(partes, y='y'):
    partes = [p for p in partes if p]
    if not partes:
        return ''
    if len(partes) == 1:
        return partes[0]
    return ', '.join(partes[:-1]) + f' {y} ' + partes[-1]


def mayuscula(t):
    return t[:1].upper() + t[1:]


def digitos(t):
    return re.sub(r'\D', '', str(t or ''))


def telefono_visible(numero_crudo):
    d = digitos(numero_crudo)
    if d.startswith('57') and len(d) == 12:
        d = d[2:]
    if len(d) == 10:
        return f'{d[:3]} {d[3:6]} {d[6:]}'
    return d


def hex_rgb(h):
    h = (h or '#000000').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_hex(t):
    return '#' + ''.join(f'{max(0, min(255, round(c))):02X}' for c in t)


def mezclar(a, b, t):
    """Mezcla el color a con b en proporción t (0 = a, 1 = b)."""
    ra, rb = hex_rgb(a), hex_rgb(b)
    return rgb_hex(tuple(x + (y - x) * t for x, y in zip(ra, rb)))


def con_luz(h, luz=None, sat_max=None, mas_luz=0.0):
    r, g, b = (c / 255 for c in hex_rgb(h))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    if luz is not None:
        ll = luz
    ll = min(0.95, ll + mas_luz)
    if sat_max is not None:
        ss = min(ss, sat_max)
    return rgb_hex(tuple(c * 255 for c in colorsys.hls_to_rgb(hh, ll, ss)))


def canales(h):
    return ', '.join(str(c) for c in hex_rgb(h))


def luminancia(h):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in hex_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    """Relación de contraste WCAG entre dos colores (1 a 21)."""
    la, lb = luminancia(a), luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def ajustar_contraste(color, fondos, minimo, hacia):
    """Mezcla el color con «hacia» (blanco o negro) lo justo para que tenga al
    menos «minimo» de contraste con cada fondo. Si ya lo cumple, no lo cambia."""
    for i in range(0, 101, 2):
        c = mezclar(color, hacia, i / 100) if i else color.upper()
        if all(contraste(c, f) >= minimo for f in fondos):
            return c
    return hacia


CREMA, CREMA_2 = '#FFFBF2', '#FBF3E1'  # fondos claros de web/estilos.css

# Paleta exacta de Cootransrural (la web original); las demás se derivan de su ficha.
# («amarillo-texto» se oscureció un poco, de #A67900 a #926A00, para llegar al
# contraste AA sobre blanco.)
PALETA_PRINCIPAL = {
    'verde': '#0A5C33', 'verde-2': '#0B6B3A', 'verde-3': '#13874B', 'verde-osc': '#052A17', 'verde-tinte': '#E6F2EA',
    'verde-tinte-2': '#EAF3EC', 'verde-tinte-3': '#E3EFE6', 'verde-linea': '#D5E6DA', 'exito-tinte': '#E8F7EE',
    'b-claro': '#A7D7B8', 'fondo-oscuro': '#0B1A12', 'noche-1': '#10241A', 'noche-2': '#04110A', 'fondo-vitrina': '#07140D',
    'amarillo': '#FFC107', 'amarillo-2': '#FFD54F', 'amarillo-osc': '#C99400', 'amarillo-texto': '#926A00', 'rojo': '#D32F2F',
    'amarillo-vivo': '#FFC107',
    'velo': '#031E10', 'velo-2': '#042615', 'velo-3': '#031A0E', 'noche': '#030E09',
}


def paleta(ficha):
    if ficha['id'] == PRINCIPAL:
        return dict(PALETA_PRINCIPAL)
    c = ficha.get('colores') or {}
    p1 = c.get('primario') or '#0A5C33'
    p2 = c.get('primario2') or mezclar(p1, '#FFFFFF', 0.08)
    osc = c.get('oscuro') or mezclar(p1, '#000000', 0.55)
    acento = c.get('acento') or '#FFC107'
    # El primario lleva texto blanco encima (botones, bandas) y va como texto sobre
    # blanco: si la ficha trae uno muy claro, en la web se usa una versión más oscura.
    if contraste('#FFFFFF', p1) < 4.5:
        p1 = ajustar_contraste(p1, ['#FFFFFF'], 4.6, '#000000')
    if contraste('#FFFFFF', osc) < 7:
        osc = ajustar_contraste(osc, ['#FFFFFF'], 7, '#000000')
    # Contraste AA con cualquier color de ficha (un primario oscuro no se toca: es la marca):
    #  - verde-2 es el color de los enlaces y antetítulos sobre blanco y crema;
    #  - verde-3 lleva texto blanco encima (avatar, degradados);
    #  - amarillo-vivo es el acento cuando va como TEXTO grande sobre el color de
    #    marca (precios, cifras): se aclara si hace falta;
    #  - amarillo-2 es texto pequeño sobre el cotizador (primario + 10 % de blanco);
    #  - amarillo-texto es texto pequeño sobre blanco.
    v2 = ajustar_contraste(p2, ['#FFFFFF', CREMA, CREMA_2], 4.6, '#000000')
    v3 = ajustar_contraste(con_luz(p2, mas_luz=0.08), ['#FFFFFF'], 4.6, '#000000')
    cotizador = mezclar(p1, '#FFFFFF', 0.1)
    vivo = ajustar_contraste(acento, [p1, cotizador, v2, osc], 3.2, '#FFFFFF')
    return {
        'verde': p1, 'verde-2': v2, 'verde-3': v3, 'verde-osc': osc,
        'verde-tinte': mezclar(p1, '#FFFFFF', 0.9), 'verde-tinte-2': mezclar(p1, '#FFFFFF', 0.91),
        'verde-tinte-3': mezclar(p1, '#FFFFFF', 0.88), 'verde-linea': mezclar(p1, '#FFFFFF', 0.82),
        'exito-tinte': mezclar(p1, '#FFFFFF', 0.9), 'b-claro': mezclar(p1, '#FFFFFF', 0.62),
        'fondo-oscuro': con_luz(osc, luz=0.075, sat_max=0.42), 'noche-1': con_luz(osc, luz=0.105, sat_max=0.4),
        'noche-2': con_luz(osc, luz=0.04, sat_max=0.6), 'fondo-vitrina': con_luz(osc, luz=0.05, sat_max=0.5),
        'amarillo': acento, 'amarillo-2': ajustar_contraste(mezclar(acento, '#FFFFFF', 0.3), [cotizador], 4.6, '#FFFFFF'),
        'amarillo-osc': mezclar(acento, '#000000', 0.21),
        'amarillo-texto': ajustar_contraste(mezclar(acento, '#000000', 0.35), ['#FFFFFF', CREMA], 4.6, '#000000'),
        'amarillo-vivo': vivo, 'rojo': c.get('rojo') or '#D32F2F',
        'velo': mezclar(osc, '#000000', 0.3), 'velo-2': mezclar(osc, '#000000', 0.1),
        'velo-3': mezclar(osc, '#000000', 0.38), 'noche': mezclar(osc, '#000000', 0.66),
    }


def css_paleta(p):
    """Variables CSS de la cooperativa (las usan web/estilos.css, paginas.css y vitrina.css)."""
    partes = [f'--{k}:{v}' for k, v in p.items()]
    for k in ('verde', 'verde-3', 'verde-osc', 'amarillo', 'velo', 'velo-2', 'velo-3', 'noche', 'rojo'):
        partes.append(f'--{k}-rgb:{canales(p[k])}')
    return ':root{' + ';'.join(partes) + '}'


# ---------------------------------------------------------------------------
# Datos derivados de cada ficha (no dependen del archivo que se genera)
# ---------------------------------------------------------------------------

def archivo_existe(rel):
    return (RAIZ / rel).is_file()


def iconos(fid):
    base = f'empresas/{fid}/'
    if fid != PRINCIPAL and archivo_existe(base + 'icono-192.png'):
        return {'i192': base + 'icono-192.png', 'i512': base + 'icono-512.png', 'maskable': base + 'icono-maskable-512.png',
                'apple': base + 'apple-touch-icon.png', 'favicon': base + 'favicon-32.png', 'propios': True}
    return {'i192': 'img/icono-192.png', 'i512': 'img/icono-512.png', 'maskable': 'img/icono-maskable-512.png',
            'apple': 'img/apple-touch-icon.png', 'favicon': 'img/favicon-32.png', 'propios': fid == PRINCIPAL}


def dominio(url):
    try:
        return urlparse(url).netloc.replace('www.', '') or url
    except ValueError:
        return url


def calle_sin_municipio(direccion, E):
    d = (direccion or '').strip()
    for sufijo in (E.get('municipio') or '', f"{E.get('pueblo') or ''}, Cundinamarca", E.get('pueblo') or ''):
        if sufijo and d.endswith(sufijo):
            d = d[: -len(sufijo)].rstrip(', ').strip()
            break
    return d


def parrafos(v):
    if not v:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [p.strip() for p in re.split(r'\n\s*\n', str(v)) if p.strip()]


# Textos de la web original de Cootransrural (su ficha aún no trae «textos»).
TEXTOS_PRINCIPAL = {
    'historia': [
        'Cootransrural nació en 1999, cuando un grupo de conductores de El Rosal decidió organizarse para dignificar su oficio y darle al municipio un transporte seguro, eficiente y confiable, tanto en el casco urbano como en las veredas.',
        'Empezamos con 22 taxis y una idea sencilla: trabajar juntos, con solidaridad, compromiso y responsabilidad con la comunidad. Gracias al esfuerzo de los asociados y al respaldo de la gente, hoy movemos a El Rosal y a la Sabana de Occidente de día y de noche. Ahora damos un paso más: llevar el servicio de siempre a tu celular.',
    ],
    'mision': 'Ofrecer a nuestros usuarios un servicio de transporte excelente y oportuno que responda a lo que esperan de un servicio público, con base en los principios del cooperativismo y con un equipo humano competente y motivado, comprometido con la mejora continua y con el crecimiento económico, social y cultural de todos nuestros asociados.',
    'vision': 'En 2030 seremos la cooperativa líder en transporte urbano e intermunicipal de la región, reconocida por la confianza que inspira, por su calidad certificada, su seguridad y su servicio oportuno, gracias a la mejora continua y a una alta competitividad.',
    'titulo_vision': 'Visión 2030',
    'linea_tiempo': [
        {'b': '1999', 's': 'Nace la cooperativa con 22 taxis.'},
        {'b': 'Hoy', 's': '52 taxis, 3 microbuses y 105 asociados.'},
        {'b': '2030', 's': 'Líderes del transporte en la región.'},
    ],
    'rutas_titulo': 'De El Rosal a toda la Sabana',
    'rutas_texto': 'Subachoque, Madrid, Facatativá, Mosquera, Funza, Tenjo, Chía, Bogotá y el aeropuerto.',
    'pie_texto': 'Taxis y microbuses en El Rosal y la Sabana de Occidente desde 1999.',
}


def muestra_conductor(ficha):
    """Conductor de muestra para las ilustraciones (móvil 023)."""
    E = ficha['EMPRESA']
    if ficha['id'] == PRINCIPAL:
        nombre, calif = 'Carlos Rodríguez', 4.9
    else:
        demo = (ficha.get('CONDUCTORES_DEMO') or [{}])[0]
        nombre, calif = demo.get('nombre') or 'Carlos Rodríguez', demo.get('calificacion') or 4.8
    partes = nombre.split()
    prefijo = (E.get('placaPrefijo') or 'TAX').strip()
    return {
        'nombre': nombre, 'pila': partes[0], 'iniciales': (partes[0][0] + (partes[-1][0] if len(partes) > 1 else '')).upper(),
        'movil': '023', 'placa': f'{prefijo} 623', 'calificacion': f'{calif:.1f}'.replace('.', ','),
        'vehiculo': E.get('vehiculo') or 'taxi', 'color': (E.get('colorTaxi') or 'amarillo').lower(),
    }


def cantidad(v):
    """Cifra de la ficha: 52, '52', '100+' o '~20' → (número, sufijo); None si no es una cifra."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return (int(v), '') if v > 0 else None
    m = re.match(r'^\s*[~≈]?\s*(\d+)\s*(\+?)\s*$', str(v))
    return (int(m.group(1)), m.group(2)) if m and int(m.group(1)) > 0 else None


def modelo_taxis(ficha):
    """Modelo de los taxis solo si la ficha lo da por confirmado (si no, ni se nombra)."""
    E = ficha['EMPRESA']
    pend = ' '.join(E.get('datosPendientes') or []).lower()
    return '' if 'modelo' in pend else (E.get('vehiculo') or '')


def cifra(v, texto):
    n = cantidad(v)
    return {'valor': str(n[0]), 'sufijo': n[1], 'contar': n[0], 'texto': texto} if n else None


def cifras(ficha):
    E = ficha['EMPRESA']
    pend = ' '.join(E.get('datosPendientes') or []).lower()
    lista = []
    if cantidad(E.get('taxis')):
        aprox = 'exacto de taxis' in pend
        etiqueta = f"taxis {modelo_taxis(ficha)}".strip() if not aprox else 'taxis'
        lista.append(cifra(E['taxis'], etiqueta + (' (aprox.)' if aprox else '')))
    elif cantidad(E.get('vehiculos')):
        lista.append(cifra(E['vehiculos'], 'vehículos'))
    for clave, texto in (('microbuses', 'microbuses'), ('asociados', 'asociados')):
        if cantidad(E.get(clave)):
            lista.append(cifra(E[clave], texto))
    if E.get('fundada'):
        lista.append({'valor': str(E['fundada']), 'contar': None, 'texto': f"fundada en {E.get('pueblo')}"})
    if E.get('servicio24h'):
        lista.append({'valor': '24', 'sufijo': 'h', 'contar': None, 'texto': 'servicio todos los días'})
    # Si faltan datos, se completa con lo que la app sí trae (sin inventar nada de la cooperativa).
    locales = [l for l in ficha.get('LUGARES') or [] if l.get('cat') not in ('municipio', 'bogota')]
    extras = [
        {'valor': str(len(ficha.get('RUTAS') or [])), 'contar': len(ficha.get('RUTAS') or []), 'texto': 'destinos con tarifa fija'},
        # Solo los lugares del propio municipio (no los pueblos vecinos ni Bogotá).
        {'valor': str(len(locales)), 'contar': len(locales), 'texto': f"lugares de {E.get('pueblo')} en la app"},
        {'valor': '3', 'contar': 3, 'texto': 'diseños de app para elegir'},
    ]
    for extra in extras:
        if len(lista) >= 4:
            break
        if extra['contar']:
            lista.append(extra)
    for c in lista:
        c.setdefault('sufijo', '')
    return lista


def oficina(ficha):
    E = ficha['EMPRESA']
    o = E.get('oficina')
    if isinstance(o, dict) and o.get('lat') and o.get('lng'):
        return {'lat': o['lat'], 'lng': o['lng']}
    for lugar in ficha.get('LUGARES') or []:
        if lugar.get('id') == 'oficina':
            return {'lat': lugar['lat'], 'lng': lugar['lng']}
    return dict(ficha['CENTRO'])


def jsonld(ficha, d):
    E = ficha['EMPRESA']
    url = d['url_publica']
    negocio = {
        '@type': 'LocalBusiness',
        '@id': '#cooperativa',
        'name': E['nombre'],
        'legalName': E.get('razonSocial') or E['nombre'],
        'slogan': E.get('lema') or None,
        'description': d['descripcion_corta'],
        'foundingDate': str(E['fundada']) if E.get('fundada') else None,
        'url': url,
        'image': d['url_sitio'] + d['img']['hero'],
        # En las propuestas no se publica logo: no es la página oficial de la cooperativa.
        'logo': (d['url_sitio'] + d['icono']['i512']) if not d['es_propuesta'] else None,
        'telephone': ('+57 ' + E['telefonoVisible']) if E.get('telefono') and E.get('telefonoVisible') else None,
        'email': E.get('correo') or None,
        'address': {
            '@type': 'PostalAddress',
            'streetAddress': d['calle'] or None,
            'addressLocality': E.get('pueblo'),
            'addressRegion': d['departamento'],
            'addressCountry': 'CO',
        },
        'geo': {'@type': 'GeoCoordinates', 'latitude': d['oficina']['lat'], 'longitude': d['oficina']['lng']},
        'openingHoursSpecification': {
            '@type': 'OpeningHoursSpecification',
            'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            'opens': '00:00',
            'closes': '23:59',
        } if E.get('servicio24h') else None,
        'areaServed': [x for x in (E.get('pueblo'), d['region'], d['departamento']) if x],
    }
    taxi = {
        '@type': 'TaxiService',
        'name': f"Taxis {E['nombre']}",
        'serviceType': 'Taxi urbano e intermunicipal',
        'provider': {'@id': '#cooperativa'},
        'areaServed': {'@type': 'City', 'name': E.get('municipio') or E.get('pueblo')},
    }
    if negocio['telephone']:
        taxi['availableChannel'] = {
            '@type': 'ServiceChannel',
            'servicePhone': {'@type': 'ContactPoint', 'telephone': negocio['telephone'], 'contactType': 'central de taxis', 'availableLanguage': 'es'},
        }
    negocio = {k: v for k, v in negocio.items() if v is not None}
    negocio['address'] = {k: v for k, v in negocio['address'].items() if v is not None}
    datos = {'@context': 'https://schema.org', '@graph': [negocio, taxi]}
    return json.dumps(datos, ensure_ascii=False, indent=2).replace('</', '<\\/')


def nombres_disenos(ficha):
    E = ficha['EMPRESA']
    if ficha['id'] == PRINCIPAL:
        b = {'nombre': 'Verde Rosal', 'corto': 'Verde', 'texto': 'El verde de la cooperativa y los tonos de la Sabana. Cercano, tranquilo y con el sello de Cootransrural.',
             'texto_vitrina': 'El verde de la cooperativa y los tonos de la Sabana. Cercano y tranquilo.'}
    else:
        b = {'nombre': 'Color de la cooperativa', 'corto': 'Cooperativa', 'texto': f"Los colores de {E['nombre']}, letra grande y pedido por pasos. Cercano, tranquilo y pensado para todas las edades.",
             'texto_vitrina': f"Los colores de {E['nombre']}, letra grande y pedido por pasos. Cercano y tranquilo."}
    personal = (ficha.get('disenos') or {}).get('b') or {}
    b.update({k: v for k, v in personal.items() if isinstance(v, str) and v})
    return {
        'a': {'nombre': 'Ámbar Urbano', 'corto': 'Ámbar', 'texto': 'Amarillo taxi con detalles oscuros. Alegre, urbano y directo: botones grandes, fáciles de tocar en la calle.',
              'texto_vitrina': 'Amarillo taxi con detalles oscuros. Alegre, urbano y directo, con botones grandes.'},
        'b': b,
        'c': {'nombre': 'Noche Neón', 'corto': 'Neón', 'texto': 'Modo oscuro con luces de neón. Elegante, moderno y cómodo para los ojos cuando pides taxi de noche.',
              'texto_vitrina': 'Modo oscuro con luces de neón. Elegante y cómodo para pedir taxi de noche.'},
    }


def tarifas_base():
    if 'tarifas_base' not in _CACHE:
        try:
            principal = json.loads((RAIZ / 'empresas' / PRINCIPAL / 'ficha.json').read_text(encoding='utf-8'))
            _CACHE['tarifas_base'] = dict(principal.get('TARIFAS') or {})
        except (OSError, ValueError):
            _CACHE['tarifas_base'] = {}
    return _CACHE['tarifas_base']


def derivados(ficha):
    fid = ficha['id']
    E = ficha['EMPRESA']
    # Tarifas: las de la ficha; lo que falte, con las de ejemplo de la principal
    # (las mismas que pone crear-ficha.py), para no mostrar nunca «$0».
    T = dict(tarifas_base(), **{k: v for k, v in (ficha.get('TARIFAS') or {}).items() if v is not None})
    es_principal = fid == PRINCIPAL
    es_propuesta = ficha.get('estado') == 'propuesta'
    es_cliente = not es_propuesta
    prefijo = '' if es_principal else f'{fid}/'
    pueblo = E.get('pueblo') or ''
    municipio = E.get('municipio') or pueblo
    departamento = municipio.split(',')[-1].strip() if ',' in municipio else 'Cundinamarca'
    region = E.get('region') or ('Sabana de Occidente' if es_principal else '')
    textos = ficha.get('textos') or {}
    pal = paleta(ficha)
    p = {}

    # Contacto
    tel = digitos(E.get('telefono'))
    wa = digitos(E.get('whatsapp'))
    if not wa and len(tel) == 10 and tel.startswith('3'):
        wa = '57' + tel  # un celular sirve también para WhatsApp
    tel_visible = E.get('telefonoVisible') or telefono_visible(tel)
    wa_visible = telefono_visible(wa)
    pend = ' '.join(E.get('datosPendientes') or []).lower()
    pendiente = {
        'telefono': es_cliente and not tel,
        'whatsapp': es_cliente and not wa,
        'correo': es_cliente and not E.get('correo'),
        'direccion': es_cliente and not E.get('direccion'),
    }
    p.update({
        'tel': ('+57' + tel) if tel else '',
        'tel_visible': tel_visible if tel else '',
        'wa': wa,
        'wa_visible': wa_visible if wa else '',
        'wa_igual_tel': bool(tel and wa and wa.endswith(tel)),
        'pendiente': pendiente,
        'hay_pendientes': any(pendiente.values()) or bool(E.get('datosPendientes')),
        'datos_pendientes_texto': lista_natural(E.get('datosPendientes') or []),
        'tiene_telefono': bool(tel),
        'tiene_whatsapp': bool(wa),
        'tiene_correo': bool(E.get('correo')),
        'tiene_direccion': bool(E.get('direccion')),
        'tiene_contacto': bool(tel or wa or E.get('correo') or E.get('direccion') or any(pendiente.values())),
        'tiene_fuentes': bool(ficha.get('fuentes')),
        'fuentes_lista': [{'url': u, 'dominio': dominio(u)} for u in ficha.get('fuentes') or []],
        'calle': calle_sin_municipio(E.get('direccion'), E),
    })
    medios = ['pide por la app'] + (['llama'] if tel else []) + (['escríbenos por WhatsApp'] if wa else [])
    p['noche_texto'] = (
        ('La central atiende las 24 horas, todos los días del año. ' if E.get('servicio24h') else 'La central te atiende todos los días. ')
        + mayuscula(lista_natural(medios, 'o')) + '.'
    )
    if es_principal:
        p['noche_texto'] = 'La central atiende las 24 horas, todos los días del año. Pide por la app, llama o escríbenos.'
    contacto = ['Visítanos en la oficina'] if E.get('direccion') else []
    if tel:
        contacto.append('llámanos')
    if wa:
        contacto.append('programa tu servicio por WhatsApp')
    elif not tel:
        contacto.append('pide tu taxi desde la app')
    p['contacto_lead'] = mayuscula(lista_natural(contacto, 'o')) + '.'

    # Generales
    p.update({
        'id': fid,
        'es_principal': es_principal,
        'es_propuesta': es_propuesta,
        'es_cliente': es_cliente,
        'ruta_empresa': prefijo,
        'url_publica': URL_PUBLICA + prefijo,
        'url_sitio': URL_PUBLICA,
        'proveedor': dict(PROVEEDOR),
        'departamento': departamento,
        'region': region,
        'estilo_colores': css_paleta(pal),
        'paleta': pal,
        'color_qr': pal['verde'] if luminancia(pal['verde']) < 0.18 else pal['verde-osc'],
        'flecha_select': f"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23{pal['verde'].lstrip('#')}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        'icono': iconos(fid),
        # Cada cooperativa tiene su página de stickers (plantillas/stickers/). La de la raíz
        # fija CT_EMPRESA='cootransrural', así que «stickers/?e=<id>» mostraría la de Cootransrural.
        'stickers_ruta': f'{prefijo}stickers/' if (PLANTILLAS / 'stickers' / 'index.html').is_file() or es_principal else f'stickers/?e={fid}',
        'franja_texto': f"Propuesta de demostración preparada por {PROVEEDOR['nombre']} para {E.get('razonSocial') or E['nombre']}",
        'otros_ids': json.dumps([f['id'] for f in fichas() if f['id'] != fid]),
    })
    p['c'] = {k.replace('-', '_'): v for k, v in pal.items()}  # paleta con claves legibles en plantillas
    p['franja_para'] = E.get('razonSocial') or E['nombre']
    razon = E.get('razonSocial') or ''
    p['razon_con_nombre'] = razon if E['nombre'].lower() in razon.lower() else (f"{razon} ({E['nombre']})" if razon else f"cooperativa {E['nombre']}")
    p['nombre_largo'] = len(E['nombre']) > 14
    # Nombre del pueblo sin cortes de línea («La Vega», «El Rosal») para el título.
    p['pueblo_junto'] = pueblo.replace(' ', '\u00a0')
    lema = (E.get('lema') or '').strip()
    p['titulo_nosotros'] = lema or f'Taxis de {pueblo}'
    p['lema_punto'] = (lema if lema[-1:] in '.!?' else lema + '.') if lema else ''
    direccion = (E.get('direccion') or '').strip()
    p['direccion_corta'] = re.sub(r',\s*' + re.escape(departamento) + r'$', '', direccion)
    p['direccion_mapa'] = (direccion.split(',')[0].strip() + ', ' + pueblo) if direccion else pueblo
    p['oficina'] = oficina(ficha)
    p['maps_url'] = f"https://www.google.com/maps/search/?api=1&query={p['oficina']['lat']},{p['oficina']['lng']}"

    # Imágenes (rutas desde la raíz del sitio). imagenes.* de la ficha manda.
    im = ficha.get('imagenes') or {}
    def foto(clave, por_defecto):
        v = im.get(clave)
        return v if v and archivo_existe(v) else por_defecto
    img = {
        'hero': foto('hero', 'img/web/hero.jpg'),
        'pasajera': foto('pasajera', 'img/web/pasajera.jpg'),
        'sabana': foto('sabana', 'img/web/sabana.jpg'),
        'conductor': foto('conductor', 'img/web/conductor.jpg'),
        'noche': foto('noche', 'img/web/noche.jpg'),
        'nosotros': foto('nosotros', 'img/web/flota-1.jpg' if es_principal else 'img/web/flota-plaza.jpg'),
        'flota': foto('flota', 'img/web/flota-plaza.jpg' if es_principal else ''),
    }
    # Fotos con QR: las de la raíz llevan el QR de Cootransrural; las demás usan
    # la copia con su propio QR (herramientas/iconos-empresas.mjs).
    for clave, archivo in (('sticker', 'sticker-taxi.jpg'), ('nevera', 'nevera.jpg')):
        propia = f'empresas/{fid}/{archivo}'
        img[clave] = foto(clave, f'img/web/{archivo}' if es_principal else (propia if archivo_existe(propia) else ''))
    p['img'] = img
    p['hay_fotos_stickers'] = bool(img['sticker'] or img['nevera'])
    capturas = {}
    for d in 'abc':
        propia = f'empresas/{fid}/disenos-{d}.jpg'
        capturas[d] = f'web/disenos/{d}.jpg' if es_principal else (propia if archivo_existe(propia) else '')
    p['capturas'] = capturas
    p['disenos'] = nombres_disenos(ficha)

    # Cifras, muestra y textos
    p['cifras'] = cifras(ficha)
    p['muestra'] = muestra_conductor(ficha)
    taxis = (cantidad(E.get('taxis')) or (0,))[0]
    aprox = 'exacto de taxis' in ' '.join(E.get('datosPendientes') or []).lower()
    p['taxis_calc'] = taxis or 30
    p['plan_b_flota'] = pesos(p['taxis_calc'] * 27000)
    p['plan_b_ejemplo'] = f"{taxis} taxis" if taxis else 'Con 30 taxis'
    p['stickers_taxis'] = (('En las dos puertas de cada taxi de la cooperativa: cerca de ' if aprox else 'En las dos puertas de los ')
                           + f"{taxis} taxis" + ('.' if aprox else ' de la cooperativa.')) if taxis else 'En las dos puertas de cada taxi de la cooperativa.'
    p['lugar_parque'] = next((l['nombre'] for l in ficha.get('LUGARES') or [] if l.get('id') == 'parque'), 'Parque Principal')

    # Ofertas (de la tarifa de la ficha)
    desc = round((T.get('descuentoProgramado') or 0.1) * 100)
    horas = T.get('horasAnticipacion') or 24
    viajes = T.get('viajesFidelidad') or 10
    desc_fid = round((T.get('descuentoFidelidad') or 0.5) * 100)
    llenos = max(1, min(viajes - 3, viajes))
    p['oferta'] = {
        'descuento': desc, 'horas': horas, 'viajes': viajes, 'siguiente': viajes + 1, 'descuento_fidelidad': desc_fid,
        'sellos': [{'lleno': i < llenos} for i in range(viajes)],
        'intro': 'Dos beneficios que la cooperativa ya ofrece, ahora también desde la app.' if es_principal else 'Dos beneficios que la cooperativa puede ofrecer desde la app.',
    }
    p['tarifas_ejemplo'] = bool(T.get('ejemplo', True))
    p['tarifa_inicial'] = {
        'minima': pesos(T.get('minimaUrbana') or 0), 'banderazo': pesos(T.get('banderazo') or 0),
        'km': pesos(T.get('porKm') or 0), 'nocturno': pesos(T.get('recargoNocturno') or 0), 'dominical': pesos(T.get('recargoDominical') or 0),
    }

    # Rutas para el pie de la foto de la Sabana
    if es_principal:
        p['rutas_titulo'] = TEXTOS_PRINCIPAL['rutas_titulo']
        p['rutas_texto'] = TEXTOS_PRINCIPAL['rutas_texto']
    else:
        nombres, bogota, aeropuerto = [], False, False
        for r in ficha.get('RUTAS') or []:
            n = r.get('destino') or ''
            if 'aeropuerto' in n.lower():
                aeropuerto = True
            elif 'bogotá' in n.lower():
                bogota = True
            elif n and n not in nombres:
                nombres.append(re.sub(r'\s*\(.*\)$', '', n))
        nombres = list(dict.fromkeys(nombres))[:7]
        if bogota:
            nombres.append('Bogotá')
        if aeropuerto:
            nombres.append('el aeropuerto')
        p['rutas_titulo'] = f"De {pueblo} a toda la {region}" if region else f"De {pueblo} a toda la región"
        p['rutas_texto'] = (lista_natural(nombres) + '.') if nombres else 'El casco urbano, las veredas y los municipios vecinos.'

    # Nosotros
    nombre = E['nombre']
    if es_principal and not textos:
        historia = TEXTOS_PRINCIPAL['historia']
    else:
        historia = parrafos(textos.get('historia'))
    if not historia:
        historia = [
            f"{nombre} es la cooperativa de taxis de {pueblo}. Sus conductores conocen cada calle y cada vereda del municipio"
            + (", y te llevan a donde necesites, de día y de noche." if E.get('servicio24h') else ", y te llevan a donde necesites."),
            'Ahora la cooperativa puede dar un paso más: llevar el servicio de siempre a tu celular. Pides el taxi con tu ubicación exacta, ves la tarifa antes de subir y sigues el móvil en el mapa hasta tu puerta.',
        ]
    p['historia'] = historia
    propia = [x for x in (textos.get('linea_tiempo') or []) if isinstance(x, dict) and x.get('b') and x.get('s')]
    if propia:
        p['linea_tiempo'] = propia[:3]
    elif es_principal:
        p['linea_tiempo'] = TEXTOS_PRINCIPAL['linea_tiempo']
    else:
        hoy = []
        if taxis:
            hoy.append(f"{'Unos ' if 'exacto de taxis' in ' '.join(E.get('datosPendientes') or []) else ''}{taxis} taxis")
        elif cantidad(E.get('vehiculos')):
            n, mas = cantidad(E['vehiculos'])
            hoy.append(f"{'Más de ' if mas else ''}{n} vehículos")
        if E.get('microbuses'):
            hoy.append(f"{E['microbuses']} microbuses")
        if E.get('asociados'):
            hoy.append(f"{E['asociados']} asociados")
        p['linea_tiempo'] = [
            {'b': str(E['fundada']), 's': f'Nace la cooperativa en {pueblo}.'} if E.get('fundada') else {'b': 'Siempre', 's': f'Los taxis de la cooperativa en {pueblo} y sus veredas.'},
            {'b': 'Hoy', 's': (lista_natural(hoy) + '.') if hoy else ('Servicio las 24 horas en ' + pueblo + ' y la región.' if E.get('servicio24h') else f'Servicio en {pueblo} y la región.')},
            {'b': 'Con la app', 's': 'Tu taxi desde el celular, con GPS y tarifa clara.'},
        ]
    mision = textos.get('mision') or (TEXTOS_PRINCIPAL['mision'] if es_principal else '')
    vision = textos.get('vision') or (TEXTOS_PRINCIPAL['vision'] if es_principal else '')
    # Si la misión y la visión oficiales están pendientes, los textos de la ficha
    # son una redacción nuestra: no se presentan como «Misión» y «Visión».
    mv_pendiente = 'misión' in pend or 'mision' in pend
    tarjetas = []
    if mision:
        tarjetas.append({'icono': 'i-diana', 'titulo': 'Nuestro compromiso' if mv_pendiente else 'Misión', 'texto': mision})
    if vision:
        # «En 2030 seremos…» → «Visión 2030».
        anio = re.match(r'^\s*(?:En|Para)\s+(?:el\s+)?(20\d\d)\b', vision)
        titulo = 'Hacia dónde vamos' if mv_pendiente else (f'Visión {anio.group(1)}' if anio else 'Visión')
        tarjetas.append({'icono': 'i-ojo', 'titulo': titulo, 'texto': vision})
    if len(tarjetas) < 2:
        respaldo = [
            {'icono': 'i-pin', 'titulo': 'Servicio puerta a puerta', 'texto': f'Te recogemos donde estás, en el casco urbano o en la vereda, y te llevamos a tu destino en {pueblo} o fuera del municipio.'},
            {'icono': 'i-ruta', 'titulo': 'Tarifas claras', 'texto': 'Ves el valor del viaje antes de pedir. Para los destinos más comunes hay tarifa fija, y la app te avisa de los recargos.'},
        ]
        tarjetas += respaldo[: 2 - len(tarjetas)]
    p['tarjetas_mv'] = tarjetas
    # Servicios de la ficha: son las opciones del formulario y, salvo en la
    # principal (su página se conserva como estaba), una lista en «Nosotros».
    servicios = [str(x).strip() for x in (textos.get('servicios') or []) if str(x).strip()]
    p['servicios'] = servicios if not es_principal else []
    p['frase'] = textos.get('frase') or E.get('lema') or ''
    p['insignia_nosotros'] = 'Nuestra flota, móviles 046 y 047' if es_principal and not im.get('nosotros') else (
        (f'Unos {taxis} taxis' if aprox else f"{taxis} taxis {modelo_taxis(ficha)}".strip()) if taxis else f'Taxis de {pueblo}')
    p['alt_nosotros'] = (
        'Taxis Kia Picanto amarillos de Cootransrural, los móviles 046 y 047, frente a la sede en El Rosal' if es_principal and not im.get('nosotros')
        else 'Taxis amarillos en fila frente a la iglesia y el parque principal de un pueblo, con las montañas al fondo'
    )
    p['sede_texto'] = ('Nuestra sede: Carrera 8 No. 12-38, Barrio San Carlos' if es_principal else (f"Oficina: {p['calle']}" if p['calle'] else ''))
    p['flota_titulo'] = ((f'Unos {taxis} taxis' if aprox else f"{taxis} taxis {modelo_taxis(ficha)}".strip()) if taxis else f'Taxis de {nombre}')
    p['flota_texto'] = f"Cada uno con su número de móvil, el mismo que verás en la app. Listos en {pueblo}{' y la ' + region if region else ''}, de día y de noche."
    if es_principal:
        p['flota_texto'] = 'Cada uno con su número de móvil, el mismo que verás en la app. Listos en El Rosal y la Sabana, de día y de noche.'

    # Formulario «Programa tu servicio»
    opciones = ['Taxi', 'Taxi al aeropuerto']
    if E.get('microbuses'):
        opciones.append('Microbús (grupos)')
    opciones += ['Transporte especial de pasajeros', 'Ruta intermunicipal'] if es_principal else ['Ruta intermunicipal']
    p['opciones_servicio'] = servicios or opciones

    # Pie y metadatos
    vehiculos = 'Taxis y microbuses' if E.get('microbuses') else 'Taxis'
    if es_principal:
        p['pie_texto'] = TEXTOS_PRINCIPAL['pie_texto']
    else:
        p['pie_texto'] = f"{vehiculos} en {pueblo}{' y la ' + region if region else ''}{' desde ' + str(E['fundada']) if E.get('fundada') else ''}."
    p['descripcion_corta'] = (
        f"Cooperativa de {vehiculos.lower()} de {municipio}. Transporte urbano e intermunicipal"
        + (' las 24 horas.' if E.get('servicio24h') else '.')
    )
    p['descripcion_meta'] = (
        f"{nombre}, taxis en {municipio}. Pide tu taxi con tu ubicación exacta, mira la tarifa antes de subir y sigue el móvil en el mapa."
        + (f" Servicio 24 horas: {tel_visible}." if E.get('servicio24h') and tel else (' Servicio 24 horas.' if E.get('servicio24h') else ''))
    )
    p['og_descripcion'] = (
        f"Taxis de la cooperativa con ubicación exacta, código de abordaje, tarifas claras{' y servicio 24 horas' if E.get('servicio24h') else ''} en {municipio}."
    )
    p['jsonld'] = jsonld(ficha, p)
    return p


_CACHE = {}


def contexto(ficha, destino_rel):
    """Datos disponibles en las plantillas para un archivo generado."""
    profundidad = len(pathlib.PurePosixPath(destino_rel).parts) - 1
    raiz = '../' * profundidad or './'
    es_principal = ficha['id'] == PRINCIPAL
    prefijo = '' if es_principal else f"{ficha['id']}/"
    # Ruta relativa desde el archivo hasta la raíz de la cooperativa.
    partes_empresa = len(pathlib.PurePosixPath(prefijo).parts) if prefijo else 0
    raiz_empresa = '../' * (profundidad - partes_empresa) or './'
    if ficha['id'] not in _CACHE:
        _CACHE[ficha['id']] = derivados(ficha)
    ctx = dict(ficha)
    ctx.update(_CACHE[ficha['id']])
    ctx.update({
        'RAIZ': raiz,
        'RAIZ_EMPRESA': raiz_empresa,
        'cooperativas': lista_cooperativas(),
        # Para scripts (p. ej. la página 404, que adapta colores y enlaces según la carpeta).
        'cooperativas_json': json.dumps([{k: c[k] for k in ('id', 'ruta', 'nombre', 'razonSocial', 'es_propuesta', 'servicio24h', 'tel', 'tel_visible', 'primario', 'primario2', 'claro', 'oscuro', 'acento', 'icono')}
                                         for c in lista_cooperativas()], ensure_ascii=False).replace('</', '<\\/'),
    })
    return ctx


def lista_cooperativas():
    if 'lista' not in _CACHE:
        salida = []
        for f in fichas():
            E = f['EMPRESA']
            d = _CACHE.get(f['id']) or derivados(f)
            _CACHE[f['id']] = d
            salida.append({
                'id': f['id'], 'nombre': E['nombre'], 'razonSocial': E.get('razonSocial') or E['nombre'],
                'pueblo': E.get('pueblo'), 'municipio': E.get('municipio'), 'estado': f.get('estado'),
                'es_propuesta': f.get('estado') == 'propuesta', 'es_principal': f['id'] == PRINCIPAL,
                'ruta': '' if f['id'] == PRINCIPAL else f"{f['id']}/", 'url_publica': d['url_publica'],
                'stickers_ruta': d['stickers_ruta'], 'icono': d['icono']['i192'], 'lema': E.get('lema') or '',
                'primario': d['paleta']['verde'], 'oscuro': d['paleta']['verde-osc'], 'acento': d['paleta']['amarillo'], 'color_qr': d['color_qr'],
                'tel_visible': d['tel_visible'], 'tel': d['tel'], 'taxis': E.get('taxis') or '', 'cifras': d['cifras'][:3],
                'primario2': d['paleta']['verde-2'], 'claro': d['paleta']['verde-3'], 'estado_texto': 'Propuesta' if f.get('estado') == 'propuesta' else 'Cliente',
                'n_rutas': len(f.get('RUTAS') or []), 'n_lugares': len(f.get('LUGARES') or []),
                'servicio24h': bool(E.get('servicio24h')),
                # Flota para el índice: la primera cifra si es de taxis o vehículos («20 taxis (aprox.)», «100+ vehículos»).
                'flota': next(({'valor': c['valor'] + c['sufijo'], 'texto': c['texto']} for c in d['cifras'][:1]
                               if c['texto'].startswith(('taxis', 'vehículos'))), None),
            })
        # Primero la principal, luego los clientes y al final las propuestas.
        salida.sort(key=lambda c: (not c['es_principal'], c['es_propuesta'], c['nombre'].lower()))
        _CACHE['lista'] = salida
    return _CACHE['lista']


def sin_versiones(texto_html):
    texto_html = re.sub(r'\?v=[0-9a-f]+', '', texto_html)
    return re.sub(r"const VERSION_DISENOS = '[0-9a-f]*';", "const VERSION_DISENOS = '';", texto_html)


def revisar_imagenes(lista):
    """Avisa si los íconos y fotos de una cooperativa se hicieron con otros colores
    o para otra dirección (herramientas/iconos-empresas.mjs deja empresas/<id>/imagenes.json)."""
    avisos = []
    for f in lista:
        if f['id'] == PRINCIPAL:
            continue
        if not archivo_existe(f"empresas/{f['id']}/icono-192.png"):
            # Sin íconos propios se usan los genéricos de img/ (verdes): hay que crearlos.
            avisos.append(f['id'])
            continue
        huella = RAIZ / 'empresas' / f['id'] / 'imagenes.json'
        try:
            usado = json.loads(huella.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            usado = {}
        if usado.get('colores') != f.get('colores') or usado.get('url') != f"{URL_PUBLICA}{f['id']}/descargar/?o=foto":
            avisos.append(f['id'])
    if avisos:
        print(f"AVISO: los íconos y fotos de {', '.join(avisos)} no corresponden a los colores de su ficha. Corre:")
        print(f"  node herramientas/iconos-empresas.mjs {' '.join(avisos)} --capturas http://localhost:<puerto>/")
    return avisos


def generar():
    escritos = 0
    lista = fichas()
    for plantilla in sorted(PLANTILLAS.rglob('*')):
        if not plantilla.is_file():
            continue
        rel = plantilla.relative_to(PLANTILLAS).as_posix()
        fuente = plantilla.read_text(encoding='utf-8')
        arbol = analizar(fuente, rel)
        # Plantillas que solo aplican a la raíz (por ejemplo, el índice de cooperativas).
        solo_raiz = rel.startswith('_raiz/')
        for ficha in lista:
            if solo_raiz and ficha['id'] != PRINCIPAL:
                continue
            destino_rel = rel[len('_raiz/'):] if solo_raiz else (rel if ficha['id'] == PRINCIPAL else f"{ficha['id']}/{rel}")
            salida = pintar(arbol, contexto(ficha, destino_rel))
            destino = RAIZ / destino_rel
            destino.parent.mkdir(parents=True, exist_ok=True)
            anterior = destino.read_text(encoding='utf-8') if destino.exists() else None
            # versionar.py agrega ?v=… a los CSS y JS (y la huella de los diseños): no cuenta como cambio.
            if anterior is None or sin_versiones(anterior) != sin_versiones(salida):
                destino.write_text(salida, encoding='utf-8')
                escritos += 1
                print('generado:', destino_rel)
    print(f'{escritos} archivo(s) escritos para {len(lista)} cooperativa(s)')
    revisar_imagenes(lista)


if __name__ == '__main__':
    generar()
